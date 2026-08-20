import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from '../scripts/openapi-document';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api/v1';

  // The version is already encoded in apiPrefix ("api/v1"), so we don't
  // also use Nest's URI versioning — that would produce /api/v1/v1/....
  // /health and /metrics stay unversioned/unprefixed: they're operational
  // endpoints for orchestrators and scrapers, not part of the public API.
  app.setGlobalPrefix(apiPrefix, { exclude: ['health', 'health/(.*)', 'metrics'] });

  // cleanupOpenApiDoc post-processes the Swagger-generated document so Zod
  // DTO schemas (created via createZodDto) render correctly — this is
  // nestjs-zod v5's replacement for the old patchNestJsSwagger() call.
  const document = cleanupOpenApiDoc(buildOpenApiDocument(app, new DocumentBuilder(), SwaggerModule));
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
  Logger.log(`Swagger docs at http://localhost:${port}/${apiPrefix}/docs`, 'Bootstrap');
  Logger.log(`Health checks at http://localhost:${port}/health`, 'Bootstrap');
  Logger.log(`Metrics at http://localhost:${port}/metrics`, 'Bootstrap');
}

bootstrap();
