import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    // No QueueService injected in unit tests (optional)
    metrics = new MetricsService();
  });

  afterEach(async () => {
    // Clear the registry to avoid metric name conflicts between test runs
    metrics.clearForTest();
  });

  it('expose() returns Prometheus text format', async () => {
    const text = await metrics.expose();
    expect(typeof text).toBe('string');
    expect(text).toContain('http_requests_total');
  });

  it('recordHttp increments http_requests_total', async () => {
    metrics.recordHttp('GET', '/api/test', 200, 0.05);
    const text = await metrics.expose();
    expect(text).toMatch(/http_requests_total{[^}]*method="GET"[^}]*} 1/);
  });

  it('recordHttp observes http_request_duration_seconds', async () => {
    metrics.recordHttp('POST', '/api/signup', 201, 0.1);
    const text = await metrics.expose();
    expect(text).toContain('http_request_duration_seconds');
  });

  it('incSignup increments signups_total', async () => {
    metrics.incSignup();
    metrics.incSignup();
    const text = await metrics.expose();
    expect(text).toMatch(/signups_total \d/);
  });

  it('setDbUp/setRedisUp reflect in db_up and redis_up gauges', async () => {
    metrics.setDbUp(true);
    metrics.setRedisUp(false);
    const text = await metrics.expose();
    expect(text).toMatch(/db_up 1/);
    expect(text).toMatch(/redis_up 0/);
  });

  it('incJobCompleted increments jobs_completed_total', async () => {
    metrics.incJobCompleted('notifications-fanout');
    const text = await metrics.expose();
    expect(text).toMatch(/jobs_completed_total{[^}]*queue="notifications-fanout"[^}]*} 1/);
  });

  it('incJobFailed increments jobs_failed_total', async () => {
    metrics.incJobFailed('notifications-fanout');
    const text = await metrics.expose();
    expect(text).toMatch(/jobs_failed_total{[^}]*queue="notifications-fanout"[^}]*} 1/);
  });

  it('incDeadLetter increments jobs_dead_letter_total', async () => {
    metrics.incDeadLetter('notifications-fanout');
    const text = await metrics.expose();
    expect(text).toMatch(/jobs_dead_letter_total{[^}]*queue="notifications-fanout"[^}]*} 1/);
  });
});
