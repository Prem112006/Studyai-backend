import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
    // Do not call process.exit(1) in serverless environment to prevent function crashes.
    // The request-level middleware will retry connecting when a request arrives.
  }
};

export default connectDB;
