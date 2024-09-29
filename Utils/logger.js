// Utils/logger.js

import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './config.env' });

// Function to retrieve a unique identifier for the log stream
const getInstanceId = () => {
  // Use an environment variable or a static identifier
  return process.env.INSTANCE_ID || 'local-instance';
};

// Configure Winston Logger
const configureLogger = () => {
  const instanceId = getInstanceId();

  const cloudWatchConfig = {
    logGroupName: process.env.LOG_GROUP_NAME || 'YourLogGroupName', // Set via environment
    logStreamName: `YourLogStreamName-${instanceId}`, // Dynamic log stream name
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    jsonMessage: true, // JSON formatted logs
    messageFormatter: ({ level, message, additionalInfo }) => {
      return `[${level}] : ${message} ${JSON.stringify(additionalInfo)}`;
    },
    uploadRate: 200, // Log events per second
    // Credentials are configured globally via AWS.config
  };

  const logger = winston.createLogger({
    level: 'info', // Minimum log level
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      // Console transport for local debugging
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
      // CloudWatch Logs transport
      new WinstonCloudWatch(cloudWatchConfig),
    ],
    exitOnError: false, // Do not exit on handled exceptions
  });

  // Handle errors from the CloudWatch transport
  logger.on('error', (err) => {
    console.error('Winston CloudWatch error:', err);
  });

  // Handle uncaught exceptions and unhandled rejections
  logger.exceptions.handle(
    new winston.transports.Console(),
    new WinstonCloudWatch({
      logGroupName: `${process.env.LOG_GROUP_NAME || 'YourLogGroupName'}-exceptions`,
      logStreamName: 'exceptions',
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      jsonMessage: true,
    })
  );

  logger.rejections.handle(
    new winston.transports.Console(),
    new WinstonCloudWatch({
      logGroupName: `${process.env.LOG_GROUP_NAME || 'YourLogGroupName'}-rejections`,
      logStreamName: 'rejections',
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      jsonMessage: true,
    })
  );

  return logger;
};

// Export the configured logger directly
const logger = configureLogger();

export default logger;
