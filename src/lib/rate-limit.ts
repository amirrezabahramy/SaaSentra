type RateLimitEntry = {
  count: number
  resetAt: number
}

const entries = new Map<string, RateLimitEntry>()

export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): boolean {
  const now = Date.now()
  const entry = entries.get(key)
  if (!entry || entry.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + options.windowMs })
    return true
  }
  if (entry.count >= options.limit) return false
  entry.count += 1
  return true
}

export function clearRateLimitsForTests(): void {
  entries.clear()
}
