import { Router } from 'express';

import { authenticateMiddleware } from '../../middleware/authenticate.middleware.js';
import { authorizeMiddleware } from '../../middleware/authorize.middleware.js';
import {
  reinstateUserController,
  suspendUserController,
} from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(authenticateMiddleware);

usersRouter.post(
  '/:userId/suspend',
  authorizeMiddleware('admin'),
  suspendUserController,
);

usersRouter.post(
  '/:userId/reinstate',
  authorizeMiddleware('admin'),
  reinstateUserController,
);
