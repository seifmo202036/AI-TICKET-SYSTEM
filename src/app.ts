import express from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import cors from 'cors';
import { notFoundMiddleware } from './middleware/not-found.middleware.js';
import {env} from './config/env.js'
import cookieParser from 'cookie-parser';

export const app = express();

app.use(cors({origin:env.CLIENT_ORIGIN,
    credentials:true
}));

app.use(express.json());
app.use(cookieParser());

// routes
app.use('/api/v1/auth', authRouter);

// 404 not found middleware
app.use(notFoundMiddleware);
//error handling 
app.use(errorHandler);
