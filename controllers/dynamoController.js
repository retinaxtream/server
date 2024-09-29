// controllers/dynamoController.js

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import pLimit from 'p-limit'; // For concurrency control

// Initialize DynamoDB Client
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

// Maximum items per batch (reduced from 25 to 5 for better control)
const BATCH_SIZE = 5;

// Further reduced concurrency to 1 to prevent exceeding write capacity
const CONCURRENCY_LIMIT = 1;

// Maximum number of retry attempts
const MAX_RETRIES = 10;

// Increased delay between batches in milliseconds (from 200ms to 500ms)
const DELAY_BETWEEN_BATCHES_MS = 500;

/**
 * Fetches the key schema for a given DynamoDB table.
 * @param {string} tableName - The name of the DynamoDB table.
 * @returns {Promise<Array<string>>} - An array of key attribute names.
 */
const getKeyAttributes = async (tableName) => {
  try {
    const describeTableCommand = new DescribeTableCommand({ TableName: tableName });
    const tableDescription = await dynamoDBClient.send(describeTableCommand);
    const keySchema = tableDescription.Table.KeySchema;

    if (!keySchema || keySchema.length === 0) {
      throw new Error(`No key schema found for table ${tableName}.`);
    }

    // Extract key attribute names
    const keyAttributes = keySchema.map((key) => key.AttributeName);
    console.log(`Key attributes for table ${tableName}: ${keyAttributes.join(', ')}`);
    return keyAttributes;
  } catch (error) {
    console.error(`Error fetching key schema for table ${tableName}: ${error.message}`);
    throw error;
  }
};

/**
 * Retry BatchWriteCommand for unprocessed items with exponential backoff.
 * Specifically handles ProvisionedThroughputExceededException.
 * @param {DynamoDBDocumentClient} client - The DynamoDB Document Client.
 * @param {Object} batchParams - The parameters for BatchWriteCommand.
 * @param {number} maxRetries - Maximum number of retry attempts.
 */
const retryBatchWrite = async (client, batchParams, maxRetries = MAX_RETRIES) => {
  let retries = 0;
  let unprocessedItems = batchParams.RequestItems;

  while (unprocessedItems && retries < maxRetries) {
    try {
      const batchCommand = new BatchWriteCommand({ RequestItems: unprocessedItems });
      const batchResult = await client.send(batchCommand);

      if (batchResult.UnprocessedItems && Object.keys(batchResult.UnprocessedItems).length > 0) {
        console.warn(`Retrying unprocessed items. Attempt ${retries + 1}`);
        unprocessedItems = batchResult.UnprocessedItems;
        retries += 1;

        // Exponential backoff delay (e.g., 200ms, 400ms, 800ms, ...)
        const delay = Math.pow(2, retries) * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        unprocessedItems = null; // All items processed
      }
    } catch (error) {
      if (error.name === 'ProvisionedThroughputExceededException') {
        console.warn(`ProvisionedThroughputExceededException encountered. Retrying attempt ${retries + 1}`);
        retries += 1;
        const delay = Math.pow(2, retries) * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(`Error during BatchWriteCommand retry: ${error.message}`);
        throw error;
      }
    }
  }

  if (unprocessedItems && Object.keys(unprocessedItems).length > 0) {
    throw new Error('Some items could not be deleted after maximum retries.');
  }
};

/**
 * Empties the specified DynamoDB table by deleting all items.
 * @param {string} tableName - The name of the DynamoDB table to empty.
 */
const emptyTable = async (tableName) => {
  try {
    // Fetch the key attributes dynamically
    const keyAttributes = await getKeyAttributes(tableName);

    let lastEvaluatedKey = undefined;
    const limit = pLimit(CONCURRENCY_LIMIT); // Limit concurrency

    do {
      // Scan the table for items to delete with consistent read
      const scanParams = {
        TableName: tableName,
        ProjectionExpression: keyAttributes.join(', '), // Dynamically set based on keyAttributes
        ConsistentRead: true, // Ensure all items are read accurately
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const scanCommand = new ScanCommand(scanParams);
      const scanResult = await dynamoDBDocClient.send(scanCommand);

      if (!scanResult.Items || scanResult.Items.length === 0) {
        break; // No more items to delete
      }

      console.log(`Fetched ${scanResult.Items.length} items to delete from ${tableName}.`);

      // Prepare delete requests
      const deleteRequests = scanResult.Items.map((item, index) => {
        const key = {};
        keyAttributes.forEach((attr) => {
          if (!(attr in item)) {
            throw new Error(`Item at index ${index} is missing key attribute '${attr}'.`);
          }
          key[attr] = item[attr];
        });

        return {
          DeleteRequest: {
            Key: key,
          },
        };
      });

      // Split delete requests into smaller batches
      const batches = [];
      for (let i = 0; i < deleteRequests.length; i += BATCH_SIZE) {
        batches.push(deleteRequests.slice(i, i + BATCH_SIZE));
      }

      // Execute batch deletes with concurrency control and delays
      for (let [index, batch] of batches.entries()) {
        await limit(async () => {
          console.log(`Processing batch ${index + 1} with ${batch.length} delete requests.`);
          const batchParams = {
            RequestItems: {
              [tableName]: batch,
            },
          };
          await retryBatchWrite(dynamoDBDocClient, batchParams);
          console.log(`Batch ${index + 1} processed successfully.`);
        });

        // Introduce delay between batches to prevent throttling
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }

      // Update the lastEvaluatedKey for pagination
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Successfully emptied table: ${tableName}`);
  } catch (error) {
    console.error(`Error emptying table ${tableName}: ${error.message}`);
    throw error;
  }
};

/**
 * Empties the EventFaces table.
 */
export const emptyEventFaces = async (req, res) => {
  const tableName = 'EventFaces'; // Replace with your actual table name

  try {
    await emptyTable(tableName);
    res.status(200).json({ message: `Table ${tableName} has been emptied successfully.` });
  } catch (error) {
    res.status(500).json({ error: `Failed to empty table ${tableName}: ${error.message}` });
  }
};

/**
 * Empties the GuestsTable.
 */
export const emptyGuestsTable = async (req, res) => {
  const tableName = 'GuestsTable'; // Replace with your actual table name

  try {
    await emptyTable(tableName);
    res.status(200).json({ message: `Table ${tableName} has been emptied successfully.` });
  } catch (error) {
    res.status(500).json({ error: `Failed to empty table ${tableName}: ${error.message}` });
  }
};
