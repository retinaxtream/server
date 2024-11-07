// server/worker.js
import { sqsClient, s3Client, rekognitionClient, ddbDocClient } from './config.js';
import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { IndexFacesCommand } from '@aws-sdk/client-rekognition';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ListCollectionsCommand } from '@aws-sdk/client-rekognition';
import { PutCommand as DocPutCommand, QueryCommand as DocQueryCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import logger from './Utils/logger.js'
import {
    DynamoDBDocumentClient,
  } from '@aws-sdk/lib-dynamodb';

import {
  DynamoDBClient
} from '@aws-sdk/client-dynamodb';

dotenv.config({ path: './config.env' });

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

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

export class Worker {
    constructor(io) {
        this.io = io;
        this.queueUrl = process.env.SQS_QUEUE_URL;
        this.concurrencyLimit = 5; // Adjust based on your server's capacity
        this.pollingInterval = 10000; // 10 seconds
        this.limit = pLimit(this.concurrencyLimit);
    }

    // Function to process a single message
    processMessage = async (message) => {
        const { eventId, socketId, filePath, originalName, mimetype } = JSON.parse(message.Body);
        console.log('file Path');
        console.log(filePath);
        console.log('originalName');
        console.log(originalName);

        const uniqueId = uuidv4();
        const sanitizedFilename = originalName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-:]/g, '');
        const s3Key = `${eventId}/${uniqueId}-${sanitizedFilename}`;
        const collectionId = `event-${eventId}`;
        try {
            console.log(`Processing image: ${originalName} for Event ID: ${eventId}`);

            // Emit initial progress
            this.io.to(socketId).emit('uploadProgress', {
                file: originalName,
                progress: 0,
                status: 'started',
            });

            // Read the image file
            const fileContent = fs.readFileSync(filePath);
            console.log('s3Key');
            console.log(s3Key);
            console.log('fileContent');
            console.log(fileContent);

            const exists = await collectionExists(collectionId);
            if (!exists) {
                logger.info(`Collection ${collectionId} does not exist. Creating new collection.`, { collectionId });
                await createCollection(collectionId);
            }
            
            // Upload to S3
            const uploadParams = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: s3Key,
                Body: fileContent,
            };

            await s3Client.send(new PutObjectCommand(uploadParams))
            console.log(`Uploaded ${originalName} to S3 as ${s3Key}`);

            // Emit progress update: 50% 
            this.io.to(socketId).emit('uploadProgress', {
                file: originalName,
                progress: 50,
                status: 'in-progress',
            });

            // Resize the image (optional)
            const resizedImageBuffer = await sharp(originalName.buffer)
                .resize(1024, 1024, { fit: 'inside' })
                .toBuffer();


            // Index Faces with Rekognition
            const indexCommand  =  new IndexFacesCommand({
                CollectionId: collectionId,
                Image: { Bytes: resizedImageBuffer },
                ExternalImageId: uniqueId, // Use uniqueId for external image identification
                DetectionAttributes: ['ALL'],
              });

              const indexResponse = await rekognitionClient.send(indexCommand);

            console.log(`Rekognition response for ${s3Key}:`, indexResponse);

            // Check if faces are detected
            if (indexResponse.FaceRecords && indexResponse.FaceRecords.length > 0) {
                for (const faceRecord of indexResponse.FaceRecords) {
                    const faceId = faceRecord.Face.FaceId;
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
                      }   }
            } else {
                console.warn(`No faces detected in image: ${s3Key}`);
            }

            // Emit progress update: 100%
            this.io.to(socketId).emit('uploadProgress', {
                file: originalName,
                progress: 100,
                status: 'completed',
            });

            // Delete the message from SQS
            const deleteParams = {
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
            };

            await sqsClient.send(new DeleteMessageCommand(deleteParams));
            console.log(`Deleted message for ${originalName} from SQS`);

            // Optionally, delete the local file after processing
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`Error deleting file ${filePath}:`, err);
                } else {
                    console.log(`Deleted local file: ${filePath}`);
                }
            });
        } catch (error) {
            console.error(`Error processing image ${originalName}:`, error);

            // Emit error status via Socket.IO
            this.io.to(socketId).emit('uploadProgress', {
                file: originalName,
                progress: 0,
                status: 'error',
                error: error.message,
            });

            // Optionally, handle retries or move the message to a Dead-Letter Queue
        }
    };

    // Function to poll SQS and process messages
    pollQueue = async () => {
        const params = {
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 10, // Max is 10
            WaitTimeSeconds: 20, // Enable long polling
            VisibilityTimeout: 60, // Time in seconds that the message is invisible to other consumers
        };

        try {
            const data = await sqsClient.send(new ReceiveMessageCommand(params));

            if (data.Messages && data.Messages.length > 0) {
                console.log(`Received ${data.Messages.length} messages from SQS`);

                // Process messages concurrently with controlled concurrency
                const processingPromises = data.Messages.map((message) =>
                    this.limit(() => this.processMessage(message))
                );

                await Promise.all(processingPromises);
            } else {
                console.log('No messages received in this poll');
            }
        } catch (error) {
            console.error('Error receiving messages from SQS:', error);
        }
    };

    // Function to start polling
    start = () => {
        console.log('Worker started and polling SQS queue...');

        // Poll immediately and then set interval
        this.pollQueue();
        setInterval(this.pollQueue, this.pollingInterval);
    };
}
