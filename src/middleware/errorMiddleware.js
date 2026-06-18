import { logger } from "../utils/logger.js";

export const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

export const errorMiddleware = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  logger.error(error.message, {
    statusCode,
    method: req.method,
    path: req.originalUrl,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });

  res.status(statusCode).json({
    error: {
      message: error.message,
      statusCode
    }
  });
};
