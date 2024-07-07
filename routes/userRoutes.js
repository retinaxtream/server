import express from 'express';
import * as userController from '../controllers/userController.js';
import multer from 'multer';
import * as authController from '../controllers/authController.js';
import * as auth from '../controllers/auth.js';
import { Logtail } from "@logtail/node";
import path from 'path';



const logtail = new Logtail("f27qB9WwtTgD9srKQETiBVG7");

import * as RhzuserController from '../controllers/RhzuserController.js';

// const { logout } = require('../controllers/authController');

const multerStorage = multer.memoryStorage();
// const upload = multer({ storage: multerStorage });
const router = express.Router();


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});



const storageTwo = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'free/'); 
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const storageclient = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'clientcover/'); 
    },
    filename: function (req, file, cb) { 
        cb(null, file.originalname);
    }
});

// const storageclient = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, 'clientcover/'); 
//     },
//     filename: function (req, file, cb) {
//         console.log(file);
//         const ext = file.mimetype.split('/')[1];
//         console.log('mimetype');
//         console.log(file.mimetype);
//         console.log(ext);
//         // const extension = path.extname(file.originalname).toLowerCase().slice(1);
//         cb(null, `user-${req.query.id}-${Date.now()}.${ext}`);
//     }
// });



const upload = multer({ storage: storage });


const storageOne = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'cover/'); 
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const storageProfile = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'profile/'); 
    },
    filename: function (req, file, cb) {
        console.log(file);
        const ext = file.mimetype.split('/')[1];
        console.log('mimetype');
        console.log(file.mimetype);
        console.log(ext);
        // const extension = path.extname(file.originalname).toLowerCase().slice(1);
        cb(null, `user-${req.query.id}-${Date.now()}.${ext}`);
    }
});

const ProfileFilter =(req,file,cb)=>{
   if(file.mimetype.startsWith('image')){
    cb(null,true)
   }else{
    cb('Not an image! Please upload only images',false)
   }
}

const cover = multer({ storage: storageOne });
const free = multer({ storage: storageTwo });
const profile = multer({ storage: storageProfile });
const clientcover = multer({ storage: storageclient });



// router.get('/', userController.home);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/validatingLink', userController.validateLink);
router.post('/create/client', auth.protect, userController.createClient);
router.get('/create/client', auth.protect, userController.getClients);
router.get('/client/sorted', auth.protect, userController.clientSorted); 
router.get('/client/:id', userController.getClientById);
router.get('/getfiles', auth.protect, userController.getFiles);  
router.get('/getpublicfiles', userController.getPublic_Files);
router.post('/createfolder', auth.protect, userController.createFolder_Bucket);
router.get('/fetchMedia',  userController.fetch_Photos);
router.get('/fetchMedia_filer',  userController.fetch_Photos_filtered);
router.post('/upload', auth.protect, upload.array('photos'), userController.upload);
router.post('/profile_upload', auth.protect, profile.single('photos'), userController.uploadProfilePhoto);
router.post("/googlesignIn",authController.googleAuth);
router.post('/sendUrl', userController.sendPublic_url);
router.post('/sendMedia',auth.protect, userController.sendMedia_Files);
router.post('/meta/:id', userController.folder_metadata);
router.post('/meta_selecting/:id', userController.fileSelecting);
router.get('/metacheck/:id', userController.matchingFolders);
router.get('/meta_selction_check/:id', auth.protect, userController.matchingFiles);
// router.get('/non_meta_files/:id', userController.UnSelected);
router.post('/deleteImages/:id', userController.deleteFiles);            
router.get('/download-into-memory', userController.downloadFile); 
router.post('/updateUser', auth.protect, userController.updateUserById);
router.post('/uploadCoverPhoto', auth.protect, cover.single('photos'), userController.uploadCoverPhoto);
router.post('/uploadResponsiveCoverPhoto', auth.protect, free.single('photos'), userController.uploadResponsiveCoverPhoto);
router.post("/googlesignIn",authController.googleAuth);
router.post("/googlesignInDesktop",authController.googleAuthDesk);
router.post('/updatePhotoSubmission/:id', userController.updatePhotoSubmission);
router.post('/uploadClientCoverPhoto',auth.protect,  clientcover.single('photos'), userController.uploadClientCoverPhoto);
router.get('/getClientCoverPhoto',auth.protect, userController.getClientCoverPhoto);

  // upload cover photo     
router.get('/getClientCoverPhotoURL/:id', userController.getClientCoverPhotoURL);
router.get('/clientcover/:photoName',  userController.getClientCoverPhoto);


 

//Rohan
router.get('/me', auth.protect, RhzuserController.getUserById);
router.post('/decode-jwt',auth.protect, RhzuserController.decodeJwt);
    
router.post('/:userId/profile', auth.protect, upload.single('profilePicture'), RhzuserController.updateProfilePicture);

router.patch('/changePassword', auth.protect, RhzuserController.changePassword);

router.get('/logout', auth.protect, authController.logout);

router 
    .route('/')
    .get(userController.userWelcome);

router 
    .get('/protect', userController.jwtcheck);
    
router
    .route('/upload/images')
    .post(upload.array('images'), userController.uploadImage);

export default router;
