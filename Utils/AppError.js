class AppError extends Error {
    constructor(message, statusCode) {
      super(message); // Passes message to the base Error class
  
      this.statusCode = statusCode;
      this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
      this.isOperational = true; // Indicates this is a known type of error (not a programming bug)
  
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  export default AppError;
  