import type { RetentionMode } from '@/types/database'

export const CUSTOM_RETENTION_MIN_SECONDS = 60
export const CUSTOM_RETENTION_MAX_SECONDS = 31_536_000

export function calculateExpiry(
  mode: RetentionMode,
  createdAt: Date,
  customSeconds: number | null = null,
): Date | null {
  const seconds: Partial<Record<RetentionMode, number>> = {
    '24_hours': 86_400,
    '12_hours': 43_200,
    '3_hours': 10_800,
  }
  const amount = mode === 'custom' ? customSeconds : seconds[mode]
  if (
    mode === 'never' ||
    mode === 'instant_after_view' ||
    mode === '5_minutes_after_view'
  )
    return null
  if (
    !amount ||
    amount < CUSTOM_RETENTION_MIN_SECONDS ||
    amount > CUSTOM_RETENTION_MAX_SECONDS
  ) {
    throw new RangeError('Invalid retention duration')
  }
  return new Date(createdAt.getTime() + amount * 1000)
}

export function calculateAfterViewExpiry(
  mode: RetentionMode,
  viewedAt: Date,
  current: Date | null,
): Date | null {
  if (current) return current
  if (mode === 'instant_after_view') return new Date(viewedAt)
  if (mode === '5_minutes_after_view')
    return new Date(viewedAt.getTime() + 300_000)
  return null
}

export const retentionLabels: Record<RetentionMode, string> = {
  '24_hours': '24 hours',
  '12_hours': '12 hours',
  '3_hours': '3 hours',
  instant_after_view: 'Immediately after view',
  '5_minutes_after_view': '5 minutes after view',
  never: 'Never',
  custom: 'Custom',
}
