import { Controller, Post, Get, Body, UseGuards, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import type { AuthenticatedUser } from './types/jwt-payload.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @ApiBearerAuth('access-token')
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  // Kicks off the redirect to Google's consent screen. GoogleAuthGuard
  // does all the work here — this handler body never actually runs.
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // intentionally empty — see comment above
  }

  // Google redirects back here after the user approves/denies. By this
  // point GoogleAuthGuard has already run GoogleStrategy.validate() (via
  // AuthService.loginWithGoogle) and populated `request.user` with the
  // resolved identity — @CurrentUser() reads the same way it does on any
  // other route, since Nest's AuthGuard attaches the strategy's result to
  // `request.user` regardless of which strategy produced it.
  //
  // Returning JSON directly here (rather than redirecting to a frontend)
  // is deliberate for now: there's no frontend consumer yet, and this
  // keeps the response shape identical to register()/login(). Worth
  // revisiting once a real frontend exists — tokens in a redirect URL
  // leak into browser history/server logs, so the better pattern at that
  // point is a short-lived one-time code exchanged in a second request,
  // not the tokens themselves.
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.issueSessionFor(user);
  }

  @ApiBearerAuth('access-token')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
