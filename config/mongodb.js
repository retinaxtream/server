import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const pass = process.env.PASSWORD_MONGO

const connectDatabase = async () => {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(`mongodb+srv://retinadevx:OL5jbWMTZzKQUR9z@cluster0.j7ukb7y.mongodb.net/`, {});
    console.log("Db Connected");
  } catch (error) {
    console.log(error.message);
  }
};
 
export default connectDatabase; 