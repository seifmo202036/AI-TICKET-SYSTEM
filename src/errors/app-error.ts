export type AppErrorOptions = {
  cause?: unknown;
};

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public readonly code: string,
    options?: AppErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
