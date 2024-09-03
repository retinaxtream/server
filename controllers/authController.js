import User from '../models/UserModel.js';
import { CatchAsync } from '../Utils/CatchAsync.js'
import jwt from 'jsonwebtoken';
import { Logtail } from "@logtail/node";
import { validationResult } from 'express-validator';


const logtail = new Logtail("5FHQ4tHsSCTJTyY71B1kLYoa");





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
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  return createSendToken(user, 200, res);
});

export const signup = CatchAsync(async (req, res, next) => {
  const { businessName, email, mobile, password, passwordConfirm, role } = req.body;

  if (!businessName || !email || !mobile || !password || !passwordConfirm) {
    return next(new AppError('Please provide all required fields', 400));
  }

  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  const normalizedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

  const existingUser = await User.findOne({ $or: [{ email }, { mobile: normalizedMobile }] });
  if (existingUser) {
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

  return createSendToken(newUser, 201, res);
});


// export const signup = CatchAsync(async (req, res, next) => {
//   const { businessName, email, mobile, password, passwordConfirm, role } = req.body;

//   if (!businessName || !email || !mobile || !password || !passwordConfirm) {
//     return res.status(400).json({
//       status: 'fail',
//       message: 'Please provide all required fields',
//     });
//   }

//   if (password !== passwordConfirm) {
//     return res.status(400).json({
//       status: 'fail',
//       message: 'Passwords do not match',
//     });
//   }

//   const normalizedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

//   const existingUser = await User.findOne({ $or: [{ email }, { mobile: normalizedMobile }] });
//   if (existingUser) {
//     return res.status(409).json({
//       status: 'fail',
//       message: 'User with this email or mobile already exists',
//     });
//   }

//   const newUser = await User.create({
//     businessName,
//     email,
//     mobile: normalizedMobile,
//     password,
//     passwordConfirm,
//     role,
//   });

//   const token = signToken(newUser._id); 

//   res.cookie('jwtToken', token, {
//     expires: new Date(Date.now() + parseInt(process.env.JWT_EXPIRES_IN, 10) * 24 * 60 * 60 * 1000),
//     httpOnly: true,
//     secure: true,
//     sameSite: 'strict'
//   });

//   res.status(201).json({
//     status: 'success',
//     token,
//     data: {
//       user: newUser,
//     },
//   });
// });

// export const login = CatchAsync(async (req, res, next) => {
//   const { email, password } = req.body;

//   if (!email || !password) {
//     return res.status(400).json({
//       status: 'fail',
//       message: 'Please provide email and password',
//     });
//   }

//   const user = await User.findOne({ email }).select('+password');
  
//   if (!user) {
//     return res.status(401).json({
//       status: 'fail',
//       message: 'Incorrect email',
//     });
//   }

//   if (!(await user.correctPassword(password, user.password))) {
//     return res.status(401).json({
//       status: 'fail',
//       message: 'Incorrect password',
//     });
//   }

//   const token = signToken(user._id);

//   const jwtExpiresIn = parseInt(process.env.JWT_EXPIRES_IN, 10);
//   if (isNaN(jwtExpiresIn)) {
//     return res.status(500).json({
//       status: 'fail',
//       message: 'Server configuration error',
//     });
//   }

//   const cookieOptions = {
//     httpOnly: true,
//     secure: true,
//     sameSite: 'strict',
//     expires: new Date(Date.now() + jwtExpiresIn * 24 * 60 * 60 * 1000)
//   };

//   res.cookie('jwtToken', token, cookieOptions);

//   res.status(200).json({
//     status: 'success',
//     token,
//     user
//   });
// });



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
  logtail.info('token is here') 
  logtail.info(token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];

  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else if (req.query.token) {
    token = req.query.token;
  }

  try {
    if (!token) {
      // logger.info('No token found');
      res.status(401);
      throw new Error('Not Authorized, no token');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select('-password');
    const user = await User.findById(decoded.id).select('-password');
    if (req.user.tokenVersion !== decoded.tokenVersion) {
      // logger.info('Invalid token version');
      res.clearCookie("jwt", { path: "/" });
      res.status(401); 
      throw new Error('Not Authorized, Invalid token version');
    }
    if (!req.user.validating && !req.body.otp) {
      // logger.info('OTP validation pending');
      res.status(401);
      throw new Error('Not Authorized, OTP validation pending');
    }

    next();
  } catch (error) {
    // logger.error(error);
    res.status(401);

    throw new Error('Not Authorized, token failed');
  } 
}); 


export const googleAuth = CatchAsync(async (req, res, next) => {
  try {

    let { email, id } = req.body; 
    if (!id) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }
 
    const user = await User.findOne({ email });

    if (!user) {
      const newUser = await User.create({
        email,
        password: "Asdfghjklqwer2",
        passwordConfirm: "Asdfghjklqwer2",
        validating: true,
      });

      const token = await signToken(newUser._id);
      res.cookie('jwtToken', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
      });

      return res.status(201).json({
        status: 'success',
        token: token,
        data: {
          user: newUser
        }
      });
    } else if (user) { 
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
    }

    next(); // Call next middleware if user already exists
  } catch (error) {
    // Log the error for debugging
    console.error('Error in googleAuth middleware:', error);
    // Return a detailed error response
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



