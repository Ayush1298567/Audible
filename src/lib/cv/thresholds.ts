/**
 * Football-safe CV surfacing thresholds by task.
 *
 * Higher-risk labels (coverage shell, pressure/disguise) require tighter
 * confidence because a bad tag can distort a coach's game-plan decision.
 */

export const CV_CONFIDENCE_THRESHOLDS = {
  coverage_shell: 0.92,
  pressure: 0.9,
  coverage_disguise: 0.94,
  alignment_depth: 0.86,
  blocking_scheme: 0.88,
  route_concept: 0.88,
  run_gap: 0.87,
  player_positions: 0.85,
} as const;

export function getCvThreshold(taskName: string): number {
  return CV_CONFIDENCE_THRESHOLDS[
    taskName as keyof typeof CV_CONFIDENCE_THRESHOLDS
  ] ?? 0.9;
}

export const DUAL_MODEL_REQUIRED_TASKS = new Set<string>([
  'coverage_shell',
  'pressure',
  'coverage_disguise',
]);

export function requiresDualModelAgreement(taskName: string): boolean {
  return DUAL_MODEL_REQUIRED_TASKS.has(taskName);
}
