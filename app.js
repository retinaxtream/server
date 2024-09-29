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
import loggerPromise from './Utils/logger.js'; // Ensure the correct path and .js extension
import userRoutes from './routes/userRoutes.js';
import connectDatabase from './config/mongodb.js';
import globalErrorHandler from './controllers/errorController.js';
import AppError from './Utils/AppError.js';

import http from 'http'; // Import HTTP module to create an HTTP server
import { Server as SocketIOServer } from 'socket.io'; // Import Socket.IO server

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
const limiter = rateLimit({
  max: 100, // Maximum number of requests
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour!',
});
app.use('/api', limiter);

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

// Catch-all route for undefined endpoints
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// ===========================
// 5. Initialize Logger and Start Server
// ===========================

const initializeServer = async () => {
  try {
    const logger = await loggerPromise;

    // Attach logger to app locals for access in routes/middleware if needed
    app.locals.logger = logger; 

    // Create an HTTP server from the Express app
    const server = http.createServer(app); 

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
  } catch (error) {
    console.error('Failed to initialize logger:', error);
    process.exit(1); // Exit the application if logger fails to initialize
  }
};

// Initialize the server
initializeServer();

// ===========================
// 7. Error Handling Middleware
// ===========================

// Already handled in initializeServer with globalErrorHandler
