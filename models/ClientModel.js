import mongoose from "mongoose";
import validator from "validator";
import { v4 as uuidv4 } from 'uuid';

const clientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  EventCategory: {
    type: String,
    required: [true, 'Please provide the event category']
  },
  PhotoSubmission:{
    type: Boolean,
    default: false
  },
  Groom: {
    type: String,     
  },
  Bride: {
    type: String,
  },
  EventName: {
    type: String,
    required: [true, 'Please provide the event name']
  },
  Venue: {
    type: String,
    required: [true, 'Please provide the venue']
  },
  ClientName: {
    type: String,
    required: [true, 'Please provide the client\'s name']
  },
  Email: {
    type: String,
    required: [true, 'Please provide the email'],
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  Date: {
    type: Date,
    // required: [true, 'Please provide the event date']
  },
  Source: {
    type: String,
    required: [true, 'Please provide the source']
  },
  Phone: {
    type: String,
    required: [true, 'Please provide the phone number'],
    validate: {
      validator: function (value) {
        return /^(\+91[\d]{10})$/.test(value);
      },
      message: 'Please provide a valid Indian mobile number with the format +919XXXXXXXXX.'
    }
  },
  magicLink: {
    type: String,
    unique: true,
    default: uuidv4, // Set to a new UUID by default
  },
});    

const Client = mongoose.model('Client', clientSchema);

export default Client;
 