import express from 'express';
//import { errorMiddleware } from './middleware/error.middleware.js';
//import { notFoundMiddleware } from './middleware/not-found.middleware.js';

export const app = express();

app.use(express.json());

// routes


//error handling (returned from any layer below)


//app.use(notFoundMiddleware);
//app.use(errorMiddleware);