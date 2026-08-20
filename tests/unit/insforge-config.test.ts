import { describe, expect, it } from 'vitest'
import { normalizeInsForgeBaseUrl } from '@/lib/insforge/config'

describe('InsForge configuration', () => {
  it('normalizes a trailing slash so SDK routes contain one separator', () => {
    expect(normalizeInsForgeBaseUrl('https://example.insforge.app/')).toBe(
      'https://example.insforge.app',
    )
  })

  it('rejects missing, non-HTTP, and path-based backend URLs', () => {
    expect(() => normalizeInsForgeBaseUrl(undefined)).toThrow()
    expect(() => normalizeInsForgeBaseUrl('ftp://example.com')).toThrow()
    expect(() =>
      normalizeInsForgeBaseUrl('https://example.com/backend'),
    ).toThrow()
  })
})
