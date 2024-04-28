import express from 'express';
import * as userController from '../controllers/userController.js';
import multer from 'multer';
import * as authController from '../controllers/authController.js';
import * as auth from '../controllers/auth.js';
import { Logtail } from "@logtail/node";



const logtail = new Logtail("f27qB9WwtTgD9srKQETiBVG7");

import * as RhzuserController from '../controllers/RhzuserController.js';

// const { logout } = require('../controllers/authController');

const multerStorage = multer.memoryStorage();
// const upload = multer({ storage: multerStorage });
const router = express.Router();


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Specify a subdirectory within your project
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});


const upload = multer({ storage: storage });
// router.get('/', userController.home);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/validatingLink', userController.validateLink);
router.post('/create/client', auth.protect, userController.createClient);
router.get('/create/client', auth.protect, userController.getClients);
router.get('/client/sorted', auth.protect, userController.clientSorted);
router.get('/client/:id', auth.protect, userController.getClientById);
router.get('/getfiles', auth.protect, userController.getFiles);
router.post('/createfolder', auth.protect, userController.createFolder_Bucket);
router.get('/fetchMedia', auth.protect, userController.fetch_Photos);
router.post('/upload', auth.protect, upload.array('photos'), userController.upload);

router.post('/sendUrl', userController.sendPublic_url);
router.post('/sendMedia', userController.sendMedia_Files);
router.post('/meta/:id', auth.protect, userController.folder_metadata);
router.get('/metacheck/:id', auth.protect, userController.matchingFolders);
router.get('/meta_selction_check/:id', auth.protect, userController.matchingFiles);
router.get('/download-into-memory', userController.downloadFile);
 

    

//Rohan

router.get('/user/:id', auth.protect, RhzuserController.getUserById);
router.post('/decode-jwt',auth.protect, RhzuserController.decodeJwt);
router.put('/updateUser/:id',auth.protect, RhzuserController.updateUserById);

router.post('/:userId/profile', auth.protect, upload.single('profilePicture'), RhzuserController.updateProfilePicture);

router.patch('/changePassword', auth.protect, RhzuserController.changePassword);


router.get('/logout', authController.logout);

router
    .route('/')
    .get(userController.userWelcome);

router
    .get('/protect', userController.jwtcheck);
router
    .route('/upload/images')
    .post(upload.array('images'), userController.uploadImage);

export default router;
