// controllers/rekognitionController.js

import logger from '../Utils/logger.js'; // Import the logger
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Guest from '../models/GuestModel.js';

import {
  IndexFacesCommand,
  SearchFacesByImageCommand
} from '@aws-sdk/client-rekognition';
import { PutCommand as DocPutCommand, QueryCommand as DocQueryCommand } from '@aws-sdk/lib-dynamodb';

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import {
  DynamoDBClient
} from '@aws-sdk/client-dynamodb';
import {
  RekognitionClient,
  DeleteCollectionCommand,
  CreateCollectionCommand,
  SearchFacesCommand,
  ListCollectionsCommand
} from '@aws-sdk/client-rekognition';
import {
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import AppError from '../Utils/AppError.js'; // Assuming you have an AppError utility
import {
  QueryCommand as QueryCommandLib,
  BatchGetCommand
} from '@aws-sdk/lib-dynamodb';
// import { log } from 'winston';

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

// Helper function to sanitize filenames
const sanitizeFilename = (filename) => {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-:]/g, '');
};

const collectionExists = async (collectionId) => {
  try {
    const listCommand = new ListCollectionsCommand({});
    console.log('listCommand !!!!!');
    console.log(listCommand);
    const response = await rekognitionClient.send(listCommand);
    console.log('response &&&&&&&&&&&&&&');
    console.log(response);
    return response.CollectionIds.includes(collectionId);
  } catch (error) {
    logger.error(`Error listing collections: ${error.message}`, { collectionId, error });
    throw error;
  }
}
// Function to create a Rekognition collection if it doesn't exist
const createCollection = async (collectionId) => {
  try {
    const createCollectionCommand = new CreateCollectionCommand({ CollectionId: collectionId });
    const response = await rekognitionClient.send(createCollectionCommand);
    logger.info(`Collection ${collectionId} created successfully with ARN: ${response.CollectionArn}`, { collectionId });
  } catch (error) {
    if (error.name === 'ResourceAlreadyExistsException') {
      logger.info(`Collection ${collectionId} already exists.`, { collectionId });
    } else {
      logger.error(`Error creating collection ${collectionId}: ${error.message}`, { collectionId, error });
      throw error;
    }
  }
};

