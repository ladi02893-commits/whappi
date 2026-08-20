export function normalizeInsForgeBaseUrl(value: string | undefined) {
  const raw = value?.trim()
  if (!raw) throw new Error('NEXT_PUBLIC_INSFORGE_URL is required.')

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('NEXT_PUBLIC_INSFORGE_URL must be a valid URL.')
  }

  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('NEXT_PUBLIC_INSFORGE_URL must use HTTP or HTTPS.')
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(
      'NEXT_PUBLIC_INSFORGE_URL must be an origin without a path.',
    )

  return url.origin
}

export function getInsForgeConfig() {
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY?.trim()
  if (!anonKey) throw new Error('NEXT_PUBLIC_INSFORGE_ANON_KEY is required.')

  return {
    baseUrl: normalizeInsForgeBaseUrl(process.env.NEXT_PUBLIC_INSFORGE_URL),
    anonKey,
  }
}
