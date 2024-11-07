// controllers/rekognitionController.js

import logger from '../Utils/logger.js';
import { S3Client } from '@aws-sdk/client-s3';
import { RekognitionClient, CreateCollectionCommand, ListCollectionsCommand, IndexFacesCommand } from '@aws-sdk/client-rekognition';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Upload } from '@aws-sdk/lib-storage';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

// Cache for existing collections to minimize API calls
const existingCollections = new Set();

// Helper function to sanitize filenames
const sanitizeFilename = (filename) => {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-:]/g, '');
};

// Function to check if a Rekognition collection exists
const collectionExists = async (collectionId) => {
  if (existingCollections.has(collectionId)) {
    return true;
  }
  try {
    const listCommand = new ListCollectionsCommand({});
    const response = await rekognitionClient.send(listCommand);
    const exists = response.CollectionIds.includes(collectionId);
    if (exists) {
      existingCollections.add(collectionId);
    }
    return exists;
  } catch (error) {
    logger.error(`Error listing collections: ${error.message}`, { collectionId, error: error.stack });
    throw error;
  }
};

// Function to create a Rekognition collection if it doesn't exist
const createCollection = async (collectionId) => {
  try {
    const createCollectionCommand = new CreateCollectionCommand({ CollectionId: collectionId });
    const response = await rekognitionClient.send(createCollectionCommand);
    logger.info(`Collection ${collectionId} created successfully with ARN: ${response.CollectionArn}`, { collectionId });
    existingCollections.add(collectionId);
  } catch (error) {
    if (error.name === 'ResourceAlreadyExistsException') {
      logger.info(`Collection ${collectionId} already exists.`, { collectionId });
      existingCollections.add(collectionId);
    } else {
      logger.error(`Error creating collection ${collectionId}: ${error.message}`, { collectionId, error: error.stack });
      throw error;
    }
  }
};

