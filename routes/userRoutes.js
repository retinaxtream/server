// routes/userRoute.js

import express from 'express';
import * as userController from '../controllers/userController.js';
import multer from 'multer';
import * as authController from '../controllers/authController.js';
import * as auth from '../controllers/auth.js';
import { Logtail } from "@logtail/node";
import { CatchAsync } from '../Utils/CatchAsync.js';
import path from 'path';
import os from 'os'; // Import os module
import { body, validationResult } from 'express-validator';
import { emptyEventFaces, emptyGuestsTable } from '../controllers/dynamoController.js';
import * as rekognitionController from '../controllers/rekognitionController.js';
import * as GuestController from '../controllers/GuestController.js';
import { getGuestDetailsWithImages } from '../controllers/GuestController.js';
import { uploadImages } from '../controllers/rekognitionController.js'; // Correct import
import { v4 as uuidv4 } from 'uuid'; // Ensure uuidv4 is imported
import  * as singnedUploads from '../controllers/signedUpload.js'
import { downloadCsv } from '../controllers/csvController.js';
const logtail = new Logtail("5FHQ4tHsSCTJTyY71B1kLYoa"); 
import * as RhzuserController from '../controllers/RhzuserController.js';

const router = express.Router();           

const uploadAiStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir()); // Temporary directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueSuffix);
  },
});

const upload_ai = multer({
  storage: uploadAiStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});


const uploadGuestImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});



// Define other storage configurations as needed
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

const storageClient = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'clientcover/');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

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
    const ext = file.mimetype.split('/')[1];
    cb(null, `user-${req.query.id}-${Date.now()}.${ext}`);
  }
});

const ProfileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb('Not an image! Please upload only images', false);
  }
};

const cover = multer({ storage: storageOne });
const free = multer({ storage: storageTwo });
const profile = multer({ storage: storageProfile });
const clientcover = multer({ storage: storageClient });

router.post('/login', CatchAsync(authController.login));
router.post('/signup', CatchAsync(authController.signup));

// Other routes
router.post('/validatingLink', userController.validateLink);
router.post('/create/client', auth.protect, userController.createClient);
router.get('/create/client', auth.protect, userController.getClients);
router.get('/client/sorted', auth.protect, userController.clientSorted);
router.get('/client/:id', userController.getClientById);
router.get('/getfiles', auth.protect, userController.getFiles);
router.get('/getpublicfiles', userController.getPublic_Files);
router.post('/createfolder', auth.protect, userController.createFolder_Bucket);
router.get('/fetchMedia', userController.fetch_Photos);
router.get('/fetchMedia_filer', userController.fetch_Photos_filtered);
router.post('/upload', auth.protect, upload.array('photos'), userController.upload);
router.delete('/client/delete/:id', auth.protect, userController.deleteClient);
router.get('/generate-signed-url', auth.protect, userController.signedUrl);
router.post('/profile_upload', auth.protect, profile.single('photos'), userController.uploadProfilePhoto);
router.get('/profile_upload', auth.protect, userController.getProfilePhotoFromGCS);
router.post("/googlesignIn", authController.googleAuth); 
router.post('/sendUrl', userController.sendPublic_url);
router.post('/sendAlbumUrl', userController.sendAlbum_url);
router.post('/sendMedia', auth.protect, userController.sendMedia_Files);
router.post('/meta/:id', userController.folder_metadata); 
router.post('/meta_selecting/:id', userController.fileSelecting);
router.get('/metacheck/:id', userController.matchingFolders); 
router.get('/meta_selection_check/:id', auth.protect, userController.matchingFiles);
// router.get('/non_meta_files/:id', userController.UnSelected);
router.post('/deleteImages/:id',auth.protect, userController.deleteFiles);
router.get('/download-into-memory', userController.downloadFile);
router.post('/updateUser', auth.protect, userController.updateUserById);
router.post('/uploadCoverPhoto', auth.protect, cover.single('photos'), userController.uploadCoverPhoto);
router.post('/uploadResponsiveCoverPhoto', auth.protect, free.single('photos'), userController.uploadResponsiveCoverPhoto);

router.get('/getCoverPhoto',  userController.getCoverPhoto);
router.get('/getCoverPhotoMob', userController.getCoverPhotoMob);

router.post("/googlesignIn", authController.googleAuth);
router.post("/googlesignInDesktop", authController.googleAuthDesk);
router.post('/updatePhotoSubmission/:id', userController.updatePhotoSubmission);
router.post('/uploadClientCoverPhoto', auth.protect, clientcover.single('photos'), userController.uploadClientCoverPhoto);
router.get('/getClientCoverPhoto', auth.protect, userController.getClientCoverPhoto);
router.post('/upload-images', upload_ai.array('images'), (req, res, next) => {
  req.socketId = req.query.socketId;
  req.eventId = req.query.eventId;
  next();
}, rekognitionController.uploadImages);

router.post(
  '/register-guest',
  // Protect the route if authentication is required; remove if not needed
  uploadGuestImage.single('guestImage'), // 'guestImage' is the field name in the form-data
  GuestController.storeGuestDetails
);

router.get(
  '/get-guest-details',
  auth.protect, // Protect the route to ensure only authenticated users can access
  GuestController.getGuestDetails
);

router.post(
  '/compare-guest-faces',
  auth.protect, // Middleware to protect the route
  rekognitionController.compareGuestFaces // Controller function handling the logic
);

router.get('/matched-images', rekognitionController.getMatchedImages);

router.post(
  '/send-matching-images',
  auth.protect, // Protect the route
  rekognitionController.sendMatchingImagesEmails // Controller function to send emails
); // End of routes


router.delete(
  '/empty-event-faces',
  auth.protect, 
  CatchAsync(emptyEventFaces)
);

router.delete(
  '/delete-collections',
  auth.protect, 
  rekognitionController.deleteAllCollections
);

// Route to empty the GuestsTable
router.delete(
  '/empty-guests-table',
  auth.protect, // Protect the route to ensure only authenticated users can perform this action
  CatchAsync(emptyGuestsTable)
);

// Example route for searching a face in an event
router.post('/search-face', auth.protect, upload_ai.single('photo'), rekognitionController.searchFace);

// Additional routes
router.get('/get-event-images', auth.protect, rekognitionController.getEventImages);
router.get('/guests-with-images', auth.protect, getGuestDetailsWithImages);

router.get('/user-detailing/:id', userController.userDetails)
// Upload cover photo
router.get('/getClientCoverPhotoURL/:id', userController.getClientCoverPhotoURL);
router.get('/clientcover/:photoName', userController.getClientCoverPhoto);

// Rohan
router.get('/me', auth.protect, RhzuserController.getUserById);
router.post('/decode-jwt', auth.protect, RhzuserController.decodeJwt);

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


// New Route: Generate Pre-Signed URLs
router.post('/get-signed-urls', singnedUploads.getSignedUrls);

// New Route: Handle Upload Completion (Optional)
router.post('/upload-complete', singnedUploads.uploadComplete);

// Route to process uploaded images
router.post('/process-uploaded-images', singnedUploads.processUploadedImages);

router.get('/download-csv', downloadCsv);

export default router;
