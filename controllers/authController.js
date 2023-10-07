import User from '../models/Usermodel.js';
import {CatchAsync} from '../Utils/CatchAsync.js'

export const signup = CatchAsync(async (req, res, next) => {
    const newUser =await User.create(req.body);
    res.status(201).json({
        status:'success',
        data:{
            user:newUser
        }
    })
});
   