import path from 'path';
// import multer from 'multer';
import { CatchAsync } from '../Utils/CatchAsync.js'
import Client from '../models/ClientModel.js';
import { Storage } from '@google-cloud/storage';
import User from '../models/Usermodel.js';
import sharp from 'sharp';
const currentModuleUrl = new URL(import.meta.url);
const currentModuleDir = path.dirname(currentModuleUrl.pathname);
const serviceAccPath = path.resolve(currentModuleDir, '../credentials.json');
const keyFilename = 'C:/Users/ADARSH/Desktop/Retina.x/credentials.json'


const storage = new Storage({
  projectId: "primal-stock-396615",
  keyFilename: keyFilename,
});

const bucketName = 'hapzea';


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



export const userWelcome = CatchAsync(async (req, res) => {
  res.status(200).json({
    status: "success",
    message: 'Hello from the retina server',
    app: "Retina"
  });
});


export const jwtcheck = CatchAsync(async (req, res) => {
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


export const createClient = CatchAsync(async (req, res, next) => {
  console.log('ID FROM CREATE CLIENT');
  console.log(req.user._id);
  let newClient;
  let magicLink;

  if (req.body) {
    if (
      req.body.Event_Category === 'Wedding' ||
      req.body.Event_Category === 'Engagement' ||
      req.body.Event_Category === 'Couple Shoot'
    ) {
      newClient = await Client.create({
        userId: req.user._id,
        ClientName: req.body.Client_Name,
        Email: req.body.Email,
        Phone: req.body.Phone,
        Date: req.body.Date,
        EventCategory: req.body.Event_Category,
        EventName: req.body.Event_Name,
        Groom: req.body.Groom,
        Bride: req.body.Bride,
        Venue: req.body.Venue,
        Source: req.body.Source,
      });
      await createFolder('hapzea', `${newClient._id}/`);
      magicLink = `http://localhost:3000/${req.user.businessName}/${req.body.Event_Name}/${newClient._id}`;
    } else {
      newClient = await Client.create({
        userId: req.user._id,
        ClientName: req.body.Client_Name,
        Email: req.body.Email,
        Phone: req.body.Phone,
        Date: req.body.Date,
        EventCategory: req.body.Event_Category,
        EventName: req.body.Event_Name,
        Venue: req.body.Venue,
        Source: req.body.Source,
      });
      await createFolder('hapzea', `${newClient._id}/`);
      magicLink = `http://localhost:3000/${req.user.businessName}/${req.body.Event_Name}/${newClient._id}`;
    }
    
    await Client.findByIdAndUpdate(newClient._id, { $set: { magicLink } }, { new: true });

    console.log(newClient);

    res.status(200).json({
      status: 'success',
    });
  }
});



export const getClients = CatchAsync(async (req, res, next) => {
  const clients = await Client.find({ userId: req.user._id });
  res.status(200).json({
    status: 'success',
    data: {
      clients,
    },
  });
});


export const clientSorted = CatchAsync(async (req, res, next) => {
  const aggregatedClients = await Client.aggregate([
    {
      $match: { userId: req.user._id },
    },
    {
      $group: {
        _id: {
          day: { $dayOfMonth: { $toDate: "$Date" } },
          month: { $month: { $toDate: "$Date" } },
          year: { $year: { $toDate: "$Date" } }
        },
        clients: { $push: "$$ROOT" }
      }
    },
    {
      $group: {
        _id: null,
        mainArray: { $push: "$clients" }
      }
    },
    {
      $project: {
        _id: 0,
        mainArray: 1
      }
    }
  ]);

  let result = aggregatedClients.length > 0 ? aggregatedClients[0].mainArray : [];
  const clientsArray = result;
  const sortedDates = clientsArray.map(clientGroup => clientGroup[0].Date).sort((a, b) => new Date(a) - new Date(b));
  const sortedClientsArray = sortedDates.map(date => clientsArray.find(clientGroup => clientGroup[0].Date === date));
  res.status(200).json({
    status: 'success',
    data: {
      clients: sortedClientsArray,
    },
  });
});


export const validateLink = CatchAsync(async (req, res, next) => {
  const clients = await Client.find({ _id: req.body.id });

  console.log(clients);

  if (clients.length === 0) {
    // Handle case where no matching client is found
    return res.status(404).json({
      status: 'fail',
      message: 'Client not found',
    });
  } 
  const user = await User.findOne({ _id: clients[0].userId });
  let linkStatus;

  if (clients[0].EventName === req.body.EventName && user.businessName === req.body.businessName) {
    linkStatus = 'Allow Access';
  } else {
    linkStatus = 'Deny Access';
  }

  res.status(200).json({
    status: 'success',
    data: {
      linkStatus,
      client: clients[0]
    },   
  });
});
 


//Get Files
async function listFilesInOne(bucketName, idFolderName) {
  try {
    const tankFolderPath = `${idFolderName}/Album/`; 
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: tankFolderPath });

    console.log('Files in "one" subdirectory:');
    files.forEach(file => {
      const relativePath = file.name.replace(tankFolderPath, '');
      console.log(relativePath);
    });
    return files;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

//Get the files from Tank
async function listSubdirectoriesInTank(bucketName, idFolderName) {
  try {
    const tankFolderPath = `${idFolderName}/Album/`;
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: tankFolderPath });

    const subdirectoriesSet = new Set();
    console.log('files'); 
    console.log(files);
    console.log(tankFolderPath);

    files.forEach(file => {
      const relativePath = file.name.replace(tankFolderPath, '');
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        subdirectoriesSet.add(parts[0]);
      }
    });

    const subdirectoriesList = Array.from(subdirectoriesSet);
    console.log('Subdirectories in Tank:', subdirectoriesList);
    return subdirectoriesList;
  } catch (error) {
    console.error('Error listing subdirectories:', error);
    throw error;
  }
}
async function listSubdirectoriesInAlbum(bucketName, idFolderName) {
  try {
    const tankFolderPath = `${idFolderName}/Album/`;
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: tankFolderPath });

    const subdirectoriesSet = new Set();
    console.log('files'); 
    console.log(files);
    console.log(tankFolderPath);

    files.forEach(file => {
      const relativePath = file.name.replace(tankFolderPath, '');
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        subdirectoriesSet.add(parts[0]);
      }
    });

    const subdirectoriesList = Array.from(subdirectoriesSet);
    console.log('Subdirectories in Tank:', subdirectoriesList);
    return subdirectoriesList;
  } catch (error) {
    console.error('Error listing subdirectories:', error);
    throw error;
  }
}
async function listSubdirectoriesInSelect(bucketName, idFolderName) {
  try {
    const tankFolderPath = `${idFolderName}/PhotoSelection/`;
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: tankFolderPath });

    const subdirectoriesSet = new Set();
    console.log('files'); 
    console.log(files);
    console.log(tankFolderPath);

    files.forEach(file => {
      const relativePath = file.name.replace(tankFolderPath, '');
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        subdirectoriesSet.add(parts[0]);
      }
    });

    const subdirectoriesList = Array.from(subdirectoriesSet);
    console.log('Subdirectories in Tank:', subdirectoriesList);
    return subdirectoriesList;
  } catch (error) {
    console.error('Error listing subdirectories:', error);
    throw error;
  }
}


