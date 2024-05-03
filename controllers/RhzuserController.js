import { CatchAsync } from '../Utils/CatchAsync.js'
import User from '../models/UserModel.js';
import { log } from 'console';
import jwt from 'jsonwebtoken';
import AppError from '../Utils/AppError.js';
import { Storage } from '@google-cloud/storage';

const bucketName = 'hapzea'; 
    

const signToken = id => {
  return jwt.sign({ id: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
}


  export const getUserById = CatchAsync(async (req, res, next) => {
    const userId = req.user._id;
    console.log('$%$%$%$%$%$%');
    console.log(req.user._id);
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User Id is required in the URL parameters.'
      });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found.'
      });
    }
    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  });
  


    // export const updateProfilePicture = CatchAsync(async (req, res, next) => {
    //     const userId = req.params.userId; 
    //     const file = req.file; 
    
    //     // Check if the file was uploaded
    //     if (!file) {
    //         return res.status(400).json({ status: 'fail', message: 'Please upload a profile picture.' });
    //     }
    
    //      const photoPath = file.path; // Path where multer saved the file
    //     const main_folder = req.query.main_folder;
    //     const sub_folder = req.query.sub_folder;
    //    await User.findByIdAndUpdate(userId, { profilePicture: photoPath }, { new: true });
    
       
    //     res.status(200).json({
    //         status: 'success',
    //         message: 'Profile picture updated successfully.',
    //         data: {
    //             path: photoPath
    //         }
    //     });
    // });


    // export async function updateProfilePicture(req, res) {
    //   try {
    //     const userId = req.params.userId; 
    //     console.log(`Updating profile picture for user ${userId}`);
    
    //     const file = req.file;
    //     if (!file) {
    //       console.log('No file uploaded');
    //       return res.status(400).json({ error: 'Please upload a profile picture.' });
    //     }
    
    //     console.log(`File received: ${file.originalname}`);
    
    //     const bucket = storage.bucket(bucketName);
    //     const imageName = `ProfilePictures/${userId}/${file.originalname}`;
    //     console.log(`Uploading to bucket: ${bucketName}, with name: ${imageName}`);
    
    //     const blob = bucket.file(imageName);
    
    //     const blobStream = blob.createWriteStream({
    //       metadata: {
    //         contentType: file.mimetype,
    //         metadata: {
    //           user: userId,
    //         },
    //       },
    //       resumable: false,
    //     });
    
    //     blobStream.on('finish', async () => {
    //       const photoPath = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
    //       console.log(`File uploaded to ${photoPath}`);
    
    //       await User.findByIdAndUpdate(userId, { profilePicture: photoPath }, { new: true });
    //       console.log(`Database updated for user ${userId} with new profile picture`);
    
    //       res.status(200).json({
    //         message: 'Profile picture updated successfully.',
    //         path: photoPath
    //       });
    //     });
    
    //     blobStream.on('error', (error) => {
    //       console.error('Blob stream error:', error);
    //       throw error;
    //     });
    
    //     blobStream.end(file.buffer);
    //   } catch (error) {
    //     console.error('Error in updateProfilePicture function:', error);
    //     res.status(500).json({ error: 'An error occurred' });
    //   }
    // }
    

export const updateProfilePicture = CatchAsync(async (req, res, next) => {
  console.log("1")
  const userId = req.params.userId; 
  const file = req.file;  // Assuming multer is used for file handling

  // Check if the file was uploaded
  if (!file) {
      return res.status(400).json({ status: 'fail', message: 'Please upload a profile picture.' });
  }

  try {
    const clientName = 'ClientA';  // Set this as needed
    const imageName = `${clientName}/${file.originalname}`;
    const bucket = storage.bucket(bucketName);
    const blob = bucket.file(imageName);

    const blobStream = blob.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          client: 'ClientA',  // Set this as needed
        },
      },
      resumable: false,
    });

    blobStream.on('finish', async () => {
      const photoPath = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
      await User.findByIdAndUpdate(userId, { profilePicture: photoPath }, { new: true });

      res.status(200).json({
          status: 'success',
          message: 'Profile picture updated successfully.',
          data: { path: photoPath }
      });
    });

    blobStream.end(file.buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'An error occurred during file upload.' });
  }
});


    
    
    
    
  export const changePassword = CatchAsync(async (req, res, next) => {
    console.log("Starting to change password for user:", req.user.id);
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      console.log("User not found with id:", req.user.id);
      // Stop further execution and pass control to the global error handling middleware
      return next(new AppError('User not found.', 404));
    }

    console.log("User found. Checking current password...");
    if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
      console.log("Current password is incorrect.");
      // Stop further execution and pass control to the global error handling middleware
      return next(new AppError('Your current password is wrong.', 401));
    }

    console.log("Current password is correct. Updating to new password...");
    user.password = req.body.newPassword;
    user.passwordConfirm = req.body.passwordConfirm; 
    
    await user.save(); // Save the updated user, which will also hash the new password

    console.log("Password updated successfully.");
    
    const token = signToken(user._id);
    console.log("JWT token generated and being sent to the user.");
    
    // Send the response back to the client
    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user._id,
          businessName: user.businessName,
          email: user.email,
          role: user.role
        }
      }
    });

    console.log("Change password process completed.");
  });


export const decodeJwt = (req, res) => {
  const { token } = req.body;
  try {
    // Decode token payload without verification
    const decoded = jwt.decode(token);
    res.status(200).json({ decoded }); 
  } catch (error) {
    res.status(400).json({ error: "Invalid token format" });
  }
};




export const updateUserById = CatchAsync(async (req, res, next) => {
  const userId = req.user._id;
    if (!userId) {
        return res.status(400).json({
            status: 'error',
            message: 'User Id is required in the URL parameters.'
        });
    }

    const allowedUpdateFields = ['businessName', 'email', 'photo', 'mobile', 'address', 'website', 'googleMapLink', 'socialProfiles'];
    const updates = {};

    Object.keys(req.body).forEach(field => {
        if (allowedUpdateFields.includes(field)) {
            updates[field] = req.body[field];
        }
    }); 

    // Log the fields that will be updated
    console.log('Fields to be updated:', updates);

    // validation: Check if email format is valid
    if (updates.email && !validator.isEmail(updates.email)) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid email format.'
        });
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
        new: true,
        runValidators: true,
        select: 'businessName email photo mobile address website googleMapLink socialProfiles'
    });

    if (!user) {
        return res.status(404).json({
            status: 'fail',
            message: 'User not found.'
        });
    }

    res.status(200).json({
        status: 'success',
        data: {
            user,
        },
    });
});
