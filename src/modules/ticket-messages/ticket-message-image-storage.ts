import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { getTicketMessageImageExtension } from './ticket-message-images.js';
import type {
  TicketMessageImage,
  TicketMessageImageMimeType,
} from './ticket-messages.types.js';

interface TicketMessageImageStorageConfig {
  region: string;
  bucketName: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface UploadedTicketMessageImage {
  s3Key: string;
  mimeType: TicketMessageImageMimeType;
  fileSizeBytes: number;
}

let storageClient: S3Client | null = null;

export async function uploadTicketMessageImage(
  ticketId: string,
  image: TicketMessageImage,
): Promise<UploadedTicketMessageImage> {
  const storageConfig = getTicketMessageImageStorageConfig();
  const s3Key = createTicketMessageImageKey(ticketId, image.mimeType);

  try {
    await getStorageClient(storageConfig).send(
      new PutObjectCommand({
        Bucket: storageConfig.bucketName,
        Key: s3Key,
        Body: image.buffer,
        ContentType: image.mimeType,
      }),
    );
  } catch (error) {
    throw new AppError(
      502,
      'Unable to upload the ticket message image',
      'S3_UPLOAD_TICKET_MESSAGE_IMAGE_FAILED',
      { cause: error },
    );
  }

  return {
    s3Key,
    mimeType: image.mimeType,
    fileSizeBytes: image.fileSizeBytes,
  };
}

export async function deleteTicketMessageImage(s3Key: string): Promise<void> {
  const storageConfig = getTicketMessageImageStorageConfig();

  try {
    await getStorageClient(storageConfig).send(
      new DeleteObjectCommand({
        Bucket: storageConfig.bucketName,
        Key: s3Key,
      }),
    );
  } catch (error) {
    throw new AppError(
      502,
      'Unable to remove the ticket message image',
      'S3_DELETE_TICKET_MESSAGE_IMAGE_FAILED',
      { cause: error },
    );
  }
}

export async function createTicketMessageImageUrl(
  s3Key: string,
): Promise<string> {
  const storageConfig = getTicketMessageImageStorageConfig();

  try {
    return await getSignedUrl(
      getStorageClient(storageConfig),
      new GetObjectCommand({
        Bucket: storageConfig.bucketName,
        Key: s3Key,
      }),
      {
        expiresIn: env.S3_SIGNED_URL_EXPIRES_IN_SECONDS,
      },
    );
  } catch (error) {
    throw new AppError(
      502,
      'Unable to create an image URL for this ticket message',
      'S3_SIGN_TICKET_MESSAGE_IMAGE_FAILED',
      { cause: error },
    );
  }
}

function getTicketMessageImageStorageConfig(): TicketMessageImageStorageConfig {
  if (!env.S3_REGION || !env.S3_BUCKET_NAME) {
    throw new AppError(
      500,
      'Ticket image storage is not configured',
      'S3_CONFIGURATION_ERROR',
    );
  }

  const hasAccessKeyId = Boolean(env.S3_ACCESS_KEY_ID);
  const hasSecretAccessKey = Boolean(env.S3_SECRET_ACCESS_KEY);

  if (hasAccessKeyId !== hasSecretAccessKey) {
    throw new AppError(
      500,
      'Both S3 access-key environment variables must be set together',
      'S3_CONFIGURATION_ERROR',
    );
  }

  const storageConfig: TicketMessageImageStorageConfig = {
    region: env.S3_REGION,
    bucketName: env.S3_BUCKET_NAME,
  };

  if (env.S3_ENDPOINT) {
    storageConfig.endpoint = env.S3_ENDPOINT;
  }

  if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    storageConfig.credentials = {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    };
  }

  return storageConfig;
}

function getStorageClient(
  storageConfig: TicketMessageImageStorageConfig,
): S3Client {
  if (storageClient) {
    return storageClient;
  }

  const clientOptions = {
    region: storageConfig.region,
    forcePathStyle: Boolean(storageConfig.endpoint),
  };

  if (storageConfig.endpoint && storageConfig.credentials) {
    storageClient = new S3Client({
      ...clientOptions,
      endpoint: storageConfig.endpoint,
      credentials: storageConfig.credentials,
    });
  } else if (storageConfig.endpoint) {
    storageClient = new S3Client({
      ...clientOptions,
      endpoint: storageConfig.endpoint,
    });
  } else if (storageConfig.credentials) {
    storageClient = new S3Client({
      ...clientOptions,
      credentials: storageConfig.credentials,
    });
  } else {
    storageClient = new S3Client(clientOptions);
  }

  return storageClient;
}

function createTicketMessageImageKey(
  ticketId: string,
  mimeType: TicketMessageImageMimeType,
): string {
  const extension = getTicketMessageImageExtension(mimeType);

  return `tickets/${ticketId}/messages/${randomUUID()}.${extension}`;
}
