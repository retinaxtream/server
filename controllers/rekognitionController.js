// controllers/rekognitionController.js

import { S3Client, PutObjectCommand, ListObjectsV2Command,GetObjectCommand  } from '@aws-sdk/client-s3';
import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesCommand,
  ListCollectionsCommand,
  SearchFacesByImageCommand
} from '@aws-sdk/client-rekognition';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import sharp from 'sharp';

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
    console.log(`Collections found: ${JSON.stringify(collectionsResponse.CollectionIds)}`);
    return collectionsResponse.CollectionIds.includes(collectionId);
  } catch (error) {
    console.error(`Error listing collections: ${error.message}`);
    throw error;
  }
};

// Function to create a Rekognition collection if it doesn't exist
const createCollection = async (collectionId) => {
  try {
    const createCollectionCommand = new CreateCollectionCommand({ CollectionId: collectionId });
    await rekognitionClient.send(createCollectionCommand);
    console.log(`Collection ${collectionId} created successfully`);
  } catch (error) {
    console.error(`Error creating collection ${collectionId}: ${error.message}`);
    throw error;
  }
};

// Controller for uploading multiple images
export const uploadImages = async (req, res) => {
  const { eventId, socketId } = req.query; // Extract eventId and socketId from query params
  const files = req.files;
  const collectionId = `event-${eventId}`; // Collection ID for Rekognition

  if (!files || files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded' });
  }

  // Retrieve Socket.IO instance from Express app
  const io = req.app.get('socketio');

  if (!socketId) {
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

      console.log(`Image uploaded to S3: ${s3Key}`);

      // Emit progress update after S3 upload
      processedCount++;
      const uploadProgress = Math.round((processedCount / totalFiles) * 100);
      console.log(`Emitting progress: ${uploadProgress}%`);
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
        console.warn(`No faces indexed in image: ${s3Key}`);
      } else {
        for (const faceRecord of indexResponse.FaceRecords) {
          const faceId = faceRecord.Face.FaceId;
          console.log(`Face indexed with ID: ${faceId}`);

          // Store face metadata in DynamoDB
          const putParams = {
            TableName: process.env.DYNAMODB_TABLE,
            Item: {
              EventId: { S: eventId },
              FaceId: { S: faceId },
              ImageUrl: { S: s3Key }, // Store the S3 key with eventId folder
              BoundingBox: {
                M: {
                  Left: { N: faceRecord.Face.BoundingBox.Left.toString() },
                  Top: { N: faceRecord.Face.BoundingBox.Top.toString() },
                  Width: { N: faceRecord.Face.BoundingBox.Width.toString() },
                  Height: { N: faceRecord.Face.BoundingBox.Height.toString() },
                }
              },
              Confidence: { N: faceRecord.Face.Confidence.toString() }
            }
          };

          try {
            const dynamoResponse = await dynamoDBClient.send(new PutItemCommand(putParams));
            console.log(`DynamoDB response: ${JSON.stringify(dynamoResponse)}`);
          } catch (dbError) {
            console.error(`Error storing FaceId ${faceId} in DynamoDB: ${dbError.message}`);
          }
        }
      }
    }

    // After all files are processed, emit completion event
    io.to(socketId).emit('uploadComplete', { message: 'All images processed successfully' });

    res.status(200).json({ message: 'Images uploaded and faces indexed' });
  } catch (error) {
    console.error(`Error uploading and indexing images: ${error.message}`);
    io.to(socketId).emit('uploadError', { message: 'Failed to process images' });
    res.status(500).json({ error: 'Failed to process images' });
  }
};

// Controller for searching faces in an event
export const searchFace = async (req, res) => {  
  const { eventId } = req.query; // Get eventId from query params
  const file = req.file;

  if (!file) {
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
    console.log(`Search response: ${JSON.stringify(searchResponse, null, 2)}`);

    const faceMatches = searchResponse.FaceMatches;

    if (faceMatches.length === 0) {
      console.warn(`No matching faces found for event: ${eventId}`);
      return res.status(200).json({ matchedImages: [] });
    }

    const matchedImages = [];
    for (const match of faceMatches) {
      const faceId = match.Face.FaceId;
      console.log(`Matched face with FaceId: ${faceId} (Confidence: ${match.Face.Confidence})`);

      // Query DynamoDB for matching face IDs and get their corresponding image URLs
      const queryParams = {
        TableName: process.env.DYNAMODB_TABLE,
        KeyConditionExpression: 'EventId = :eventId and FaceId = :faceId',
        ExpressionAttributeValues: {
          ':eventId': { S: eventId },
          ':faceId': { S: faceId },
        },
      };

      const queryResponse = await dynamoDBClient.send(new QueryCommand(queryParams));
      console.log(`DynamoDB query response: ${JSON.stringify(queryResponse, null, 2)}`);

      if (queryResponse.Items.length === 0) {
        console.warn(`No corresponding image found in DynamoDB for FaceId: ${faceId}`);
      } else {
        for (const item of queryResponse.Items) {
          matchedImages.push(`https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${item.ImageUrl.S}`);
          console.log(`Matched image URL: https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${item.ImageUrl.S}`);
        }
      }
    }

    res.status(200).json({ matchedImages });
  } catch (error) {
    console.error(`Error searching faces: ${error.message}`);
    res.status(500).json({ error: 'Failed to search for faces' });
  }
};

