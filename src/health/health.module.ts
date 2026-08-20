import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { PrismaHealthIndicator } from './prisma.health';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController, MetricsController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
