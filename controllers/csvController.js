// controllers/csvController.js
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import mongoose from 'mongoose';
import Guest from '../models/GuestModel.js'; // Adjust the path as necessary

export const downloadCsv = async (req, res) => {
  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ error: 'Missing required field: eventId.' });
  }

  try {
    // Retrieve all matched guests from MongoDB
    const matchedGuests = await Guest.find({ eventId });
    if (!matchedGuests || matchedGuests.length === 0) {
      return res.status(404).json({ error: 'No guests found for the event.' });
    }

    // Generate CSV file
    const tmpDir = os.tmpdir(); // Get the temporary directory path
    const filePath = path.join(tmpDir, `${eventId}_guests.csv`); // Create the file path

    const csvWriter = createCsvWriter({
      path: filePath, // Use the temporary directory path
      header: [
        { id: 'eventId', title: 'Event ID' },
        { id: 'guestId', title: 'Guest ID' },
        { id: 'name', title: 'Name' },
        { id: 'email', title: 'Email' },
        { id: 'mobile', title: 'Mobile' },
        { id: 's3Url', title: 'S3 URL' },
        { id: 'createdAt', title: 'Created At' },
      ],
    });

    await csvWriter.writeRecords(matchedGuests);

    // Send the CSV file as a response
    res.download(filePath, `guests_${eventId}.csv`, (err) => {
      if (err) {
        console.error('Error sending CSV file:', err);
        res.status(500).json({ error: 'Failed to send CSV file.' });
      }
      // Clean up the temporary file
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting temporary CSV file:', err);
        }
      });
    });
  } catch (error) {
    console.error('Error generating CSV file:', error);
    res.status(500).json({ error: 'Failed to generate CSV file.' });
  }
};
