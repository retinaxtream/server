// controllers/rekognitionController.js

import logger from '../Utils/logger.js'; // Import the logger
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesCommand,
  ListCollectionsCommand,
  SearchFacesByImageCommand
} from '@aws-sdk/client-rekognition';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand as DocPutCommand } from '@aws-sdk/lib-dynamodb';
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

// Function to check if a Rekognition collection exists
const collectionExists = async (collectionId) => {
  try {
    const listCollectionsCommand = new ListCollectionsCommand({});
    const collectionsResponse = await rekognitionClient.send(listCollectionsCommand);
    logger.info(`Collections found: ${collectionsResponse.CollectionIds.length}`, { collectionId });
    return collectionsResponse.CollectionIds.includes(collectionId);
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
    // Check if collection exists for the event (Rekognition)
    const exists = await collectionExists(collectionId);
    if (!exists) {
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

      const indexResponse = await rekognitionClient.send(indexCommand);
      if (indexResponse.FaceRecords.length === 0) {
        logger.warn(`No faces indexed in image: ${s3Key}`, { eventId, s3Key });
      } else {
        for (const faceRecord of indexResponse.FaceRecords) {
          const faceId = faceRecord.Face.FaceId;
          logger.info(`Face indexed with ID: ${faceId}`, { eventId, faceId });

          // Store face metadata in DynamoDB
          const putParams = {
            TableName: process.env.DYNAMODB_TABLE,
            Item: {
              EventId: eventId,
              FaceId: faceId,
              ImageUrl: s3Key, // Store the S3 key with eventId folder
              BoundingBox: {
                Left: faceRecord.Face.BoundingBox.Left,
                Top: faceRecord.Face.BoundingBox.Top,
                Width: faceRecord.Face.BoundingBox.Width,
                Height: faceRecord.Face.BoundingBox.Height,
              },
              Confidence: faceRecord.Face.Confidence,
            }
          };

          try {
            const dynamoResponse = await dynamoDBDocClient.send(new PutCommand(putParams));
            logger.info(`DynamoDB response: ${JSON.stringify(dynamoResponse)}`, { eventId, faceId });
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
        TableName: process.env.DYNAMODB_TABLE,
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
    const createCollectionCommand = new CreateCollectionCommand({ CollectionId: collectionId });
    const response = await rekognitionClient.send(createCollectionCommand);
    logger.info(`Collection ${collectionId} created with ARN: ${response.CollectionArn}`, { collectionId });
  } catch (error) {
    if (error.name === 'ResourceAlreadyExistsException') {
      logger.info(`Collection ${collectionId} already exists.`, { collectionId });
    } else {
      logger.error(`Error creating collection ${collectionId}: ${error.message}`, { collectionId, error });
      throw error;
    }
  }
};

// Controller to compare guest faces and find matches
export const compareGuestFaces = async (req, res) => {
  const { eventId } = req.query; // Assuming eventId is passed as a query parameter

  // Validate that eventId is provided 
  if (!eventId) {
    logger.warn('EventId is required for comparing guest faces');
    return res.status(400).json({ message: 'EventId is required.' });
  }

  // Define Rekognition collection name
  const collectionId = `event-${eventId}-collection`;

  try {
    logger.info('Starting compareGuestFaces function', { eventId });

    // Ensure DynamoDB_TABLE_NAME is set
    if (!process.env.DYNAMODB_TABLE_NAME) {
      logger.error('DYNAMODB_TABLE_NAME environment variable is not set.');
      throw new AppError('Server configuration error: DynamoDB table name is missing.', 500);
    }

    // Ensure Rekognition collection exists
    await createCollection(collectionId);
    logger.info(`Ensured collection ${collectionId} exists`, { eventId });

    // Step 2: Retrieve all guest details for the event
    const queryParams = {
      TableName: process.env.DYNAMODB_TABLE_NAME, // GuestsTable
      IndexName: 'EventIdIndex', // GSI on GuestsTable
      KeyConditionExpression: 'EventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId, // Assuming eventId is a string
      },
    };

    logger.info('Executing DynamoDB QueryCommand to retrieve guests', { eventId, tableName: process.env.DYNAMODB_TABLE_NAME, queryParams });

    const data = await dynamoDBDocClient.send(new QueryCommand(queryParams));

    if (!data.Items || data.Items.length === 0) {
      logger.info('No guests found for this event.', { eventId });
      return res.status(200).json({ message: 'No guests found for this event.', matches: [] });
    }
    
    const guests = data.Items;
    logger.info(`Retrieved ${guests.length} guests for event ${eventId}`, { eventId, guestCount: guests.length });

    // Step 3: Index all guest faces into Rekognition collection with concurrency control
    const limit = pLimit(5); // Adjust concurrency as needed

    const indexPromises = guests.map((guest) => limit(async () => {
      const { GuestId, ImageUrl } = guest;

      // Check if the face is already indexed by storing FaceIds in DynamoDB
      if (guest.FaceId) {
        logger.info(`Guest ${GuestId} already has a FaceId: ${guest.FaceId}`, { eventId, GuestId, FaceId: guest.FaceId });
        return;
      }

      // Extract the S3 key from ImageUrl
      const s3Key = ImageUrl.replace(`https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/`, '');
      logger.info(`Processing GuestId ${GuestId} with S3 Key: ${s3Key}`, { eventId, GuestId, s3Key });

      // Get image buffer from S3
      const imageBuffer = await getImageBuffer(s3Key);
      logger.info(`Fetched image buffer for GuestId ${GuestId}`, { eventId, GuestId });

      // Resize the image using sharp (optional)
      const resizedImageBuffer = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();
      logger.info(`Resized image for GuestId ${GuestId}`, { eventId, GuestId });

      // Index face into Rekognition collection
      const indexParams = {
        CollectionId: collectionId,
        Image: { Bytes: resizedImageBuffer },
        ExternalImageId: GuestId, // Use GuestId as ExternalImageId
        DetectionAttributes: ['DEFAULT'],
      };

      try {
        const indexResponse = await rekognitionClient.send(new IndexFacesCommand(indexParams));
        logger.info(`Indexed face for GuestId ${GuestId}`, { eventId, GuestId });

        if (indexResponse.FaceRecords && indexResponse.FaceRecords.length > 0) {
          const faceRecord = indexResponse.FaceRecords[0];
          
          // Ensure that Face and FaceId exist
          if (faceRecord.Face && faceRecord.Face.FaceId) {
            const faceId = faceRecord.Face.FaceId;
            logger.info(`Obtained FaceId ${faceId} for GuestId ${GuestId}`, { eventId, GuestId, FaceId: faceId });

            // Update DynamoDB with FaceId
            const updateParams = {
              TableName: process.env.DYNAMODB_TABLE_NAME, // GuestsTable
              Key: {
                EventId: eventId,
                GuestId: GuestId,
              },
              UpdateExpression: 'set FaceId = :f',
              ExpressionAttributeValues: {
                ':f': faceId,
              },
            };

            try {
              await dynamoDBDocClient.send(new DocUpdateCommand(updateParams));
              logger.info(`Updated DynamoDB with FaceId ${faceId} for GuestId ${GuestId}`, { eventId, GuestId, FaceId: faceId });
            } catch (updateError) {
              logger.error(`Error updating DynamoDB with FaceId ${faceId} for GuestId ${GuestId}: ${updateError.message}`, { eventId, GuestId, FaceId: faceId, error: updateError });
            }
          } else {
            logger.warn(`Face or FaceId missing in FaceRecords for GuestId ${GuestId}.`, { eventId, GuestId });
          }
        } else {
          logger.warn(`No faces detected for GuestId ${GuestId}.`, { eventId, GuestId });
        }
      } catch (indexError) {
        logger.error(`Error indexing face for GuestId ${GuestId}: ${indexError.message}`, { eventId, GuestId, error: indexError });
      }
    }));

    await Promise.all(indexPromises);
    logger.info('Completed indexing all guest faces.', { eventId });

    // Step 4: Refresh the guests array to include updated FaceIds
    logger.info('Executing DynamoDB QueryCommand to retrieve updated guests', { eventId, tableName: process.env.DYNAMODB_TABLE_NAME, queryParams });

    const refreshedData = await dynamoDBDocClient.send(new QueryCommand(queryParams));
    const refreshedGuests = refreshedData.Items;
    logger.info('Refreshed guest data with FaceIds.', { eventId });

    // Step 5: Compare each guest's face with others to find matches
    const matches = [];

    for (const guest of refreshedGuests) {
      const { GuestId, FaceId, Name, Mobile, ImageUrl } = guest;

      // Skip guests without a FaceId
      if (!FaceId) {
        logger.warn(`GuestId ${GuestId} does not have a FaceId. Skipping comparison.`, { eventId, GuestId });
        continue;
      }

      // Search for matching faces in the collection
      const searchParams = {
        CollectionId: collectionId,
        FaceId: FaceId,
        FaceMatchThreshold: 80, // Adjust threshold as needed
        MaxFaces: 10, // Adjust based on expected number of matches
      };

      try {
        const searchResponse = await rekognitionClient.send(new SearchFacesCommand(searchParams));
        logger.info(`Performed SearchFaces for GuestId ${GuestId}. Matches found: ${searchResponse.FaceMatches.length}`, { eventId, GuestId, matchCount: searchResponse.FaceMatches.length });

        const faceMatches = searchResponse.FaceMatches;

        if (faceMatches && faceMatches.length > 0) {
          for (const match of faceMatches) {
            // Check if 'Face' property exists before accessing 'FaceId'
            if (!match.Face) {
              logger.warn(`Face object missing in faceMatches for FaceId ${FaceId}.`, { eventId, GuestId });
              continue;
            }

            const matchedFaceId = match.Face.FaceId;
            const similarity = match.Similarity;

            // Avoid matching the face with itself
            if (matchedFaceId === FaceId) continue;

            // Find the matched guest's details
            const matchedGuest = refreshedGuests.find(g => g.FaceId === matchedFaceId);

            if (matchedGuest) {
              matches.push({
                guest: {
                  guestId: GuestId,
                  name: Name,
                  mobile: Mobile,
                  imageUrl: ImageUrl,
                },
                matchedGuest: {
                  guestId: matchedGuest.GuestId,
                  name: matchedGuest.Name,
                  mobile: matchedGuest.Mobile,
                  imageUrl: matchedGuest.ImageUrl,
                },
                similarity: similarity,
              });
              logger.info(`Found match between GuestId ${GuestId} and GuestId ${matchedGuest.GuestId} with similarity ${similarity}`, { eventId, GuestId, matchedGuestId: matchedGuest.GuestId, similarity });
            } else {
              logger.warn(`Matched guest with FaceId ${matchedFaceId} not found in guests list.`, { eventId, matchedFaceId });
            }
          }
        }
      } catch (searchError) {
        logger.error(`Error searching faces for GuestId ${GuestId}: ${searchError.message}`, { eventId, GuestId, error: searchError });
      }
    }

    // Remove duplicate matches (e.g., A matches B and B matches A)
    const uniqueMatches = [];
    const seenPairs = new Set();

    for (const match of matches) {
      const pairKey = [match.guest.guestId, match.matchedGuest.guestId].sort().join('-');
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        uniqueMatches.push(match);
      }
    }  

    logger.info(`Found ${uniqueMatches.length} unique matches.`, { eventId });
    res.status(200).json({ matches: uniqueMatches });
  } catch (error) {
    logger.error(`Error comparing guest faces: ${error.message}`, { eventId, error });
    res.status(500).json({ error: 'Failed to compare guest faces.' });
  }
};