// Controller for uploading multiple images
export const uploadImages = async (req, res) => {
  const { eventId, socketId } = req.query; // Extract eventId and socketId from query params
  const files = req.files;
  const collectionId = `event-${eventId}`; // Collection ID for Rekognition

  if (!files || files.length === 0) {
    logger.warn('No files uploaded', { eventId });
    return res.status(400).json({ message: 'No files uploaded' });
  }

  // Retrieve Socket.IO instance from Express app
  const io = req.app.get('socketio');

  if (!socketId) {
    logger.warn('No socket ID provided', { eventId });
    return res.status(400).json({ message: 'No socket ID provided' });
  }

  try {
    logger.info(`Starting uploadImages for EventId: ${eventId} with ${files.length} files`, { eventId });

    // Check if collection exists for the event (Rekognition)
    const exists = await collectionExists(collectionId);
    if (!exists) {
      console.log('!exists !!!!!!!!!!');
      await createCollection(collectionId);
    }

    const totalFiles = files.length;
    let processedCount = 0;

    for (const file of files) {
      // Generate unique UUID for the filename
      const uniqueId = uuidv4();

      // Sanitize the original filename
      const sanitizedFilename = sanitizeFilename(file.originalname);

      // Construct S3 key with eventId as folder name
      const s3Key = `${eventId}/${uniqueId}-${sanitizedFilename}`;

      // Resize the image (optional)
      const resizedImageBuffer = await sharp(file.buffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();

      // Upload image to S3 under the eventId folder
      const uploadParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: resizedImageBuffer,
      };
      await s3Client.send(new PutObjectCommand(uploadParams));

      logger.info(`Image uploaded to S3: ${s3Key}`, { eventId, s3Key });

      // Emit progress update after S3 upload
      processedCount++;
      const uploadProgress = Math.round((processedCount / totalFiles) * 100);
      logger.info(`Emitting progress: ${uploadProgress}%`, { eventId, socketId, uploadProgress });
      io.to(socketId).emit('uploadProgress', { progress: uploadProgress });

      // Index faces in AWS Rekognition
      const indexCommand = new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: resizedImageBuffer },
        ExternalImageId: uniqueId, // Use uniqueId for external image identification
        DetectionAttributes: ['ALL'],
      });
      console.log('^^^^^^^^^^^^^^');
      const indexResponse = await rekognitionClient.send(indexCommand);
      logger.info(`IndexFaces response for image ${s3Key}: ${JSON.stringify(indexResponse)}`, { eventId, s3Key });
      console.log('indexResponse');
      console.log(indexResponse);
      if (indexResponse.FaceRecords.length === 0) {
        logger.warn(`No faces indexed in image: ${s3Key}`, { eventId, s3Key });
        console.log('No faces indexed in image &&&&&&&&&');
      } else {
        console.log('Indexing ............................');
        logger.info(`Number of faces detected in image ${s3Key}: ${indexResponse.FaceRecords.length}`, { eventId, s3Key });

        for (const faceRecord of indexResponse.FaceRecords) {
          const faceId = faceRecord.Face.FaceId;
          console.log(`Face indexed with ID: ${faceId}`);
          logger.info(`Face indexed with ID: ${faceId}`, { eventId, faceId });

          // Store face metadata in DynamoDB
          const putParams = {
            TableName: process.env.EVENT_FACES_TABLE_NAME,
            Item: {
              EventId: eventId, // String
              FaceId: faceId,   // String
              ImageUrl: s3Key,  // String
              BoundingBox: {
                Left: faceRecord.Face.BoundingBox.Left,
                Top: faceRecord.Face.BoundingBox.Top,
                Width: faceRecord.Face.BoundingBox.Width,
                Height: faceRecord.Face.BoundingBox.Height,
              },
              Confidence: faceRecord.Face.Confidence, // Number
            }
          };

          try {
            const dynamoResponse = await dynamoDBDocClient.send(new DocPutCommand(putParams));
            logger.info(`DynamoDB PutItem successful for FaceId ${faceId}`, { eventId, faceId, dynamoResponse });
          } catch (dbError) {
            logger.error(`Error storing FaceId ${faceId} in DynamoDB: ${dbError.message}`, { eventId, faceId, dbError });
          }
        }
      }
    }

    // After all files are processed, emit completion event
    io.to(socketId).emit('uploadComplete', { message: 'All images processed successfully' });
    logger.info('All images processed successfully', { eventId, socketId });

    res.status(200).json({ message: 'Images uploaded and faces indexed' });
  } catch (error) {
    logger.error(`Error uploading and indexing images: ${error.message}`, { eventId, error });
    io.to(socketId).emit('uploadError', { message: 'Failed to process images' });
    res.status(500).json({ error: 'Failed to process images' });
  }
};

