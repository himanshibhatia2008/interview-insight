export const DAILY_AI_LIMIT = 40;

export function isDailyLimitReached(usageCount: number): boolean {
  return usageCount > DAILY_AI_LIMIT;
}