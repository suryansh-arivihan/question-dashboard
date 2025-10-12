/**
 * Script to extract subject-chapter mappings from DynamoDB
 * Run with: npx tsx scripts/extract-mappings.ts
 */

import { config } from "dotenv";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../src/lib/dynamodb";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// Load environment variables from the project root
import { join as pathJoin } from "path";
config({ path: pathJoin(process.cwd(), ".env") });

interface SubjectChapterMapping {
  subject: string;
  chapters: {
    name: string;
    display_name: string;
    topicCount: number;
  }[];
}

async function extractMappings() {
  console.log("Fetching all topic mappings from DynamoDB...");

  const command = new ScanCommand({
    TableName: TABLES.MAPPINGS,
    FilterExpression: "exam = :exam",
    ExpressionAttributeValues: {
      ":exam": "neet",
    },
  });

  const response = await docClient.send(command);
  const mappings = response.Items || [];

  console.log(`Found ${mappings.length} topic mappings`);

  // Group by subject and chapter
  const subjectMap = new Map<string, Map<string, { display_name: string; count: number }>>();

  for (const mapping of mappings) {
    const { subject, chapter, chapter_display_name } = mapping;

    // Skip entries without required fields
    if (!subject || !chapter) {
      console.log("Skipping mapping with missing subject/chapter:", mapping);
      continue;
    }

    if (!subjectMap.has(subject)) {
      subjectMap.set(subject, new Map());
    }

    const chapterMap = subjectMap.get(subject)!;

    if (!chapterMap.has(chapter)) {
      chapterMap.set(chapter, { display_name: chapter_display_name, count: 0 });
    }

    chapterMap.get(chapter)!.count++;
  }

  // Build the final structure
  const subjects: SubjectChapterMapping[] = [];

  for (const [subjectName, chapterMap] of subjectMap.entries()) {
    const chapters = Array.from(chapterMap.entries()).map(([name, info]) => ({
      name,
      display_name: info.display_name || name,
      topicCount: info.count,
    }));

    // Sort chapters alphabetically
    chapters.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));

    subjects.push({
      subject: subjectName,
      chapters,
    });
  }

  // Sort subjects
  subjects.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));

  // Write to file
  const outputPath = join(process.cwd(), "src", "data", "subject-chapter-mappings.ts");

  // Ensure directory exists
  mkdirSync(dirname(outputPath), { recursive: true });

  const fileContent = `/**
 * Static subject-chapter mappings extracted from DynamoDB
 * Generated on: ${new Date().toISOString()}
 * Total subjects: ${subjects.length}
 * Total chapters: ${subjects.reduce((acc, s) => acc + s.chapters.length, 0)}
 * Total topics: ${mappings.length}
 */

export interface SubjectChapterMapping {
  subject: string;
  chapters: {
    name: string;
    display_name: string;
    topicCount: number;
  }[];
}

export const SUBJECT_CHAPTER_MAPPINGS: SubjectChapterMapping[] = ${JSON.stringify(subjects, null, 2)};

export const SUBJECTS = ${JSON.stringify(subjects.map(s => s.subject), null, 2)};
`;

  writeFileSync(outputPath, fileContent, "utf-8");
  console.log(`✓ Mappings written to: ${outputPath}`);
  console.log(`  - ${subjects.length} subjects`);
  console.log(`  - ${subjects.reduce((acc, s) => acc + s.chapters.length, 0)} chapters`);
  console.log(`  - ${mappings.length} topics`);
}

extractMappings().catch(console.error);
