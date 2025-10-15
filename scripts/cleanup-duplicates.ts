/**
 * Script to identify and remove duplicate questions between PENDING and VERIFIED tables
 *
 * Run this script to find questions that exist in both tables and remove them from PENDING
 * since VERIFIED is the source of truth for verified questions.
 */

import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../src/lib/dynamodb";

async function scanAllPages(tableName: string) {
  let allItems: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  console.log(`\nScanning ${tableName}...`);

  do {
    const command: ScanCommand = new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const response = await docClient.send(command);
    const items = response.Items || [];
    allItems = allItems.concat(items);
    lastEvaluatedKey = response.LastEvaluatedKey;

    console.log(`  Scanned ${items.length} items (total so far: ${allItems.length})`);
  } while (lastEvaluatedKey);

  return allItems;
}

async function main() {
  try {
    console.log("Starting duplicate check and cleanup...\n");

    // Fetch all questions from both tables
    const [pendingItems, verifiedItems] = await Promise.all([
      scanAllPages(TABLES.QUESTIONS_PENDING),
      scanAllPages(TABLES.QUESTIONS_VERIFIED),
    ]);

    console.log(`\nResults:`);
    console.log(`  PENDING table: ${pendingItems.length} questions`);
    console.log(`  VERIFIED table: ${verifiedItems.length} questions`);

    // Create a map of verified questions by question_id
    const verifiedMap = new Map(
      verifiedItems.map(item => [item.question_id, item])
    );

    // Find duplicates in pending table
    const duplicates = pendingItems.filter(item =>
      verifiedMap.has(item.question_id)
    );

    console.log(`\nFound ${duplicates.length} duplicate questions in PENDING table`);

    if (duplicates.length === 0) {
      console.log("\nNo duplicates found. All good!");
      return;
    }

    // Show details of duplicates
    console.log("\nDuplicate questions:");
    duplicates.forEach((item, index) => {
      const verified = verifiedMap.get(item.question_id);
      console.log(`\n${index + 1}. Question ID: ${item.question_id}`);
      console.log(`   Subject/Chapter/Topic: ${item.subject}/${item.chapter_name}/${item.identified_topic}`);
      console.log(`   Pending status: ${item.status || 'N/A'}`);
      console.log(`   Verified status: ${verified?.status || 'N/A'}`);
      console.log(`   Verified at: ${verified?.verified_at || 'N/A'}`);
      console.log(`   Keys: PrimaryKey=${item.PrimaryKey}, question_id=${item.question_id}`);
    });

    console.log("\n⚠️  CLEANUP NEEDED");
    console.log("These duplicate questions should be removed from the PENDING table.");
    console.log("\nTo perform the cleanup, uncomment the deletion code in this script.");

    // UNCOMMENT THE CODE BELOW TO ACTUALLY PERFORM THE CLEANUP
    /*
    console.log("\nStarting cleanup...");
    let deletedCount = 0;

    for (const item of duplicates) {
      try {
        const deleteCommand = new DeleteCommand({
          TableName: TABLES.QUESTIONS_PENDING,
          Key: {
            PrimaryKey: item.PrimaryKey,
            question_id: item.question_id,
          },
        });

        await docClient.send(deleteCommand);
        deletedCount++;
        console.log(`  Deleted ${deletedCount}/${duplicates.length}: ${item.question_id}`);
      } catch (error) {
        console.error(`  Failed to delete ${item.question_id}:`, error);
      }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} duplicate questions from PENDING table.`);
    */

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
