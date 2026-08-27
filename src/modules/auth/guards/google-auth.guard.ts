import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Used only on GET /auth/google (kicks off the redirect to Google) and
 * GET /auth/google/callback (handles the redirect back). Both are @Public()
 * — there's no access token yet at this point in the flow. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
