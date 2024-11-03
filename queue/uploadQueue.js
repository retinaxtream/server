import Bull from 'bull';
import dotenv from 'dotenv';
import logger from '../Utils/logger.js';

dotenv.config();

const redisOptions = {
  host: process.env.REDIS_HOST, // '127.0.0.1'
  port: process.env.REDIS_PORT, // 6379
};

if (process.env.REDIS_PASSWORD) {
  redisOptions.password = process.env.REDIS_PASSWORD;
}

const uploadQueue = new Bull('upload-queue', {
  redis: redisOptions,
});

uploadQueue.on('error', (error) => {
  logger.error(`Bull Queue Error: ${error.message}`, { error });
});

export default uploadQueue;
