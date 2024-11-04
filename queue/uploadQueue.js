// server/queues/uploadQueue.js

import Bull from 'bull';
import dotenv from 'dotenv';
import logger from '../Utils/logger.js';

dotenv.config();

const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  // Do NOT include password since Redis does not require authentication
};

const uploadQueue = new Bull('upload-queue', {
  redis: redisOptions,
  settings: {
    lockDuration: 30000, // Time in ms to lock a job before it's considered stalled
    stalledInterval: 30000, // Interval in ms to check for stalled jobs
    maxStalledCount: 1, // Maximum number of times a job can be stalled before failing
  },
  limiter: {
    max: 50, // Maximum number of jobs processed per interval
    duration: 1000, // Interval duration in ms
  },
});

// Event Listeners for Logging
uploadQueue.on('error', (error) => {
  logger.error(`Bull Queue Error: ${error.message}`, { error, timestamp: new Date().toISOString() });
});

uploadQueue.on('completed', (job, result) => {
  logger.info(`Job completed: ${job.id}`, { jobId: job.id, result, timestamp: new Date().toISOString() });
});

uploadQueue.on('failed', (job, error) => {
  logger.error(`Job failed: ${job.id} - ${error.message}`, { jobId: job.id, error, timestamp: new Date().toISOString() });
});

export default uploadQueue;
