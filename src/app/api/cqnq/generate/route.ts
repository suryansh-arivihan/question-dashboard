import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand, ScanCommandOutput } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow up to 5 minutes for generation (max for hobby plan)

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
  pipeline_status: string;
  question: string;
  question_images: string[];
  question_number?: number;
  question_type: string;
  solution: string;
  solution_images: string[];
  subject: string;
  topic_id: string;
}

interface ExcelRow {
  micro_lecture_code: string;
  question_code: string;
  question_level: string;
  Unit: string;
  chapter_name: string;
  question_type: string;
  question: string;
  question_image: string;
  optiona: string;
  optiona_image: string;
  optionb: string;
  optionb_image: string;
  optionc: string;
  optionc_image: string;
  optiond: string;
  optiond_image: string;
  answer: string;
  explanation: string;
  image_explanation: string;
  key_concept: string;
  identified_topic: string;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("[CQNQ Generate API] Request started");

    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const subject = searchParams.get("subject");
    const chapter = searchParams.get("chapter");

    if (!subject || !chapter) {
      return NextResponse.json(
        { error: "Both subject and chapter parameters are required" },
        { status: 400 }
      );
    }

    console.log("[CQNQ Generate API] Generating CQNQ for:", { subject, chapter });

    // Step 1: Get all topics for this chapter from mappings table
    const topics = await fetchTopicsForChapter(subject, chapter);
    console.log(`[CQNQ Generate API] Found ${topics.length} topics`);

    if (topics.length === 0) {
      return NextResponse.json(
        { error: "No topics found for this chapter" },
        { status: 404 }
      );
    }

    // Step 2: Fetch questions using round-robin algorithm
    let questions: VerifiedQuestion[];
    try {
      questions = await fetchQuestionsRoundRobin(subject, chapter, topics);
      console.log(`[CQNQ Generate API] Selected ${questions.length} questions using question_number`);
    } catch (error) {
      // Fallback: If question_number field is missing, use alternative method
      console.log(`[CQNQ Generate API] Falling back to alternative method (sorting by createdAt)`);
      questions = await fetchQuestionsWithoutNumber(subject, chapter, topics);
      console.log(`[CQNQ Generate API] Selected ${questions.length} questions using fallback`);
    }

    if (questions.length < 150) {
      return NextResponse.json(
        {
          error: `Not enough questions. Found ${questions.length}, need minimum 150`,
        },
        { status: 400 }
      );
    }

    // Step 3: Transform to Excel format
    const excelRows = transformToExcelFormat(questions, chapter);

    // Step 4: Generate Excel file
    const excelBuffer = generateExcelFile(excelRows);

    // Step 5: Return as downloadable file
    const fileName = `CQNQ_${subject}_${chapter}_${Date.now()}.xlsx`;

    console.log(`[CQNQ Generate API] Generated Excel file in ${Date.now() - startTime}ms`);