// Controller for searching faces in an event
export const searchFace = async (req, res) => {
  const { eventId } = req.query; // Get eventId from query params
  const file = req.file;

  if (!file) {
    logger.warn('No file uploaded for face search', { eventId });
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    // Resize the uploaded image to within the AWS Rekognition limits (max 4096x4096 pixels)
    const resizedImageBuffer = await sharp(file.buffer)
      .resize(1024, 1024, { fit: 'inside' })
      .toBuffer();

    // Call AWS Rekognition to search for faces
    const searchCommand = new SearchFacesByImageCommand({
      CollectionId: `event-${eventId}`,
      Image: { Bytes: resizedImageBuffer },
      MaxFaces: 50, // Limit to top 50 matches
      FaceMatchThreshold: 70, // Confidence threshold
    });

    const searchResponse = await rekognitionClient.send(searchCommand);
    logger.info(`Search response: ${JSON.stringify(searchResponse, null, 2)}`, { eventId });

    const faceMatches = searchResponse.FaceMatches;

    if (faceMatches.length === 0) {
      logger.warn(`No matching faces found for event: ${eventId}`, { eventId });
      return res.status(200).json({ matchedImages: [] });
    }

    const matchedImages = [];
    for (const match of faceMatches) {
      const faceId = match.Face.FaceId;
      logger.info(`Matched face with FaceId: ${faceId} (Confidence: ${match.Face.Confidence})`, { eventId, faceId, confidence: match.Face.Confidence });

      // Query DynamoDB for matching face IDs and get their corresponding image URLs
      const queryParams = {
        TableName: process.env.EVENT_FACES_TABLE_NAME,
        KeyConditionExpression: 'EventId = :eventId and FaceId = :faceId',
        ExpressionAttributeValues: {
          ':eventId': eventId,
          ':faceId': faceId,
        },
      };

      const queryResponse = await dynamoDBDocClient.send(new QueryCommand(queryParams));
      logger.info(`DynamoDB query response: ${JSON.stringify(queryResponse, null, 2)}`, { eventId, faceId });

      if (queryResponse.Items.length === 0) {
        logger.warn(`No corresponding image found in DynamoDB for FaceId: ${faceId}`, { eventId, faceId });
      } else {
        for (const item of queryResponse.Items) {
          const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${item.ImageUrl}`;
          matchedImages.push(imageUrl);
          logger.info(`Matched image URL: ${imageUrl}`, { eventId, faceId, imageUrl });
        }
      }
    }

    res.status(200).json({ matchedImages });
  } catch (error) {
    logger.error(`Error searching faces: ${error.message}`, { eventId, error });
    res.status(500).json({ error: 'Failed to search for faces' });
  }
};

// Controller for getting all event images
export const getEventImages = async (req, res) => {
  const { eventId } = req.query;

  if (!eventId) {
    logger.warn('No event ID provided for fetching images');
    return res.status(400).json({ message: 'No event ID provided' });
  }

  try {
    // List objects in the S3 bucket under the eventId prefix
    const listParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: `${eventId}/`,
    };

    const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      logger.info('No images found for event', { eventId });
      return res.status(200).json({ images: [] });
    }

    // Map S3 objects to image URLs
    const images = listedObjects.Contents.map((item) => {
      const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${item.Key}`;
      logger.info(`Fetched image URL: ${imageUrl}`, { eventId, key: item.Key });
      return imageUrl;
    });

    res.status(200).json({ images });
  } catch (error) {
    logger.error(`Error fetching event images: ${error.message}`, { eventId, error });
    res.status(500).json({ error: 'Failed to fetch event images' });
  }
};

// Helper function to get image buffer from S3
const getImageBuffer = async (s3Key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    const stream = response.Body;
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    logger.info(`Fetched image buffer from S3: ${s3Key}`, { s3Key });
    return buffer;
  } catch (error) {
    logger.error(`Error fetching image from S3: ${error.message}`, { s3Key, error });
    throw error;
  }
};



// Function to ensure Rekognition collection exists
const ensureCollectionExists = async (collectionId) => {
  try {
    const listCollectionsCommand = new ListCollectionsCommand({});
    const collectionsResponse = await rekognitionClient.send(listCollectionsCommand);
    if (!collectionsResponse.CollectionIds.includes(collectionId)) {
      const createCollectionCommand = new CreateCollectionCommand({ CollectionId: collectionId });
      const createResponse = await rekognitionClient.send(createCollectionCommand);
      logger.info(`Collection ${collectionId} created with ARN: ${createResponse.CollectionArn}`, { collectionId });
    } else {
      logger.info(`Collection ${collectionId} already exists.`, { collectionId });
    }
  } catch (error) {
    logger.error(`Error ensuring collection exists: ${error.message}`, { collectionId, error });
    throw error;
  }
};


// Function to retrieve guests by EventId
const getGuestsByEventId = async (eventId) => {
  const queryParams = {
    TableName: process.env.GUESTS_TABLE_NAME,
    IndexName: 'EventIdIndex',
    KeyConditionExpression: 'EventId = :eventId',
    ExpressionAttributeValues: {
      ':eventId': eventId,
    },
  };

  console.log('queryParams @@@@@@@@@@@');
  console.log(queryParams);

  try {
    console.log('INSIDE TRY');
    const data = await dynamoDBDocClient.send(new DocQueryCommand(queryParams));
    console.log('data calllllllllllllllllling');
    console.log(data);
    console.log(data.Items);
    logger.info('DynamoDB Query executed', { eventId, returnedItems: data.Items ? data.Items.length : 0 });

    // Check if data.Items is defined and not empty
    if (!data.Items || data.Items.length === 0) {
      logger.warn(`No guests found for event: ${eventId}`);
      return [];
    }

    return data.Items.map((item) => ({
      guestId: item.GuestId,
      eventId: item.EventId,
      faceId: item.FaceId,
      Mobile: item.Mobile,
      Name: item.Name,
      imageUrl: item.ImageUrl,
    }));
  } catch (error) {
    logger.error('Error querying GuestsTable', { eventId, error: error.message });
    throw error;
  }
};


