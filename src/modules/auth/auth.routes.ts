import { Router } from 'express';

import { env } from '../../config/env.js';
import {
  getCurrentUserController,
  loginController,
  logoutController,
  refreshController,
  signupController,
} from './auth.controller.js';
import {
  authenticateMiddleware,
} from '../../middleware/authenticate.middleware.js';
import {
  authorizeMiddleware,
} from '../../middleware/authorize.middleware.js';
import {
  validateBodyMiddleware,
} from './validate-body.middleware.js';
import {
  loginSchema,
  signupSchema,
} from './auth.validation.js';

export const authRouter = Router();

authRouter.post(
  '/signup',
  validateBodyMiddleware(signupSchema),
  signupController,
);
authRouter.post('/login',
  validateBodyMiddleware(loginSchema),
  loginController);

authRouter.get(
  '/me',
  authenticateMiddleware,
  getCurrentUserController,
);

authRouter.post(
  '/refresh',
  refreshController,
);

authRouter.post(
  '/logout',
  logoutController,
);

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
