import express from 'express';
import morgan from 'morgan';
import userroute from './routes/userRoutes.js';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDatabase from './config/mongodb.js';

dotenv.config({ path: './config.env' });
connectDatabase();

const app = express();
app.use(express.json());

console.log(process.env.NODE_ENV);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use((req, res, next) => {
  console.log('Hello from the middleware 👋');
  next();
});
 
app.use(cors({  
  origin: ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Content-Type-Options'],
  credentials: true,
}));

app.use('/api/v1/user', userroute);

// Catch-all for unhandled routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});


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