// Helper function to get event faces by FaceIds using QueryCommand on GSI
const getEventFacesByFaceIds = async (faceIds, eventId) => {
  if (!faceIds || faceIds.length === 0) {
    logger.warn('No FaceIds provided for BatchGetCommand', { eventId });
    return [];
  }

  const batchGetParams = {
    RequestItems: {
      [process.env.EVENT_FACES_TABLE_NAME]: {
        Keys: faceIds.map((faceId) => ({
          FaceId: faceId,     // Assuming FaceId is a string
          EventId: eventId,   // Assuming EventId is a string
        })),
        // Optionally, specify ProjectionExpression to retrieve only necessary attributes
        // ProjectionExpression: 'FaceId, ImageUrl, Confidence'
      },
    },
  };

  try {
    const batchGetResponse = await dynamoDBDocClient.send(new BatchGetCommand(batchGetParams));

    if (
      !batchGetResponse.Responses ||
      !batchGetResponse.Responses[process.env.EVENT_FACES_TABLE_NAME] ||
      batchGetResponse.Responses[process.env.EVENT_FACES_TABLE_NAME].length === 0
    ) {
      logger.info('No matches found in EventFaces table', { eventId });
      return [];
    }

    return batchGetResponse.Responses[process.env.EVENT_FACES_TABLE_NAME].map(item => ({
      faceId: item.FaceId,
      imageUrl: item.ImageUrl,
      confidence: item.Confidence,
    }));
  } catch (error) {
    logger.error('Error executing BatchGetCommand for EventFaces', { error: error.message, eventId });
    throw error;
  }
};

// Helper function to convert stream to buffer
const streamToBuffer = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

const getPresignedUrl = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL valid for 1 hour
    return url;
  } catch (error) {
    console.error(`Error generating pre-signed URL for key ${key}:`, error);
    return null; // Handle as per your application's requirements
  }
};


