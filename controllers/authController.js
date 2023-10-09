import User from '../models/Usermodel.js';
import { CatchAsync } from '../Utils/CatchAsync.js'
import jwt from 'jsonwebtoken';


const signToken = id =>{
    return jwt.sign({ id: id}, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
}


export const signup = CatchAsync(async (req, res, next) => {
    if (!req.body.mobile.startsWith('+91')) {
        req.body.mobile = '+91' + req.body.mobile;
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

    const token = signToken(newUser._id);

    res.status(201).json({
        status: 'success',
        token:token,
        data: {
            user: newUser
        }
    })
});


export const login = CatchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    // console.log(email,password);
  
    //1) check if email amd password exist
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
        res.status(200).json({
            status:'success',
            token
        })
        
    //3)if everything ok, send token to client

    // createSendToken(user, 200, res);
  });
  

export  const protect = CatchAsync(async (req, res, next) => {
    let token;
  
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    } else if (req.query.token) {
      token = req.query.token;
    }
  
    try {
      if (!token) {
        logger.info('No token found');
        res.status(401);
        throw new Error('Not Authorized, no token');
      }
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
      req.user = await User.findById(decoded.id).select('-password');
  
  
      const user = await User.findById(decoded.id).select('-password');
      if (req.user.tokenVersion !== decoded.tokenVersion) {
        logger.info('Invalid token version');
        res.clearCookie("jwt", { path: "/" });
        res.status(401);
        throw new Error('Not Authorized, Invalid token version');
      }
      if (!req.user.validating && !req.body.otp) {
        logger.info('OTP validation pending');
        res.status(401);
        throw new Error('Not Authorized, OTP validation pending');
      }
  
      next();
    } catch (error) {
      logger.error(error);
      res.status(401);
      throw new Error('Not Authorized, token failed');
    }
  });