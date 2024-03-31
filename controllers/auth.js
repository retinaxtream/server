import User from '../models/Usermodel.js';
import { CatchAsync } from '../Utils/CatchAsync.js'
import jwt from 'jsonwebtoken';



export const protect = CatchAsync(async (req, res, next) => {
  let token;
  if (req.headers.cookie) {
    console.log('#### INSIDE IF ####');
    // Use a library or custom logic to parse the cookie and extract the token
    const cookies = req.headers.cookie.split(';'); // Split the string into an array of cookies
    console.log(cookies);
    const jwtCookie = cookies.find(cookie => cookie.trim().startsWith('jwtToken='));

    if (jwtCookie) {
      token = jwtCookie.split('=')[1].trim();
    }
  }
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else if (req.query.token) {
    token = req.query.token;
  }


  try {
    if (!token) {
      //   logger.info('No token found');
      res.status(401);
      throw new Error('Not Authorized, no token');
    }


    console.log('TOKEN');
    console.log(token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded.....');
    console.log(decoded);
    // console.log();
    req.user = await User.findById(decoded.id).select('-password');
    console.log('UUUUSEER');
    console.log(req.user);
    // const user = await User.findById(decoded.id).select('-password');
    next();
  } catch (error) {
    // logger.error(error);
    console.log('from catch');
    res.status(401);
    throw new Error('Not Authorized, token failed');
  }
});

