import type {
  NextFunction,
  Request,
  Response,
} from 'express';

import { signupSchema } from './auth.validation.js';
import { signup } from './auth.service.js';

export async function signupController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = signupSchema.parse(
      request.body,
    );

    const user = await signup(input);

    response.status(201).json({
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
}