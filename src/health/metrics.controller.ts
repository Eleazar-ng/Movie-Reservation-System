import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import * as client from 'prom-client';

/**
 * Baseline process/runtime telemetry (CPU, memory, event loop lag, GC) via
 * prom-client's default metrics collector. Custom business metrics
 * (reservations created, holds expired, payment failures, etc.) get added
 * as counters/histograms alongside the modules that produce them in later
 * stages — this just establishes the /metrics endpoint and scrape format.
 */
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', client.register.contentType)
  async getMetrics(): Promise<string> {
    return registry.metrics();
  }
}

export const metricsRegistry = registry;
