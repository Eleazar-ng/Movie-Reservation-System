import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, StrategyOptions, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

/** Everything we actually need out of Google's profile response, extracted
 * once here so the rest of the app doesn't depend on passport's shape. */
export interface GoogleProfile {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    const options: StrategyOptions = {
      clientID: config.get<string>('auth.google.clientId')!,
      clientSecret: config.get<string>('auth.google.clientSecret')!,
      callbackURL: config.get<string>('auth.google.callbackUrl')!,
      scope: ['email', 'profile'],
    };
    super(options);
  }

 /**
   * Passport calls this after Google redirects back with a successful
   * login. `profile` is Google's raw response; the account-linking policy
   * itself lives in AuthService.loginWithGoogle() — this method's job is
   * just to extract the fields we need and hand off to it.
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google profile did not include an email address'), undefined);
      return;
    }

    const googleProfile: GoogleProfile = {
      providerAccountId: profile.id,
      email,
      emailVerified: (profile.emails?.[0] as { verified?: boolean } | undefined)?.verified ?? false,
      firstName: profile.name?.givenName ?? '',
      lastName: profile.name?.familyName ?? '',
    };

    try {
      const user = await this.authService.loginWithGoogle(googleProfile);
      done(null, user);
    } catch (err) {
      done(err instanceof Error ? err : new Error('Google login failed'), undefined);
    }
  }
}

