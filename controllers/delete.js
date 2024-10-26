// controllers/delete.js

// Step 1: Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config(); // Ensure this is called before any other imports that might use env variables

// Step 2: Import necessary AWS SDK clients and commands
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";


// Step 4: Initialize DynamoDB Client with correct credentials and region
const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = 'EventFaces'; // Your DynamoDB table name

const dynamoDBClient = new DynamoDBClient({ 
    region,
    credentials: {
      accessKeyId:'AKIA6ODVAPOJMTIQTV62',
      secretAccessKey:'BMFfkWd6PW7P1r5qYznZtWRVvINHIQENJXZz8xVi',
    },
});

const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

// Step 5: Define the function to delete all items
const deleteAllItems = async () => {
    try {
        let scanParams = { TableName: tableName };
        let items;
        let deletedCount = 0;

        do {
            // Step 5A: Scan the table to retrieve items
            const scanResult = await dynamoDBDocClient.send(new ScanCommand(scanParams));
            items = scanResult.Items;

            // Step 5B: Log fetched items for debugging
            console.log('Fetched Items:', JSON.stringify(items, null, 2));

            if (!items || items.length === 0) {
                break;
            }

            // Step 5C: Map items to DeleteRequests using both 'EventId' and 'FaceId'
            const deleteRequests = items.map((item) => {
                console.log('Processing Item Key:', {
                    EventId: item.EventId,
                    FaceId: item.FaceId,
                });

                // Verify that both EventId and FaceId are present
                if (!item.EventId || !item.FaceId) {
                    console.warn('Missing EventId or FaceId for item:', item);
                    return null; // Skip this item
                }

                return {
                    DeleteRequest: {
                        Key: {
                            EventId: item.EventId, // Partition Key
                            FaceId: item.FaceId,     // Sort Key
                        },
                    },
                };
            }).filter(request => request !== null); // Remove null entries

            // Step 5D: Split deleteRequests into chunks of 25 to comply with DynamoDB's batch limits
            const chunks = [];
            for (let i = 0; i < deleteRequests.length; i += 25) {
                chunks.push(deleteRequests.slice(i, i + 25));
            }

            // Step 5E: Execute BatchWrite for each chunk
            for (const chunk of chunks) {
                console.log(`Deleting a batch of ${chunk.length} items...`);
                const batchWriteParams = {
                    RequestItems: {
                        [tableName]: chunk,
                    },
                };
                const batchWriteResult = await dynamoDBDocClient.send(new BatchWriteCommand(batchWriteParams));
                
                // Step 5F: Optionally handle unprocessed items
                if (Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
                    console.warn('Unprocessed items found, retrying...');
                    await retryUnprocessedItems(batchWriteResult.UnprocessedItems);
                }

                deletedCount += chunk.length;
                console.log(`Successfully deleted ${chunk.length} items in this batch.`);
            }

            console.log(`Total deleted items so far: ${deletedCount}`);

            // Step 5G: Update ExclusiveStartKey for pagination
            scanParams.ExclusiveStartKey = scanResult.LastEvaluatedKey;
        } while (scanParams.ExclusiveStartKey);

        console.log("All items deleted successfully.");
    } catch (error) {
        console.error("Error deleting items:", error);
    }
};

// Step 6: Define a function to handle unprocessed items (optional but recommended)
const retryUnprocessedItems = async (unprocessedItems, attempt = 1) => {
    const maxAttempts = 5;
    const delay = Math.pow(2, attempt) * 100; // Exponential backoff

    const params = {
        RequestItems: unprocessedItems,
    };
    console.log(`Retrying unprocessed items, attempt ${attempt}...`);
    const retryResult = await dynamoDBDocClient.send(new BatchWriteCommand(params));

    if (Object.keys(retryResult.UnprocessedItems).length > 0) {
        if (attempt < maxAttempts) {
            console.warn(`Attempt ${attempt} failed, retrying after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            await retryUnprocessedItems(retryResult.UnprocessedItems, attempt + 1);
        } else {
            console.error('Max retry attempts reached. Some items were not deleted:', retryResult.UnprocessedItems);
        }
    } else {
        console.log('All unprocessed items have been successfully deleted.');
    }
};

// Step 7: Define a function to confirm all deletions (optional)
const confirmDeletion = async () => {
    try {
        const scanParams = { TableName: tableName };
        const scanResult = await dynamoDBDocClient.send(new ScanCommand(scanParams));
        if (scanResult.Items.length === 0) {
            console.log("All items have been successfully deleted.");
        } else {
            console.warn("Some items were not deleted:", scanResult.Items);
        }
    } catch (error) {
        console.error("Error confirming deletion:", error);
    }
};

// Step 8: Execute the delete function and confirm
deleteAllItems().then(confirmDeletion).catch(error => console.error(error));
