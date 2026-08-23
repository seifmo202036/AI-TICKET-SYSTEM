import { Router } from 'express';

import { env } from '../../config/env.js';
import {
  getCurrentUserController,
  loginController,
  logoutController,
  refreshController,
  signupController,
} from './auth.controller.js';
import { authenticateMiddleware } from '../../middleware/authenticate.middleware.js';
import { authorizeMiddleware } from '../../middleware/authorize.middleware.js';
import { validateBodyMiddleware } from '../../middleware/validate-body.middleware.js';
import { loginSchema, signupSchema } from './auth.validation.js';
import {
  authGeneralRateLimiter,
  loginRateLimiter,
  refreshRateLimiter,
  signupRateLimiter,
} from '../../middleware/rate-limit.middleware.js';

export const authRouter = Router();

authRouter.use(authGeneralRateLimiter);

authRouter.post(
  '/signup',
  signupRateLimiter,
  validateBodyMiddleware(signupSchema),
  signupController,
);
authRouter.post(
  '/login',
  loginRateLimiter,
  validateBodyMiddleware(loginSchema),
  loginController,
);

authRouter.get('/me', authenticateMiddleware, getCurrentUserController);

authRouter.post('/refresh', refreshRateLimiter, refreshController);

authRouter.post('/logout', logoutController);

if (env.NODE_ENV === 'test') {
  authRouter.get(
    '/test/agent-only',
    authenticateMiddleware,
    authorizeMiddleware('agent', 'admin'),
    (_request, response) => {
      response.status(204).send();
    },
  );
}
