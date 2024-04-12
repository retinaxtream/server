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

app.use(
  cors({  
    origin: [
      'https://api.hapzea.com',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Content-Type-Options'],
    credentials: true,
  })
);
 
app.use('/api/v1/user', userroute);

const port = process.env.PORT;
app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
 