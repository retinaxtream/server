// backend/worker/uploadWorker.js

import uploadQueue from '../queue/uploadQueue.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, IndexFacesCommand, CreateCollectionCommand, ListCollectionsCommand } from '@aws-sdk/client-rekognition';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../Utils/logger.js';
import socket from '../socketClient.js'; // Import the Socket.io client
import dotenv from 'dotenv';

dotenv.config();

// Initialize AWS Clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

// Helper function to sanitize filenames
const sanitizeFilename = (filename) => {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-:]/g, '');
};

// Function to check if Rekognition collection exists
const collectionExists = async (collectionId) => {
  try {
    const listCommand = new ListCollectionsCommand({});
    const response = await rekognitionClient.send(listCommand);
    return response.CollectionIds.includes(collectionId);
  } catch (error) {
    logger.error(`Error listing collections: ${error.message}`, { collectionId, error });
    throw error;
  }
};

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

// Initial Log to Confirm Worker Start
logger.info('Upload Worker Started and Listening for Jobs...', { timestamp: new Date().toISOString() });

// Process Jobs from Queue
uploadQueue.process(async (job) => {
  const { filePath, originalName, eventId, socketId } = job.data; // Single file per job
  const collectionId = `event-${eventId}`;

  try {
    // Ensure Rekognition collection exists
    const exists = await collectionExists(collectionId);
    if (!exists) {
      await createCollection(collectionId);
    }

    // Read file from disk
    const fileBuffer = await fs.readFile(filePath);

    // Resize image using Sharp
    const resizedImageBuffer = await sharp(fileBuffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .toFormat('jpeg', { quality: 80 }) // Adjust quality as needed
      .toBuffer();

    // Generate unique ID and sanitize filename
    const uniqueId = uuidv4();
    const sanitizedFilename = sanitizeFilename(originalName);
    const s3Key = `${eventId}/${uniqueId}-${sanitizedFilename}`;

    // Upload to S3
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: resizedImageBuffer,
      ContentType: 'image/jpeg',
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    logger.info(`Uploaded ${s3Key} to S3`);

    // Emit progress via Socket.io (since it's a single file, progress is 100%)
    socket.emit('uploadProgress', { socketId, progress: 100 });

    // Index Faces with Rekognition
    const indexCommand = new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: resizedImageBuffer },
      ExternalImageId: uniqueId,
      DetectionAttributes: ['ALL'],
    });

    const indexResponse = await rekognitionClient.send(indexCommand);
    logger.info(`Indexed faces for ${s3Key}`);

    if (indexResponse.FaceRecords.length === 0) {
      logger.warn(`No faces detected in ${s3Key}`);
    } else {
      for (const faceRecord of indexResponse.FaceRecords) {
        const faceId = faceRecord.Face.FaceId;

        // Store metadata in DynamoDB
        const putParams = {
          TableName: process.env.EVENT_FACES_TABLE_NAME,
          Item: {
            EventId: eventId, // String
            FaceId: faceId,   // String
            ImageUrl: s3Key,  // String
            BoundingBox: faceRecord.Face.BoundingBox,
            Confidence: faceRecord.Face.Confidence, // Number
          },
        };

        await dynamoDBDocClient.send(new PutCommand(putParams)); // Corrected command
        logger.info(`Stored face ${faceId} metadata in DynamoDB`);
      }
    }

    // Optionally delete the file from server after processing
    await fs.unlink(filePath);
    logger.info(`Deleted temporary file ${filePath}`);

    // Emit completion via Socket.io
    socket.emit('uploadComplete', { socketId, message: 'Image processed successfully' });
    logger.info(`Completed processing file ${s3Key} for event ${eventId}`);
  } catch (error) {
    logger.error(`Error processing file ${filePath}: ${error.message}`, { error });
    socket.emit('uploadError', { socketId, message: `Failed to process image ${path.basename(filePath)}` });
    throw error; // Let Bull handle retries if configured
  }
});
