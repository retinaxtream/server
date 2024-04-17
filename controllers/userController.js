import path from 'path';
// import multer from 'multer';
import { CatchAsync } from '../Utils/CatchAsync.js'
import Client from '../models/ClientModel.js';
import { Storage } from '@google-cloud/storage';
import User from '../models/UserModel.js';
import nodemailer from "nodemailer";
import fs from 'fs'; 
import sharp from 'sharp';
import { log } from 'console';
import { Logtail } from "@logtail/node";


const logtail = new Logtail("wioUzMpsdSdWHrZeN5YSuKS3");


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
export const jwtcheck = CatchAsync(async (req, res) => {
  // logger.info("from protect router");
  logtail.info(req.headers);
  console.log(req.headers);
  const cookieString =  req.headers.cookie;
  // logger.info(cookieString);
  logtail.info('cookieString');
  logtail.info(req.headers.cookie);


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
  console.log(req.user);
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
      magicLink = `https://api.hapzea.com/${req.user.businessName}/${req.body.Event_Name}/${newClient._id}`;
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
      magicLink = `https://api.hapzea.com/${req.user.businessName}/${req.body.Event_Name}/${newClient._id}`;
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
  console.log(req.body.type);
  console.log('tttttty');
  const  Type  =req.body.type
  const clients = await Client.find({ _id: req.body.id });
console.log(req.body.id);
  console.log(clients);

  if (clients.length === 0) {
    // Handle case where no matching client is found
    return res.status(404).json({
      status: 'fail',
      message: 'Client not found',
    });
  }
  const user = await User.findOne({ _id: clients[0].userId });
  console.log('link validation');
  console.log(user);

  let linkStatus;

  if(Type === 'media'){
    if (user.businessName === req.body.businessName) {
      linkStatus = 'Allow Access';
    } else {
      linkStatus = 'Deny Access';
    }
  }else{
    if (clients[0].EventName === req.body.EventName && user.businessName === req.body.businessName) {
      linkStatus = 'Allow Access';
    } else {
      linkStatus = 'Deny Access';
    }
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
        fs.unlinkSync(photoPath);
        console.log(`Deleted ${photoPath}`);
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
    console.log('files.........');
    // console.log(files);

    const matchingFolders = files.filter((file) => {
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
      console.log('folders');
      console.log(folderName);
      return folderName;
    }); 

    return folderNames;
  } catch (error) {
    console.error('Error fetching folders by metadata:', error);
    throw error;
  }
};
const getFilesByMetadata = async (bucketName, userId, metadataKey, metadataValue,sub_Files) => {
  try {
    console.log('called getFilesByMetadata');
    const bucket = storage.bucket(bucketName);

    const folderPath = `${userId}/PhotoSelection/${sub_Files}/`;

    const [files] = await bucket.getFiles({
      prefix: folderPath, 
    });
    console.log('files.........');
    console.log(files);

    const matchingFolders = files.filter((file) => {
      const metadata = file.metadata;
      console.log('%$%$%$');
      console.log(file.metadata);
      console.log(metadata);
      console.log(file);
      // Check if the file has metadata
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
      console.log('folders');
      console.log(folderName);
      return folderName;
    }); 

    return { sub_Files: sub_Files, folderNames: folderNames };
  } catch (error) {
    console.error('Error fetching folders by metadata:', error);
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



export const sendPublic_url = CatchAsync(async (req, res, next) => {
  console.log('calling');
  console.log(req.body);
  const { email, magic_url, company_name, event_name } = req.body;
  await sendURL(email, magic_url, company_name, event_name);
  res.status(200).json({
    status: 'success',
  });
});

export const sendMedia_Files = CatchAsync(async (req, res, next) => {
  const { email, magic_url, company_name, event_name } = req.body;
  console.log('Media sharing');
  await sendMedia(email, magic_url, company_name, event_name);
  res.status(200).json({
    status: 'success',
  });
});




export const folder_metadata = CatchAsync(async (req, res, next) => {
  const clientId = req.params.id;
  const folders = req.body.selected;
  let subFolder;
  if(req.body.sub_folder){
     subFolder = req.body.sub_folder;
  }
  console.log(clientId);
  const bucketName = 'hapzea';            
  const bucket = storage.bucket(bucketName);
  
  let [files] = [];

  if (subFolder) {
    const prefix = `${clientId}/PhotoSelection/${subFolder}/`;
    const [files] = await bucket.getFiles({
      prefix: prefix,
    });

    // for (const file of files) {
    //     await file.setMetadata({ metadata: null });
    //     console.log(`Metadata removed for file ${file.name}`);
  
    // }
    
    for (const file of files) {
      if (!file.name.endsWith('/')) {
        await file.setMetadata({ metadata: null });
        console.log(`Metadata removed for file ${file.name}`);
      }
    }

    for (const item of folders) {
      const filePath = item.src;
      const fileName = filePath.split('/').pop();
      const folderPath = `${clientId}/PhotoSelection/${subFolder}/${fileName}`;
      await bucket.file(folderPath).setMetadata({
        metadata: {
          selected: true
        }, 
      });
      console.log(`New metadata set for folder ${folderPath}`);
    }
    
    res.status(200).json({
      status: 'success',
    });
  } else {

    async function removeMetadataFromFolders(bucket, prefix) {
      const [files] = await bucket.getFiles({
        prefix: prefix,
        autoPaginate: false // Make sure to disable auto-pagination
      });
    
      for (const file of files) {
        if (file.name.endsWith('/')) {
          // It's a folder, remove metadata and recursively call the function
          await file.setMetadata({ metadata: null });
          console.log(`Metadata removed for folder ${file.name}`);
          await removeMetadataFromFolders(bucket, `${prefix}${file.name}`);
        }
      }
    }
    
    await removeMetadataFromFolders(bucket, `${clientId}/PhotoSelection/`);
        
    
    for (const folder of folders) {
      const folderPath = `${clientId}/PhotoSelection/${folder}/`;
      await bucket.file(folderPath).setMetadata({
        metadata: {
          selected: false
        }, 
      });
      console.log(`New metadata set for folder ${folderPath}`);
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
    console.log('from');
    console.log(folders);
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
  console.log('*************');
  console.log(sub_Files); // Correctly log subFiles from req.query

  const Files = await getFilesByMetadata("hapzea", clientId, "selected", true, sub_Files);
  if (Files) {
    console.log('Files');  
    console.log(Files);
    res.status(200).json({
      status: 'success',
      data: Files
    });
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
            <p>We are sharing the public URL for you to invite your guest for ${event_name}.Please find the details below:</p>
            <p>Click the button below to view more details of the event:</p>
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
    console.log("Email sent: " + info.response);
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
      subject: "Meida Files",
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
            <p>We are sharing the URL for accessing you to select photos which you need to put in the Album for ${event_name}.Please find the details below:</p>
            <p>Click the button below to view more details.</p>
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
    console.log("Email sent: " + info.response);
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

    console.log(
      `Contents of gs://${bucketName}/${fileName} are ${contents.toString()}.`
    );

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
