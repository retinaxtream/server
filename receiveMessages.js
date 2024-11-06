// receiveMessage.js
import sqsClient from './config.js';
import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const receiveMessages = async () => {
  const params = {
    QueueUrl: 'https://sqs.ap-south-1.amazonaws.com/992382843794/image-upload-queue',
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 20, // Enable long polling
  };

  try {
    const data = await sqsClient.send(new ReceiveMessageCommand(params));
    if (data.Messages) {
      for (const message of data.Messages) {
        const body = JSON.parse(message.Body);
        const { eventId, socketId, filePath, originalName, mimetype } = body;

        console.log('Processing message:', body);

        // Process the message (e.g., upload to S3, index with Rekognition)
        // This is a placeholder for your processing logic

        // After processing, delete the message
        const deleteParams = {
          QueueUrl: params.QueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        };

        try {
          await sqsClient.send(new DeleteMessageCommand(deleteParams));
          console.log('Message deleted:', message.MessageId);
        } catch (deleteError) {
          console.error('Error deleting message:', deleteError);
        }
      }
    } else {
      console.log('No messages to process');
    }
  } catch (error) {
    console.error('Error receiving messages:', error);
  }
};

receiveMessages();
