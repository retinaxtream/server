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
app.use('/api', limiter);

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

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
