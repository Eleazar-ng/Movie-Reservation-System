import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { appConfig, authConfig, storageConfig, stripeConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfig, authConfig, storageConfig, stripeConfig],
    }),
    PrismaModule,
    StorageModule,
    HealthModule,
    AuthModule
    // Domain modules (auth, movies, theaters, showtimes, reservations,
    // payments, admin) get registered here stage by stage — intentionally
    // absent until their stage lands.
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Every Zod DTO (createZodDto) in the app gets validated automatically —
    // no per-route @UsePipes needed. Failures throw ZodValidationException,
    // handled by GlobalExceptionFilter below.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Secure-by-default: every route requires a valid access token unless
    // explicitly marked @Public(). See auth/guards/jwt-auth.guard.ts.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
