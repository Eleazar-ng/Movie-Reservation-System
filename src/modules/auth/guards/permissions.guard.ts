import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionKey, UserRole } from 'generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

/**
 * Runs after JwtAuthGuard. Applied per-route via
 * `@UseGuards(PermissionsGuard)` alongside `@RequirePermission(...)`.
 *
 * Deliberately queries AdminPermission live on every request rather than
 * trusting anything embedded in the access token — granting or revoking a
 * specific admin's permission this way takes effect on their very next
 * request, the same principle JwtStrategy applies to suspension.
 *
 * Two implementation calls made here, worth flagging explicitly for
 * review rather than burying silently:
 *   1. SUPER_ADMIN bypasses every permission check unconditionally — a
 *      super_admin composes what other admins can do and isn't expected
 *      to hold individual grants themselves.
 *   2. When a route declares more than one required permission, ALL of
 *      them must be held (AND), not just one (OR). Most routes will only
 *      ever declare a single permission, so this rarely matters in
 *      practice, but it's a real behavioral choice for the routes that do.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return false;
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    const grants = await this.prisma.adminPermission.findMany({
      where: { userId: user.id, permission: { in: requiredPermissions } },
      select: { permission: true },
    });

    const grantedSet = new Set(grants.map((g: { permission: PermissionKey }) => g.permission));
    return requiredPermissions.every((permission) => grantedSet.has(permission));
  }
}

