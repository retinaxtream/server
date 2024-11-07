import { sqsClient } from '../config.js';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import pLimit from 'p-limit';
import fs from 'fs/promises'; 
import path from 'path';
import logger from '../Utils/logger.js'; 

const QUEUE_URL = process.env.SQS_QUEUE_URL;

const enqueueMessage = async (messageBody) => {
  const params = {
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
  };

  try {
    const data = await sqsClient.send(new SendMessageCommand(params));
    logger.info('Message enqueued successfully', { MessageId: data.MessageId, QueueUrl: QUEUE_URL });
    return data;
  } catch (error) {
    logger.error('Error enqueuing message', { error: error.message, stack: error.stack, params });
    throw error; 
  }
};

export const uploadImages = async (req, res) => {
  const { eventId, socketId } = req;
  const files = req.files;

  if (!files || files.length === 0) {
    logger.warn('No files uploaded', { eventId });
    return res.status(400).json({ message: 'No files uploaded' });
  }

  if (!socketId) {
    logger.warn('No socket ID provided', { eventId });
    return res.status(400).json({ message: 'No socket ID provided' });
  }

  try {
    logger.info(`Starting uploadImages for EventId: ${eventId} with ${files.length} files`, { eventId });

    const limit = pLimit(3); 

    const uploadPromises = files.map((file) =>
      limit(async () => {
        const messageBody = {
          eventId,
          socketId,
          filePath: path.resolve(file.path),
          originalName: file.originalname,
          mimetype: file.mimetype,
        };

        logger.debug('Enqueuing message', { messageBody });

        await enqueueMessage(messageBody);
      })
    );

    await Promise.all(uploadPromises);

    logger.info('All upload tasks enqueued successfully', { eventId });
    res.status(200).json({ message: 'Images uploaded and tasks enqueued' });
  } catch (error) {
    logger.error(`Upload process failed: ${error.message}`, { eventId, error });
    res.status(500).json({ error: 'Failed to enqueue upload tasks' });
  }
};
