import logger from '../Utils/logger.js'; // Import the logger
import { RekognitionClient, IndexFacesCommand, ListCollectionsCommand, CreateCollectionCommand } from '@aws-sdk/client-rekognition';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import AppError from '../Utils/AppError.js'; // Assuming you have an AppError utility
import pLimit from 'p-limit';
import { streamToBuffer } from '../Utils/streamUtils.js'; // Create a utility to convert streams to buffers
import { PutCommand as DocPutCommand, QueryCommand as DocQueryCommand } from '@aws-sdk/lib-dynamodb';



import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import express from 'express'; // Ensure Express is imported
const router = express.Router(); // Initialize Express router

// Load environment variables (ensure you have dotenv configured in your main server file)
import dotenv from 'dotenv';
dotenv.config();

// Configure AWS SDK
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Ensure these env variables are set
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

/**
 * Function to sanitize filenames by replacing special characters with underscores
 * @param {string} fileName - The original filename
 * @returns {string} - The sanitized filename
 */
const sanitizeFileName = (fileName) => {
  return encodeURIComponent(fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
};

/**
 * Function to generate a pre-signed URL for uploading to S3
 * @param {string} fileName - The sanitized filename
 * @param {string} fileType - The MIME type of the file
 * @param {string} eventId - The event identifier to structure the S3 key
 * @returns {Promise<string>} - The pre-signed URL
 */
const generatePreSignedUrl = async (fileName, fileType, eventId) => {
  const fileKey = `${eventId}/${fileName}`;
  const params = {
    Bucket: process.env.S3_BUCKET_NAME, // Ensure this environment variable is set
    Key: fileKey,
    Expires: 1200, // URL expiration time in seconds (5 minutes)
    ContentType: fileType,
    // ACL: 'public-read', // Uncomment if you want the uploaded file to be publicly readable
  };

  try {
    const url = await s3.getSignedUrlPromise('putObject', params);
    return url;
  } catch (error) {
    console.error(`Error generating pre-signed URL for ${fileKey}:`, error);
    throw error;
  }
};

/**
 * Handler to generate pre-signed URLs for multiple files
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export const getSignedUrls = async (req, res) => {
  const { files, eventId } = req.body;

  // Input Validation
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ message: 'No files provided for upload.' });
  }

  if (!eventId) {
    return res.status(400).json({ message: 'Event ID is required.' });
  }

  try {
    const signedUrls = await Promise.all(
      files.map(async (file) => {
        // Additional Validation (Optional)
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedMimeTypes.includes(file.fileType)) {
          throw new Error(`Unsupported file type: ${file.fileType}`);
        }

        const sanitizedFileName = sanitizeFileName(file.filename);
        const url = await generatePreSignedUrl(sanitizedFileName, file.fileType, eventId);
        const key = `${eventId}/${sanitizedFileName}`;
        console.log(`Generated pre-signed URL for ${key}`);
        return { url, key };
      })
    );

    res.json({ signedUrls });
  } catch (error) {
    console.error('Error generating pre-signed URLs:', error);
    res.status(500).json({ message: 'Error generating pre-signed URLs' });
  }
};

/**
 * Handler to notify backend of successful uploads
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export const uploadComplete = async (req, res) => {
  const { keys, eventId } = req.body;

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    console.warn('No file keys provided for upload completion.');
    return res.status(400).json({ message: 'No file keys provided.' });
  }

  if (!eventId) {
    return res.status(400).json({ message: 'Event ID is required.' });
  }

  try {
    console.log(`Upload complete for eventId ${eventId}. Keys:`, keys);

    // Example: Save to database
    // await EventModel.findByIdAndUpdate(eventId, { $push: { files: { $each: keys } } });

    res.status(200).json({ message: 'Upload successful.', keys });
  } catch (error) {
    console.error('Error handling upload completion:', error);
    res.status(500).json({ message: 'Error handling upload completion.' });
  }
};



// controllers/rekognitionController.js


// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

/**
 * Helper function to ensure Rekognition collection exists
 */
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
/**
 * Helper function to fetch image from S3 and convert to buffer
 */
const fetchImageFromS3 = async (s3Key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    const buffer = await streamToBuffer(response.Body);
    logger.info(`Fetched image buffer from S3: ${s3Key}`, { s3Key });
    return buffer;
  } catch (error) {
    logger.error(`Error fetching image from S3: ${s3Key}`, { s3Key, error: error.message });
    throw error;
  }
};

