import type { NextFunction, Request, Response } from 'express';

import multer from 'multer';

import { AppError } from '../../errors/app-error.js';
import {
  isTicketMessageImageMimeType,
  MAX_TICKET_MESSAGE_IMAGE_SIZE_BYTES,
} from './ticket-message-images.js';

const ticketMessageImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: MAX_TICKET_MESSAGE_IMAGE_SIZE_BYTES,
  },
  fileFilter: (_request, file, callback) => {
    if (isTicketMessageImageMimeType(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(
      new AppError(
        400,
        'Only JPEG, PNG, and WebP images can be attached to a ticket message',
        'INVALID_IMAGE_TYPE',
      ),
    );
  },
});

export function ticketMessageImageUploadMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  ticketMessageImageUpload.single('image')(request, response, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof multer.MulterError) {
      next(mapMulterError(error));
      return;
    }

    next(
      new AppError(
        400,
        'Unable to process the attached image',
        'INVALID_IMAGE_UPLOAD',
        { cause: error },
      ),
    );
  });
}

function mapMulterError(error: multer.MulterError): AppError {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new AppError(
      400,
      'Attached images must be 5 MB or smaller',
      'IMAGE_TOO_LARGE',
      { cause: error },
    );
  }

  if (
    error.code === 'LIMIT_FILE_COUNT' ||
    error.code === 'LIMIT_UNEXPECTED_FILE'
  ) {
    return new AppError(
      400,
      'A ticket message can include only one image in the image field',
      'TOO_MANY_IMAGES',
      { cause: error },
    );
  }

  return new AppError(
    400,
    'Unable to process the attached image',
    'INVALID_IMAGE_UPLOAD',
    { cause: error },
  );
}
