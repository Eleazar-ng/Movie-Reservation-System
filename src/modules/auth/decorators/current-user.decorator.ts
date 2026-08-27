import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

/**
 * Usage: `findMine(@CurrentUser() user: AuthenticatedUser)`.
 * Reads `request.user`, populated by JwtStrategy.validate() via
 * JwtAuthGuard. Only valid on routes actually behind that guard — on a
 * @Public() route, `request.user` won't exist.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
