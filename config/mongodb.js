import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({path:'./config.env'});



const DB = process.env.DATABASE.replace('<PASSWORD>', process.env.DATABASE_PASSWORD)
  .replace('<DATABASE>', process.env.DATABASE_NAME); // Replace 'database' with your desired database name


  const connectDatabase = async () => {
    try {
      mongoose.set("strictQuery", true);
      await mongoose.connect(DB, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log("Connected to MongoDB");
    } catch (error) {
      console.error("MongoDB connection error:", error.message);
    }
  };
  
export default connectDatabase;
