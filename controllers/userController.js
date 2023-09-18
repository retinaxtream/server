import path from 'path';
// import multer from 'multer';
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


export const userWelcome = (req, res) => {
    res.status(200).json({
        status: "success",
        message: 'Hello from the retina server',
        app: "Retina"
    });
};


// export const uploadImage = async(req, res) => {
//     try {
//         console.log('calling');
//         if (!req.files || req.files.length === 0) {
//           return res.status(400).json({ error: 'No image files provided' });
//         }
        
//         const imageUrls = [];
    
//         const bucket = storage.bucket(bucketName);

//         for (const imageFile of req.files) {
//           const clientName = 'ClientA'; // Replace with the actual client information
//           const imageName = `${clientName}/${imageFile.originalname}`;
//           // const imageName = imageFile.originalname; 
//           const blob = bucket.file(imageName); 
    
//           // const blobStream = blob.createWriteStream({
//           //   resumable: false,
//           // }); 
    
//           const blobStream = blob.createWriteStream({
//             metadata: {
//               contentType: imageFile.mimetype,
//               metadata: {     
//                 client: 'ClientA',
//               },
//             },
//             resumable: false,
//           });
    
//           blobStream.on('finish', () => {
//             const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
//             imageUrls.push(publicUrl);
    
//             if (imageUrls.length === req.files.length) {
//               res.status(200).json({ message: 'Images uploaded successfully', imageUrls });
//             }
//           });

//           blobStream.end(imageFile.buffer);
//         }

//       } catch (error) {   
//         console.error(error);
//         res.status(500).json({ error: 'An error occurred' });
//       }
//   };



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

      // const optimizedImageBuffer = await sharp(imageFile.buffer)
      // .jpeg({ quality: 50 }) 
      // .toBuffer();

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



 