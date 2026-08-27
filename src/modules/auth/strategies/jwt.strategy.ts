import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService  } from 'src/prisma/prisma.service';
import { AccessTokenPayload, AuthenticatedUser } from '../types/jwt-payload.interface';

/**
 * Runs on every request to a route guarded by JwtAuthGuard. Passport
 * verifies the token's signature and expiry itself (via the options passed
 * to `super()`) before `validate()` is even called — by the time you're in
 * here, you know the token is authentic and unexpired. What's still your
 * call: what to do with that identity.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret')!,
    });
  }

  /**
   * Looks the user up fresh on every request rather than trusting the
   * token's embedded role — a suspension or role change this way takes
   * effect on the very next request instead of waiting for the access
   * token to expire (mirrors the same principle from the pre-NestJS
   * version of this system).
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Account no longer exists or has been suspended');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role, // read fresh from the DB row, not the token payload
    };
  }
}
