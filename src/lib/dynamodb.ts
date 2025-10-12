import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Lazy initialization of DynamoDB client
let _docClient: DynamoDBDocumentClient | null = null;

function createDocClient(): DynamoDBDocumentClient {
  // Validate required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID) {
    throw new Error("AWS_ACCESS_KEY_ID is not set");
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS_SECRET_ACCESS_KEY is not set");
  }
  if (!process.env.AWS_REGION) {
    throw new Error("AWS_REGION is not set");
  }

  // Create DynamoDB client
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Create Document Client for easier data handling
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });
}

export function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    _docClient = createDocClient();
  }
  return _docClient;
}

// Export as a property getter for backwards compatibility
export const docClient = new Proxy({} as DynamoDBDocumentClient, {
  get(_target, prop) {
    return getDocClient()[prop as keyof DynamoDBDocumentClient];
  }
});

// Table names
export const TABLES = {
  MAPPINGS: "ExamChapterTopicMappings",
  QUESTIONS_PENDING: "NEETAdaptiveQuestionGeneratorData",
  QUESTIONS_VERIFIED: "NEETAdaptiveQuestionGeneratorDataVerified",
  GENERATION_QUEUE: "generation_queue",
} as const;
