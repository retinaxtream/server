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
    // mobile: { // Commented out mobile field
    //   type: String,
    //   required: true,
    // },
    email: { // Added email field
      type: String,
      required: true,
      lowercase: true, // Converts email to lowercase before saving
      trim: true, // Removes whitespace from both ends
      match: [/\S+@\S+\.\S+/, 'is invalid'], // Basic email format validation
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
// Optionally, create an index for email if frequent lookups by email are expected
GuestSchema.index({ email: 1 }, { unique: true });

const Guest = mongoose.model('Guest', GuestSchema);

export default Guest;