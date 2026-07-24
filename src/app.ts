import express from 'express';
import { errorHandler } from './middleware/error.middleware.ts';
import { notFoundMiddleWare } from './middleware/not-found.middleware.ts';

export const app = express();

app.use(express.json());

// routes



// 404 not found middleware
app.use(notFoundMiddleWare);
//error handling 
app.use(errorHandler);