// app.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import logger from './Utils/logger.js'; // Direct import of the initialized logger
import userRoutes from './routes/userRoutes.js';
import connectDatabase from './config/mongodb.js';
import globalErrorHandler from './controllers/errorController.js';
import AppError from './Utils/AppError.js';

// import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import http from 'http'; // Import HTTP module to create an HTTP server
import { Server as SocketIOServer } from 'socket.io'; // Import Socket.IO server
import { Worker } from './worker.js'; // Import the Worker class

// ===========================
// 0. Process-Level Error Handlers
// ===========================

const shutdown = (server) => {
  logger.info('Shutting down gracefully...');
  
  server.close(() => {
    logger.info('💥 Process terminated!');
    process.exit(1);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...');
  logger.error(`Error Name: ${err.name}`);
  logger.error(`Error Message: ${err.message}`);
  logger.error(`Stack Trace: ${err.stack}`);

  // If server is initialized, shut it down gracefully
  if (global.server) {
    shutdown(global.server);
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION! Shutting down...');
  logger.error(`Reason: ${reason}`);
  logger.error(`Promise: ${promise}`);

  // If server is initialized, shut it down gracefully
  if (global.server) {
    shutdown(global.server);
  } else {
    process.exit(1);
  }
});

// ===========================
// 1. Initialize Environment Variables and Database
// ===========================

dotenv.config({ path: './config.env' });
connectDatabase();

// ===========================
// 2. Create Express App
// ===========================

const app = express();

// ===========================
// 3. Configure Middleware
// ===========================
 
// Set security HTTP headers
// app.use(helmet());

// Rate limiting to prevent brute force attacks
// const limiter = rateLimit({
//   max: 100, 
//   windowMs: 60 * 60 * 1000, 
//   message: 'Too many requests from this IP, please try again in an hour!',
// });
// app.use('/api', limiter);

// Data sanitization against NoSQL query injection and XSS
// app.use(mongoSanitize());
// app.use(xss());

// Body parser, reading data from body into req.body
app.use(express.json());

// Cookie parser
app.use(cookieParser());

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// CORS configuration
app.use(
  cors({
    origin: [
      'https://hapzea.com',
      'http://hapzea.com',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Content-Type-Options'],
    credentials: true,
  })
);

// ===========================
// 4. Define Routes
// ===========================

app.use('/api/v1/user', userRoutes);

// Test Routes for Error Handling
app.get('/test-uncaught-exception', (req, res) => {
  throw new Error('Simulated uncaught exception');
});

app.get('/test-unhandled-rejection', (req, res) => {
  Promise.reject(new Error('Simulated unhandled rejection'));
});

// Catch-all route for undefined endpoints
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// ===========================
// 5. Initialize Server and Socket.IO
// ===========================

const initializeServer = () => {
  try {
    // Attach logger to app locals for backward compatibility
    app.locals.logger = logger;

    // Create an HTTP server from the Express app
    const server = http.createServer(app);

    // Assign the server to a global variable for access in error handlers
    global.server = server;

    // Initialize Socket.IO server
    const io = new SocketIOServer(server, {
      cors: {
        origin: [
          'https://hapzea.com',
          'http://hapzea.com',
          'http://localhost:3000',
        ],
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Content-Type-Options'],
        credentials: true,
      }, 
    });

    // Handle Socket.IO connections 
    io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Optional: Handle custom events from the client if needed
      // socket.on('customEvent', (data) => { /* Handle event */ });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });

    // Make Socket.IO accessible to other parts of the app (like controllers)
    app.set('socketio', io);

    // ===========================
    // 6. Global Error Handling Middleware
    // ===========================

    // Place the global error handler after all routes and middleware
    app.use(globalErrorHandler);

    // Start listening
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      logger.info(`App running on port ${port} in ${process.env.NODE_ENV} mode`);
    });

    // ===========================
    // 7. Initialize and Start the Worker
    // ===========================

    const worker = new Worker(io); // Pass the Socket.IO instance
    worker.start();

  } catch (error) {
    logger.error('Failed to initialize server:', error);
    process.exit(1); // Exit the application if server initialization fails
  }
};

// Initialize the server
initializeServer();

// ===========================
// 8. Error Handling Middleware
// ===========================

// Already handled in initializeServer with globalErrorHandler
