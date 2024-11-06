// server/uploadController.js
import { sqsClient } from '../config.js';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';

// Define SQS Queue URL from environment variables
const QUEUE_URL = process.env.SQS_QUEUE_URL;

// Function to enqueue a message to SQS
const enqueueMessage = async (messageBody) => {
  const params = {
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
  };

  try {
    const data = await sqsClient.send(new SendMessageCommand(params));
    console.log('Message enqueued successfully:', data.MessageId);
  } catch (error) {
    console.error('Error enqueuing message:', error);
    throw error;
  }
};

// Upload Controller Function
export const uploadImages = async (req, res) => {
  const { eventId, socketId } = req;
  const files = req.files;

  if (!files || files.length === 0) {
    console.warn('No files uploaded', { eventId });
    return res.status(400).json({ message: 'No files uploaded' });
  }

  if (!socketId) {
    console.warn('No socket ID provided', { eventId });
    return res.status(400).json({ message: 'No socket ID provided' });
  }

  try {
    console.info(`Starting uploadImages for EventId: ${eventId} with ${files.length} files`, { eventId });

    // Define concurrency limit
    const limit = pLimit(3); // Adjust based on EC2 capacity

    // Create an array of promises with controlled concurrency
    const uploadPromises = files.map((file) =>
      limit(async () => {
        const messageBody = {
          eventId,
          socketId,
          filePath: path.resolve(file.path),
          originalName: file.originalname,
          mimetype: file.mimetype,
        };

        await enqueueMessage(messageBody);
      })
    );

    // Execute all upload promises
    await Promise.all(uploadPromises);

    console.info('All upload tasks enqueued successfully', { eventId });
    res.status(200).json({ message: 'Images uploaded and tasks enqueued' });
  } catch (error) {
    console.error(`Upload process failed: ${error.message}`, { eventId, error });
    res.status(500).json({ error: 'Failed to enqueue upload tasks' });
  }
};
