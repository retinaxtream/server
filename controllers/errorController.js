// controllers/errorController.js

import AppError from "../Utils/AppError.js";
import logger from '../Utils/logger.js'; // Direct import of the logger

// Handle MongoDB CastError (invalid ObjectId)
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

// Handle MongoDB duplicate key error
const handleDuplicateFieldsDB = (err) => {
  const value = err.keyValue ? JSON.stringify(err.keyValue) : '';
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

// Handle MongoDB validation errors
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

// Send error response during development
const sendErrorDev = (err, res) => {
  // Log the error details using Winston
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    error: err,
  });

  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

// Send error response during production
const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    // Log operational errors as warnings
    logger.warn('Operational error:', {
      message: err.message,
      statusCode: err.statusCode,
      status: err.status,
    });

    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    // Log programming or other unknown errors as errors
    logger.error('ERROR 💥:', {
      message: err.message,
      stack: err.stack,
      error: err,
    });

    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
};

// Global error handling middleware
const globalErrorHandler = (err, req, res, next) => {
  // Set default values if not set
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;

    // Handle specific MongoDB errors
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);

    sendErrorProd(error, res);
  }
};

export default globalErrorHandler;  