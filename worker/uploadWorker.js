// backend/worker/uploadWorker.js

import uploadQueue from '../queue/uploadQueue.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, IndexFacesCommand, CreateCollectionCommand, ListCollectionsCommand } from '@aws-sdk/client-rekognition';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../Utils/logger.js';
import io from '../socket.js'; // Import the Socket.io instance
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

// Process Jobs from Queue
uploadQueue.process(async (job) => {
  const { files, eventId, socketId } = job.data;
  const collectionId = `event-${eventId}`;

  // Ensure Rekognition collection exists
  const exists = await collectionExists(collectionId);
  if (!exists) {
    await createCollection(collectionId);
  }

  const totalFiles = files.length;
  let processedCount = 0;

  for (const filePath of files) {
    try {
      // Read file from disk
      const fileBuffer = await fs.readFile(filePath);

      // Resize image using Sharp
      const resizedImageBuffer = await sharp(fileBuffer)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .toFormat('jpeg', { quality: 80 }) // Adjust quality as needed
        .toBuffer();

      // Generate unique ID and sanitize filename
      const uniqueId = uuidv4();
      const originalName = path.basename(filePath);
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

      // Emit progress via Socket.io
      processedCount++;
      const uploadProgress = Math.round((processedCount / totalFiles) * 100);
      io.to(socketId).emit('uploadProgress', { progress: uploadProgress });

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

          await dynamoDBDocClient.send(new PutItemCommand(putParams));
          logger.info(`Stored face ${faceId} metadata in DynamoDB`);
        }
      }

      // Optionally delete the file from server after processing
      await fs.unlink(filePath);
      logger.info(`Deleted temporary file ${filePath}`);
    } catch (error) {
      logger.error(`Error processing file ${filePath}: ${error.message}`, { error });
      io.to(socketId).emit('uploadError', { message: `Failed to process image ${path.basename(filePath)}` });
    }
  }

  // Emit completion via Socket.io
  io.to(socketId).emit('uploadComplete', { message: 'All images processed successfully' });
  logger.info(`Completed processing all files for event ${eventId}`);
});
