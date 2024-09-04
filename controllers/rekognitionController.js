import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, IndexFacesCommand, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Controller for uploading multiple images
export const uploadImages = async (req, res) => {
    const { eventId } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }

    try {
        for (const file of files) {
            const s3Key = `${uuidv4()}-${file.originalname}`;

            // Upload image to S3
            const uploadParams = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: s3Key,
                Body: file.buffer,
            };

            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log(`Image uploaded to S3: ${s3Key}`);

            // Index faces in Rekognition
            const indexCommand = new IndexFacesCommand({
                CollectionId: `event-${eventId}`,
                Image: { Bytes: file.buffer },
                ExternalImageId: s3Key,
                DetectionAttributes: ['ALL'],
            });

            const indexResponse = await rekognitionClient.send(indexCommand);
            console.log('Faces indexed:', indexResponse);

            // Store face metadata in DynamoDB
            for (const faceRecord of indexResponse.FaceRecords) {
                const faceId = faceRecord.Face.FaceId;

                const item = {
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
                            },
                        },
                        Confidence: { N: faceRecord.Face.Confidence.toString() },
                    },
                };

                await dynamoDBClient.send(new PutItemCommand(item));
                console.log('Face metadata stored in DynamoDB:', faceId);
            }
        }
        res.status(200).json({ message: 'Images uploaded and faces indexed' });
    } catch (error) {
        console.error('Error indexing faces:', error);
        res.status(500).json({ error: 'Failed to process images' });
    }
};

// Controller for searching an image
export const searchFace = async (req, res) => {
    const { eventId } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const searchCommand = new SearchFacesByImageCommand({
            CollectionId: `event-${eventId}`,
            Image: { Bytes: file.buffer },
            MaxFaces: 5,
            FaceMatchThreshold: 90,
        });

        const searchResponse = await rekognitionClient.send(searchCommand);
        const faceMatches = searchResponse.FaceMatches;

        const matchedImages = [];
        for (const match of faceMatches) {
            const faceId = match.Face.FaceId;

            const queryParams = {
                TableName: process.env.DYNAMODB_TABLE,
                KeyConditionExpression: 'EventId = :eventId and FaceId = :faceId',
                ExpressionAttributeValues: {
                    ':eventId': { S: eventId },
                    ':faceId': { S: faceId },
                },
            };

            const queryResponse = await dynamoDBClient.send(new QueryCommand(queryParams));

            for (const item of queryResponse.Items) {
                matchedImages.push(item.ImageUrl.S);
            }
        }

        res.status(200).json({ matchedImages });
    } catch (error) {
        console.error('Error searching faces:', error);
        res.status(500).json({ error: 'Failed to search for faces' });
    }
};
