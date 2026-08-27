import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from 'generated/prisma/enums';

export const PERMISSIONS_KEY = 'permissions';

/** Fine-grained gate: which specific admin PermissionKey(s) this route
 * requires (e.g. MOVIES_MANAGE). Pair with PermissionsGuard. A super_admin
 * implicitly passes every check (see PermissionsGuard) since they compose
 * what other admins can do rather than needing grants themselves. */
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
