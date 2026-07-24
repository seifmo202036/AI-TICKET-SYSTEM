import type {Request, Response, NextFunction} from 'express';
import type {ErrorRequestHandler} from 'express';

export class AppError extends Error {
  constructor(public statusCode: number ,  message: string , public readonly code: string) {
    super(message);
    this.name = 'AppError';
  }
};