// Controller for uploading multiple images
export const uploadImages = async (req, res) => {
  const { eventId, socketId } = req.query;
  const files = req.files;
  const collectionId = `event-${eventId}`;
  const bucketName = process.env.S3_BUCKET_NAME; // Ensure this is set in your environment variables

  // Input Validation
  if (!eventId || typeof eventId !== 'string') {
    logger.warn('Invalid or missing eventId', { eventId });
    return res.status(400).json({ message: 'Invalid or missing eventId' });
  }

  if (!socketId || typeof socketId !== 'string') {
    logger.warn('Invalid or missing socketId', { socketId });
    return res.status(400).json({ message: 'Invalid or missing socketId' });
  }

  if (!files || files.length === 0) {
    logger.warn('No files uploaded', { eventId });
    return res.status(400).json({ message: 'No files uploaded' });
  }

  // Retrieve Socket.IO instance from Express app
  const io = req.app.get('socketio');
  if (!io) {
    logger.error('Socket.IO instance not found in app', { eventId });
    return res.status(500).json({ message: 'Internal server error' });
  }

  // Limit the number of concurrent uploads to 5
  const limit = pLimit(5);

  try {
    logger.info(`Starting uploadImages for EventId: ${eventId} with ${files.length} files`, { eventId });

    // Check if Rekognition collection exists; create if it doesn't
    const exists = await collectionExists(collectionId);
    if (!exists) {
      logger.info(`Collection ${collectionId} does not exist. Creating new collection.`, { collectionId });
      await createCollection(collectionId);
    }

    const totalFiles = files.length;
    let processedCount = 0;

    // Create an array of promises with controlled concurrency
    const uploadPromises = files.map((file) =>
      limit(async () => {
        try {
          // Generate unique UUID for the filename
          const uniqueId = uuidv4();

          // Sanitize the original filename
          const sanitizedFilename = sanitizeFilename(file.originalname);

          // Construct S3 key with eventId as folder name
          const s3Key = `${eventId}/${uniqueId}-${sanitizedFilename}`;

          // Read the file from the temporary directory
          if (!file.path) {
            throw new Error(`File path is undefined for file: ${file.originalname}`);
          }
          const fileBuffer = await fs.readFile(file.path);

          // Resize and compress the image to ensure it's within Rekognition limits
          let resizedImageBuffer = await sharp(fileBuffer)
            .resize(1024, 1024, { fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer();

          let imageSizeInMB = resizedImageBuffer.length / (1024 * 1024);
          logger.info(`Initial resized image size: ${imageSizeInMB.toFixed(2)} MB`, { eventId, s3Key });

          // Further compress if necessary
          while (imageSizeInMB > 15) {
            const resizeRatio = 0.9; // Reduce dimensions by 10%
            resizedImageBuffer = await sharp(resizedImageBuffer)
              .resize({
                width: Math.round(resizedImageBuffer.width * resizeRatio),
                height: Math.round(resizedImageBuffer.height * resizeRatio),
                fit: 'inside',
              })
              .jpeg({ quality: 70 }) // Further compress
              .toBuffer();

            imageSizeInMB = resizedImageBuffer.length / (1024 * 1024);
            logger.info(`Further resized image size: ${imageSizeInMB.toFixed(2)} MB`, { eventId, s3Key });

            if (resizedImageBuffer.width < 500 || resizedImageBuffer.height < 500) {
              logger.warn(`Image size could not be reduced below 15 MB without compromising quality. Skipping Rekognition indexing for ${s3Key}.`, { eventId, s3Key });
              break;
            }
          }

          if (imageSizeInMB > 15) {
            logger.warn(`Final image size ${imageSizeInMB.toFixed(2)} MB exceeds Rekognition limit. Skipping indexing for ${s3Key}.`, { eventId, s3Key });
            // Proceed to upload to S3 without Rekognition indexing
          }

          // Upload image to S3 using multipart upload for efficiency
          const uploadParams = {
            Bucket: bucketName,
            Key: s3Key,
            Body: resizedImageBuffer,
            ContentType: file.mimetype,
          };

          const parallelUploads3 = new Upload({
            client: s3Client,
            params: uploadParams,
            queueSize: 4, // Concurrent upload threads
            partSize: 5 * 1024 * 1024, // 5MB per part
          });

          parallelUploads3.on('httpUploadProgress', (progress) => {
            logger.info(`Uploading ${sanitizedFilename}: ${progress.loaded}/${progress.total}`, { eventId, s3Key });
          });

          await parallelUploads3.done();

          logger.info(`Successfully uploaded to S3: ${s3Key}`, { eventId, s3Key });

          // Emit progress update after S3 upload
          processedCount++;
          const uploadProgress = Math.round((processedCount / totalFiles) * 100);
          logger.info(`Progress: ${uploadProgress}% for file: ${s3Key}`, { eventId, socketId, uploadProgress });
          io.to(socketId).emit('uploadProgress', { progress: uploadProgress });

          // Only proceed with Rekognition indexing if image size is within limits
          if (imageSizeInMB <= 15) {
            // Index faces in AWS Rekognition
            const indexCommand = new IndexFacesCommand({
              CollectionId: collectionId,
              Image: { Bytes: resizedImageBuffer },
              ExternalImageId: uniqueId, // Use uniqueId for external image identification
              DetectionAttributes: ['ALL'],
            });

            let indexResponse;
            try {
              indexResponse = await rekognitionClient.send(indexCommand);
              logger.info(`IndexFaces response for image ${s3Key}: ${JSON.stringify(indexResponse)}`, { eventId, s3Key });
            } catch (rekognitionError) {
              logger.error(`Rekognition IndexFacesCommand failed: ${rekognitionError.message}`, { eventId, s3Key, rekognitionError: rekognitionError.stack });
              io.to(socketId).emit('uploadError', { message: `Rekognition failed for image ${file.originalname}: ${rekognitionError.message}` });
              return {
                key: s3Key,
                url: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
              };
            }

            if (indexResponse.FaceRecords.length === 0) {
              logger.warn(`No faces indexed in image: ${s3Key}`, { eventId, s3Key });
            } else {
              logger.info(`Number of faces detected in image ${s3Key}: ${indexResponse.FaceRecords.length}`, { eventId, s3Key });

              // Store each face record in DynamoDB
              for (const faceRecord of indexResponse.FaceRecords) {
                const faceId = faceRecord.Face.FaceId;
                logger.info(`Face indexed with ID: ${faceId}`, { eventId, faceId });

                // Prepare the DynamoDB PutCommand parameters
                const putParams = {
                  TableName: process.env.EVENT_FACES_TABLE_NAME,
                  Item: {
                    EventId: eventId, // Partition Key (String)
                    FaceId: faceId,   // Sort Key (String)
                    ImageUrl: s3Key,  // String
                    BoundingBox: faceRecord.Face.BoundingBox, // Map
                    Confidence: faceRecord.Face.Confidence,   // Number
                  },
                };

                try {
                  // Send the PutCommand to DynamoDB
                  const dynamoResponse = await dynamoDBDocClient.send(new PutCommand(putParams));
                  logger.info(`DynamoDB PutItem successful for FaceId ${faceId}`, { eventId, faceId, dynamoResponse });
                } catch (dbError) {
                  logger.error(`Error storing FaceId ${faceId} in DynamoDB: ${dbError.message}`, { eventId, faceId, dbError: dbError.stack });
                  // Optionally, emit an error event to the client
                  io.to(socketId).emit('uploadError', { message: `Failed to store face data for image ${file.originalname}` });
                }
              }
            }
          }

          // Attempt to delete the temp file
          try {
            await fs.unlink(file.path);
            logger.info(`Deleted temp file: ${file.path}`, { eventId, fileName: file.originalname });
          } catch (unlinkError) {
            logger.error(`Failed to delete temp file ${file.path}: ${unlinkError.message}`, { eventId, fileName: file.originalname });
          }

          return {
            key: s3Key,
            url: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
          };
        } catch (imageError) {
          logger.error(`Error processing image ${file.originalname}: ${imageError.message}`, { eventId, error: imageError.stack });
          // Emit error for this specific image but continue processing others
          io.to(socketId).emit('uploadError', { message: `Failed to process image ${file.originalname}: ${imageError.message}` });
          return null; // Optionally, you can choose to filter out failed uploads
        }
      })
    );

    const uploadedFiles = await Promise.all(uploadPromises);

    // Filter out any failed uploads (if you returned null on failure)
    const successfulUploads = uploadedFiles.filter((file) => file !== null);

    // After all files are processed, emit completion event
    io.to(socketId).emit('uploadComplete', { message: 'All images processed successfully' });
    logger.info('All images processed successfully', { eventId, socketId });

    res.status(200).json({
      message: 'Files uploaded and faces indexed successfully.',
      files: successfulUploads,
    });
  } catch (error) {
    logger.error(`Error uploading files: ${error.message}`, { eventId, error: error.stack });
    io.to(socketId).emit('uploadError', { message: 'Failed to process images' });
    res.status(500).json({ message: 'Error uploading files.', error: error.message });
  }
};
