import { UserRole } from "generated/prisma/enums";

/** Shape encoded into the signed access token. Kept deliberately minimal —
 * anything beyond identity (permissions, suspension status) is looked up
 * fresh from the database on every request rather than trusted from the
 * token, so that a suspension or permission change takes effect
 * immediately instead of waiting for the token to expire. See
 * JwtStrategy.validate() and PermissionsGuard for where that lookup goes. */
export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  role: UserRole;
}

/** What JwtStrategy.validate() attaches to `request.user` after a fresh
 * DB lookup. This is what @CurrentUser() and the guards below read. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}
