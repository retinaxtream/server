import User from '../models/UserModel.js';
import { CatchAsync } from '../Utils/CatchAsync.js'
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import AppError from '../Utils/AppError.js';
import logger from '../Utils/logger.js'; 


    
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
}; 

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN, 10);

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    expires: new Date(Date.now() + jwtExpiresIn * 24 * 60 * 60 * 1000),
  };

  res.cookie('jwtToken', token, cookieOptions);

  user.password = undefined; // Hide password in response

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};
 
export const login = CatchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    logger.warn('Login failed: Missing email or password');
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.correctPassword(password, user.password))) {
    logger.warn(`Login failed: Incorrect email or password for ${email}`);
    return next(new AppError('Incorrect email or password', 401));
  }

  logger.info(`User logged in: ${email}`);
  return createSendToken(user, 200, res);
});

export const signup = CatchAsync(async (req, res, next) => {
  const { businessName, email, mobile, password, passwordConfirm, role } = req.body;

  if (!businessName || !email || !mobile || !password || !passwordConfirm) {
    logger.warn('Signup failed: Missing required fields');
    return next(new AppError('Please provide all required fields', 400));
  }

  if (password !== passwordConfirm) {
    logger.warn('Signup failed: Passwords do not match');
    return next(new AppError('Passwords do not match', 400));
  }

  const normalizedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

  const existingUser = await User.findOne({ $or: [{ email }, { mobile: normalizedMobile }] });
  if (existingUser) {
    logger.warn(`Signup failed: User already exists with email ${email} or mobile ${mobile}`);
    return next(new AppError('User with this email or mobile already exists', 409));
  }

  const newUser = await User.create({
    businessName,
    email,
    mobile: normalizedMobile,
    password,
    passwordConfirm,
    role,
  });

  logger.info(`New user signed up: ${email}`);
  return createSendToken(newUser, 201, res);
});
 



export const logout = async (req, res) => {
  try {
      await res.clearCookie("jwtToken");
      res.status(200).json({ status: 'success' });
  } catch (error) {
      console.error('Logout failed:', error);
      res.status(400).json({ status: 'fail' });   
  }
};

export const protect = CatchAsync(async (req, res, next) => {
  let token;
  logger.info('Attempting to authenticate request');

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    logger.debug(`Token found in Authorization header: ${token.substring(0, 20)}...`);
  } else if (req.cookies.jwtToken) {
    token = req.cookies.jwtToken;
    logger.debug(`Token found in cookies: ${token.substring(0, 20)}...`);
  } else if (req.query.token) {
    token = req.query.token;
    logger.debug(`Token found in query parameters: ${token.substring(0, 20)}...`);
  } else {
    logger.warn('No token found in request');
    return res.status(401).json({ message: 'Not Authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    logger.info(`Token decoded successfully for user ID: ${decoded.id}`);

    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      logger.warn('User not found for the decoded token');
      return res.status(401).json({ message: 'Not Authorized, user not found' });
    }

    if (req.user.tokenVersion !== decoded.tokenVersion) {
      res.clearCookie("jwtToken", { path: "/" });
      logger.warn('Token version mismatch, invalidating token');
      return res.status(401).json({ message: 'Not Authorized, Invalid token version' });
    }

    if (!req.user.validating && !req.body.otp) {
      logger.warn('OTP validation pending for the user');
      return res.status(401).json({ message: 'Not Authorized, OTP validation pending' });
    }

    logger.info(`Authentication successful for user ID: ${req.user._id}`);
    next();
  } catch (error) {
    logger.error(`Authentication failed: ${error.message}`);
    return res.status(401).json({ message: 'Not Authorized, token failed' });
  }
});


export const googleAuth = CatchAsync(async (req, res, next) => {
  try {
    const { email, id: googleId } = req.body;

    if (!googleId) {
      logger.warn('Google Authentication failed: Missing Google ID');
      return res.status(401).json({ error: 'Invalid Credentials' });
    }

    let user = await User.findOne({ email });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.validating = true;
        await user.save({ validateBeforeSave: false });
        logger.info(`Google account linked for user: ${email}`);
      }
    } else {
      user = await User.create({
        email,
        googleId,
        validating: true,
      });
      logger.info(`New user created via Google Auth: ${email}`);
    }

    const token = signToken(user._id);
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    logger.info(`User authenticated via Google: ${email}`);
    return res.status(200).json({
      status: 'success',
      token,
      data: { user },
    });
  } catch (error) {
    logger.error(`Google Authentication failed: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});


export const googleAuthDesk = CatchAsync(async (req, res, next) => {
  try {
    let  { email } = req.body; 

    if (!email) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: "User not authorized" });
    }

    const token = await signToken(user._id);
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    }); 

    return res.status(201).json({
      status: 'success',
      token: token,
      data: {
        user
      }
    });
  } catch (error) {
    // Log the error for debugging
    console.error('Error in googleAuth middleware:', error);
    // Return a detailed error response
    return res.status(500).json({ error: error.message });
  }
});



