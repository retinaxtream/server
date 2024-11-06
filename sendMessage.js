// sendMessage.js
import sqsClient from './config.js';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import fs from 'fs';
import path from 'path';

const sendMessageToQueue = async (eventId, socketId, filePath, originalName, mimetype) => {
  const messageBody = JSON.stringify({
    eventId,
    socketId,
    filePath,
    originalName,
    mimetype,
  });

  const params = {
    QueueUrl: 'https://sqs.ap-south-1.amazonaws.com/992382843794/image-upload-queue',
    MessageBody: messageBody,
  };

  try {
    const data = await sqsClient.send(new SendMessageCommand(params));
    console.log('Message sent successfully:', data.MessageId);
  } catch (error) {
    console.error('Error sending message:', error);
  }
};

// Example Usage
const main = async () => {
  const eventId = '671139b3c31e41de452d972c';
  const socketId = 'akkhtJdC18IJz8XvAAAF';
  const filePath = path.resolve('./uploads/image1.jpg');  
  const originalName = 'image1.jpg';
  const mimetype = 'image/jpeg';

  // Ensure the file exists
  if (!fs.existsSync(filePath)) {
    console.error('File does not exist:', filePath);
    return;
  }

  await sendMessageToQueue(eventId, socketId, filePath, originalName, mimetype);
};

main();
