import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  businessName: { type: String },
  validating: {
    type: Boolean,
    default: false,
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    required: [true, 'Please provide an email'],
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  photo: { type: String, default: 'default.png' },
  role: {
    type: String,
    enum: ['user', 'guide', 'lead-guide', 'admin'],
    default: 'user',
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
  },
  password: {
    type: String,
    required: [
      function () {
        return !this.googleId;
      },
      'Please provide a password',
    ],
    minlength: 8,
    select: false,
  },
  passwordConfirm: {
    type: String,
    validate: {
      validator: function (el) {
        if (this.password || el) {
          return el === this.password;
        }
        return true;
      },
      message: 'Passwords are not the same!',
    },
  },
  mobile: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    validate: {
      validator: function (value) {
        // Allow undefined or null values
        if (value == null) return true;
        return /^(\+91[\d]{10})$/.test(value);
      },
      message: 'Please provide a valid Indian mobile number with the format +919XXXXXXXXX.',
    },
    // Removed default: ''
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: { type: Boolean, default: true, select: false },
  address: { type: String },
  website: {
    type: String,
    validate: {
      validator: function (v) {
        return v == null || v === '' || validator.isURL(v);
      },
      message: 'Please provide a valid URL',
    },
    default: undefined, // Changed from ''
  },
  googleMapLink: {
    type: String,
    validate: {
      validator: function (v) {
        return v == null || v === '' || validator.isURL(v);
      },
      message: 'Please provide a valid URL',
    },
    default: undefined, // Changed from ''
  },
  socialProfiles: {
    facebook: {
      type: String,
      validate: {
        validator: function (v) {
          return v == null || v === '' || validator.isURL(v);
        },
        message: 'Please provide a valid URL for Facebook',
      },
      default: undefined, // Changed from ''
    },
    twitter: {
      type: String,
      validate: {
        validator: function (v) {
          return v == null || v === '' || validator.isURL(v);
        },
        message: 'Please provide a valid URL for Twitter',
      },
      default: undefined, // Changed from ''
    },
    instagram: {
      type: String,
      validate: {
        validator: function (v) {
          return v == null || v === '' || validator.isURL(v);
        },
        message: 'Please provide a valid URL for Instagram',
      },
      default: undefined, // Changed from ''
    },
  },
});

// Hash the password before saving, if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

// Pre-save hook to format mobile number
userSchema.pre('save', function (next) {
  if (!this.isModified('mobile')) return next();

  if (this.mobile && !this.mobile.startsWith('+91')) {
    this.mobile = '+91' + this.mobile;
  }
  next();
});

// Update passwordChangedAt if password is modified
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Query middleware to exclude inactive users
userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

// Instance method to check if password is correct
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Instance method to check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to create a password reset token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken) 
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

const User = mongoose.model('User', userSchema);

export default User;
