import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import  validator  from "validator";
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  businessName: {
    type: String,
  },
  validating: { type: Boolean },
  email: {
    type: String,
    sparse: true,
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  photo: {
    type: String,
    default: 'default.png'
  },
  role: { 
    type: String,
    enum: ['user', 'guide', 'lead-guide', 'admin'],
    default: 'user'
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 8,
    select: false
  },
  passwordConfirm: {
    type: String,
    validate: {
      validator: function (el) {
        // Only perform validation if password is provided
        if (this.password) {
          return el === this.password;
        }
        return true; // Return true if password is not provided
      },
      message: 'Passwords are not the same!'
    }
  },
  
  mobile: {
    type: String,
    sparse: true, // Allows multiple documents to have null or empty mobile values
    validate: {
      validator: function (value) {
        if (value) {
          return /^(\+91[\d]{10})$/.test(value);
        }
        return true; // Return true if mobile value is null or empty
      },
      message: 'Please provide a valid Indian mobile number with the format +919XXXXXXXXX or leave it empty.',
    }, 
  },
  
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false
  },

  //rhz
  
    address: {
      type: String,
    },
    
      website: {
        type: String,
        validate: {
          validator: function(v) {
            // Check if 'v' is not empty, and then validate URL
            return v === '' || validator.isURL(v);
          },
          message: 'Please provide a valid URL',
        },
        default: ''
      },
      googleMapLink: {
        type: String,
        validate: {
          validator: function(v) {
            // Check if 'v' is not empty, and then validate URL
            return v === '' || validator.isURL(v);
          },
          message: 'Please provide a valid URL',
        },
        default: ''
      },

    
      socialProfiles: {
        facebook: {
          type: String,
          validate: {
            validator: function(v) {
              return v === '' || validator.isURL(v);
            },
            message: 'Please provide a valid URL for Facebook',
          },
          default: ''
        },
        twitter: {
          type: String,
          validate: {
            validator: function(v) {
              return v === '' || validator.isURL(v);
            },
            message: 'Please provide a valid URL for Twitter',
          },
          default: ''
        },
        instagram: {
          type: String,
          validate: {
            validator: function(v) {
              return v === '' || validator.isURL(v);
            },
            message: 'Please provide a valid URL for Instagram',
          },
          default: ''
        },
      },
      



      //pass

      password: { type: String, required: true, select: false },
      passwordChangedAt: { type: Date }

});

//pass

userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};



userSchema.pre('save', async function (next) {

  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);

  this.passwordConfirm = undefined;
  next();
});

userSchema.pre('save', function (next) {
  if (this.isModified('mobile')) {

    if (!this.mobile.startsWith('+91')) {

      this.mobile = '+91' + this.mobile;
    }
  }
  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.pre(/^find/, function (next) {

  this.find({ active: { $ne: false } });
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
 return await bcrypt.compare(candidatePassword, userPassword);
};

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
