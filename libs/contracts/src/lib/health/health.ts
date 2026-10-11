export type DependencyState = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  services: Record<'catalog' | 'auth' | 'library' | 'creator', DependencyState>;
}
