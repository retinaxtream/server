import express from 'express';
import * as userController from '../controllers/userController.js';

const router = express.Router();

router
    .route('/')
    .get(userController.userWelcome)    


export default router
      