import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password is too long. Please use a shorter password.',
  );

export const signupSchema = z
  .object({
    userName: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters long.')
      .max(50, 'Username cannot be longer than 50 characters.')
      .regex(
        /^[a-zA-Z0-9_]+$/,
        'Username may contain only letters, numbers, and underscores.',
      ),

    email: z
      .string()
      .trim()
      .email('Please enter a valid email address.')
      .max(255, 'Email address cannot be longer than 255 characters.'),

    password: passwordSchema,

    role: z.enum(['customer', 'agent']),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email('Please enter a valid email address.'),

    password: z
      .string()
      .refine(
        (password) => password.trim().length > 0,
        'Password is required.',
      ),
  })
  .strict(); // rejects properties not in the schema like defining roles

//extract the TypeScript data type from it to use it later
/*
Without z.infer, you will write

const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

type LoginInput = {
  email: string;
  password: string;
};
The schema checks real incoming data while 
your application is running. 
The inferred type helps TypeScript check your code
while you are writing it.
*/
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
