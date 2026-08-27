import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HttpHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { ConfigService } from '@nestjs/config';
import { Public } from 'src/modules/auth/decorators/public.decorator';

/**
 * Excluded from the public OpenAPI contract (deliverable #2) since these
 * are operational endpoints, not part of the customer/admin-facing API
 * surface. They're documented separately in README "Health & Telemetry".
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly http: HttpHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  // Liveness: "is the process up at all". No dependency checks — used by
  // an orchestrator to decide whether to restart the container.
  @Public()
  @Get('live')
  live(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Readiness: "can this instance actually serve traffic right now".
  // Checks the database and heap usage; used to gate load-balancer routing.
  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }

  // Full health report (DB + storage reachability + memory) — useful for
  // a status page or manual debugging, not wired to orchestrator probes.
  @Public()
  @Get()
  @HealthCheck()
  check() {
    const storageEndpoint = this.config.get<string>('storage.endpoint')!;
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.http.pingCheck('object_storage', `${storageEndpoint}/minio/health/live`),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}
