import mongoose from 'mongoose';

// Define schema for GuestRegister
const GuestRegisterSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true, // Removes whitespace from both ends
    },
    email: {
      type: String,
      required: true,
      lowercase: true, // Converts email to lowercase before saving
      trim: true, // Removes whitespace from both ends
      match: [/\S+@\S+\.\S+/, 'is invalid'], // Basic email format validation
    },
    mobile: {
      type: String,
      trim: true, // Removes whitespace from both ends
      match: [/^[0-9]{10}$/, 'is invalid'], // Basic mobile number format validation (10 digits)
    },
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

// Create an index to optimize queries based on email and name
GuestRegisterSchema.index({ email: 1, name: 1 });

// Compile the model
const GuestRegister = mongoose.model('GuestRegister', GuestRegisterSchema);
 
export default GuestRegister;
