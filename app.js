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

import userRoutes from './routes/userRoutes.js';
import connectDatabase from './config/mongodb.js';
import globalErrorHandler from './controllers/errorController.js';
import AppError from './Utils/AppError.js';

import http from 'http'; // Import HTTP module to create an HTTP server
import { Server as SocketIOServer } from 'socket.io'; // Import Socket.IO server

dotenv.config({ path: './config.env' });
connectDatabase();

const app = express();

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

app.use(express.json()); 
app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

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

app.use('/api/v1/user', userRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);

  // Set default status code and message
  let statusCode = 500;
  let message = 'Internal Server Error';

  // Handle Multer errors
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.message;
  } else if (err.message === 'Invalid file type. Only images are allowed.') {
    statusCode = 400;
    message = err.message;
  } else if (err.message === 'DYNAMODB_TABLE_NAME environment variable is not set.') {
    statusCode = 500;
    message = err.message;
  }

  res.status(statusCode).json({
    error: {
      message,
      storageErrors: [], // Populate as needed
      statusCode,
      status: statusCode >= 500 ? 'error' : 'fail',
    },
  });
});

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

// ===========================
// 6. Socket.IO Integration
// ===========================

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
  console.log(`Client connected: ${socket.id}`); 

  // Optional: Handle custom events from the client if needed
  // socket.on('customEvent', (data) => { /* Handle event */ });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Make Socket.IO accessible to other parts of the app (like controllers)
app.set('socketio', io);

// ===========================
// 7. Start the Server
// ===========================

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`App running on port ${port}`);
});
   