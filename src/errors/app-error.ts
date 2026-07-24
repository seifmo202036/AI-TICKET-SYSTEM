

export class AppError extends Error {
  constructor(public statusCode: number ,  message: string , public readonly code: string) {
    super(message);
    this.name = 'AppError';
  }
};


