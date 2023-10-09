import path from 'path';
// import multer from 'multer';
import {CatchAsync} from '../Utils/CatchAsync.js'

import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
const currentModuleUrl = new URL(import.meta.url);
const currentModuleDir = path.dirname(currentModuleUrl.pathname);
const serviceAccPath = path.resolve(currentModuleDir, '../credentials.json');    
const keyFilename = 'C:/Users/ADARSH/Desktop/Retina.x/credentials.json'


const storage = new Storage({
    projectId: "primal-stock-396615",
    keyFilename: keyFilename,  
  });   
  
  const bucketName = 'zephyrgllide'; 


  // userRouter.post(
  //   "/",
  //   asyncHandler(async (req, res) => {
  //     const { email, password } = req.body;
  //     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  //     const passwordRegex =
  //       /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{12,}$/;
  //     if (!emailRegex.test(email)) {
  //       res.status(400);
  //       throw new Error("Invalid Email Address");
  //     }
  
  //     if (!passwordRegex.test(password)) {
  //       res.status(400);
  //       throw new Error(
  //         "Invalid Password. It should be at least 12 characters long, contain at least one uppercase letter, one lowercase letter, and one number."
  //       );
  //     }
  
  //     const userExist = await User.findOne({ email });
  //     if (userExist) {
  //       res.status(400);
  //       throw new Error("User Already Exists");
  //     }
  //     // const otp = await sendOTP(email);
  
  //     const user = await User.create({
  //       email,
  //       password,
  //     });
  
  //     if (user) {
  //       res.status(201).json({
  //         _id: user._id,
  //         email: user.email,
  //         isAdmin: user.isAdmin,
  //         token: generateToken(user._id),
  //       });
  //     } else {
  //       res.status(400);
  //       throw new Error("Invalid User Data");
  //     }
  //   })
  // );
  

export const userWelcome = CatchAsync(async(req, res) => {
    res.status(200).json({
        status: "success",
        message: 'Hello from the retina server',
        app: "Retina"
    });
});


export const jwtcheck =  CatchAsync(async (req, res) => {
    // logger.info("from protect router");
    console.log(req.headers);
    const cookieString = req.headers.cookie;
    // logger.info(cookieString);

    if (cookieString) {
      const cookies = cookieString.split("; ");
      console.log('$$');
      console.log(cookies);
      const cookieObj = cookies.reduce((prev, current) => {
        const [name, value] = current.split("=");
        prev[name] = value;
        return prev;
      }, {});
      // console.log(cookieObj);
      const jwtToken = cookieObj.jwt || cookieObj.jwtToken;
       console.log(jwtToken);
      res.status(200).json({
        status: "sucess",
        jwtToken,
      });
    } else {
      res.status(401).json({
        status: "error",
        message: "Cookie not found",
      });
    }
  });


///We have to change this function with catchAsync later
export async function uploadImage(req, res) {
  try {

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const imageUrls = [];
    const bucket = storage.bucket(bucketName);

    for (const imageFile of req.files) {
      const clientName = 'ClientA'; 
      const imageName = `${clientName}/${imageFile.originalname}`;
      const blob = bucket.file(imageName);


      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: imageFile.mimetype,
          metadata: {
            client: 'ClientA',
          },
        },
        resumable: false,
      });

      blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
        imageUrls.push(publicUrl);

        if (imageUrls.length === req.files.length) {
          res.status(200).json({ message: 'Images uploaded successfully', imageUrls });
        }
      });

      blobStream.end(imageFile.buffer);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }     
}        

 

 