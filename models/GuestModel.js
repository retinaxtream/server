// models/MatchedGuest.js

import mongoose from 'mongoose';

const GuestSchema = new mongoose.Schema(
  {
    eventId: {
      type: String, 
      required: true,
      index: true, // For faster queries based on eventId
    },
    guestId: {
      type: String,
      required: true,
      index: true, // For faster queries based on guestId
    },
    name: {
      type: String,
      required: true,
    },
    mobile: {
      type: String,
      required: true,
    },
    matches: [
      {
        faceId: {
          type: String,
          required: true,
        },
        imageUrl: {
          type: String,
          required: true,
        },
        confidence: {
          type: Number,
          required: true,
        },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Options
    versionKey: false, // Remove __v field
  }
);

// Create indexes for efficient querying
GuestSchema.index({ eventId: 1, guestId: 1 });

const Guest = mongoose.model('Guest', GuestSchema);

export default Guest;
