import path from 'path';
// import multer from 'multer';
import { CatchAsync } from '../Utils/CatchAsync.js'
import Client from '../models/ClientModel.js';
import { Storage } from '@google-cloud/storage';
import User from '../models/UserModel.js';
import nodemailer from "nodemailer";
import fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import AppError from '../Utils/AppError.js';
// import sharp from 'sharp';
import mime from 'mime-types';
import { log } from 'console';
import { Logtail } from "@logtail/node";


// const logtail = new Logtail("wioUzMpsdSdWHrZeN5YSuKS3");
const logtail = new Logtail("5FHQ4tHsSCTJTyY71B1kLYoa");


const currentModuleUrl = new URL(import.meta.url);
// const currentModuleDir = path.dirname(currentModuleUrl.pathname);
// const serviceAccPath = path.resolve(currentModuleDir, '../credentials.json');
const keyFilename = './credentials.json'


const storage = new Storage({
  projectId: "primal-stock-396615",
  keyFilename: keyFilename,
});

const bucketName = 'hapzea';

// export const home = CatchAsync(async (req, res) => {
//   res.status(200).send('Hello from the retina server');
// }); 
// ###########################################################################
export const userWelcome = CatchAsync(async (req, res) => {
  res.status(200).json({
    status: "success",
    message: 'Hello from the retina server',
    app: "Retina"
  });
});


// ###########################################################################
export const updateUserById = CatchAsync(async (req, res, next) => {
  try {
    const userId = req.user._id;
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required in the URL parameters.'
      });
    }

    // Retrieve user from the database
    const user = await User.findById(userId);


    // Update user's information with data from the request body
    user.businessName = req.body.businessName || user.businessName;
    user.email = req.body.email || user.email;
    user.address = req.body.address || user.address;
    user.website = req.body.website || user.website;
    user.googleMapLink = req.body.googleMapLink || user.googleMapLink;
    user.socialProfiles = req.body.socialProfiles || user.socialProfiles;
    user.youtube = req.body.youtube || user.youtube;

    // Only update password and confirm password if they are provided
    if (req.body.password) {
      user.password = req.body.password;
      user.passwordConfirm = req.body.passwordConfirm;
    }

    // Save the updated user
    await user.save();

    // Send response
    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (error) {
    // Handle errors properly
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// ###########################################################################
export const jwtcheck = CatchAsync(async (req, res) => {
  // logger.info("from protect router");
  logtail.info(req.headers);
  const cookieString = req.headers.cookie;
  // logger.info(cookieString);
  logtail.info('cookieString');
  logtail.info(req.headers.cookie);


  if (cookieString) {
    const cookies = cookieString.split("; ");
    const cookieObj = cookies.reduce((prev, current) => {
      const [name, value] = current.split("=");
      prev[name] = value;
      return prev;
    }, {});
    // console.log(cookieObj);
    const jwtToken = cookieObj.jwt || cookieObj.jwtToken;
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
  let newClient;
  let magicLink;

  if (req.body) {
    // Extracting username from email if businessName is empty or undefined
    let businessName = req.user.businessName;
    if (!businessName) {
      const extractedUsername = await extractUsernameFromEmail(req.user.email); // Await here
      if (extractedUsername) {
        businessName = extractedUsername;
      }
    }

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
      magicLink = `https://hapzea.com/invitation/${businessName}/${req.body.Event_Name}/${newClient._id}`;
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
      magicLink = `https://hapzea.com/invitation/${businessName}/${req.body.Event_Name}/${newClient._id}`;
    }

    await Client.findByIdAndUpdate(newClient._id, { $set: { magicLink } }, { new: true });

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
const extractUsernameFromEmail = async (email) => {
  return email.split('@')[0];
};

export const validateLink = CatchAsync(async (req, res, next) => {
  const { type, id, businessName, EventName } = req.body;

  logtail.info('validation');
  logtail.info(req.body);

  const clients = await Client.findById(id);
  if (!clients) {
    return res.status(404).json({
      status: 'fail',
      message: 'Client not found',
    });
  }

  const user = await User.findById(clients.userId);
  if (!user) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found',
    });
  }

  const extractedUsername = await extractUsernameFromEmail(user.email);
  let linkStatus;

  logtail.info({ extractedUsername, reqBodyBusinessName: businessName, userBusinessName: user.businessName });

  if (type === 'media') {
    linkStatus = (user.businessName === businessName || extractedUsername === businessName) ? 'Allow Access' : 'Deny Access';
  } else {
    logtail.info({ eventName: clients.EventName, reqEventName: EventName });
    if (clients.EventName === EventName && (user.businessName === businessName || extractedUsername === businessName)) {
      linkStatus = 'Allow Access';
    } else {
      linkStatus = 'Deny Access';
    }
  }

  logtail.info(linkStatus);

  res.status(200).json({
    status: 'success',
    data: {
      linkStatus,
      client: clients,
    },
  });
});



// ###########################################################################
async function listFilesInOne(bucketName, idFolderName) {
  try {
    const tankFolderPath = `${idFolderName}/Album/one`;
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: tankFolderPath });

    files.forEach(file => {
      const relativePath = file.name.replace(tankFolderPath, '');
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

  } catch (error) {
    console.error('Error creating folders:', error);
  }
}

async function createSubfolder(bucket, parentFolderName, subfolderName) {
  const folderObjectName = `${parentFolderName}${subfolderName}/`;
  const folderObject = bucket.file(folderObjectName);

  // Upload an empty buffer to create the subfolder object
  await folderObject.save(Buffer.from(''));

}

// ###########################################################################
async function createFolderIn(bucketName, userId, newFolderName, media) {
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
  try {
    const userId = req.query._id;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required in the query parameters.'
      });
    }

    let AlbumsSubs, PhotoSubs;

    try {
      AlbumsSubs = await getFoldersInAlbum('hapzea', userId);
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve albums data.',
        error: error.message
      });
    }

    try {
      PhotoSubs = await getFoldersInPhoto('hapzea', userId);
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve photos data.',
        error: error.message
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        album: AlbumsSubs,
        photo: PhotoSubs
      }
    });
  } catch (error) {
    // This catches any unexpected errors
    return res.status(500).json({
      status: 'error',
      message: 'An unexpected error occurred.',
      error: error.message
    });
  }
});
// ###########################################################################
export const getPublic_Files = CatchAsync(async (req, res, next) => {
  try {
    const userId = req.query._id;
    const user = await Client.findById(userId);
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required in the query parameters.'
      });
    }

    let AlbumsSubs, PhotoSubs;

    try {
      AlbumsSubs = await getFoldersInAlbum('hapzea', userId);
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve albums data.',
        error: error.message
      });
    }

    try {
      PhotoSubs = await getFoldersInPhoto('hapzea', userId);
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve photos data.',
        error: error.message
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        album: AlbumsSubs,
        photo: PhotoSubs
      },
      user
    });
  } catch (error) {
    // This catches any unexpected errors
    return res.status(500).json({
      status: 'error',
      message: 'An unexpected error occurred.',
      error: error.message
    });
  }
});



