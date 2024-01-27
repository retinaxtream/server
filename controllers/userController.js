import path from 'path';
// import multer from 'multer';
import { CatchAsync } from '../Utils/CatchAsync.js'
import Client from '../models/ClientModel.js';
import { Storage } from '@google-cloud/storage';
import User from '../models/Usermodel.js';
import fs from 'fs';
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


// ###########################################################################
export const userWelcome = CatchAsync(async (req, res) => {
  res.status(200).json({
    status: "success",
    message: 'Hello from the retina server',
    app: "Retina"
  });
});

// ###########################################################################
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


// ###########################################################################
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

// ###########################################################################
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


// ###########################################################################
export const getClients = CatchAsync(async (req, res, next) => {
  const clients = await Client.find({ userId: req.user._id });
  res.status(200).json({
    status: 'success',
    data: {
      clients,
    },
  });
});

// ###########################################################################
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

// ###########################################################################
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



// ###########################################################################
async function listFilesInOne(bucketName, idFolderName) {
  try {
    const tankFolderPath = `${idFolderName}/Album/one`;
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

// ###########################################################################
// async function organizeFoldersInAlbum(bucketName, idFolderName) {
//   try {
//     const albumFolderPath = `${idFolderName}/Album/`;
//     const [files] = await storage.bucket(bucketName).getFiles({ prefix: albumFolderPath });

//     const subdirectoriesSet = new Set();

//     files.forEach(file => {
//       const relativePath = file.name.replace(albumFolderPath, '');
//       const parts = relativePath.split('/');
//       if (parts.length > 1) {
//         subdirectoriesSet.add(parts[0]);
//       }
//     });

//     const subdirectoriesList = Array.from(subdirectoriesSet);
//     console.log('Subdirectories in Album:', subdirectoriesList);

//     const foldersInSubdirectories = {};

//     await Promise.all(
//       subdirectoriesList.map(async subdirectory => {
//         const subdirectoryPath = `${albumFolderPath}${subdirectory}/`;
//         const [subdirectoryFiles] = await storage.bucket(bucketName).getFiles({ prefix: subdirectoryPath });

//         const foldersInSubdirectory = new Set();
//         subdirectoryFiles.forEach(file => {
//           const relativePath = file.name.replace(subdirectoryPath, '');
//           const folderName = relativePath.split('/')[0];
//           if (folderName) {
//             foldersInSubdirectory.add(folderName);
//           }
//         });

//         foldersInSubdirectories[subdirectory] = Array.from(foldersInSubdirectory);
//       })
//     );

//     const resultObject = {
//       subdirectoriesList: subdirectoriesList,
//       foldersInSubdirectories: foldersInSubdirectories,
//     };

//     console.log('Organized Folders Album:', resultObject);
//     return resultObject;
//   } catch (error) {
//     console.error('Error organizing folders:', error);
//     throw error;
//   }
// }
async function getFoldersInAlbum(bucketName, idFolderName) {
  try {
    const albumFolderPath = `${idFolderName}/Album/`;
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: albumFolderPath });

    const foldersInAlbum = new Set();

    // Identify folders directly inside the Album directory
    files.forEach(file => {
      const relativePath = file.name.replace(albumFolderPath, '');
      const folderName = relativePath.split('/')[0];
      if (folderName) {
        foldersInAlbum.add(folderName);
      }
    });

    const foldersList = Array.from(foldersInAlbum);

    console.log('Folders in Album:', foldersList);

    return foldersList;
  } catch (error) {
    console.error('Error getting folders in Album:', error);
    throw error;
  }
}

async function getFoldersInPhoto(bucketName, idFolderName) {
  try {
    const albumFolderPath = `${idFolderName}/PhotoSelection/`;
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: albumFolderPath });

    const foldersInAlbum = new Set();

    // Identify folders directly inside the Album directory
    files.forEach(file => {
      const relativePath = file.name.replace(albumFolderPath, '');
      const folderName = relativePath.split('/')[0];
      if (folderName) {
        foldersInAlbum.add(folderName);
      }
    });

    const foldersList = Array.from(foldersInAlbum);

    console.log('Folders in Album:', foldersList);

    return foldersList;
  } catch (error) {
    console.error('Error getting folders in Album:', error);
    throw error;
  }
}
// ##################organizeFoldersIn#########################################################
// async function organizeFoldersInPhoto(bucketName, idFolderName) {
//   try {
//     const albumFolderPath = `${idFolderName}/PhotoSelection/`;
//     const [files] = await storage.bucket(bucketName).getFiles({ prefix: albumFolderPath });

//     const subdirectoriesSet = new Set();

