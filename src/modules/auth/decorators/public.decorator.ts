import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as not requiring authentication.
 * Needed because JwtAuthGuard is registered globally (see app.module.ts)
 * — secure-by-default, opt out explicitly rather than opt in per route.
 * Used on things like /auth/login, /auth/register, /auth/google*.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