// ###########################################################################


async function fetchAllPhotos(bucketName, userId, albumName, folderName) {
  try {
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
  const folderName = req.body.folder_name
  // const sub_folder = req.params.sub_folder
  const userId = req.query._id;
  if (!userId) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required in the query parameters.'
    });
  }

  // await fetchAllPhotos('hapzea',userId, main_folder );
  await createFolderIn('hapzea', userId, folderName, main_folder);
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
        // You can perform further processing or store the uploaded file information as needed
        fs.unlinkSync(photoPath);
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





const getFoldersByMetadata = async (bucketName, userId, metadataKey, metadataValue) => {
  try {
    console.log('called getFoldersByMetadata');
    const bucket = storage.bucket(bucketName);

    const folderPath = `${userId}/PhotoSelection`;

    const [files] = await bucket.getFiles({
      prefix: folderPath,
    });


    const matchingFolders = files.filter((file) => {
      console.log('FILE FROM METACHECK');
      console.log(file);
      const metadata = file.metadata;
      // Check if the file has metadata
      if (metadata.metadata) {
        // Check if the nested metadata object contains the specified key and value
        const nestedMetadata = metadata.metadata; // Access nested metadata object
        return nestedMetadata && nestedMetadata['selected'] === metadataValue.toString();
      }
      return false; // File doesn't have metadata
    });

    // Extract folder names from file paths
    const folderNames = matchingFolders.map((file) => {
      const filePath = file.name; // Use 'name' property to get the file path
      const folderName = filePath.substring(folderPath.length); // Get the folder name relative to folderPath
      return folderName;
    });

    return folderNames;
  } catch (error) {
    console.error('Error fetching folders by metadata:', error);
    throw error;
  }
};


const getFilesByMetadata = async (bucketName, userId, metadataKey, metadataValue, sub_Files) => {
  try {
    console.log('called getFilesByMetadata');
    const bucket = storage.bucket(bucketName);

    const folderPath = `${userId}/PhotoSelection/${sub_Files}/`;

    const [files] = await bucket.getFiles({
      prefix: folderPath,
    });


    const matchingFolders = files.filter((file) => {
      const metadata = file.metadata;

      if (metadata.metadata) {
        const nestedMetadata = metadata.metadata;
        return nestedMetadata && nestedMetadata['selected'] === metadataValue.toString();
      }
      return false;
    });

    // Extract folder names from file paths
    const folderNames = matchingFolders.map((file) => {
      const filePath = file.name; // Use 'name' property to get the file path
      const folderName = filePath.substring(folderPath.length); // Get the folder name relative to folderPath
      return folderName;
    });

    return { sub_Files: sub_Files, folderNames: folderNames };
  } catch (error) {
    console.error('Error fetching folders by metadata:', error);
    throw error;
  }
};



