// queue.js
import Bull from 'bull';

const uploadQueue = new Bull('upload-queue', {
  redis: { host: '127.0.0.1', port: 6379 }, // Configure Redis connection
});

export default uploadQueue;