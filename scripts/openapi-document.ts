import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Single source of truth for the OpenAPI document metadata, used both by
 * the live /api/v1/docs UI and by `npm run openapi:generate` (which writes
 * openapi/openapi.json — deliverable #2). Keeping this in one place means
 * the exported contract can never drift from what's actually mounted.
 */
export function buildOpenApiDocument(
  app: INestApplication,
  builder: DocumentBuilder,
  swagger: typeof SwaggerModule,
): OpenAPIObject {
  const config = builder
    .setTitle('Movie Reservation System API')
    .setDescription(
      'Browse movies and showtimes, reserve seats, manage reservations, and administer the catalog. ' +
        'Authenticated endpoints use a Bearer JWT (obtained via /auth/login, /auth/register, or Google OAuth).',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('auth', 'Signup, login, and OAuth')
    .addTag('movies', 'Browsing and catalog management')
    .addTag('theaters', 'Theaters and screens')
    .addTag('showtimes', 'Scheduling and seat availability')
    .addTag('reservations', 'Seat holds, confirmation, and cancellation')
    .addTag('admin', 'Staff-only management and reporting')
    .build();

  return swagger.createDocument(app, config);
}
