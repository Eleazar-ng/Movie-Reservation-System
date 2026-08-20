import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from './openapi-document';

/**
 * `npm run openapi:generate` — produces deliverable #2 (OpenAPI 3.0 JSON
 * contract) as a static file, independent of a running server. Safe to run
 * in CI to catch contract drift (diff the output against a committed copy)
 * once the API surface stabilizes.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  const document = cleanupOpenApiDoc(buildOpenApiDocument(app, new DocumentBuilder(), SwaggerModule));

  const outDir = join(__dirname, '..', 'openapi');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));

  // eslint-disable-next-line no-console
  console.log(`OpenAPI contract written to ${outPath}`);
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate OpenAPI document:', err);
  process.exit(1);
});