/**
 * Controller to process uploaded images: index faces and store metadata
 */
export const processUploadedImages = async (req, res, next) => {
  const { s3Keys, eventId, socketId } = req.body;

  console.log('eventId socketId');
  console.log(eventId, socketId);
  console.log('s3Keys');
  console.log(s3Keys);
  
  
  
  // Input Validation
  if (!s3Keys || !Array.isArray(s3Keys) || s3Keys.length === 0) {
    logger.warn('No S3 keys provided for processing', { eventId });
    return res.status(400).json({ message: 'No S3 keys provided for processing.' });
  }

  if (!eventId) {
    logger.warn('No eventId provided', { eventId });
    return res.status(400).json({ message: 'Event ID is required.' });
  }

  if (!socketId) {
    logger.warn('No socketId provided', { eventId });
    return res.status(400).json({ message: 'Socket ID is required for progress updates.' });
  }

  try {
    logger.info(`Starting processing of ${s3Keys.length} images for eventId: ${eventId}`, { eventId });
    console.log(`Starting processing of ${s3Keys.length} images for eventId: ${eventId}`, { eventId });
  
    // Ensure Rekognition collection exists
    const collectionId = `event-${eventId}`;
    const exists = await collectionExists(collectionId);
    if (!exists) {
      logger.info(`Collection ${collectionId} does not exist. Creating new collection.`, { collectionId });
      await createCollection(collectionId);
    }
    // Retrieve Socket.IO instance from Express app
    const io = req.app.get('socketio');

    const limit = pLimit(5); // Limit concurrency to 5

    let processedCount = 0;

    const processingPromises = s3Keys.map(s3Key => limit(async () => {
      try {
        // Fetch image from S3
        const imageBuffer = await fetchImageFromS3(s3Key);
        console.log('imageBuffer -------');
        console.log(imageBuffer);
        
        const indexCommand = new IndexFacesCommand({
          CollectionId: collectionId,
          Image: { Bytes: imageBuffer },
          ExternalImageId: s3Key, // Using S3 key as ExternalImageId
          DetectionAttributes: ['ALL'],
        });
        
        const indexResponse = await rekognitionClient.send(indexCommand);
            // const indexResponse = await rekognitionClient.send(indexCommand);

        logger.info(`Indexed faces for image: ${s3Key}`, { eventId, s3Key, faceRecords: indexResponse.FaceRecords.length });
        console.log(`Indexed faces for image: ${s3Key}`, { eventId, s3Key, faceRecords: indexResponse.FaceRecords.length });
        
        // Store face metadata in DynamoDB
        for (const faceRecord of indexResponse.FaceRecords) {
          const faceId = faceRecord.Face.FaceId;
          // const boundingBox = faceRecord.Face.BoundingBox;
          // const confidence = faceRecord.Face.Confidence;

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

            const dynamoResponse = await dynamoDBDocClient.send(new DocPutCommand(putParams));
            logger.info(`DynamoDB PutItem successful for FaceId ${faceId}`, { eventId, faceId, dynamoResponse });
        }

        // Update progress
        processedCount++;
        const uploadProgress = Math.round((processedCount / s3Keys.length) * 100);
        io.to(socketId).emit('uploadProgress', { progress: uploadProgress });
        logger.info(`Progress: ${uploadProgress}%`, { eventId, socketId });

      } catch (error) {
        logger.error(`Error processing image: ${s3Key}`, { eventId, s3Key, error: error.message });
        io.to(socketId).emit('uploadError', { message: `Failed to process image ${s3Key}` });
      }
    }));

    await Promise.all(processingPromises);

    // Emit completion event
    io.to(socketId).emit('uploadComplete', { message: 'All images processed successfully.' });
    logger.info(`Completed processing of images for eventId: ${eventId}`, { eventId });

    res.status(200).json({ message: 'Images processed successfully.' });
  } catch (error) {
    logger.error('Error processing uploaded images', { eventId, error: error.message });
    next(new AppError('Failed to process uploaded images.', 500));
  }
};
