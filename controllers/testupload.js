// controllers/rekognitionController.js

import logger from '../Utils/logger.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import Guest from '../models/GuestModel.js';
import { sendMedia } from '../Utils/emailSender.js';
import AppError from '../Utils/AppError.js';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';

// Initialize AWS S3 Client
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Helper function to sanitize filenames
const sanitizeFilename = (filename) => {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-:]/g, '');
};

// Controller for uploading multiple images
export const uploadImages = async (req, res) => {
  const files = req.files;
  const bucketName = process.env.S3_BUCKET_NAME; // Ensure this is set in your environment variables
  const folderPath = `uploads/${req.eventId}/`; // Organize uploads per event

  if (!files || files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded.' });
  }

  // Limit the number of concurrent uploads to 5
  const limit = pLimit(5);

  try {
    const uploadPromises = files.map((file) =>
      limit(async () => {
        const fileStream = await fs.readFile(file.path);
        const uploadParams = {
          Bucket: bucketName,
          Key: `${folderPath}${file.filename}`,
          Body: fileStream,
          ContentType: file.mimetype,
        };

        const parallelUploads3 = new Upload({
          client: s3Client,
          params: uploadParams,
          // Optional concurrency and part size configuration
          queueSize: 4, // concurrent uploads
          partSize: 5 * 1024 * 1024, // 5MB per part
        });

        parallelUploads3.on('httpUploadProgress', (progress) => {
          logger.info(`Uploading ${file.filename}: ${progress.loaded}/${progress.total}`);
        });

        await parallelUploads3.done();

        // Optionally, delete the file from local storage after upload
        await fs.unlink(file.path);

        return {
          key: `${folderPath}${file.filename}`,
          url: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${folderPath}${file.filename}`,
        };
      })
    );

    const uploadedFiles = await Promise.all(uploadPromises);

    // Further processing can be done here, such as indexing with Rekognition
    // For example:
    // await indexFacesInS3Images(uploadedFiles);

    res.status(200).json({
      message: 'Files uploaded successfully.',
      files: uploadedFiles,
    });
  } catch (error) {
    logger.error(`Error uploading files: ${error.message}`, { error });
    res.status(500).json({ message: 'Error uploading files.', error: error.message });
  }
};
