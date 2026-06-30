/** F-9 observability health check contracts — consumed by HealthController + its tests. */

export interface LivenessResponse {
  status: 'ok';
}

export type CheckState = 'up' | 'down';

export interface ReadinessResponse {
  status: 'ok' | 'error';
  checks: { db: CheckState; redis: CheckState };
}
