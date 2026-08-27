import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RefreshTokenSchema = z.object({
  // The raw opaque refresh token, as originally issued to the client —
  // see AuthService notes on why it's opaque rather than a second JWT.
  refreshToken: z.string().min(1),
});

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}