const getFilesWithoutMetadata = async (bucketName, userId, metadataKey, metadataValue, sub_Files) => {
  try {
    const bucket = storage.bucket(bucketName);
    const folderPath = `${userId}/PhotoSelection/${sub_Files}/`;

    const [files] = await bucket.getFiles({ prefix: folderPath });

    const nonMatchingFolders = files.filter((file) => {
      const metadata = file.metadata;


      // Check if the file does not have the specified metadata
      if (metadata.metadata) {
        const nestedMetadata = metadata.metadata;
        return !nestedMetadata || nestedMetadata[metadataKey] !== metadataValue.toString();
      }
      return true; // If there's no metadata, it's considered non-matching
    });

    const folderNames = nonMatchingFolders.map((file) => {
      const filePath = file.name;
      const folderName = filePath.substring(folderPath.length);
      return folderName;
    });

    return { sub_Files: sub_Files, folderNames: folderNames };
  } catch (error) {
    console.error('Error fetching folders without metadata:', error);
    throw error;
  }
};



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

  // Extract parameters from the query string
  const main_folder = req.query.main_folder;
  const sub_folder = req.query.sub_folder;
  const id = req.query.id;

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


export const fetch_Photos_filtered = CatchAsync(async (req, res, next) => {
  const main_folder = req.query.main_folder;
  const sub_folder = req.query.sub_folder;
  const id = req.query.id;

  // Fetch all photos using the fetchAllPhotos function
  const fetchedFiles = await fetchAllPhotosFilter('hapzea', id, main_folder, sub_folder);

  // Filter files that do not have metadata
  const filesWithoutMetadata = fetchedFiles.filter(file => !file.metadata || Object.keys(file.metadata).length === 0);


  const urls = filesWithoutMetadata.map(file => {
    const fileName = file.name;
    return `https://storage.cloud.google.com/hapzea/${fileName}`;
  });

  // Send the response with URLs of files that do not have metadata
  res.status(200).json({
    status: 'success',
    data: {
      files: urls,
    },
  });
});



// Fetch all photos function
const fetchAllPhotosFilter = async (bucketName, userId, main_folder, sub_folder) => {
  try {
    const bucket = storage.bucket(bucketName);
    const folderPath = `${userId}/${main_folder}/${sub_folder}/`;

    const [files] = await bucket.getFiles({
      prefix: folderPath,
    });

    const fileDetails = await Promise.all(files.map(async file => {
      const [metadata] = await file.getMetadata();
      return {
        name: file.name,
        metadata: metadata.metadata,
      };
    }));

    return fileDetails;
  } catch (error) {
    console.error('Error fetching photos:', error);
    throw error;
  }
};



export const upload = CatchAsync(async (req, res, next) => {
  const photoPaths = req.files.map(file => file.path);
  const main_folder = req.query.main_folder;
  const sub_folder = req.query.sub_folder;
  const id = req.query.id;
  // Use your uploadPhotos function to handle the photo upload
  await uploadPhotos('hapzea', id, main_folder, sub_folder, photoPaths);

  console.log('frrafsefsdf');
  res.status(200).json({
    status: 'success',
  });
});



export const sendPublic_url = CatchAsync(async (req, res, next) => {
  console.log('calling');
  const { email, magic_url, company_name, event_name } = req.body;
  await sendURL(email, magic_url, company_name, event_name);
  res.status(200).json({
    status: 'success',
  });
});


export const sendAlbum_url = CatchAsync(async (req, res, next) => {
  const { email, magic_url, company_name, event_name } = req.body;
  await sendAlbum(email, magic_url, company_name, event_name);
  res.status(200).json({
    status: 'success',
  });
});


export const sendMedia_Files = CatchAsync(async (req, res, next) => {
  const { email, magic_url, company_name, event_name, clientId } = req.body;
  const folders = await getFoldersByMetadata("hapzea", clientId, "selected", false);
  const trimmedFolderPaths = folders.map(path => path.replace(/\//g, ''));
  console.log(trimmedFolderPaths);

  const photoSubmission = {};
  trimmedFolderPaths.forEach(path => {
    photoSubmission[path] = false;
  });

  const user = await Client.findOneAndUpdate(
    { _id: clientId },
    { PhotoSubmission: photoSubmission },
    { new: true }
  );
  console.log(user);

  if (!user) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found'
    });
  }

  await sendMedia(email, magic_url, company_name, event_name);
  res.status(200).json({
    status: 'success',
  });
});





