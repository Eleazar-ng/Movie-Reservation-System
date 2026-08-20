import { z } from 'zod';

/**
 * Every env var the app depends on, validated once at boot. If something
 * required is missing or malformed, the app fails fast with a clear error
 * instead of surfacing a confusing runtime failure three requests later.
 *
 * Stripe and Google OAuth vars are optional at this stage (Stages 2 and 7
 * aren't built yet) but already typed here so the schema doesn't need
 * revisiting later — just flip `optional()` to required when those stages
 * land and you want boot-time enforcement.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api/v1'),

  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET should be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.url().optional(),

  STORAGE_ENDPOINT: z.url(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY_ID: z.string(),
  STORAGE_SECRET_ACCESS_KEY: z.string(),
  STORAGE_BUCKET: z.string(),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
