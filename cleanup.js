// server/cleanup.js
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import logger from './Utils/logger.js'; // Ensure logger is imported

// Schedule a task to run every day at midnight
cron.schedule('0 0 * * *', () => {
  const directory = path.join(__dirname, 'face_uploads');
  fs.readdir(directory, (err, files) => {
    if (err) {
      return logger.error(`Error reading directory ${directory}: ${err.message}`);
    }
    
    files.forEach((file) => {
      const filePath = path.join(directory, file);
      fs.unlink(filePath, (err) => {
        if (err) {
          logger.error(`Error deleting file ${filePath}: ${err.message}`);
        } else {
          logger.info(`Deleted file: ${filePath}`);
        }
      });
    });
  });
});
