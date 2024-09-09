import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, CreateCollectionCommand, IndexFacesCommand, ListCollectionsCommand, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import sharp from 'sharp';


// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });

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
    const { eventId } = req.body;
    const files = req.files;
    const collectionId = `event-${eventId}`;

    if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }

    try {
        // Check if collection exists
        const exists = await collectionExists(collectionId);
        if (!exists) {
            await createCollection(collectionId);
        }

        for (const file of files) {
            const s3Key = `${uuidv4()}-${file.originalname}`;

            // Resize the image
            const resizedImageBuffer = await sharp(file.buffer)
                .resize(1024, 1024, { fit: 'inside' })
                .toBuffer();

            // Upload image to S3
            const uploadParams = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: s3Key,
                Body: resizedImageBuffer,
                ACL: 'public-read',
            };
            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log(`Image uploaded to S3: ${s3Key}`);

            // Index faces in Rekognition
            const indexCommand = new IndexFacesCommand({
                CollectionId: collectionId,
                Image: { Bytes: resizedImageBuffer },
                ExternalImageId: s3Key,
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
                            ImageUrl: { S: s3Key },
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

        res.status(200).json({ message: 'Images uploaded and faces indexed' });
    } catch (error) {
        console.error(`Error indexing faces: ${error.message}`);
        res.status(500).json({ error: 'Failed to process images' });
    }
};
// Controller for searching faces in an event
export const searchFace = async (req, res) => {
    const { eventId } = req.body;
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
            MaxFaces: 50,  // Limit to top 5 matches
            FaceMatchThreshold: 70,  // Confidence threshold
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
