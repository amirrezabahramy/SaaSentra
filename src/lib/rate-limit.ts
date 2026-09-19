import { db } from '#/db'

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export function tooManyRequestsResponse(windowMs: number): Response {
  return Response.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) },
    },
  )
}

export async function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): Promise<boolean> {
  const now = new Date()
  const resetAt = new Date(now.getTime() + options.windowMs)
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE
    SET "count" = CASE
      WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
      ELSE "RateLimitBucket"."count" + 1
    END,
    "resetAt" = CASE
      WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
      ELSE "RateLimitBucket"."resetAt"
    END,
    "updatedAt" = ${now}
    RETURNING "count"
  `
  return (rows[0]?.count ?? options.limit + 1) <= options.limit
}

export async function clearRateLimitsForTests(): Promise<void> {
  await db.rateLimitBucket.deleteMany()
}
