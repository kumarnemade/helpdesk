import { z } from "zod";

// Also enforced by Better Auth (server/src/auth.ts) for sign-in and password changes.
export const MIN_PASSWORD_LENGTH = 12;
// Better Auth's default maximum.
export const MAX_PASSWORD_LENGTH = 128;

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(100, "Name must be at most 100 characters"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// Route params for /api/users/:id.
export const userIdParamsSchema = z.object({
  id: z.string().trim().min(1, "User id is required"),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
