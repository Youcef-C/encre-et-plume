import { Injectable, Optional } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { QueueService } from '../queue/queue.service';
import { QUEUE_NAMES, DEAD_LETTER_QUEUE } from '@encre-et-plume/shared';

/**
 * F-9 metrics registry over prom-client.
 * Per-instance Registry so tests never pollute each other or the global default register.
 * ponytail: queue_depth refreshed in expose() (async scrape-time pull) rather than prom-client's
 * sync collect() callback — avoids async-in-sync complexity with no runtime cost difference.
 */
@Injectable()
export class MetricsService {
  readonly register = new Registry();

  private readonly httpRequestsTotal: Counter;
  private readonly httpRequestDuration: Histogram;
  private readonly jobsCompleted: Counter;
  private readonly jobsFailed: Counter;
  private readonly jobsDeadLetter: Counter;
  private readonly jobDuration: Histogram;
  private readonly queueDepthGauge: Gauge;
  private readonly dbUp: Gauge;
  private readonly redisUp: Gauge;
  private readonly signupsTotal: Counter;
  readonly paymentsTotal: Counter; // declared; MR wires status='succeeded'|'failed'

  constructor(@Optional() private readonly queueService?: QueueService) {
    collectDefaultMetrics({ register: this.register });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests by method, route, and status',
      labelNames: ['method', 'route', 'status'],
      registers: [this.register],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.register],
    });

    this.jobsCompleted = new Counter({
      name: 'jobs_completed_total',
      help: 'Total completed jobs by queue',
      labelNames: ['queue'],
      registers: [this.register],
    });

    this.jobsFailed = new Counter({
      name: 'jobs_failed_total',
      help: 'Total failed job attempts by queue',
      labelNames: ['queue'],
      registers: [this.register],
    });

    this.jobsDeadLetter = new Counter({
      name: 'jobs_dead_letter_total',
      help: 'Total jobs moved to dead-letter queue',
      labelNames: ['queue'],
      registers: [this.register],
    });

    this.jobDuration = new Histogram({
      name: 'job_duration_seconds',
      help: 'Job processing duration in seconds',
      labelNames: ['queue'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
      registers: [this.register],
    });

    this.queueDepthGauge = new Gauge({
      name: 'queue_depth',
      help: 'Queue job count by queue name and state',
      labelNames: ['queue', 'state'],
      registers: [this.register],
    });

    this.dbUp = new Gauge({
      name: 'db_up',
      help: 'Database reachability (1=up, 0=down)',
      registers: [this.register],
    });

    this.redisUp = new Gauge({
      name: 'redis_up',
      help: 'Redis reachability (1=up, 0=down)',
      registers: [this.register],
    });

    this.signupsTotal = new Counter({
      name: 'signups_total',
      help: 'Total successful user signups',
      registers: [this.register],
    });

    // ponytail: declared but not incremented until MR wires it; label/seam only
    this.paymentsTotal = new Counter({
      name: 'payments_total',
      help: 'Total payments by status (MR-owned)',
      labelNames: ['status'],
      registers: [this.register],
    });
  }

  recordHttp(method: string, route: string, status: number, durationS: number): void {
    const labels = { method, route, status: String(status) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationS);
  }

  incJobCompleted(queue: string): void {
    this.jobsCompleted.inc({ queue });
  }

  incJobFailed(queue: string): void {
    this.jobsFailed.inc({ queue });
  }

  incDeadLetter(queue: string): void {
    this.jobsDeadLetter.inc({ queue });
  }

  observeJobDuration(queue: string, durationS: number): void {
    this.jobDuration.observe({ queue }, durationS);
  }

  incSignup(): void {
    this.signupsTotal.inc();
  }

  incPayment(status: string): void {
    this.paymentsTotal.inc({ status });
  }

  setDbUp(up: boolean): void {
    this.dbUp.set(up ? 1 : 0);
  }

  setRedisUp(up: boolean): void {
    this.redisUp.set(up ? 1 : 0);
  }

  async expose(): Promise<string> {
    // Refresh queue depth at scrape time (async pull, no background polling)
    if (this.queueService) {
      const names = [...QUEUE_NAMES, DEAD_LETTER_QUEUE] as string[];
      await Promise.allSettled(
        names.map(async (name) => {
          const counts = await this.queueService!.getCounts(name as Parameters<typeof this.queueService.getCounts>[0]).catch(() => null);
          if (!counts) return;
          for (const [state, count] of Object.entries(counts)) {
            this.queueDepthGauge.set({ queue: name, state }, (count as number) ?? 0);
          }
        }),
      );
    }
    return this.register.metrics();
  }

  /** Test helper — clears the registry to prevent duplicate metric name errors across test runs. */
  clearForTest(): void {
    this.register.clear();
  }
}
