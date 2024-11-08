// controllers/rekognitionController.js

import logger from '../Utils/logger.js'; // Import the logger
import { CatchAsync } from '../Utils/CatchAsync.js'
import Guest from '../models/GuestModel.js';
// AWS SDK v3 Clients and Commands
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { RekognitionClient, CreateCollectionCommand, IndexFacesCommand, SearchFacesCommand, ListCollectionsCommand, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition';
import { DynamoDBDocumentClient, PutCommand as DocPutCommand, QueryCommand as DocQueryCommand } from '@aws-sdk/lib-dynamodb';

// Utility Libraries
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import pLimit from 'p-limit'; // Ensure p-limit is installed
import AppError from '../Utils/AppError.js'; // Assuming you have an AppError utility

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
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


export const storeGuestDetails = async (req, res, next) => {
  logger.info("Calling storeGuestDetails function");

  const { eventId } = req.query; // Assuming eventId is passed as a query parameter
  const { name, email /*, mobile */ } = req.body; // Replaced 'mobile' with 'email'
  const file = req.file;

  // Validate required fields
  if (!eventId || !name || !email /* || !mobile */ || !file) { // Replaced 'mobile' with 'email'
    logger.warn('Missing required fields', { 
      eventId, 
      name, 
      email /*, mobile */, 
      filePresent: !!file 
    });
    return res.status(400).json({
      error: {
        message: 'Missing required fields: eventId, name, email, or image.', // Updated message
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
    logger.info('Guest image uploaded to S3', { eventId, s3Key });

     // Construct the full S3 URL for the uploaded image
     const imageUrl = getS3Url(s3Key);

    // Index the face in Rekognition
    const collectionId = `event-${eventId}`;

    const indexFacesParams = {
      CollectionId: collectionId,
      Image: {
        S3Object: {
          Bucket: process.env.S3_BUCKET_NAME,
          Name: s3Key,
        },
      },
      ExternalImageId: guestId, // Optional: Helps in identifying the face later
      MaxFaces: 1, // Assuming one face per image
      QualityFilter: 'AUTO',
    };


    const indexFacesCommand = new IndexFacesCommand(indexFacesParams);
    const indexFacesResponse = await rekognitionClient.send(indexFacesCommand);
    logger.info('Face indexed in Rekognition', { guestId, indexFacesResponse });

    // Extract FaceId from the response
    if (!indexFacesResponse.FaceRecords || indexFacesResponse.FaceRecords.length === 0) {
      logger.warn(`No face detected in the image for GuestId: ${guestId}`);
      return res.status(400).json({ error: 'No face detected in the uploaded image.' });
    }

    const faceId = indexFacesResponse.FaceRecords[0].Face.FaceId;
    logger.info('FaceId obtained', { guestId, faceId });

    // Prepare the item to be stored in DynamoDB
    const putParams = {
      TableName: process.env.GUESTS_TABLE_NAME, // Use the correct environment variable
      Item: {
        EventId: eventId,
        GuestId: guestId,
        Name: name,
        Email: email, // Added 'email'
        // Mobile: mobile, // Commented out 'mobile'
        ImageUrl: imageUrl, // Store the full S3 URL
        ScannedAt: new Date().toISOString(),
        FaceId: faceId, // Store the FaceId
      },
    };

    // Store guest details in DynamoDB
    await dynamoDBDocClient.send(new DocPutCommand(putParams));
    logger.info('Guest details stored in DynamoDB', { eventId, guestId });

    // Respond with success
    res.status(200).json({ message: 'Guest details stored successfully', guestId });
  } catch (error) {
    logger.error('Error storing guest details', { 
      eventId, 
      error: error.message, 
      stack: error.stack 
    });
    next(error); // Pass the error to the centralized error handler
  }
};
// Controller to get all guest details for an event
export const getGuestDetails = async (req, res) => {
  const { eventId } = req.query; // Assuming eventId is passed as a query parameter

  // Validate that eventId is provided
  if (!eventId) {
    logger.warn('EventId is missing in the request', { eventId });
    return res.status(400).json({ message: 'EventId is required.' });
  }

  try {
    // Define parameters for DynamoDB Query using DynamoDBDocumentClient
    const queryParams = {
      TableName: process.env.GUESTS_TABLE_NAME, // Ensure this environment variable is set
      IndexName: 'EventIdIndex', // Name of the GSI
      KeyConditionExpression: 'EventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId, // Directly pass the value without specifying type
      },
    };

    // Execute the QueryCommand using DynamoDBDocumentClient
    const data = await dynamoDBDocClient.send(new DocQueryCommand(queryParams));
    logger.info('DynamoDB Query executed', { eventId, returnedItems: data.Items.length });

    // Check if any guests are found
    if (!data.Items || data.Items.length === 0) {
      logger.info('No guests found for the event', { eventId });
      return res.status(200).json({ guests: [] }); // Return empty array if no guests found
    }

    // Map DynamoDB items to a more readable format
    const guests = data.Items.map((item) => ({
      guestId: item.GuestId,
      name: item.Name,
      mobile: item.Mobile,
      imageUrl: item.ImageUrl, // Assuming ImageUrl is already a full URL
      scannedAt: item.ScannedAt,
    }));

    // Respond with the guest details
    logger.info('Guest details retrieved successfully', { eventId, guestCount: guests.length });
    res.status(200).json({ guests });
  } catch (error) {
    logger.error('Error fetching guest details', { eventId, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch guest details.' });
  }
};


export const getGuestDetailsWithImages = CatchAsync(async (req, res, next) => {
  console.log('Calling getGuestDetailsWithImages');
  console.log('Event ID:', req.query.eventId);

  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({
      status: 'fail',
      message: 'Event ID is required',
    });
  }

  const guests = await Guest.find({ eventId });

  res.status(200).json({  
    status: 'success',
    data: {
      guests, // Changed from 'guest' to 'guests' for clarity
    },
  });
});