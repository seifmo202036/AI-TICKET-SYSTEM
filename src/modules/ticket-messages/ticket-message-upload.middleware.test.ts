import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import type { AppError } from '../../errors/app-error.js';
import { MAX_TICKET_MESSAGE_IMAGE_SIZE_BYTES } from './ticket-message-images.js';
import { ticketMessageImageUploadMiddleware } from './ticket-message-upload.middleware.js';

interface MultipartFile {
  mimeType: string;
  content: Buffer;
}

function createMultipartRequest(file: MultipartFile): Request {
  const boundary = 'ticket-message-upload-boundary';
  const requestBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="image"; filename="image"\r\n' +
        `Content-Type: ${file.mimeType}\r\n\r\n`,
    ),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const request = Readable.from([requestBody]) as unknown as Request;

  request.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(requestBody.length),
  };

  return request;
}

async function runUploadMiddleware(request: Request): Promise<unknown> {
  return new Promise((resolve) => {
    ticketMessageImageUploadMiddleware(
      request,
      {} as Response,
      ((error?: unknown) => resolve(error)) as NextFunction,
    );
  });
}

describe('ticketMessageImageUploadMiddleware', () => {
  it('accepts one supported image in memory', async () => {
    const request = createMultipartRequest({
      mimeType: 'image/png',
      content: Buffer.from('image data'),
    });

    const error = await runUploadMiddleware(request);

    expect(error).toBeUndefined();
    expect(request.file?.mimetype).toBe('image/png');
    expect(request.file?.buffer).toEqual(Buffer.from('image data'));
  });

  it('rejects unsupported image MIME types', async () => {
    const request = createMultipartRequest({
      mimeType: 'image/gif',
      content: Buffer.from('gif data'),
    });

    const error = (await runUploadMiddleware(request)) as AppError;

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('INVALID_IMAGE_TYPE');
  });

  it('rejects images larger than 5 MB', async () => {
    const request = createMultipartRequest({
      mimeType: 'image/webp',
      content: Buffer.alloc(MAX_TICKET_MESSAGE_IMAGE_SIZE_BYTES + 1),
    });

    const error = (await runUploadMiddleware(request)) as AppError;

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('IMAGE_TOO_LARGE');
  });
});