    return new NextResponse(Buffer.from(excelBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[CQNQ Generate API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate CQNQ",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function fetchTopicsForChapter(
  subject: string,
  chapter: string
): Promise<string[]> {
  let topics: string[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  do {
    const command: ScanCommand = new ScanCommand({
      TableName: TABLES.MAPPINGS,
      FilterExpression:
        "exam = :exam AND subject = :subject AND chapter = :chapter",
      ExpressionAttributeValues: {
        ":exam": "neet",
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
      },
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const response: ScanCommandOutput = await docClient.send(command);
    const mappings = response.Items || [];

    // Extract unique topic names
    const topicNames = mappings.map((m: any) => m.topic as string);
    topics.push(...topicNames);

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return [...new Set(topics)]; // Remove duplicates
}

async function fetchQuestionsRoundRobin(
  subject: string,
  chapter: string,
  topics: string[]
): Promise<VerifiedQuestion[]> {
  const levels = [1, 2, 3]; // Only levels 1, 2, 3
  const selectedQuestions: VerifiedQuestion[] = [];
  let questionNumber = 1;
  const MAX_QUESTIONS = 250;
  const MIN_QUESTIONS = 150;
  let totalQueriesMade = 0;

  // Keep trying with increasing question_number until we have 150-250 questions
  while (selectedQuestions.length < MIN_QUESTIONS && questionNumber <= 10) {
    console.log(
      `[CQNQ] Round ${questionNumber}: Current count = ${selectedQuestions.length}`
    );

    let foundInThisRound = 0;

    for (const topic of topics) {
      for (const level of levels) {
        totalQueriesMade++;

        // Fetch question with specific question_number
        const question = await fetchQuestionByNumber(
          subject,
          chapter,
          topic,
          level,
          questionNumber
        );

        if (question) {
          selectedQuestions.push(question);
          foundInThisRound++;

          // Stop if we've reached the maximum
          if (selectedQuestions.length >= MAX_QUESTIONS) {
            console.log(`[CQNQ] Reached maximum of ${MAX_QUESTIONS} questions`);
            return selectedQuestions.slice(0, MAX_QUESTIONS);
          }
        }
      }
    }

    console.log(`[CQNQ] Round ${questionNumber}: Found ${foundInThisRound} questions`);

    // If we didn't find ANY questions in round 1, the question_number field is missing
    if (questionNumber === 1 && foundInThisRound === 0) {
      throw new Error(
        `No questions found with question_number field. The question_number field may not be populated yet for this chapter. Total queries made: ${totalQueriesMade}`
      );
    }

    // If we didn't find any questions in this round, stop trying
    if (foundInThisRound === 0) {
      console.log(`[CQNQ] No more questions found at question_number ${questionNumber}`);
      break;
    }

    questionNumber++;
  }

  return selectedQuestions;
}

async function fetchQuestionsWithoutNumber(
  subject: string,
  chapter: string,
  topics: string[]
): Promise<VerifiedQuestion[]> {
  const levels = [1, 2, 3]; // Only levels 1, 2, 3
  const selectedQuestions: VerifiedQuestion[] = [];
  const MAX_QUESTIONS = 250;
  const MIN_QUESTIONS = 150;

  console.log(`[CQNQ Fallback] Fetching questions for ${topics.length} topics × ${levels.length} levels`);

  // Cache to store fetched questions by topic-level
  const questionsByTopicLevel: Map<string, VerifiedQuestion[]> = new Map();

  let questionIndex = 0;
  let foundInRound = true;
  const MAX_EMPTY_RESULTS = 50; // Circuit breaker: stop if we get 50 consecutive empty FETCHES in first round

  // Do round-robin: fetch 1st question from each topic-level, then 2nd, then 3rd, etc.
  while (selectedQuestions.length < MAX_QUESTIONS && foundInRound && questionIndex < 10) {
    foundInRound = false;
    console.log(`[CQNQ Fallback] Round ${questionIndex + 1}: Fetching question #${questionIndex + 1} from each topic-level`);

    let roundCount = 0;
    let consecutiveEmptyFetches = 0; // Track consecutive empty FETCHES (not cached lookups)

    // Process topics in smaller batches to avoid DynamoDB throttling
    // Batch size of 3 topics = 9 parallel requests (3 topics × 3 levels)
    const BATCH_SIZE = 3;
    for (let i = 0; i < topics.length; i += BATCH_SIZE) {
      const topicBatch = topics.slice(i, i + BATCH_SIZE);

      // Fetch in parallel for this batch
      const fetchPromises: Promise<{ key: string; questions: VerifiedQuestion[] }>[] = [];

      for (const topic of topicBatch) {
        for (const level of levels) {
          const key = `${topic}-${level}`;

          // Check if we already have questions cached for this topic-level
          if (!questionsByTopicLevel.has(key)) {
            // First time fetching for this topic-level - get all questions and cache
            fetchPromises.push(
              fetchAllQuestionsForTopicLevel(subject, chapter, topic, level)
                .then(questions => ({ key, questions }))
            );
          }
        }
      }

      // Wait for all fetches in this batch to complete
      if (fetchPromises.length > 0) {
        const results = await Promise.all(fetchPromises);

        for (const { key, questions } of results) {
          if (questions.length > 0) {
            // Sort by createdAt to get consistent ordering
            questions.sort((a, b) => a.createdAt - b.createdAt);
            questionsByTopicLevel.set(key, questions);
            consecutiveEmptyFetches = 0; // Reset counter on successful fetch
          } else {
            consecutiveEmptyFetches++;

            // Circuit breaker: if too many consecutive empty FETCHES, this chapter likely has no questions
            if (consecutiveEmptyFetches >= MAX_EMPTY_RESULTS) {
              console.log(`[CQNQ Fallback] Circuit breaker triggered: ${consecutiveEmptyFetches} consecutive empty fetches`);
              break;
            }
          }
        }

        // Add a small delay between batches to avoid throttling (100ms)
        if (i + BATCH_SIZE < topics.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Now select questions from this batch
      for (const topic of topicBatch) {
        for (const level of levels) {
          const key = `${topic}-${level}`;
          const questions = questionsByTopicLevel.get(key);

          // Try to get the question at current index
          if (questions && questions.length > questionIndex) {
            selectedQuestions.push(questions[questionIndex]);
            foundInRound = true;
            roundCount++;

            if (selectedQuestions.length >= MAX_QUESTIONS) {
              console.log(`[CQNQ Fallback] Reached maximum of ${MAX_QUESTIONS} questions`);
              return selectedQuestions.slice(0, MAX_QUESTIONS);
            }
          }
        }
      }
    }

    console.log(`[CQNQ Fallback] Round ${questionIndex + 1}: Found ${roundCount} questions, total: ${selectedQuestions.length}`);

    // If we've completed a round and reached minimum, stop
    if (selectedQuestions.length >= MIN_QUESTIONS) {
      console.log(`[CQNQ Fallback] Reached minimum of ${MIN_QUESTIONS} questions after round ${questionIndex + 1}, stopping`);
      break;
    }

    questionIndex++;
  }

  console.log(`[CQNQ Fallback] Final count: ${selectedQuestions.length} questions from ${questionsByTopicLevel.size} topic-level combinations`);

  if (selectedQuestions.length < MIN_QUESTIONS) {
    throw new Error(
      `Not enough questions found. Found ${selectedQuestions.length}, need minimum ${MIN_QUESTIONS}. This chapter may not have enough verified questions yet. Please verify more questions for this chapter.`
    );
  }

  return selectedQuestions;
}

async function fetchAllQuestionsForTopicLevel(
  subject: string,
  chapter: string,
  topic: string,
  level: number,
  maxRetries: number = 3
): Promise<VerifiedQuestion[]> {
  const allQuestions: VerifiedQuestion[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  try {
    do {
      const command: ScanCommand = new ScanCommand({
        TableName: TABLES.QUESTIONS_VERIFIED,
        FilterExpression:
          "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND difficulty_level = :level",
        ExpressionAttributeValues: {
          ":subject": subject.toLowerCase(),
          ":chapter": chapter.toLowerCase(),
          ":topic": topic.toLowerCase(),
          ":level": level,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      // Retry with exponential backoff for throttling errors
      let retries = 0;
      let response: ScanCommandOutput | null = null;

      while (retries <= maxRetries) {
        try {
          response = await docClient.send(command);
          break; // Success, exit retry loop
        } catch (err: any) {
          if (err.name === 'ThrottlingException' && retries < maxRetries) {
            // Exponential backoff: 200ms, 400ms, 800ms
            const delay = 200 * Math.pow(2, retries);
            console.log(`[CQNQ Fallback] Throttled, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
          } else {
            throw err; // Re-throw if not throttling or max retries reached
          }
        }
      }

      if (!response) {
        throw new Error('Failed to fetch after retries');
      }

      if (response.Items && response.Items.length > 0) {
        allQuestions.push(...(response.Items as VerifiedQuestion[]));
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allQuestions;
  } catch (error: any) {
    console.error(
      `[CQNQ Fallback] Error fetching questions for ${topic}, level ${level}:`,
      error.name || error
    );
    return [];
  }
}

async function fetchQuestionByNumber(
  subject: string,
  chapter: string,
  topic: string,
  level: number,
  questionNumber: number
): Promise<VerifiedQuestion | null> {
  try {
    const command: ScanCommand = new ScanCommand({
      TableName: TABLES.QUESTIONS_VERIFIED,
      FilterExpression:
        "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND difficulty_level = :level AND question_number = :qnum",
      ExpressionAttributeValues: {
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
        ":topic": topic.toLowerCase(),
        ":level": level,
        ":qnum": questionNumber,
      },
      Limit: 10, // Check first 10 items
    });

    const response: ScanCommandOutput = await docClient.send(command);

    if (response.Items && response.Items.length > 0) {
      // Log the first match for debugging in round 1
      if (questionNumber === 1) {
        console.log(
          `[CQNQ] ✓ Found question for topic: ${topic}, level: ${level}, question_number: ${questionNumber}`
        );
      }
      return response.Items[0] as VerifiedQuestion;
    }

    return null;
  } catch (error) {
    console.error(
      `[CQNQ] Error fetching question for ${topic}, level ${level}, number ${questionNumber}:`,
      error
    );
    return null;
  }
}

function transformToExcelFormat(
  questions: VerifiedQuestion[],
  chapterDisplayName: string
): ExcelRow[] {
  // Static micro_lecture_code for all questions
  const microLectureCode = "CHENEETENGBCCML1";

  return questions.map((q, index) => {
    // Generate sequential question codes
    const questionCode = `CHENEETENGBCCMCQ${index + 1}`;

    // Map level to text (just the word, no number prefix)
    const levelMap: Record<number, string> = {
      1: "EASY",
      2: "MEDIUM",
      3: "HARD",
    };

    // Map question type
    const questionTypeMap: Record<string, string> = {
      MCQ: "MULTIPLE_CHOICE_QUESTION",
    };

    // Map answer letter to number (A->1, B->2, C->3, D->4)
    const answerMap: Record<string, string> = {
      A: "1",
      B: "2",
      C: "3",
      D: "4",
    };

    // Extract options
    const optionA = q.options.find((o) => o.label === "A");
    const optionB = q.options.find((o) => o.label === "B");
    const optionC = q.options.find((o) => o.label === "C");
    const optionD = q.options.find((o) => o.label === "D");

    return {
      micro_lecture_code: microLectureCode,
      question_code: questionCode,
      question_level: levelMap[q.difficulty_level] || `${q.difficulty_level}`,
      Unit: chapterDisplayName,
      chapter_name: q.chapter_name,
      question_type: questionTypeMap[q.question_type] || q.question_type,
      question: q.question,
      question_image: q.question_images?.join(", ") || "",
      optiona: optionA?.text || "",
      optiona_image: optionA?.image || "",
      optionb: optionB?.text || "",
      optionb_image: optionB?.image || "",
      optionc: optionC?.text || "",
      optionc_image: optionC?.image || "",
      optiond: optionD?.text || "",
      optiond_image: optionD?.image || "",
      answer: answerMap[q.answer] || q.answer, // Convert A/B/C/D to 1/2/3/4
      explanation: q.solution || "",
      image_explanation: q.solution_images?.join(", ") || "",
      key_concept: q.key_concept || "",
      identified_topic: q.identified_topic,
    };
  });
}

function generateExcelFile(rows: ExcelRow[]): Buffer {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Convert rows to worksheet
  const ws = XLSX.utils.json_to_sheet(rows);

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "CQNQ");

  // Generate buffer
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return excelBuffer;
}
