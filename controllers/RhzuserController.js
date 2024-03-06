import { CatchAsync } from '../Utils/CatchAsync.js'
import User from '../models/Usermodel.js';
import { log } from 'console';
import jwt from 'jsonwebtoken';



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

  export const updateUserById = CatchAsync(async (req, res, next) => {
    const userId = req.params.id;
    if (!userId) {
    return res.status(400).json({
        status: 'error',
        message: 'User Id is required in the URL parameters.'
    });
    }

    // Fields that can be updated
    const allowedUpdateFields = ['businessName', 'email', 'photo', 'mobile', 'address', 'website', 'googleMapLink', 'socialProfiles'];
    const updates = {};

    // Fields that are allowed to be updated
    Object.keys(req.body).forEach(field => {
    if (allowedUpdateFields.includes(field)) {
        updates[field] = req.body[field];
    }
    });

    
    // validation: Check if email format is valid
    if (updates.email && !validator.isEmail(updates.email)) {
    return res.status(400).json({
        status: 'error',
        message: 'Invalid email format.'
    });
    }

    // update operation 
    const user = await User.findByIdAndUpdate(userId, updates, {
    new: true, // Return the modified user instead of the original.
    runValidators: true // Ensure updated fields are validated by the schema.
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
