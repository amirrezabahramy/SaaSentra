import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number)
    return (
      first === 10 ||
      first === 127 ||
      first === 0 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    )
  }

  const normalized = address.toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  )
}

function allowsLocalDevelopmentUrl(url: URL): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || isPrivateAddress(url.hostname))
  )
}

/** Reject endpoints that could turn payment delivery into an SSRF primitive. */
export async function parseExternalUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('A valid HTTPS URL is required')
  }

  if (url.username || url.password || url.hash) {
    throw new Error('Callback URLs cannot contain credentials or fragments')
  }
  if (url.protocol !== 'https:' && !allowsLocalDevelopmentUrl(url)) {
    throw new Error('Callback URLs must use HTTPS')
  }
  if (allowsLocalDevelopmentUrl(url)) return url

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Callback URL host is not allowed')
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Callback URL host is not allowed')
    }
    return url
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true })
    if (
      records.length === 0 ||
      records.some((record) => isPrivateAddress(record.address))
    ) {
      throw new Error('Callback URL host is not allowed')
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Callback URL host is not allowed'
    ) {
      throw error
    }
    throw new Error('Callback URL host could not be resolved')
  }

  return url
}

export async function assertMatchingExternalOrigin(
  returnUrl: string,
  callbackUrl: string,
): Promise<URL> {
  const [safeReturnUrl, safeCallbackUrl] = await Promise.all([
    parseExternalUrl(returnUrl),
    parseExternalUrl(callbackUrl),
  ])
  if (safeReturnUrl.origin !== safeCallbackUrl.origin) {
    throw new Error('Return URL must use the configured service origin')
  }
  return safeReturnUrl
}
