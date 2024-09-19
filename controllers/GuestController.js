// controllers/rekognitionController.js

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

// Helper function to sanitize filenames
const sanitizeFilename = (filename) => {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-:]/g, '');
};

// Helper function to construct S3 URL
const getS3Url = (s3Key) => {
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
};

// Function to store guest details
export const storeGuestDetails = async (req, res, next) => {
  const { eventId } = req.query; // Assuming eventId is passed as a query parameter
  const { name, mobile } = req.body;
  const file = req.file;

  // Validate required fields
  if (!eventId || !name || !mobile || !file) {
    return res.status(400).json({
      error: {
        message: 'Missing required fields: eventId, name, mobile, or image.',
        storageErrors: [],
        statusCode: 400,
        status: 'fail',
      },
    });
  }

  try {
    // Generate a unique ID for the guest
    const guestId = uuidv4();

    // Sanitize the original filename
    const sanitizedFilename = sanitizeFilename(file.originalname);

    // Construct the S3 key (path) for the guest image
    const s3Key = `${eventId}/guests/${guestId}-${sanitizedFilename}`;

    // Resize the image using sharp (optional, based on your requirements)
    const resizedImageBuffer = await sharp(file.buffer)
      .resize(1024, 1024, { fit: 'inside' })
      .toBuffer();

    // Upload the guest image to S3
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: resizedImageBuffer,
      ContentType: file.mimetype, // Ensure the correct MIME type
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`Guest image uploaded to S3: ${s3Key}`);

    // Construct the full S3 URL for the uploaded image
    const imageUrl = getS3Url(s3Key);

    // Prepare the item to be stored in DynamoDB
    const putParams = {
      TableName: process.env.DYNAMODB_TABLE_NAME, // Ensure this environment variable is set
      Item: {
        EventId: eventId,
        GuestId: guestId,
        Name: name, 
        Mobile: mobile,
        ImageUrl: imageUrl, // Store the full S3 URL
        ScannedAt: new Date().toISOString(),
      },
    };

    // Store guest details in DynamoDB
    await dynamoDBDocClient.send(new PutCommand(putParams));
    console.log(`Guest details stored in DynamoDB: ${guestId}`);

    // Respond with success
    res.status(200).json({ message: 'Guest details stored successfully', guestId });
  } catch (error) {
    console.error(`Error storing guest details: ${error.message}`);
    next(error); // Pass the error to the centralized error handler
  }
};

// Controller to get all guest details for an event
export const getGuestDetails = async (req, res) => {
    const { eventId } = req.query; // Assuming eventId is passed as a query parameter
  
    // Validate that eventId is provided
    if (!eventId) {
      return res.status(400).json({ message: 'EventId is required.' });
    }
  
    try {
      // Define parameters for DynamoDB Query
      const queryParams = {
        TableName: process.env.DYNAMODB_GUESTS_TABLE, // Ensure this environment variable is set
        KeyConditionExpression: 'EventId = :eventId',
        ExpressionAttributeValues: {
          ':eventId': { S: eventId },
        },
      };
   

      // Execute the QueryCommand
      const data = await dynamoDBClient.send(new QueryCommand(queryParams));
  
      // Check if any guests are found
      if (!data.Items || data.Items.length === 0) {
        return res.status(200).json({ guests: [] }); // Return empty array if no guests found
      }
  
      // Map DynamoDB items to a more readable format
      const guests = data.Items.map((item) => ({
        guestId: item.GuestId.S,
        name: item.Name.S,
        mobile: item.Mobile.S,
        imageUrl: getS3Url(item.ImageUrl.S),
        scannedAt: item.ScannedAt.S,
      }));
  
      // Respond with the guest details
      res.status(200).json({ guests });
    } catch (error) {
      console.error(`Error fetching guest details: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch guest details.' });
    }
  };