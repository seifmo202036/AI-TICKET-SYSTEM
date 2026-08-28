import type {
  TicketMessageImage,
  TicketMessageImageMimeType,
} from './ticket-messages.types.js';

export const MAX_TICKET_MESSAGE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const supportedTicketMessageImageMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export function isTicketMessageImageMimeType(
  mimeType: string,
): mimeType is TicketMessageImageMimeType {
  return supportedTicketMessageImageMimeTypes.includes(
    mimeType as TicketMessageImageMimeType,
  );
}

export function toTicketMessageImage(
  file: Express.Multer.File | undefined,
): TicketMessageImage | undefined {
  if (!file) {
    return undefined;
  }

  if (!isTicketMessageImageMimeType(file.mimetype)) {
    return undefined;
  }

  return {
    buffer: file.buffer,
    mimeType: file.mimetype,
    fileSizeBytes: file.size,
  };
}

export function getTicketMessageImageExtension(
  mimeType: TicketMessageImageMimeType,
): 'jpg' | 'png' | 'webp' {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
}