///////////////////////////FOR COMPARE GUEST FACES /////////////////////////////////////////
export const compareGuestFaces = async (req, res, next) => {
  const { eventId } = req.query;

  // Validate required fields
  if (!eventId) {
    logger.warn('Missing required fields', { eventId });
    return res.status(400).json({
      error: {
        message: 'Missing required field: eventId.',
        statusCode: 400,
        status: 'fail',
      },
    });
  }

  try {
    // Retrieve all guests for the event
    const guests = await getGuestsByEventId(eventId);
    logger.info({ message: 'All the guests under the eventId.', guests });

    if (!guests || guests.length === 0) {
      logger.info('No guests found for the event', { eventId });
      return res.status(200).json({ message: 'No guests found for the event.', guestMatches: [] });
    }

    const collectionId = `event-${eventId}`; // Ensure consistent naming

    const exists = await collectionExists(collectionId);
    if (!exists) {
      logger.error(`Rekognition collection ${collectionId} does not exist. Please upload event images first.`);
      return res.status(400).json({ error: `Rekognition collection ${collectionId} does not exist. Please upload event images first.` });
    } else {
      logger.info(`Using existing collection: ${collectionId}`, { eventId, collectionId });
    }

    const guestMatches = [];
    const limit = pLimit(5); // Adjust concurrency as needed

    const processingPromises = guests.map(guest => limit(async () => {
      if (!guest.faceId || !guest.imageUrl) {
        logger.warn(`Guest ${guest.guestId} does not have FaceId or ImageUrl.`, { guestId: guest.guestId });
        guestMatches.push({
          guestId: guest.guestId,
          name: guest.Name,
          mobile: guest.Mobile,
          matches: [], // No matches
        });
        return;
      }

      try {
        // Fetch the guest image from S3
        const imageUrl = guest.imageUrl;
        const s3Url = new URL(imageUrl);
        const s3Key = decodeURIComponent(s3Url.pathname.substring(1)); // Remove leading '/'
        logger.info(`Fetching image from S3: ${s3Key}`, { eventId });

        const getObjectParams = {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: s3Key,
        };
        const getObjectCommand = new GetObjectCommand(getObjectParams);
        const s3Response = await s3Client.send(getObjectCommand);
        const imageBuffer = await streamToBuffer(s3Response.Body);

        // Search for matching faces in EventFaces collection
        const searchFacesByImageParams = {
          CollectionId: collectionId,
          Image: {
            Bytes: imageBuffer,
          },
          FaceMatchThreshold: 70, // Adjust as needed
          MaxFaces: 10, // Adjust based on how many matches you want
        };

        const searchFacesByImageCommand = new SearchFacesByImageCommand(searchFacesByImageParams);
        const searchResponse = await rekognitionClient.send(searchFacesByImageCommand);

        const matchedFaceIds = searchResponse.FaceMatches.map(match => match.Face.FaceId);
        if (matchedFaceIds.length === 0) {
          logger.info(`No matches found for GuestId: ${guest.guestId}`, { guestId: guest.guestId });
          guestMatches.push({
            guestId: guest.guestId,
            name: guest.Name,
            mobile: guest.Mobile,
            matches: [], // No matches
          });
          return;
        }

        // Retrieve details of matched EventFaces
        const matchedImages = await getEventFacesByFaceIds(matchedFaceIds, eventId);

        // Generate pre-signed URLs for matched images
        const matchedImagesWithUrls = await Promise.all(matchedImages.map(async (match) => {
          const presignedUrl = await getPresignedUrl(match.imageUrl);
          return {
            faceId: match.faceId, // Ensure consistent property names (lowercase)
            imageUrl: presignedUrl, // Replace with pre-signed URL
            confidence: match.confidence,
          };
        }));

        // Push to guestMatches array with consistent property naming
        guestMatches.push({
          guestId: guest.guestId,
          name: guest.Name,
          mobile: guest.Mobile,
          matches: matchedImagesWithUrls, // Array of matched images with URLs
        });

        // **Store the matched details in MongoDB**
        const matchedGuestData = {
          eventId: eventId,
          guestId: guest.guestId,
          name: guest.Name,
          mobile: guest.Mobile,
          matches: matchedImagesWithUrls,
        };

        // Save to MongoDB using the correct model 
        const matchedGuest = new Guest(matchedGuestData);
        await matchedGuest.save();
        logger.info(`Matched guest data saved to MongoDB for GuestId: ${guest.guestId}`, { guestId: guest.guestId });
      } catch (error) {
        logger.error('Error processing guest face comparison', { guestId: guest.guestId, error: error.message, stack: error.stack });
        // Optionally, you can push partial data or continue
        guestMatches.push({
          guestId: guest.guestId,
          name: guest.Name,
          mobile: guest.Mobile,
          matches: [], // No matches due to error
        });
      }
    }));

    // Wait for all processing to complete
    await Promise.all(processingPromises);

    // Respond with the guest matches
    res.status(200).json({
      message: 'Face comparison completed successfully.',
      guestMatches
    });

  } catch (error) {
    logger.error('Error in compareGuestFaces function', { eventId, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to compare guest faces.' });
  }
};





//////////////////////////FOR DELETING COLLECTIONS ////////////////////////////////////
// List of Collection IDs to delete
const collectionIds = [
  'event-66a4a9b6e68c3c0766ce76e2',
  'event-66b0cda960645b7b30f6389d',
  'event-66b0cda960645b7b30f6389d-collection',
  'event-66b0cda960645b7b30f6389d-faces-collection',
  'event-66b8e52c60645b7b30f6405c',
  'event-66cec52a28ad7c1333701d95',
  'event-66cefe727f02f1ad4c0fa98a',
  'event-66f7f5c3067744a8b3984be3',
  'event-testeventid',
  'event-wedding-2023',
  'event-wedding-2024'
];

export const deleteAllCollections = async (req, res, next) => {
  try {
    const limit = pLimit(5); // Limit concurrency to 5

    // Function to delete a single collection
    const deleteCollection = async (collectionId) => {
      try {
        const deleteParams = { CollectionId: collectionId };
        const deleteCommand = new DeleteCollectionCommand(deleteParams);
        const response = await rekognitionClient.send(deleteCommand);
        logger.info(`Successfully deleted collection: ${collectionId}`, { collectionId, response });
        return { collectionId, status: 'Deleted', response };
      } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
          logger.warn(`Collection not found: ${collectionId}`, { collectionId });
          return { collectionId, status: 'Not Found' };
        } else {
          logger.error(`Failed to delete collection: ${collectionId}`, { collectionId, error });
          return { collectionId, status: 'Error', message: error.message };
        }
      }
    };

    // Create an array of deletion promises with controlled concurrency
    const deletionPromises = collectionIds.map((collectionId) =>
      limit(() => deleteCollection(collectionId))
    );

    // Execute all deletion promises
    const deletionResults = await Promise.all(deletionPromises);

    // Respond with the results
    res.status(200).json({
      message: 'Deletion process completed',
      results: deletionResults
    });
  } catch (error) {
    logger.error('Error deleting collections', { error });
    next(new AppError('Failed to delete collections', 500));
  }
};