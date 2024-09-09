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
    required: [true, 'Please provide the event category'],
  },
  PhotoSubmission: {
    type: Map,
    of: Boolean,
    default: {},
  },
  Groom: {
    type: String,
  },
  Bride: {
    type: String,
  },
  EventName: {
    type: String,
    // EventName is not required, it will default to EventCategory if not provided
  },
  Venue: {
    type: String,
  },
  ClientName: {
    type: String,
  },
  Email: {
    type: String,
    required: [true, 'Please provide the email'],
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  Date: {
    type: Date,
    required: [true, 'Please provide the event date'],
  },
  Source: {
    type: String,
  },
  Phone: {
    type: String,
    validate: {
      validator: function (value) {
        if (!value) {
          return true;
        }
        return /^(\+91[\d]{10})$/.test(value);
      },
      message: 'Please provide a valid Indian mobile number with the format +919XXXXXXXXX.',
    },
  },
  magicLink: {
    type: String,
    unique: true,
    default: uuidv4, // Set to a new UUID by default
  },
});

// Pre-save hook to set ClientName if it's empty
clientSchema.pre('save', function (next) {
  if (!this.ClientName || this.ClientName.trim() === '') {
    if (this.Groom && this.Bride) {
      this.ClientName = `${this.Groom} & ${this.Bride}`;
    } else if (this.Groom) {
      this.ClientName = this.Groom;
    } else if (this.Bride) {
      this.ClientName = this.Bride;
    }
  }

  // Set EventName to EventCategory if EventName is not provided
  if (!this.EventName || this.EventName.trim() === '') {
    this.EventName = this.EventCategory;
  }

  next();
});

const Client = mongoose.model('Client', clientSchema);

export default Client;
