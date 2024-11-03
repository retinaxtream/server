// routes/userRoute.js
import express from 'express';
import * as userController from '../controllers/userController.js';
import multer from 'multer';
import * as authController from '../controllers/authController.js';
import * as auth from '../controllers/auth.js';
import { Logtail } from "@logtail/node";
import { CatchAsync } from '../Utils/CatchAsync.js';
import path from 'path';
import { body, validationResult } from 'express-validator';
// import { storeGuestDetails } from '../controllers/GuestController.js';
import { emptyEventFaces, emptyGuestsTable } from '../controllers/dynamoController.js';
import * as rekognitionController from '../controllers/rekognitionController.js';
import * as GuestController from '../controllers/GuestController.js';
import { getGuestDetailsWithImages } from '../controllers/GuestController.js';


const logtail = new Logtail("5FHQ4tHsSCTJTyY71B1kLYoa");

import * as RhzuserController from '../controllers/RhzuserController.js';

const multerStorage = multer.memoryStorage();
const router = express.Router();

const memoryStorage = multer.memoryStorage();
// const upload_ai = multer({ storage: memoryStorage });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Ensure this directory exists and is writable
  },
  filename: function (req, file, cb) {
    // Use a unique filename to prevent collisions
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

// Initialize Multer with disk storage
const upload_ai = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});


const guestImageStorage = multer.memoryStorage();
const uploadGuestImage = multer({
  storage: guestImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    console.log('Incoming file:', file.originalname, file.mimetype); // Log file details
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/');
//   },
//   filename: function (req, file, cb) {
//     cb(null, file.originalname);
//   }
// });

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
const clientcover = multer({ storage: storageclient });

// Validation and sanitization middleware for signup
const validateSignup = [
  body('businessName')
    .notEmpty()
    .withMessage('Please provide a business name')
    .trim()
    .escape(),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('mobile')
    .notEmpty()
    .withMessage('Please provide a mobile number')
    .trim()
    .escape(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .trim()
    .escape(),
  body('passwordConfirm')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
    .trim()
    .escape(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid input',
        errors: errors.array(),
      });
    }
    next();
  },
];

// Validation and sanitization middleware for login
const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Please provide a password')
    .trim()
    .escape(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid input',
        errors: errors.array(),
      });
    }
    next();
  },
];

// Authentication routes
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
router.post('/deleteImages/:id', userController.deleteFiles);
router.get('/download-into-memory', userController.downloadFile);
router.post('/updateUser', auth.protect, userController.updateUserById);
router.post('/uploadCoverPhoto', auth.protect, cover.single('photos'), userController.uploadCoverPhoto);
router.post('/uploadResponsiveCoverPhoto', auth.protect, free.single('photos'), userController.uploadResponsiveCoverPhoto);

router.get('/getCoverPhoto', auth.protect, userController.getCoverPhoto);
router.get('/getCoverPhotoMob', auth.protect, userController.getCoverPhotoMob);

router.post("/googlesignIn", authController.googleAuth);
router.post("/googlesignInDesktop", authController.googleAuthDesk);
router.post('/updatePhotoSubmission/:id', userController.updatePhotoSubmission);
router.post('/uploadClientCoverPhoto', auth.protect, clientcover.single('photos'), userController.uploadClientCoverPhoto);
router.get('/getClientCoverPhoto', auth.protect, userController.getClientCoverPhoto);

// Example route for uploading multiple images for face indexing in an event
// router.post('/upload-images',auth.protect, upload_ai.array('images'), rekognitionController.uploadImages);
// routes/userRoute.js
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
);

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
router.post('/search-face',auth.protect, upload_ai.single('photo'), rekognitionController.searchFace);
// routes/userRoute.js
router.get('/get-event-images',auth.protect, rekognitionController.getEventImages);
router.get('/guests-with-images',auth.protect, getGuestDetailsWithImages);


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

export default router;