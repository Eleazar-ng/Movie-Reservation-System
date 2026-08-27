import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const passwordSchema = z.string()
.min(8, 'Password must be at least 8 characters')
.regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,'Password must contain at least one uppercase letter, one lowercase letter, and one number');

export const RegisterSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.email(),
  // TODO (yours): decide the actual password policy (min length is a
  // placeholder). Whatever you land on, it needs to match what
  // AuthService.register() enforces when hashing — keep them in sync.
  password: passwordSchema
});

export class RegisterDto extends createZodDto(RegisterSchema) {}
