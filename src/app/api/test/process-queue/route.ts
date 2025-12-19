import { NextRequest, NextResponse } from "next/server";
import { GetCommand, UpdateCommand, ScanCommand as LibScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import * as XLSX from "xlsx";
import { uploadTestToS3 } from "@/lib/s3";
import { TestGenerationQueueEntry } from "@/types";
import OpenAI from "openai";

export const maxDuration = 300; // 5 minutes
export const dynamic = "force-dynamic";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const VERIFIED_QUESTIONS_TABLE = "NEETAdaptiveQuestionGeneratorDataVerified";

interface VerifiedQuestion {
  PrimaryKey: string;
  question_id: string;
  answer: string;
  chapter_code: string;
  chapter_name: string;
  createdAt: number;
  difficulty_level: number;
  identified_topic: string;
  key_concept: string;
  options: Array<{
    image: string;
    label: string;
    text: string;
  }>;
  question: string;
  question_images: string[];
  question_type: string;
  solution: string;
  solution_images: string[];
  subject: string;
  topic_id: string;
}

interface ExcelRow {
  "Chapter Code": string;
  "Taken From": string;
  "Id": string;
  "Subject": string;
  "Unit": string;
  "Chapter": string;
  "Level": string;
  "Board": string;
  "NEET": string;
  "Mains": string;
  "Advanced": string;
  "Type": string;
  "TopicName": string;
  "topic": string;
  "Question Text": string;
  "Question image": string;
  "Option A": string;
  "Option B": string;
  "Option C": string;
  "Option D": string;
  "Answer": string;
  "Explanation": string;
  "Explanation image": string;
  "Score": number;
  "Negative score": number;
  "Total Time duration": number;
  "Video": string;
  "DefaultStartTime": string;
  "VideoCompletionStartPos": string;
  "VideoCompletionEndPos": string;
  "OptionalTag": string;
  "SubText": string;
  "globalText": string;
}

async function fetchQuestionsForTopicLevel(
  subject: string,
  chapter: string,
  topic: string,
  level: number,
  count: number
): Promise<VerifiedQuestion[]> {
  const questions: VerifiedQuestion[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  // Normalize inputs by trimming whitespace
  const normalizedSubject = subject.trim().toLowerCase();
  const normalizedChapter = chapter.trim().toLowerCase();
  const normalizedTopic = topic.trim().toLowerCase();

  try {
    do {
      const command: ScanCommand = new ScanCommand({
        TableName: VERIFIED_QUESTIONS_TABLE,
        FilterExpression:
          "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND difficulty_level = :level",
        ExpressionAttributeValues: {
          ":subject": { S: normalizedSubject },
          ":chapter": { S: normalizedChapter },
          ":topic": { S: normalizedTopic },
          ":level": { N: level.toString() },
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const response = await dynamoClient.send(command);

      if (response.Items) {
        const items = response.Items.map((item) =>
          unmarshall(item)
        ) as VerifiedQuestion[];
        questions.push(...items);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;

      if (questions.length >= count) {
        break;
      }
    } while (lastEvaluatedKey);

    questions.sort((a, b) => b.createdAt - a.createdAt);
    return questions.slice(0, count);
  } catch (error) {
    console.error(
      `Error fetching questions for ${topic} level ${level}:`,
      error
    );
    throw error;
  }
}

function convertAnswerToNumber(answer: string): string {
  const answerMap: Record<string, string> = {
    A: "1",
    B: "2",
    C: "3",
    D: "4",
  };
  return answerMap[answer.toUpperCase()] || "1";
}

function convertLevelToString(level: number): string {
  const levelMap: Record<number, string> = {
    1: "easy",
    2: "medium",
    3: "hard",
  };
  return levelMap[level] || "easy";
}

function transformToExcelRow(
  question: VerifiedQuestion,
  testNum: number,
  questionNum: number,
  chapterDisplayName: string
): ExcelRow {
  const optionA = question.options.find((opt) => opt.label === "A");
  const optionB = question.options.find((opt) => opt.label === "B");
  const optionC = question.options.find((opt) => opt.label === "C");
  const optionD = question.options.find((opt) => opt.label === "D");

  return {
    "Chapter Code": question.chapter_code || "",
    "Taken From": `${chapterDisplayName} Q${questionNum}`,
    Id: `${question.chapter_code}T${testNum}Q${questionNum}`,
    Subject: question.subject.charAt(0).toUpperCase() + question.subject.slice(1),
    Unit: chapterDisplayName,
    Chapter: `${chapterDisplayName} Test ${testNum}`,
    Level: convertLevelToString(question.difficulty_level),
    Board: "NO",
    NEET: "YES",
    Mains: "NO",
    Advanced: "NO",
    Type: "SINGLE_CHOICE",
    TopicName: question.identified_topic,
    topic: question.topic_id,
    "Question Text": question.question,
    "Question image": question.question_images?.join(", ") || "",
    "Option A": optionA?.text || "",
    "Option B": optionB?.text || "",
    "Option C": optionC?.text || "",
    "Option D": optionD?.text || "",
    Answer: convertAnswerToNumber(question.answer),
    Explanation: question.solution,
    "Explanation image": question.solution_images?.join(", ") || "",
    Score: 4,
    "Negative score": -1,
    "Total Time duration": questionNum === 1 ? 720000 : 0,
    Video: "",
    DefaultStartTime: "",
    VideoCompletionStartPos: "",
    VideoCompletionEndPos: "",
    OptionalTag: "",
    SubText: "",
    globalText: "",
  };
}

// Helper function to rephrase question text using OpenAI
async function rephraseQuestionText(originalQuestion: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at rephrasing NEET exam questions. Your task is to rephrase the given question text while:
1. Maintaining the EXACT same meaning and intent
2. Keeping all numerical values, chemical formulas, biological terms, and technical terminology UNCHANGED
3. Preserving the difficulty level
4. Making only slight variations in wording and sentence structure
5. Ensuring a student wouldn't immediately recognize it as the same question they've seen before
6. Keeping the question academically rigorous and appropriate for NEET exam standards

IMPORTANT: Only return the rephrased question text, nothing else. Do not add explanations, options, or any additional content.`
        },
        {
          role: "user",
          content: originalQuestion
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const rephrasedText = completion.choices[0]?.message?.content?.trim();

    if (!rephrasedText) {
      console.warn("Empty response from OpenAI, using original question");
      return originalQuestion;
    }

    return rephrasedText;
  } catch (error) {
    console.error("Error rephrasing question:", error);
    // Fallback to original question text if rephrasing fails
    return originalQuestion;
  }
}

// Helper function to rephrase all questions in parallel
async function rephraseAllQuestions(questions: VerifiedQuestion[]): Promise<VerifiedQuestion[]> {
  console.log(`Starting to rephrase ${questions.length} questions in parallel...`);

  const rephrasePromises = questions.map(async (question, index) => {
    const rephrasedText = await rephraseQuestionText(question.question);
    console.log(`Question ${index + 1}/${questions.length} rephrased`);

    return {
      ...question,
      question: rephrasedText,
    };
  });

  const rephrasedQuestions = await Promise.all(rephrasePromises);
  console.log(`All ${questions.length} questions rephrased successfully`);

  return rephrasedQuestions;
}

// Helper function to check for next queued item and trigger processing
async function processNextQueuedItem(baseUrl: string) {
  try {
    // Query for the next QUEUED item
    const scanCommand = new LibScanCommand({
      TableName: TABLES.TEST_GENERATION_QUEUE,
      FilterExpression: "#status = :queued",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":queued": "QUEUED",
      },
      Limit: 1,
    });

    const result = await docClient.send(scanCommand);

    if (result.Items && result.Items.length > 0) {
      const nextEntry = result.Items[0] as TestGenerationQueueEntry;
      console.log(`Found next queued item: ${nextEntry.id}, triggering processing...`);

      // Trigger processing for next item (fire-and-forget)
      fetch(`${baseUrl}/api/test/process-queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queueId: nextEntry.id }),
      }).catch((error) => {
        console.error("Error triggering next queue item:", error);
      });
    } else {
      console.log("No more queued items found.");
    }
  } catch (error) {
    console.error("Error checking for next queued item:", error);
  }
}