// export const folder_metadata = CatchAsync(async (req, res, next) => {
//   const clientId = req.params.id;
//   const folders = req.body.selected;
//   console.log('$$$$$ %%%%%');
//   console.log(clientId,folders);
//   let subFolder;
//   if (req.body.sub_folder) {
//     subFolder = req.body.sub_folder;
//   }
//   const bucketName = 'hapzea';
//   const bucket = storage.bucket(bucketName);

//   let [files] = [];

//   if (subFolder) {
//     console.log('SUB');
//     const prefix = `${clientId}/PhotoSelection/${subFolder}/`;
//     const [files] = await bucket.getFiles({
//       prefix: prefix,
//     });

//     // for (const file of files) {
//     //   if (!file.name.endsWith('/')) {
//     //     await file.setMetadata({ metadata: null });
//     //     console.log(`Metadata removed for file ${file.name}`);
//     //   }
//     // }

//     for (const item of folders) {
//       console.log('ITEM');
//       console.log(item);
//       const filePath = item.src;
//       const fileName = filePath.split('/').pop();
//       const folderPath = `${clientId}/PhotoSelection/${subFolder}/${fileName}`;
//       await bucket.file(folderPath).setMetadata({
//         metadata: {
//           selected: true
//         },
//       });
//     }

//     res.status(200).json({
//       status: 'success',
//     });
//   } else {

//     async function removeMetadataFromFolders(bucket, prefix) {
//       const [files] = await bucket.getFiles({
//         prefix: prefix,
//         autoPaginate: false
//       });

//       for (const file of files) {
//         if (file.name.endsWith('/')) {
//           await file.setMetadata({ metadata: null });
//           await removeMetadataFromFolders(bucket, `${prefix}${file.name}`);
//         }
//       }
//     }

//     await removeMetadataFromFolders(bucket, `${clientId}/PhotoSelection/`);


//     for (const folder of folders) {
//       console.log('Here IT IS');                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
//       const folderPath = `${clientId}/PhotoSelection/${folder}/`;
//       await bucket.file(folderPath).setMetadata({
//         metadata: {
//           selected: false
//         },
//       });
//     }

//     res.status(200).json({
//       status: 'success',
//     });
//   }
// });



export const folder_metadata = CatchAsync(async (req, res, next) => {
  const clientId = req.params.id;
  const folders = req.body.selected;
  console.log('$$$$$ %%%%%');
  console.log(clientId, folders);
  let subFolder;
  if (req.body.sub_folder) {
    subFolder = req.body.sub_folder;
  }
  const bucketName = 'hapzea';
  const bucket = storage.bucket(bucketName);

  let [files] = [];

  if (subFolder) {
    console.log('SUB');
    const prefix = `${clientId}/PhotoSelection/${subFolder}/`;
    const [files] = await bucket.getFiles({
      prefix: prefix,
    });

    // for (const file of files) {
    //   if (!file.name.endsWith('/')) {
    //     await file.setMetadata({ metadata: null });
    //     console.log(`Metadata removed for file ${file.name}`);
    //   }
    // }

    for (const item of folders) {
      console.log('ITEM');
      console.log(item);
      const filePath = item.src;
      const fileName = filePath.split('/').pop();
      const folderPath = `${clientId}/PhotoSelection/${subFolder}/${fileName}`;
      try {
        await bucket.file(folderPath).setMetadata({
          metadata: {
            selected: true
          },
        });
        logtail.info(`Metadata updated for file: ${folderPath}`);
      } catch (error) {
        logtail.error(`Error updating metadata for file ${folderPath}: ${error.message}`);
      }
    }

    res.status(200).json({
      status: 'success',
    });
  } else {

    async function removeMetadataFromFolders(bucket, prefix) {
      const [files] = await bucket.getFiles({
        prefix: prefix,
        autoPaginate: false
      });

      for (const file of files) {
        if (file.name.endsWith('/')) {
          await file.setMetadata({ metadata: null });
          await removeMetadataFromFolders(bucket, `${prefix}${file.name}`);
          logtail.info('removeMetadataFromFolders')
        }
      }
    }

    try {
      await removeMetadataFromFolders(bucket, `${clientId}/PhotoSelection/`);
    } catch (error) {
      logtail.error(`Error removing metadata: ${error.message}`);
    }

    for (const folder of folders) {
      console.log('Here IT IS');
      logtail.info('Here IT IS')
      const folderPath = `${clientId}/PhotoSelection/${folder}/`;
      console.log(`Updating metadata for folder: ${folderPath}`);
      logtail.info(`Updating metadata for folder: ${folderPath}`)
      try {
        await bucket.file(folderPath).setMetadata({
          metadata: {
            selected: false
          },
        });
        logtail.info(`Metadata updated successfully for ${folderPath}`);
        console.log(`Metadata updated successfully for ${folderPath}`);
      } catch (error) {
        logtail.error(`Error updating metadata for ${folderPath}: ${error.message}`);
        console.error(`Error updating metadata for ${folderPath}:`, error);
      }
    }

    res.status(200).json({
      status: 'success',
    });
  }
});

