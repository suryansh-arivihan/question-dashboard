import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Lazy initialization of S3 client
let _s3Client: S3Client | null = null;

function createS3Client(): S3Client {
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

  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

export function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = createS3Client();
  }
  return _s3Client;
}

// S3 configuration
export const S3_CONFIG = {
  BUCKET: "mldatabase",
  TEST_GENERATOR_PREFIX: "neet-test-generator",
} as const;

/**
 * Generates S3 key path for test files
 * Format: neet-test-generator/<subject>/<chapterName>/testfile_<timestamp>.xlsx
 */
export function generateTestS3Key(
  subject: string,
  chapterName: string,
  timestamp: number = Date.now()
): string {
  const fileName = `testfile_${timestamp}.xlsx`;
  return `${S3_CONFIG.TEST_GENERATOR_PREFIX}/${subject}/${chapterName}/${fileName}`;
}

/**
 * Uploads a test Excel file to S3
 * @param fileBuffer - Excel file buffer
 * @param subject - Subject name (e.g., "physics")
 * @param chapterName - Chapter name (e.g., "mechanics")
 * @returns S3 key path
 */
export async function uploadTestToS3(
  fileBuffer: Buffer,
  subject: string,
  chapterName: string
): Promise<string> {
  const s3Client = getS3Client();
  const timestamp = Date.now();
  const s3Key = generateTestS3Key(subject, chapterName, timestamp);

  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    Metadata: {
      subject,
      chapter: chapterName,
      timestamp: timestamp.toString(),
    },
  });

  await s3Client.send(command);
  return s3Key;
}

/**
 * Generates a pre-signed URL for downloading a test file from S3
 * @param s3Key - S3 key path
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Pre-signed URL
 */
export async function generateDownloadUrl(
  s3Key: string,
  expiresIn: number = 3600
): Promise<string> {
  const s3Client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: S3_CONFIG.BUCKET,
    Key: s3Key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

/**
 * Generates the full S3 URI for a given key
 * @param s3Key - S3 key path
 * @returns Full S3 URI (e.g., s3://mldatabase/neet-test-generator/...)
 */
export function getS3Uri(s3Key: string): string {
  return `s3://${S3_CONFIG.BUCKET}/${s3Key}`;
}