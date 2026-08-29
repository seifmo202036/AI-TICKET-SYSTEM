import { Router } from 'express';

import { authenticateMiddleware } from '../../middleware/authenticate.middleware.js';
import { authorizeMiddleware } from '../../middleware/authorize.middleware.js';
import {
  approveAgentController,
  declineAgentController,
  getManageableUsersController,
  getPendingAgentsController,
  reinstateUserController,
  suspendUserController,
} from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(authenticateMiddleware);

// GET pending agents awaiting admin approval
usersRouter.get(
  '/agents/pending',
  authorizeMiddleware('admin'),
  getPendingAgentsController,
);

usersRouter.get(
  '/',
  authorizeMiddleware('admin'),
  getManageableUsersController,
);

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

usersRouter.post(
  '/:userId/approve',
  authorizeMiddleware('admin'),
  approveAgentController,
);

usersRouter.post(
  '/:userId/decline',
  authorizeMiddleware('admin'),
  declineAgentController,
);