export const fileSelecting = CatchAsync(async (req, res, next) => {
  const clientId = req.params.id;
  const folders = req.body.selected;
  let subFolder;

  if (req.body.sub_folder) {
    subFolder = req.body.sub_folder;
  }

  const bucketName = 'hapzea';
  const bucket = storage.bucket(bucketName);

  let [files] = [];

  if (subFolder) {
    const prefix = `${clientId}/PhotoSelection/${subFolder}/`;
    const [files] = await bucket.getFiles({
      prefix: prefix,
    });

    for (const item of folders) {
      const filePath = item.src;
      const fileName = filePath.split('/').pop();
      const folderPath = `${clientId}/PhotoSelection/${subFolder}/${fileName}`;
      await bucket.file(folderPath).setMetadata({
        metadata: {
          selecting: true,
        },
      });
    }

    res.status(200).json({
      status: 'success',
    });
  } else {

    async function removeMetadataFromFolders(bucket, prefix) {
      const [files] = await bucket.getFiles({
        prefix: prefix,
        autoPaginate: false,
      });

      for (const file of files) {
        if (file.name.endsWith('/')) {
          await file.setMetadata({ metadata: null });
          await removeMetadataFromFolders(bucket, `${prefix}${file.name}`);
        }
      }
    }

    await removeMetadataFromFolders(bucket, `${clientId}/PhotoSelection/`);

    for (const folder of folders) {
      const folderPath = `${clientId}/PhotoSelection/${folder}/`;
      await bucket.file(folderPath).setMetadata({
        metadata: {
          selecting: true,
        },
      });
    }

    res.status(200).json({
      status: 'success',
    });
  }
});



export const matchingFolders = CatchAsync(async (req, res, next) => {
  const clientId = req.params.id;
  const folders = await getFoldersByMetadata("hapzea", clientId, "selected", false);
  if (folders) {
    res.status(200).json({
      status: 'success',
      data: folders
    });
  }
});

export const matchingFiles = CatchAsync(async (req, res, next) => {
  const clientId = req.params.id;
  let sub_Files;
  sub_Files = req.query.subFiles; // Access query parameter from req.query
  const Files = await getFilesByMetadata("hapzea", clientId, "selected", true, sub_Files);
  if (Files) {
    res.status(200).json({
      status: 'success',
      data: Files
    });
  }
});