// Controller for getting all event images
export const getEventImages = async (req, res) => {
  const { eventId } = req.query;

  if (!eventId) {
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
      return res.status(200).json({ images: [] });
    }

    // Map S3 objects to image URLs
    const images = listedObjects.Contents.map((item) => {
      const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${item.Key}`;
      return imageUrl;
    });

    res.status(200).json({ images });
  } catch (error) {
    console.error(`Error fetching event images: ${error.message}`);
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
    return Buffer.concat(chunks);
  } catch (error) {
    console.error(`Error fetching image from S3: ${error.message}`);
    throw error;
  }
};

// Function to ensure Rekognition collection exists
const ensureCollectionExists = async (collectionId) => {
  try {
    const createCollectionCommand = new CreateCollectionCommand({ CollectionId: collectionId });
    const response = await rekognitionClient.send(createCollectionCommand);
    console.log(`Collection ${collectionId} created with ARN: ${response.CollectionArn}`);
  } catch (error) {
    if (error.name === 'ResourceAlreadyExistsException') {
      console.log(`Collection ${collectionId} already exists.`);
    } else {
      console.error(`Error creating collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }
};

// Controller to compare guest faces and find matches
export const compareGuestFaces = async (req, res) => {
  const { eventId } = req.query; // Assuming eventId is passed as a query parameter

  // Validate that eventId is provided
  if (!eventId) {
    return res.status(400).json({ message: 'EventId is required.' });
  }

  // Define Rekognition collection name
  const collectionId = `event-${eventId}-collection`;

  try {
    // Step 1: Ensure Rekognition collection exists
    await ensureCollectionExists(collectionId);

    // Step 2: Retrieve all guest details for the event
    const queryParams = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      IndexName: 'EventIdIndex', // Ensure you have a GSI on EventId
      KeyConditionExpression: 'EventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId,
      },
    };

    const data = await dynamoDBDocClient.send(new QueryCommand(queryParams));

    if (!data.Items || data.Items.length === 0) {
      return res.status(200).json({ message: 'No guests found for this event.', matches: [] });
    }

    const guests = data.Items;

    // Step 3: Index all guest faces into Rekognition collection with concurrency control
    const limit = pLimit(5); // Limit concurrency to 5

    const indexPromises = guests.map((guest) => limit(async () => {
      const { GuestId, ImageUrl } = guest;

      // Check if the face is already indexed by storing FaceIds in DynamoDB
      if (guest.FaceId) {
        console.log(`Guest ${GuestId} already has a FaceId: ${guest.FaceId}`);
        return;
      }

      // Extract the S3 key from ImageUrl
      const s3Key = ImageUrl.replace(`https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`, '');

      // Get image buffer from S3
      const imageBuffer = await getImageBuffer(s3Key);

      // Resize the image using sharp (optional)
      const resizedImageBuffer = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();

      // Index face into Rekognition collection
      const indexParams = {
        CollectionId: collectionId,
        Image: { Bytes: resizedImageBuffer },
        ExternalImageId: GuestId, // Use GuestId as ExternalImageId
        DetectionAttributes: ['DEFAULT'],
      };

      try {
        const indexResponse = await rekognitionClient.send(new IndexFacesCommand(indexParams));
        if (indexResponse.FaceRecords && indexResponse.FaceRecords.length > 0) {
          const faceId = indexResponse.FaceRecords[0].Face.FaceId;
          console.log(`Indexed face for GuestId ${GuestId}: FaceId ${faceId}`);

          // Update DynamoDB with FaceId
          const updateParams = {
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Key: {
              EventId: eventId,
              GuestId: GuestId,
            },
            UpdateExpression: 'set FaceId = :f',
            ExpressionAttributeValues: {
              ':f': faceId,
            },
          };

          await dynamoDBDocClient.send(new PutCommand(updateParams));
        } else {
          console.warn(`No faces detected for GuestId ${GuestId}.`);
        }
      } catch (indexError) {
        console.error(`Error indexing face for GuestId ${GuestId}: ${indexError.message}`);
      }
    }));

    await Promise.all(indexPromises);
    console.log('Completed indexing all guest faces.');

    // Refresh the guests array to include updated FaceIds
    const refreshedData = await dynamoDBDocClient.send(new QueryCommand(queryParams));
    const refreshedGuests = refreshedData.Items;

    // Step 4: Compare each guest face with others to find matches
    const matches = [];

    for (const guest of refreshedGuests) {
      const { GuestId, FaceId, Name, Mobile, ImageUrl } = guest;

      // Skip guests without a FaceId
      if (!FaceId) {
        console.warn(`GuestId ${GuestId} does not have a FaceId. Skipping comparison.`);
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
        const faceMatches = searchResponse.FaceMatches;

        if (faceMatches && faceMatches.length > 0) {
          for (const match of faceMatches) {
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
            }
          }
        }
      } catch (searchError) {
        console.error(`Error searching faces for GuestId ${GuestId}: ${searchError.message}`);
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

    res.status(200).json({ matches: uniqueMatches });
  } catch (error) {
    console.error(`Error comparing guest faces: ${error.message}`);
    res.status(500).json({ error: 'Failed to compare guest faces.' });
  }
};