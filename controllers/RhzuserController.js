import { CatchAsync } from '../Utils/CatchAsync.js'
import User from '../models/Usermodel.js';
import { log } from 'console';
import jwt from 'jsonwebtoken';
import AppError from '../Utils/AppError.js';


const signToken = id => {
  return jwt.sign({ id: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
}


  export const getUserById = CatchAsync(async (req, res, next) => {
    const userId = req.params.id;
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
  

  //Update Profile

  // export const updateUserById2 = CatchAsync(async (req, res, next) => {
  //   const userId = req.params.id;
  //   if (!userId) {
  //   return res.status(400).json({
  //       status: 'error',
  //       message: 'User Id is required in the URL parameters.'
  //   });
  //   }

  //   // Fields that can be updated
  //   const allowedUpdateFields = ['businessName', 'email', 'photo', 'mobile', 'address', 'website', 'googleMapLink', 'socialProfiles'];
  //   const updates = {};

  //   // Fields that are allowed to be updated
  //   Object.keys(req.body).forEach(field => {
  //   if (allowedUpdateFields.includes(field)) {
  //       updates[field] = req.body[field];
  //   }
  //   });

    
  //   // validation: Check if email format is valid
  //   if (updates.email && !validator.isEmail(updates.email)) {
  //   return res.status(400).json({
  //       status: 'error',
  //       message: 'Invalid email format.'
  //   });
  //   }

  //   // update operation 
  //   const user = await User.findByIdAndUpdate(userId, updates, {
  //   new: true, // Return the modified user instead of the original.
  //   runValidators: true // Ensure updated fields are validated by the schema.
  //   });

  //   if (!user) {
  //   return res.status(404).json({
  //       status: 'fail',
  //       message: 'User not found.'
  //   });
  //   }

  //   res.status(200).json({
  //   status: 'success',
  //   data: {
  //       user,
  //   },
  //   });
  //   });



    export const updateProfilePicture = CatchAsync(async (req, res, next) => {
        const userId = req.params.userId; 
        const file = req.file; 
    
        // Check if the file was uploaded
        if (!file) {
            return res.status(400).json({ status: 'fail', message: 'Please upload a profile picture.' });
        }
    
         const photoPath = file.path; // Path where multer saved the file
        const main_folder = req.query.main_folder;
        const sub_folder = req.query.sub_folder;
       await User.findByIdAndUpdate(userId, { profilePicture: photoPath }, { new: true });
    
       
        res.status(200).json({
            status: 'success',
            message: 'Profile picture updated successfully.',
            data: {
                path: photoPath
            }
        });
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
    const userId = req.params.id;
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