//     files.forEach(file => {
//       const relativePath = file.name.replace(albumFolderPath, '');
//       const parts = relativePath.split('/');
//       if (parts.length > 1) {
//         subdirectoriesSet.add(parts[0]);
//       }
//     });

//     const subdirectoriesList = Array.from(subdirectoriesSet);
//     // console.log('Subdirectories in PhotoSelection:', subdirectoriesList);

//     // Organize folders in each subdirectory
//     const foldersInSubdirectories = {};

//     await Promise.all(
//       subdirectoriesList.map(async subdirectory => {
//         const subdirectoryPath = `${albumFolderPath}${subdirectory}/`;
//         const [subdirectoryFiles] = await storage.bucket(bucketName).getFiles({ prefix: subdirectoryPath });

//         const foldersInSubdirectory = new Set();
//         subdirectoryFiles.forEach(file => {
//           const relativePath = file.name.replace(subdirectoryPath, '');
//           const folderName = relativePath.split('/')[0];
//           if (folderName) {
//             foldersInSubdirectory.add(folderName);
//           }
//         });

//         foldersInSubdirectories[subdirectory] = Array.from(foldersInSubdirectory);
//       })
//     );

//     const resultObject = {
//       subdirectoriesList: subdirectoriesList,
//       foldersInSubdirectories: foldersInSubdirectories,
//     };

//     console.log('Organized Folders PhotoSelection:', resultObject);
//     return resultObject;
//   } catch (error) {
//     console.error('Error organizing folders:', error);
//     throw error;
//   }
// }
// ###########################################################################
async function createFolder(bucketName, userId) {
  try {
    const bucket = storage.bucket(bucketName);

    // Ensure the folder name has a trailing slash
    const userFolderName = userId.endsWith('/') ? userId : `${userId}/`;

    // Create the user folder
    await createSubfolder(bucket, userFolderName, 'Album');
    await createSubfolder(bucket, userFolderName, 'PhotoSelection');

    // Create subfolders inside 'Album'
    const albumFolderPath = `${userFolderName}Album/`;
    await createSubfolder(bucket, albumFolderPath, 'Full Photos');
    await createSubfolder(bucket, albumFolderPath, 'Starred Photos');

    // Create subfolders inside 'PhotoSelection' 
    const photoSelectionFolderPath = `${userFolderName}PhotoSelection/`;
    await createSubfolder(bucket, photoSelectionFolderPath, 'Full Photos');
    await createSubfolder(bucket, photoSelectionFolderPath, 'Starred Photos');

    console.log(`Default folders created inside "${userId}" folder.`);
  } catch (error) {
    console.error('Error creating folders:', error);
  }
}

async function createSubfolder(bucket, parentFolderName, subfolderName) {
  const folderObjectName = `${parentFolderName}${subfolderName}/`;
  const folderObject = bucket.file(folderObjectName);

  // Upload an empty buffer to create the subfolder object
  await folderObject.save(Buffer.from(''));

  console.log(`Subfolder "${subfolderName}" created successfully.`);
}

// ###########################################################################
async function createFolderIn(bucketName, userId, newFolderName,media) {
  try {
    const bucket = storage.bucket(bucketName);

    const userFolderName = userId.endsWith('/') ? userId.slice(0, -1) : userId;

    const userFolderObject = bucket.file(`${userFolderName}/${media}/`);
    const [userFolderExists] = await userFolderObject.exists();

    if (!userFolderExists) {
      console.error(`User-specific folder "${userFolderName}/${media}/" does not exist.`);
      return;
    }

    const newFolderObject = bucket.file(`${userFolderName}/${media}/${newFolderName}/`);
    await newFolderObject.save(Buffer.from(''));

    // console.log(`Folder "${newFolderName}" created successfully inside 'Album' folder.`);
  } catch (error) {
    console.error('Error creating folder:', error);
  }
}

// async function createSubFolderIn(bucketName, userId, newFolderName, media, subfolder) {
//   try {
//     const bucket = storage.bucket(bucketName);

//     const userFolderName = userId.endsWith('/') ? userId.slice(0, -1) : userId;

//     let folderPath = `${userFolderName}/${media}/`;

//     if (subfolder) {
//       folderPath += `${newFolderName}/`;
//       const subfolderObject = bucket.file(folderPath);
//       const [subfolderExists] = await subfolderObject.exists();

//       if (!subfolderExists) {
//         console.error(`Subfolder "${folderPath}" does not exist.`);
//         return;
//       }
//     }

//     const newFolderObject = bucket.file(`${folderPath}${subfolder}/`);
//     await newFolderObject.save(Buffer.from(''));

//     console.log(`Folder "${subfolder}" created successfully inside '${folderPath}'.`);
//   } catch (error) {
//     console.error('Error creating folder:', error);
//   }
// }

