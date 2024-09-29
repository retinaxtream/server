// Utils/logger.js

import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';
import AWS from 'aws-sdk';

// Configure AWS SDK v2
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: new AWS.Credentials(
    process.env.AWS_ACCESS_KEY_ID,
    process.env.AWS_SECRET_ACCESS_KEY
  ),
});

// Function to retrieve a unique identifier for the log stream
const getInstanceId = async () => {
  // Use an environment variable or a static identifier
  return process.env.INSTANCE_ID || 'local-instance';
};

// Asynchronous function to configure and return the logger
const configureLogger = async () => {
  try {
    const instanceId = await getInstanceId();

    const cloudWatchConfig = {
      logGroupName: process.env.LOG_GROUP_NAME || 'YourLogGroupName', // Set via environment
      logStreamName: `YourLogStreamName-${instanceId}`, // Dynamic log stream name
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      jsonMessage: true, // JSON formatted logs
      messageFormatter: ({ level, message, additionalInfo }) => {
        return `[${level}] : ${message} ${JSON.stringify(additionalInfo)}`;
      },
      uploadRate: 200, // Log events per second
      // Use AWS SDK v2 client
      awsOptions: {
        // Credentials are already set in AWS.config, so this may not be necessary
        // but you can include additional options here if needed
      },
    };

    const logger = winston.createLogger({
      level: 'info', // Minimum log level
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(), // Optional: Logs to console
        new WinstonCloudWatch(cloudWatchConfig), // Logs to CloudWatch
      ],
    });

    // Handle errors from the CloudWatch transport
    logger.on('error', (err) => {
      console.error('Winston CloudWatch error:', err);
    });

    return logger;
  } catch (error) {
    console.error('Failed to configure logger:', error);
    throw error; // Re-throw to allow handling in the application
  }
};

// Export the configured logger as a promise
const loggerPromise = configureLogger();

export default loggerPromise;
         