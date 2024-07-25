import express from 'express';
import morgan from 'morgan';
import userroute from './routes/userRoutes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import connectDatabase from './config/mongodb.js';
import globalErrorHandler from './controllers/errorController.js';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';



dotenv.config({ path: './config.env' });
connectDatabase();

const app = express();

// app.use(helmet());
// app.use(mongoSanitize());
app.use(express.json());
app.use(cookieParser()); 

console.log(process.env.NODE_ENV);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} 
 
// const limiter = rateLimit({ 
//   max:100,
//   windowMs: 60 * 60 * 1000,
//   message: 'Too many request from this IP, Please try again in an hour!'
// });

// app.use('/api/v1/user',limiter); 

app.use((req, res, next) => {
  console.log('Hello from the middleware 👋');
  next();
});
 

app.use(cors({  
  origin: ['https://hapzea.com','http://hapzea.com','https://hapzea.com','http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Content-Type-Options'],
  credentials: true,
}));

app.use('/api/v1/user', userroute);  

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404)); 
}); 

app.use(globalErrorHandler);  
app.use((err, req, res, next) => { 
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  res.status(err.statusCode).json({ 
    status: err.status,
    message: err.message,
    error: err, 
    stack: err.stack,
  });
});   


const port = process.env.PORT;
app.listen(port, () => {
  console.log(`App running on port ${port}`);
});  
 