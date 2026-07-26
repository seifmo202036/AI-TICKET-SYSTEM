import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters')
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password is too long',
  );

export const signupSchema = z
  .object({
    userName: z
      .string()
      .trim()
      .min(3, 'Username must contain at least 3 characters')
      .max(50, 'Username cannot exceed 50 characters')
      .regex(
        /^[a-zA-Z0-9_]+$/,
        'Username may contain letters, numbers, and underscores only',
      ),

    email: z
      .string()
      .trim()
      .email('Enter a valid email address')
      .max(255),

    password: passwordSchema,

    accountType: z.enum(['customer', 'agent']),
  })
  .strict();

export const signinSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email('Enter a valid email address'),

    password: z.string().refine(
    (password) => password.trim().length > 0,
    'Password is required'
    )
  })
  .strict(); // rejects properties not in the schema like defining roles



//extract the TypeScript data type from it to use it later 
/*
Without z.infer, you will write

const signinSchema = z.object({
  email: z.string(),
  password: z.string(),
});

type SigninInput = {
  email: string;
  password: string;
};
The schema checks real incoming data while 
your application is running. 
The inferred type helps TypeScript check your code
while you are writing it.
*/
export type SignupInput = z.infer<typeof signupSchema>;
export type SigninInput = z.infer<typeof signinSchema>;