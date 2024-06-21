import User from '../models/UserModel.js';
import { CatchAsync } from '../Utils/CatchAsync.js'
import jwt from 'jsonwebtoken';
import { Logtail } from "@logtail/node";


const logtail = new Logtail("f27qB9WwtTgD9srKQETiBVG7");



const signToken = id => {
  // logtail.info(id, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN);
  return jwt.sign({ id: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
}



export const signup = CatchAsync(async (req, res, next) => {
  try {
    const { businessName, email, mobile, password, passwordConfirm, role } = req.body;

    // Check for missing fields
    if (!businessName || !email || !mobile || !password || !passwordConfirm) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide all required fields',
      });
    }

    // Check if password and passwordConfirm match
    if (password !== passwordConfirm) {
      return res.status(400).json({
        status: 'fail',
        message: 'Passwords do not match',
      });
    }

    // Normalize mobile number
    const normalizedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { mobile: normalizedMobile }] });
    if (existingUser) {
      return res.status(409).json({
        status: 'fail',
        message: 'User with this email already exists',
      });
    }

    // Create new user
    const newUser = await User.create({
      businessName,
      email,
      mobile: normalizedMobile,
      password,
      passwordConfirm,
      role,
    });

    const token = signToken(newUser._id);
    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: newUser,
      },
    });
  } catch (error) {
    console.error('Error in signup controller:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
});


export const login = CatchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide email and password',
    });
  }

  // Check if the user exists based on the email
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    return res.status(401).json({
      status: 'fail',
      message: 'Incorrect email',
    });
  }

  // Check if the password is correct
  if (!(await user.correctPassword(password, user.password))) {
    return res.status(401).json({
      status: 'fail',
      message: 'Incorrect password',
    });
  }

  console.log('FROM LOGIN');
  const token = signToken(user._id);
  console.log(token);
  
  res.cookie('jwtToken', token, {
    httpOnly: true, 
    secure: true,   
    sameSite: 'strict' 
  });

  res.status(200).json({
    status: 'success',
    token,
    user
  });
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
  logtail.info('token is here')
  logtail.info(token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    console.log(token);
    console.log(req.headers);
    console.log(req.headers.authorization);
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else if (req.query.token) {
    token = req.query.token;
  }

  try {
    if (!token) {
      console.log('##### No token found #######');
      // logger.info('No token found');
      res.status(401);
      throw new Error('Not Authorized, no token');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select('-password');
    console.log('FROM PROTECT *****************');
    console.log(req.user);
    console.log(req.user._id);
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
    console.log('In the catch');
    throw new Error('Not Authorized, token failed');
  }
});


export const googleAuth = CatchAsync(async (req, res, next) => {
  try {
    let { email, id } = req.body;
    if (!id) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }

    console.log(email, id);
    const user = await User.findOne({ email });

    if (!user) {
      console.log('User not found, creating a new user');
      const newUser = await User.create({
        email,
        password: "Asdfghjklqwer2",
        passwordConfirm: "Asdfghjklqwer2",
        validating: true,
      });

      console.log('New user created:', newUser);
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
      console.log('existing user');
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
    let { email } = req.body;

    if (!email) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }

    console.log(email);
    const user = await User.findOne({ email });

    if (!user) {
      console.log('User not found');
      return res.status(401).json({ error: "User not authorized" });
    }

    console.log('Existing user:', user);
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



