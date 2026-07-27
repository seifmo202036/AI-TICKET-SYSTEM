import { Router } from 'express';

import { signupController } from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/signup',
  signupController,
);