export const deleteFiles = CatchAsync(async (req, res, next) => {
  const id = req.params.id;
  const { sub_folder, imageFiles, mainFile } = req.body;

  if (!id || !sub_folder || !imageFiles || !imageFiles.length) {
    return next(new AppError('Invalid request parameters', 400));
  }

  const bucketName = 'hapzea';
  const bucket = storage.bucket(bucketName);

  const deletePromises = imageFiles.map(imageFile => {
    const filePath = `${id}/${mainFile}/${sub_folder}/${imageFile}`;
    const file = bucket.file(filePath);
    return file.delete().catch(error => {
      console.error(`Error deleting file ${filePath}:`, error);
      throw new AppError(`Error deleting file ${filePath}`, 500);
    });
  });

  try {
    await Promise.all(deletePromises);
    res.status(200).json({
      status: 'success',
      message: 'Images deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

const sendURL = async (email, magic_url, company_name, event_name) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "retina@hapzea.com",
        pass: "nkhz kfjz nvri tkny", // Provide the correct password
      },
    });

    const mailOptions = {
      from: "retina@hapzea.com",
      to: email,
      subject: "Invitation",
      html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Public URL For Event</title>
      <style>
        /* CSS styles for the email template */
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .header h1 {
          color: #820037;
          margin: 0;
        }
        .content {
          margin-bottom: 20px;
        }
        .content p {
          font-size: 16px;
          line-height: 1.6;
          margin: 0;
        }
        .button {
          text-align: center;
          margin-top: 20px;
        }
        .button a {
          display: inline-block;
          background-color: #820037;
          color: #fff;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 5px;
        }
      </style>
      </head>
      <body>
        <div class="container">
          <div class="header"> 
            <h1>Public URL for Invitation</h1>
            <p>Love from ${company_name}</p> 
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>We are excited to invite you to ${event_name}!.It's going to be a fantastic event, and we can't wait to share the details with you.</p>
            <p>Click the button below to learn more about the event and how you can join us:</p>
          </div>
          <div class="button">
            <a href="${magic_url}" target="_blank">View Event Details</a> <!-- Replace [Public URL] with the actual public URL sent from frontend -->
          </div>
        </div>
      </body>
      </html>      
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return "send";
  } catch (error) {
    throw error;
  }
};
const sendAlbum = async (email, magic_url, company_name, event_name) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "retina@hapzea.com",
        pass: "nkhz kfjz nvri tkny", // Provide the correct password
      },
    });

    const mailOptions = {
      from: "retina@hapzea.com",
      to: email,
      subject: `The  ${event_name} Memories!`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title> ${event_name} Album</title>
<style>
  /* CSS styles for the email template */
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f4f4f4;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
    background-color: #ffffff;
    border-radius: 10px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    color: #333333;
  }
  .header {
    text-align: center;
    margin-bottom: 30px;
  }
  .header h1 {
    color: #3498db;
    margin: 0;
  }
  .header p {
    color: #888888;
    margin: 5px 0 0;
  }
  .content {
    margin-bottom: 30px;
  }
  .content p {
    font-size: 16px;
    line-height: 1.6;
    margin: 0 0 10px;
  }
  .button {
    text-align: center;
    margin-top: 30px;
  }
  .button a {
    display: inline-block;
    background-color: #3498db;
    color: #ffffff;
    text-decoration: none;
    padding: 12px 25px;
    border-radius: 5px;
    font-size: 16px;
    transition: background-color 0.3s;
  }
  .button a:hover {
    background-color: #2980b9;
  }
  .footer {
    text-align: center;
    font-size: 12px;
    color: #888888;
    margin-top: 30px;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1> ${event_name} Album</h1>
      <p>Love from ${company_name}</p>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>We're excited to share with you the  ${event_name} album! Click the button below to check out your favourite memories:</p>
    </div>
    <div class="button">
      <a href="${magic_url}" target="_blank">View Event Details</a>
    </div>
    <div class="footer">
      <small>Thank you for being a part of our special memories!</small>
    </div>
  </div>
</body>
</html>`
    };

    const info = await transporter.sendMail(mailOptions);
    return "send";
  } catch (error) {
    throw error;
  }
};




const sendMedia = async (email, magic_url, company_name, event_name) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "retina@hapzea.com",
        pass: "nkhz kfjz nvri tkny", // Provide the correct password
      },
    });

    const mailOptions = {
      from: "retina@hapzea.com",
      to: email,
      subject: `Help Us Create the Perfect ${event_name} Album!`,
      html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Album</title>
      <style>
        /* CSS styles for the email template */
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .header h1 {
          color: #F46036;
          margin: 0;
        }
        .content {
          margin-bottom: 20px;
        }
        .content p {
          font-size: 16px;
          line-height: 1.6;
          margin: 0;
        }
        .button {
          text-align: center;
          margin-top: 20px;
        }
        .button a {
          display: inline-block;
          background-color: #F46036;
          color: #fff;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 5px;
        }
      </style>
      </head>
      <body>
        <div class="container">
          <div class="header"> 
            <h1>Album</h1>
            <p>Love from ${company_name}</p> 
          </div>
          <div class="content"> 
            <p>Hello,</p>
            <p>We're thrilled to invite you to help create the ${event_name} album!.</p>
            <p>Click the button below to check out the details and choose the photos you'd love to see included:</p>
          </div>
          <div class="button">
            <a href="${magic_url}" target="_blank">View Event Details</a> <!-- Replace [Public URL] with the actual public URL sent from frontend -->
          </div>
        </div>
      </body>
      </html>       
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return "send";
  } catch (error) {
    throw error;
  }
};


export const downloadFile = CatchAsync(async (req, res, next) => {
  try {
    const bucketName = 'hapzea';
    const fileName = '66066f3a59374beb5c1816fb/PhotoSelection/Full Photos/mathilde-langevin-SG5KAZirWVA-unsplash.jpg';

    // Downloads the file into a buffer in memory.
    const contents = await storage.bucket(bucketName).file(fileName).download();


    // Get the file extension from the fileName
    const fileExtension = fileName.split('.').pop().toLowerCase();
    let contentType = 'application/octet-stream'; // Default content type

    // Set content type based on file extension
    if (fileExtension === 'jpg' || fileExtension === 'jpeg') {
      contentType = 'image/jpeg';
    } else if (fileExtension === 'png') {
      contentType = 'image/png';
    } else if (fileExtension === 'gif') {
      contentType = 'image/gif';
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType);

    res.send(contents);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



async function uploadSinglePhoto(bucketName, userId, subfolderName, photoPath) {
  try {
    const bucket = storage.bucket(bucketName);

    // Construct the destination path based on userID and subfolder
    let destinationPath = `${userId}/`;
    if (subfolderName) {
      destinationPath += `${subfolderName}/`;
    }


    const [files] = await bucket.getFiles({ prefix: destinationPath });
    for (const file of files) {
      // Delete each file
      await file.delete();
      console.log(`Deleted old photo: ${file.name}`);
    }

    const photoName = path.basename(photoPath); // Extract the photo name using path module
    const file = bucket.file(`${destinationPath}${photoName}`);

    // const [exists] = await file.exists();
    // if (exists) {
    //   console.log('deleted');
    //   await file.delete();
    //   console.log(`Deleted old photo: ${destinationPath}${photoName}`);
    // }

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
      // You can perform further processing or store the uploaded file information as needed
      fs.unlinkSync(photoPath);
    });

    // Pipe the file into the write stream
    const readStream = fs.createReadStream(photoPath);
    readStream.pipe(stream);

  } catch (error) {
    console.error('Error uploading photo:', error);
  }
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

async function uploadImageToGCS(bucketName, userId, photoPath) {
  try {
    const bucket = storage.bucket(bucketName);

    // Construct the destination path based on userID
    const destinationPath = `users/${userId}/profile/`;

    // Create the directory if it doesn't exist
    const localDir = path.join(__dirname, `../uploads/${destinationPath}`);
    if (!fs.existsSync(localDir)) {
      await mkdir(localDir, { recursive: true });
    }

    // Extract the photo name using path module
    const photoName = path.basename(photoPath);
    const localPhotoPath = path.join(localDir, photoName);

    // Move the file to the local directory
    fs.renameSync(photoPath, localPhotoPath);

    const file = bucket.file(`${destinationPath}${photoName}`);

    // Create a write stream to upload the file to GCS
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'image/jpeg', // Change this based on your file type
      },
    });

    // Handle stream events (success, error)
    stream.on('error', (err) => {
      console.error(`Error uploading photo ${photoName}:`, err);
    });

    stream.on('finish', async () => {
      // You can perform further processing or store the uploaded file information as needed
      await unlink(localPhotoPath);
    });

    // Pipe the file into the write stream
    const readStream = fs.createReadStream(localPhotoPath);
    readStream.pipe(stream);

  } catch (error) {
    console.error('Error uploading profile photo:', error);
  }
}

export const uploadProfilePhoto = CatchAsync(async (req, res, next) => {


  // Check if req.files is an array or if req.file exists for a single file
  const photoPaths = req.files ? req.files.map(file => file.path) : [req.file.path];
  // Find the user by ID
  const user = await User.findById(req.query.id);

  if (!user) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found',
    });
  }

  // Update the user's photo field
  user.photo = req.file ? req.file.filename : req.files[0].filename;

  // Save the updated user document
  await user.save();

  // Upload the image to GCS
  // await uploadPhotos('hapzea', '66464345b891e85686ef92f6', 'Album', 'Full Photos', photoPaths);
  await uploadImageToGCS('hapzea', req.query.id, req.file.path);
  // ('hapzea', req.query.id, req.file.path);
  // await uploadImageToGCS(req.file, req.query.id);

  // Log the user object to confirm the photo is set

  // Respond with success
  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});


export const uploadCoverPhoto = CatchAsync(async (req, res, next) => {

  const coverPhotoPath = req.file.path;
  const id = req.query.id;

  await uploadSinglePhoto('hapzea', id, 'cover', coverPhotoPath);

  res.status(200).json({
    status: 'success',
  });
});

export const uploadResponsiveCoverPhoto = CatchAsync(async (req, res, next) => {
  const responsiveCoverPhotoPath = req.file.path;
  const id = req.query.id;

  await uploadSinglePhoto('hapzea', id, 'responsive-cover', responsiveCoverPhotoPath);

  res.status(200).json({
    status: 'success',
  });
});

export const getCoverPhoto = async (req, res, next) => {
  const userId = req.query._id;
  const subfolder = 'responsive-cover';

  if (!userId) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required',
    });
  }

  await gettingImageFn(userId, subfolder, res);
};


export const getCoverPhotoMob = async (req, res, next) => {
  const userId = req.query._id;
  const subfolder = 'cover';

  if (!userId) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required',
    });
  }

  await gettingImageFn(userId, subfolder, res);
};


const gettingImageFn = async (userId, subfolder, res) => {
  const prefix = `${userId}/${subfolder}/`;
  const bucket = new Storage().bucket(bucketName);

  try {
    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No files found in the user folder',
      });
    }

    const file = files[0];
    const fileStream = file.createReadStream();
    const contentType = mime.lookup(file.name) || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error retrieving photo:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error retrieving photo',
    });
  }
};

export const updatePhotoSubmission = CatchAsync(async (req, res, next) => {
  const clientId = req.params.id;
  const select = req.body.select; // Assuming select is a string representing the folder name
  console.log('updatePhotoSubmission');
  console.log('Client ID:', clientId);
  console.log('Select:', select);

  const user = await Client.findById(clientId);
  if (!user) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found'
    });
  }

  const photoSubmission = user.PhotoSubmission || new Map();

  // Ensure photoSubmission is a Map
  if (!(photoSubmission instanceof Map)) {
    return res.status(400).json({
      status: 'fail',
      message: 'PhotoSubmission is not a Map'
    });
  }

  // Update the specific key in the photoSubmission Map
  photoSubmission.set(select, true); // Set the value to true for the specified select string

  console.log('Updated PhotoSubmission:', Array.from(photoSubmission.entries()));

  const updatedUser = await Client.findByIdAndUpdate(
    clientId,
    { PhotoSubmission: photoSubmission },
    { new: true }
  );

  console.log('Updated User:', updatedUser);

  res.status(200).json({
    status: 'success',
    data: updatedUser
  });
});



const deleteExistingImage = async (userId) => {
  const folderPrefix = `${userId}/client-Cover/`;
  const bucket = new Storage().bucket(bucketName);

  try {
    const [files] = await bucket.getFiles({ prefix: folderPrefix });

    if (files.length > 0) {
      // If there are files, delete each file
      await Promise.all(files.map(file => file.delete()));
    }
  } catch (error) {
    console.error('Error deleting existing images:', error);
    throw error; // Propagate the error to the caller
  }
};

export const uploadClientCoverPhoto = async (req, res, next) => {
  console.log('Received request to upload photo for user ID:', req.query._id);

  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      message: 'No file uploaded',
    });
  }

  const responsiveCoverPhotoPath = req.file.path;
  const userId = req.query._id;

  try {
    // Delete existing images before uploading new one
    await deleteExistingImage(userId);

    // Upload new image
    const photoUrl = await uploadclientPhoto(bucketName, userId, 'client-Cover', responsiveCoverPhotoPath);

    // Update user document with new cover photo URL
    await User.findByIdAndUpdate(userId, { coverPhoto: photoUrl });

    // Respond with success and new photo URL
    res.status(200).json({
      status: 'success',
      photoUrl,
    });
  } catch (error) {
    console.error('Error in uploadClientCoverPhoto:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error uploading photo',
    });
  }
};

export const getClientCoverPhotoURL = async (req, res, next) => {
  const userId = req.params.id;

  try {
    const user = await User.findById(userId).select('coverPhoto');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    res.status(200).json({
      status: 'success',
      coverPhoto: user.coverPhoto,
    });
  } catch (error) {
    console.error('Error fetching cover photo URL:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching cover photo URL',
    });
  }
};

async function uploadclientPhoto(bucketName, userId, subfolderName, photoPath) {
  console.log('Uploading to bucket:', bucketName, 'User ID:', userId, 'Subfolder:', subfolderName, 'Photo path:', photoPath);

  try {
    const bucket = storage.bucket(bucketName);
    subfolderName = subfolderName || 'default';
    const destinationPath = `${userId}/${subfolderName}/`;
    const photoName = path.basename(photoPath);
    const file = bucket.file(`${destinationPath}${photoName}`);
    const contentType = mime.lookup(photoPath) || 'application/octet-stream';

    console.log('Destination path:', destinationPath);
    console.log('Photo name:', photoName);
    console.log('Content type:', contentType);

    const stream = file.createWriteStream({
      metadata: {
        contentType: contentType,
      },
    });

    stream.on('error', (err) => {
      console.error(`Error uploading photo ${photoName}:`, err);
    });

    stream.on('finish', () => {
      console.log(`Successfully uploaded photo ${photoName} to ${destinationPath}`);
      try {
        fs.unlinkSync(photoPath);
        console.log(`Local file ${photoPath} deleted successfully.`);
      } catch (err) {
        console.error(`Error deleting local file ${photoPath}:`, err);
      }
    });

    const readStream = fs.createReadStream(photoPath);
    readStream.pipe(stream);

    // Return the public URL of the uploaded file
    return `https://storage.googleapis.com/${bucketName}/${destinationPath}${photoName}`;
  } catch (error) {
    console.error('Error uploading photo:', error);
    throw error;
  }
}


export const getClientCoverPhoto = async (req, res, next) => {
  const userId = req.query._id;

  if (!userId) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required',
    });
  }

  const prefix = `${userId}/client-Cover/`;
  const bucket = new Storage().bucket(bucketName);

  try {
    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No files found in the user folder',
      });
    }

    const file = files[0];
    const fileStream = file.createReadStream();
    const contentType = mime.lookup(file.name) || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error retrieving photo:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error retrieving photo',
    });
  }
};
