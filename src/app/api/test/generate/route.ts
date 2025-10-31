import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import * as XLSX from "xlsx";

export const maxDuration = 300; // 5 minutes
export const dynamic = "force-dynamic";

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

interface TestConfig {
  subject: string;
  chapter: string;
  numTests: number;
  testData: Record<string, Record<number, Record<number, number>>>;
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

  try {
    do {
      const command = new ScanCommand({
        TableName: VERIFIED_QUESTIONS_TABLE,
        FilterExpression:
          "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND difficulty_level = :level",
        ExpressionAttributeValues: {
          ":subject": { S: subject.toLowerCase() },
          ":chapter": { S: chapter.toLowerCase() },
          ":topic": { S: topic },
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

      // Stop if we have enough questions
      if (questions.length >= count) {
        break;
      }
    } while (lastEvaluatedKey);

    // Sort by createdAt for consistency
    questions.sort((a, b) => a.createdAt - b.createdAt);

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

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: TestConfig = await request.json();
    const { subject, chapter, numTests, testData } = body;

    if (!subject || !chapter || !numTests || !testData) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

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
        return NextResponse.json(
          {
            error: `Test ${testNum} must have exactly 45 questions. Current: ${testTotal}`,
          },
          { status: 400 }
        );
      }
    }

    // Fetch all questions needed for all tests
    const questionsByTopicLevel: Record<
      string,
      Record<number, VerifiedQuestion[]>
    > = {};

    for (const topic of Object.keys(testData)) {
      questionsByTopicLevel[topic] = {};

      for (const level of [1, 2, 3]) {
        // Calculate total needed across all tests
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
            return NextResponse.json(
              {
                error: `Insufficient questions for topic "${topic}" level ${level}. Needed: ${totalNeeded}, Available: ${questions.length}`,
              },
              { status: 400 }
            );
          }

          questionsByTopicLevel[topic][level] = questions;
        }
      }
    }

    // Distribute questions across tests using round-robin
    const testQuestions: Record<number, VerifiedQuestion[]> = {};
    for (let testNum = 1; testNum <= numTests; testNum++) {
      testQuestions[testNum] = [];
    }

    // Track question index for each topic-level
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

    // Get chapter display name from first question
    let chapterDisplayName = chapter;
    const firstQuestion = Object.values(questionsByTopicLevel)[0]?.[1]?.[0];
    if (firstQuestion) {
      chapterDisplayName =
        firstQuestion.chapter_name.charAt(0).toUpperCase() +
        firstQuestion.chapter_name.slice(1);
    }

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

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Tests_${subject}_${chapter}_${Date.now()}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error generating tests:", error);
    return NextResponse.json(
      {
        error: "Failed to generate tests",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
