// testDynamoDB.js

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from config.env
dotenv.config({ path: path.resolve(__dirname, 'config.env') });

// Log environment variables to verify they are loaded (Avoid logging sensitive info in production)
console.log('GUESTS_TABLE_NAME:', process.env.GUESTS_TABLE_NAME);
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('S3_BUCKET_NAME:', process.env.S3_BUCKET_NAME);
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID_PROD ? 'Present' : 'Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY_PROD ? 'Present' : 'Missing');

// Check if required environment variables are loaded
if (!process.env.GUESTS_TABLE_NAME) {
  console.error('GUESTS_TABLE_NAME environment variable is not set.');
  process.exit(1);
}

if (!process.env.AWS_ACCESS_KEY_ID_PROD || !process.env.AWS_SECRET_ACCESS_KEY_PROD) {
  console.error('AWS credentials are not set in environment variables.');
  process.exit(1);
}

// Initialize Low-Level DynamoDB Client with Explicit Credentials and Logging
const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_PROD,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_PROD,
  },
  logger: console, // Enables console logging for the SDK
});

// Function to query guests based on eventId using low-level DynamoDBClient
const queryGuests = async (eventId) => {
  const queryParams = {
    TableName: process.env.GUESTS_TABLE_NAME, // "GuestsTable"
    IndexName: 'EventIdIndex', // Ensure this GSI exists
    KeyConditionExpression: 'EventId = :eventId',
    ExpressionAttributeValues: {
      ':eventId': { S: eventId }, // Explicitly specify the data type
    },
  };

  try {
    console.log('Executing QueryCommand with params:', JSON.stringify(queryParams, null, 2));
    const data = await client.send(new QueryCommand(queryParams));
    if (!data.Items || data.Items.length === 0) {
      console.log('No guests found for this event.');
      return;
    }
    // Unmarshall the items for readability
    const unmarshalledItems = data.Items.map(item => unmarshall(item));
    console.log('Query Success:', JSON.stringify(unmarshalledItems, null, 2));
  } catch (error) {
    console.error('Query Error:', error);
    if (error.name === 'ResourceNotFoundException') {
      console.error('The table or index does not exist.');
    } else if (error.name === 'ValidationException') {
      console.error('There is an issue with the provided parameters.');
    }
    // Add more error-specific handling as needed
  }
};

// Use the existing EventId
const eventId = '66b0cda960645b7b30f6389d';
queryGuests(eventId);
