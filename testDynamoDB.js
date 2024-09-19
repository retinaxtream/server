// testDynamoDB.js

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config(); // Load environment variables



const REGION = process.env.AWS_REGION || "ap-south-1";
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
console.log('DYNAMODB_TABLE_NAME:', TABLE_NAME);

if (!TABLE_NAME) {
  console.error('DYNAMODB_TABLE_NAME environment variable is not set.');
  process.exit(1);
}

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const testPutItem = async () => {
  const guestId = uuidv4();
  const params = {
    TableName: TABLE_NAME,
    Item: {
      GuestId: guestId,
      EventId: 'test-event-id',
      Name: 'Test Guest',
      Mobile: '+1234567890',
      ImageUrl: 'https://example.com/image.jpg',
      CreatedAt: new Date().toISOString(),
    },
  };

  try {
    await ddbDocClient.send(new PutCommand(params));
    console.log('Item successfully inserted into DynamoDB:', params.Item);
  } catch (error) {
    console.error('Error inserting item into DynamoDB:', error);
  }
};

testPutItem();
