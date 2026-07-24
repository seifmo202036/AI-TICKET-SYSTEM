import type {Request, Response, NextFunction} from 'express';
import {AppError} from '../errors/app-error.ts';


// us app.use() to handle 404 errors for routes that are not found
export const notFoundMiddleWare = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(404, `Route ${req.method} ${req.originalUrl} was not found`,
      'ROUTE_NOT_FOUND');
  next(error); // pass the error to the next middleware (error handling middleware)
};