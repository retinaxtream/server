import express from 'express';
import morgan from 'morgan';
import userroute from './routes/userRoutes.js';
import cors from 'cors';
import dotenv from "dotenv";
import connectDatabase from "./config/mongodb.js";




dotenv.config({path:'./config.env'});
connectDatabase();

const app = express();
app.use(express.json());

console.log(process.env.NODE_ENV);

if(process.env.NODE_ENV === 'development'){
    app.use(morgan('dev'));
}

app.use((req,res,next)=>{
    console.log('Hello from the middlewear 👋');    
    next();
})

app.use(cors({
    origin: ['http://localhost:3000','https://storage.cloud.google.com/zephyrgllide/zhangzui-Pf23Y30hD68-unsplash.jpg'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Content-Type-Options'],
    credentials: true
  }));
   
app.use('/api/v1/user',userroute) 

// app.get('/api/v1/user', (req, res) => {
//     res.status(200)
//         .json({
//             status:"success",
//             message: 'Hello from the retina server',
//             app: "Retina"
//         });
// })    

const port = process.env.PORT
app.listen(port, () => {
    console.log(`App runnung on port ${port}`);
})