import express from 'express';
import * as userController from '../controllers/userController.js';
import multer from 'multer';
import * as authController from '../controllers/authController.js';

const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });
const router = express.Router();


router.post('/signup',authController.signup);
router.post('/login',authController.login);
 
router
    .route('/')
    .get(userController.userWelcome);

router
    .route('/upload/images')
    .post(upload.array('images'), userController.uploadImage);

export default router;
