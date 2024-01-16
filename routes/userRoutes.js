import express from 'express';
import * as userController from '../controllers/userController.js';
import multer from 'multer';
import * as authController from '../controllers/authController.js';
import * as auth from '../controllers/auth.js';


const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });
const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/validatingLink', userController.validateLink);
router.post('/create/client', auth.protect, userController.createClient);
router.get('/create/client', auth.protect, userController.getClients);
router.get('/client/sorted', auth.protect, userController.clientSorted);
router.get('/client/:id', auth.protect, userController.getClientById);
router.get('/getfiles', auth.protect, userController.getFiles);
router.post('/createfolder', auth.protect, userController.createFolder_Bucket);


router
    .route('/')
    .get(userController.userWelcome);

router
    .get('/protect', userController.jwtcheck);
router
    .route('/upload/images')
    .post(upload.array('images'), userController.uploadImage);

export default router;