// ###########################################################################
export const getFiles = CatchAsync(async (req, res, next) => {
  const userId = req.query._id;
  
  if (!userId) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required in the query parameters.'
    });
  }
  const AlbumsSubs = await getFoldersInAlbum('hapzea', userId);
  const PhotoSubs = await getFoldersInPhoto('hapzea', userId);
  res.status(200).json({
    status: 'success',
    data: {
      album: AlbumsSubs,
      photo: PhotoSubs
    } 
  });
});


// ###########################################################################


async function fetchAllPhotos(bucketName, userId, albumName, folderName) {
  try {
    console.log('called fetchAllPhotos');
    const bucket = storage.bucket(bucketName);

    // Construct the prefix based on userID, album, folder, and subfolder
    let prefix = `${userId}/`;
    if (albumName) {
      prefix += `${albumName}/`;
    }
    if (folderName) {
      prefix += `${folderName}/`;
    }

    // List all files with the specified prefix
    const [files] = await bucket.getFiles({
      prefix: prefix,
    });

    // Extract file names and transform them into URLs
    const urls = files.map(file => {
      const fileName = file.name;
      console.log('File:', fileName);
      return `https://storage.cloud.google.com/${bucketName}/${fileName}`;
    });


    const filteredFileNames = urls.slice(1);
    // Return the list of URLs
    return filteredFileNames;

  } catch (error) {
    console.error('Error fetching photos:', error);
    // Return an empty array or handle the error as needed
    return [];
  }
}




// ###########################################################################
export const createFolder_Bucket = CatchAsync(async (req, res, next) => {
  const main_folder = req.body.main_folder
  const folderName =req.body.folder_name
  // const sub_folder = req.params.sub_folder
  const userId = req.query._id;
  if (!userId) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required in the query parameters.'
    });
  }
 
  // await fetchAllPhotos('hapzea',userId, main_folder );
  await createFolderIn('hapzea',userId,folderName, main_folder );
  // if (subfolder !== null) {
  //   await createSubFolderIn('hapzea', userId, folderName, media, subfolder);
  // } else {
  //   await createFolderIn('hapzea', userId, folderName, media);
  // }
  res.status(200).json({
    status: 'success',
  });
});


// ###########################################################################
async function uploadPhotos(bucketName, userId, albumName, subfolderName, photoPaths) {
  try {
    console.log('called uploadPhotos');
    const bucket = storage.bucket(bucketName);

    // Construct the destination path based on userID, album, folder, and subfolder
    let destinationPath = `${userId}/`;
    if (albumName) {
      destinationPath += `${albumName}/`;
    }
    if (subfolderName) {
      destinationPath += `${subfolderName}/`;
    }

    // Upload each photo to the specified subfolder
    for (const photoPath of photoPaths) {
      const photoName = path.basename(photoPath); // Extract the photo name using path module
      const file = bucket.file(`${destinationPath}${photoName}`);

      // Create a write stream to upload the file
      const stream = file.createWriteStream({
        metadata: {
          contentType: 'image/jpeg', // Change this based on your file type
        },
      });

      // Handle stream events (success, error)
      stream.on('error', (err) => {
        console.error(`Error uploading photo ${photoName}:`, err);
      });

      stream.on('finish', () => {
        console.log(`Photo ${photoName} uploaded to '${destinationPath}'.`);
        // You can perform further processing or store the uploaded file information as needed
      });

      // Pipe the file into the write stream
      const readStream = fs.createReadStream(photoPath);
      readStream.pipe(stream);
    }

    console.log('All photos uploaded successfully.');
  } catch (error) {
    console.error('Error uploading photos:', error);
  }
}

// ###########################################################################
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
  // console.log(client);
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

export const fetch_Photos = CatchAsync(async (req, res, next) => {
  console.log('fetch photos called from server');
  
  // Extract parameters from the query string
  const main_folder = req.query.main_folder;
  const sub_folder = req.query.sub_folder;
  const id = req.query.id;  // Assuming you want to extract it from the query string

  // Use the extracted parameters in your fetchAllPhotos function
  const fetchedFiles = await fetchAllPhotos('hapzea', id, main_folder, sub_folder);

  // Send the response
  res.status(200).json({
    status: 'success',
    data: {
      files: fetchedFiles,
    },
  });
});



 

export const upload = CatchAsync(async (req, res, next) => {
  const photoPaths = req.files.map(file => file.path);
  console.log(photoPaths);
  const main_folder = req.query.main_folder;
  const sub_folder = req.query.sub_folder;
  const id = req.query.id; 
  // Use your uploadPhotos function to handle the photo upload
  await uploadPhotos('hapzea', id, main_folder, sub_folder,photoPaths);

  console.log('frrafsefsdf'); 
  res.status(200).json({
    status: 'success',
  });
}); 
