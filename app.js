import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import dotenv from 'dotenv';
import userroute from './routes/userRoutes.js';
import connectDatabase from './config/mongodb.js';

dotenv.config({ path: './config.env' });
connectDatabase();

const app = express();
app.use(express.json());

// Configure Morgan Logger middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Custom Middleware
app.use((req, res, next) => {
  console.log('Hello from the middleware 👋');
  next();
});

// CORS Configuration
// CORS Configuration
app.use(cors({  
  origin: ['https://hapzea.com','http://hapzea.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Content-Type-Options'],
  credentials: true,
}));


// Routes
app.use('/api/v1/user', userroute);

// Get the port from environment variable
const port = process.env.PORT || 3000;

// Start the server
app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
