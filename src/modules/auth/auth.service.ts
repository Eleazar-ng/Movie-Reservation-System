import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { Prisma, User, OAuthProvider, UserRole } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccessTokenPayload, AuthenticatedUser } from './types/jwt-payload.interface';
import { GoogleProfile } from './strategies/google.strategy';
import { RegisterSchema } from './dto/register.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession {
  tokens: TokenPair;
  user: AuthenticatedUser;
}

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Primitives (implemented) ──────────────────────────────────────────

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  signAccessToken(payload: AccessTokenPayload): string {

    return this.jwt.sign(payload, {
      secret: this.config.get<string>('auth.jwtSecret'),
      // Config always yields a valid duration string (e.g. "15m") — cast
      // needed because @nestjs/jwt's expiresIn is a branded template-literal
      // type (via the `ms` package), not a plain `string`.
      expiresIn: this.config.get<string>('auth.jwtExpiresIn') as JwtSignOptions['expiresIn'],
    });
  }

  /** A long random opaque string — deliberately NOT a second JWT. It's
   * never decoded, only looked up by hash in the RefreshToken table, so
   * there's no benefit to it being self-describing, and an opaque token
   * is trivially revocable (delete/mark the row) in a way a stateless JWT
   * isn't without extra bookkeeping anyway. */
  generateOpaqueRefreshToken(): string {
    return randomBytes(64).toString('hex');
  }

  /** SHA-256 is intentional here, not bcrypt — this hashes a
   * high-entropy random token (not a low-entropy human password), so
   * there's nothing for bcrypt's slow, salted hashing to defend against
   * that a fast cryptographic hash doesn't already cover. Using bcrypt
   * here would just be slower for no security benefit. */
  hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  refreshTokenExpiryDate(): Date {
    const days = this.config.get<number>('auth.refreshTokenExpiresInDays') ?? 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }

  // ── Orchestration (yours) ──────────────────────────────────────────────

  async register(dto: z.infer<typeof RegisterSchema>): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);

    // role is never taken from the request body — always CUSTOMER here.
    // Staff accounts are only ever created via the Stage 3+ admin routes
    // by a super_admin, never through public self-registration.
    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        role: UserRole.CUSTOMER,
      },
    });

    const authenticatedUser = this.toAuthenticatedUser(user);
    const tokens = await this.issueTokenPair(authenticatedUser);
    return { tokens, user: authenticatedUser };
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same generic failure for "no such user", "Google-only account with
    // no password", and "wrong password" — distinguishing them would let
    // an attacker enumerate which emails have accounts.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only reveal suspension *after* the password has been proven correct
    // — at that point the caller has already demonstrated they own the
    // credentials, so this is no longer an enumeration risk.
    if (!user.isActive || user.deletedAt) {
      throw new ForbiddenException('This account has been suspended');
    }

    const authenticatedUser = this.toAuthenticatedUser(user);
    const tokens = await this.issueTokenPair(authenticatedUser);
    return { tokens, user: authenticatedUser };
  }

  /**
   * Called from GoogleStrategy.validate(). Implements the account-linking
   * policy: auto-link by email, but only when Google's own token asserts
   * the email is verified — never merge into an existing account on an
   * unverified claim.
   */
  async loginWithGoogle(profile: GoogleProfile): Promise<AuthenticatedUser> {
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (existingLink) {
      const { user } = existingLink;
      if (!user.isActive || user.deletedAt) {
        throw new ForbiddenException('This account has been suspended');
      }
      return this.toAuthenticatedUser(user);
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: profile.email } });

    if (existingUser) {
      if (!profile.emailVerified) {
        throw new ForbiddenException(
          'An account with this email already exists. Please log in with your password, ' +
            'or use a Google account with a verified email.',
        );
      }
      if (!existingUser.isActive || existingUser.deletedAt) {
        throw new ForbiddenException('This account has been suspended');
      }

      await this.prisma.oAuthAccount.create({
        data: {
          userId: existingUser.id,
          provider: OAuthProvider.GOOGLE,
          providerAccountId: profile.providerAccountId,
        },
      });

      return this.toAuthenticatedUser(existingUser);
    }

    // New identity entirely — create the User (no password) and the
    // OAuthAccount link together, atomically.
    const newUser = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.user.create({
        data: {
          firstName: profile.firstName || 'Google',
          lastName: profile.lastName || 'User',
          email: profile.email,
          passwordHash: null,
          role: UserRole.CUSTOMER,
        },
      });
      await tx.oAuthAccount.create({
        data: {
          userId: created.id,
          provider: OAuthProvider.GOOGLE,
          providerAccountId: profile.providerAccountId,
        },
      });
      return created;
    });

    return this.toAuthenticatedUser(newUser);
  }

    /** Issues a session for a user identity Passport has already resolved
   * (the Google OAuth callback route) — same token-issuance path as
   * register()/login(), just without a password check in front of it. */
  async issueSessionFor(user: AuthenticatedUser): Promise<AuthSession> {
    const tokens = await this.issueTokenPair(user);
    return { tokens, user };
  }

  /**
   * Refresh-token rotation with reuse detection. Each successful refresh
   * consumes the presented token and issues a brand new one; if a token
   * that was already rotated gets presented again, that's a signal the
   * token was stolen and both the thief and the legitimate holder now
   * have divergent copies — so every refresh token for that user gets
   * revoked, forcing a full re-login rather than trusting either copy.
   */
  async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.replacedById) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected — all sessions have been revoked');
    }

    const { user } = stored;
    if (!user.isActive || user.deletedAt) {
      throw new ForbiddenException('This account has been suspended');
    }

    const newRawRefreshToken = this.generateOpaqueRefreshToken();
    const newTokenHash = this.hashRefreshToken(newRawRefreshToken);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt: this.refreshTokenExpiryDate(),
        },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
    });

    const accessToken = this.signAccessToken({ sub: user.id, email: user.email, role: user.role });
    return { accessToken, refreshToken: newRawRefreshToken };
  }

  /** Marks the presented refresh token revoked. Deliberately a no-op
   * (not an error) for an already-revoked/unknown token, so a duplicate
   * logout call isn't a client-visible failure. The row is kept (not
   * deleted) so refreshTokens() can still detect reuse-after-logout. */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt) {
      return;
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(user: AuthenticatedUser): Promise<TokenPair> {
    const accessToken = this.signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const rawRefreshToken = this.generateOpaqueRefreshToken();
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: this.refreshTokenExpiryDate(),
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