async function createFolder(bucketName, folderName) {
  try {
    console.log('@@@@@@@ Atleast calling @@@@@@@');
    const bucket = storage.bucket(bucketName);

    // Ensure the folder name has a trailing slash
    const folderObjectName = folderName.endsWith('/') ? folderName : `${folderName}/`;

    // Create an empty object with the folder name
    const folderObject = bucket.file(folderObjectName);

    // Upload an empty buffer to create the object
    await folderObject.save(Buffer.from(''));

    console.log(`Folder "${folderName}" created successfully.`);
  } catch (error) {
    console.error('Error creating folder:', error);
  }
}



// async function createFolderBucket(bucketName, userId, newFolderName) {
//   try {
//     const bucket = storage.bucket(bucketName);

//     // const userFolderName = userId.endsWith('/') ? userId : `${userId}/Album/`;
//     const userFolderName = `${userId}/Album/`;

//     const userFolderObject = bucket.file(userFolderName);
//     const [userFolderExists] = await userFolderObject.exists();

//     if (!userFolderExists) {
//       console.error(`User-specific folder "${userFolderName}" does not exist.`);
//       return;
//     }

//     const albumFolderName = `${userFolderName}/`;
//     const newFolderObject = bucket.file(`${albumFolderName}${newFolderName}/`);
//     await newFolderObject.save(Buffer.from(''));

//     console.log(`Folder "${newFolderName}" created successfully inside 'Album' folder.`);
//   } catch (error) {
//     console.error('Error creating folder:', error);
//   }
// }


async function createFolderBucket(bucketName, userId, newFolderName) {
  try {
    const bucket = storage.bucket(bucketName);

    const userFolderName = userId.endsWith('/') ? userId.slice(0, -1) : userId;

    const userFolderObject = bucket.file(`${userFolderName}/Album/`);
    const [userFolderExists] = await userFolderObject.exists();

    if (!userFolderExists) {
      console.error(`User-specific folder "${userFolderName}/Album/" does not exist.`);
      return;
    }

    const newFolderObject = bucket.file(`${userFolderName}/Album/${newFolderName}/`);
    await newFolderObject.save(Buffer.from(''));

    console.log(`Folder "${newFolderName}" created successfully inside 'Album' folder.`);
  } catch (error) {  
    console.error('Error creating folder:', error);
  }
}


export const getFiles = CatchAsync(async (req, res, next) => {
  const userId = req.query._id;  
  if (!userId) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required in the query parameters.'
    });
  }
 
  const AlbumDta = await listSubdirectoriesInAlbum('hapzea', userId);
  const photoselect = await listSubdirectoriesInSelect('hapzea', userId);
  // const maindtaOne = await createFolder('hapzea', 'Two');
  // const maindta = await createFolderBucket('hapzea',userId, 'Two');
  res.status(200).json({
    status: 'success',
    data: { Album:AlbumDta,
    Selection:photoselect
    }
  }); 
});

 



// New method to get a client by _id
export const getClientById = CatchAsync(async (req, res, next) => {
  const clientId = req.params.id;

  if (!clientId) {
    return res.status(400).json({
      status: 'error',
      message: 'Client ID is required in the URL parameters.'
    });
  }

  // Use the client ID to fetch the client from the database
  const client = await Client.findById(clientId);

  console.log(client);

  if (!client) {
    return res.status(404).json({
      status: 'fail',
      message: 'Client not found.'
    });
  } 

  res.status(200).json({
    status: 'success',
    data: {
      client,
    },
  });
});