export async function POST(request: NextRequest) {
  let queueId: string | undefined;

  // Extract base URL from request for triggering subsequent queue items
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  try {
    const body = await request.json();
    queueId = body.queueId;

    if (!queueId) {
      return NextResponse.json(
        { error: "Missing queueId" },
        { status: 400 }
      );
    }

    // Fetch queue entry
    const getCommand = new GetCommand({
      TableName: TABLES.TEST_GENERATION_QUEUE,
      Key: { id: queueId },
    });

    const getResult = await docClient.send(getCommand);
    const queueEntry = getResult.Item as TestGenerationQueueEntry | undefined;

    if (!queueEntry) {
      return NextResponse.json(
        { error: "Queue entry not found" },
        { status: 404 }
      );
    }

    // Check if already processing or completed
    if (queueEntry.status !== "QUEUED") {
      return NextResponse.json(
        { error: `Test is already ${queueEntry.status}` },
        { status: 400 }
      );
    }

    // Update status to IN_PROGRESS
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.TEST_GENERATION_QUEUE,
        Key: { id: queueId },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "IN_PROGRESS",
          ":updatedAt": Date.now(),
        },
      })
    );

    // Extract configuration from queue entry
    const { subject, chapter_name: chapter, numTests, testData, chapter_display_name: chapterDisplayName } = queueEntry;

    // Validate that each test has exactly 45 questions
    for (let testNum = 1; testNum <= numTests; testNum++) {
      let testTotal = 0;
      Object.keys(testData).forEach((topic) => {
        if (testData[topic][testNum]) {
          testTotal +=
            (testData[topic][testNum][1] || 0) +
            (testData[topic][testNum][2] || 0) +
            (testData[topic][testNum][3] || 0);
        }
      });

      if (testTotal !== 45) {
        throw new Error(
          `Test ${testNum} must have exactly 45 questions. Current: ${testTotal}`
        );
      }
    }

    // Fetch all questions needed for all tests
    const questionsByTopicLevel: Record<string, Record<number, VerifiedQuestion[]>> = {};

    for (const topic of Object.keys(testData)) {
      questionsByTopicLevel[topic] = {};

      for (const level of [1, 2, 3]) {
        let totalNeeded = 0;
        for (let testNum = 1; testNum <= numTests; testNum++) {
          totalNeeded += testData[topic][testNum]?.[level] || 0;
        }

        if (totalNeeded > 0) {
          const questions = await fetchQuestionsForTopicLevel(
            subject,
            chapter,
            topic,
            level,
            totalNeeded
          );

          if (questions.length < totalNeeded) {
            throw new Error(
              `Insufficient questions for topic "${topic}" level ${level}. Needed: ${totalNeeded}, Available: ${questions.length}`
            );
          }

          questionsByTopicLevel[topic][level] = questions;
        }
      }
    }

    // Distribute questions across tests
    const testQuestions: Record<number, VerifiedQuestion[]> = {};
    for (let testNum = 1; testNum <= numTests; testNum++) {
      testQuestions[testNum] = [];
    }

    const questionIndices: Record<string, Record<number, number>> = {};

    for (let testNum = 1; testNum <= numTests; testNum++) {
      for (const topic of Object.keys(testData)) {
        if (!questionIndices[topic]) {
          questionIndices[topic] = { 1: 0, 2: 0, 3: 0 };
        }

        for (const level of [1, 2, 3]) {
          const count = testData[topic][testNum]?.[level] || 0;

          if (count > 0 && questionsByTopicLevel[topic][level]) {
            const startIdx = questionIndices[topic][level];
            const questionsForTest = questionsByTopicLevel[topic][level].slice(
              startIdx,
              startIdx + count
            );

            testQuestions[testNum].push(...questionsForTest);
            questionIndices[topic][level] += count;
          }
        }
      }
    }

    // Rephrase all questions for each test in parallel
    console.log("Starting question rephrasing for all tests...");
    const rephraseTestPromises = Object.keys(testQuestions).map(async (testNumStr) => {
      const testNum = parseInt(testNumStr);
      const questions = testQuestions[testNum];
      console.log(`Rephrasing ${questions.length} questions for Test ${testNum}...`);
      const rephrasedQuestions = await rephraseAllQuestions(questions);
      return { testNum, rephrasedQuestions };
    });

    const rephrasedTestResults = await Promise.all(rephraseTestPromises);

    // Update testQuestions with rephrased versions
    rephrasedTestResults.forEach(({ testNum, rephrasedQuestions }) => {
      testQuestions[testNum] = rephrasedQuestions;
    });

    console.log("All tests rephrased successfully!");

    // Generate Excel file with multiple sheets
    const wb = XLSX.utils.book_new();

    for (let testNum = 1; testNum <= numTests; testNum++) {
      const excelRows: ExcelRow[] = testQuestions[testNum].map(
        (question, index) =>
          transformToExcelRow(question, testNum, index + 1, chapterDisplayName)
      );

      const ws = XLSX.utils.json_to_sheet(excelRows);
      XLSX.utils.book_append_sheet(wb, ws, `TEST ${testNum}`);
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Upload to S3
    const s3Key = await uploadTestToS3(Buffer.from(buffer), subject, chapter);

    // Update queue entry to COMPLETED
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.TEST_GENERATION_QUEUE,
        Key: { id: queueId },
        UpdateExpression:
          "SET #status = :status, updatedAt = :updatedAt, s3_file_path = :s3_file_path",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "COMPLETED",
          ":updatedAt": Date.now(),
          ":s3_file_path": s3Key,
        },
      })
    );

    // Check for and process next queued item
    await processNextQueuedItem(baseUrl);

    return NextResponse.json({
      success: true,
      message: "Test generated successfully",
      s3_file_path: s3Key,
    });
  } catch (error) {
    console.error("Error processing queue:", error);

    // Update queue entry to FAILED if we have a queueId
    if (queueId) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.TEST_GENERATION_QUEUE,
            Key: { id: queueId },
            UpdateExpression:
              "SET #status = :status, updatedAt = :updatedAt, #error = :error",
            ExpressionAttributeNames: {
              "#status": "status",
              "#error": "error",
            },
            ExpressionAttributeValues: {
              ":status": "FAILED",
              ":updatedAt": Date.now(),
              ":error": error instanceof Error ? error.message : "Unknown error",
            },
          })
        );

        // Check for and process next queued item even after failure
        await processNextQueuedItem(baseUrl);
      } catch (updateError) {
        console.error("Error updating failed status:", updateError);
      }
    }

    return NextResponse.json(
      {
        error: "Failed to process queue",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}