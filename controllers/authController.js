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
    // logtail.info(req.body)
    if (!req.body.mobile.startsWith('+91')) {
      req.body.mobile = '+91' + req.body.mobile;
      // logtail.info(req.body.mobile);
    }

    const newUser = await User.create({
      businessName: req.body.businessName,
      email: req.body.email,
      mobile: req.body.mobile,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
      passwordChangedAt: req.body.passwordChangedAt,
      role: req.body.role
    });

    // logtail.info(newUser);

    const token = signToken(newUser._id);
    // logtail.info(token)
    res.status(201).json({
      status: 'success',
      token: token,
      data: {
        user: newUser
      }
    });
  } catch (error) {
    // Handle the error
    console.error('Error in signup controller:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});



export const login = CatchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  // logtail.info({email, password });
  // console.log(email,password);

  if (!email || !password) {
    return res.status(400).json({
      status: 'Please provide email and password',
    });
  }

  //2) check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');

  // console.log(user);

  if (!user || !(await user.correctPassword(password, user.password))) {
    return res.status(401).json({
      status: 'Incorrect email or password',
    });
  }


  const token = signToken(user._id);
  res.cookie('jwtToken', token, {
    httpOnly: true, 
    secure: true,   
    sameSite: 'strict' 
  });

  res.status(200).json({
    status: 'success',
    token,
    user
  })
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
        validating: true,
      });

      console.log('New user created:', newUser);
      const token = await signToken(newUser._id);

      return res.status(201).json({
        status: 'success',
        token: token,
        data: {
          user: newUser
        }
      });
    }

    next(); // Call next middleware if user already exists
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
