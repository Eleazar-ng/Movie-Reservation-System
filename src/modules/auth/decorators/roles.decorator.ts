import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'generated/prisma/enums';

export const ROLES_KEY = 'roles';

/** Coarse-grained gate: which UserRole(s) may access this route. Pair with
 * RolesGuard. For finer-grained admin capabilities, use @RequirePermission
 * instead — role answers "customer or staff", permission answers "which
 * specific admin capability". */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
