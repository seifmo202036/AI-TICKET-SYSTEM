import type {
    NextFunction,
    Request,
    Response,
  } from "express";
  
  import { z } from "zod";
  
  import { AppError } from "../../errors/app-error.js";
  
  export function validateBodyMiddleware(
    schema: z.ZodTypeAny,
  ) {
    return (
      req: Request,
      _res: Response,
      next: NextFunction,
    ): void => {
      const result = schema.safeParse(req.body);
  
      if (!result.success) {
        const validationMessage =
          result.error.issues
            .map((issue) => {
              const field =
                issue.path.join(".");
  
              return field
                ? `${field}: ${issue.message}`
                : issue.message;
            })
            .join(", ");
  
        next(
          new AppError(
            400,
            validationMessage,
            "VALIDATION_ERROR",
          ),
        );
  
        return;
      }
  
      // Use the normalized Zod result.
      req.body = result.data;
  
      next();
    };
  }