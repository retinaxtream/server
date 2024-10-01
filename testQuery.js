// testDynamoDB.js

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from config.env
dotenv.config({ path: path.resolve(__dirname, 'config.env') });

console.log('DYNAMODB_TABLE_NAME:', process.env.DYNAMODB_TABLE_NAME);

// Initialize DynamoDB Document Client
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(client);

const queryGuests = async (eventId) => {
  const queryParams = {
    TableName: process.env.DYNAMODB_TABLE_NAME, // "GuestsTable"
    IndexName: 'EventIdIndex', // Ensure this GSI exists
    KeyConditionExpression: 'EventId = :eventId',
    ExpressionAttributeValues: {
      ':eventId': eventId,
    },
  };

  try {
    const data = await ddbDocClient.send(new QueryCommand(queryParams));
    console.log('Query Success:', data.Items);
  } catch (error) {
    console.error('Query Error:', error);
  }
};

// Replace with your actual eventId
const eventId = '66b0cda960645b7b30f6389d';
queryGuests(eventId);
