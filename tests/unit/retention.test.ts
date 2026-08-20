import {
  calculateAfterViewExpiry,
  calculateExpiry,
  CUSTOM_RETENTION_MAX_SECONDS,
  CUSTOM_RETENTION_MIN_SECONDS,
} from '@/lib/domain/retention'
import { customRetentionSchema } from '@/lib/validation'

describe('retention expiry calculation', () => {
  const created = new Date('2026-08-20T00:00:00.000Z')
  it.each([
    ['24_hours', '2026-08-21T00:00:00.000Z'],
    ['12_hours', '2026-08-20T12:00:00.000Z'],
    ['3_hours', '2026-08-20T03:00:00.000Z'],
  ] as const)('calculates %s from creation', (mode, expected) =>
    expect(calculateExpiry(mode, created)?.toISOString()).toBe(expected),
  )
  it('uses a custom duration', () =>
    expect(calculateExpiry('custom', created, 90)?.toISOString()).toBe(
      '2026-08-20T00:01:30.000Z',
    ))
  it.each(['never', 'instant_after_view', '5_minutes_after_view'] as const)(
    'does not set send-time expiry for %s',
    (mode) => expect(calculateExpiry(mode, created)).toBeNull(),
  )
  it('validates sensible custom bounds', () => {
    expect(
      customRetentionSchema.safeParse(CUSTOM_RETENTION_MIN_SECONDS).success,
    ).toBe(true)
    expect(
      customRetentionSchema.safeParse(CUSTOM_RETENTION_MAX_SECONDS).success,
    ).toBe(true)
    expect(customRetentionSchema.safeParse(59).success).toBe(false)
    expect(
      customRetentionSchema.safeParse(CUSTOM_RETENTION_MAX_SECONDS + 1).success,
    ).toBe(false)
  })
})

describe('after-view expiry', () => {
  const viewed = new Date('2026-08-20T10:00:00.000Z')
  it('expires instant messages at first view', () =>
    expect(
      calculateAfterViewExpiry(
        'instant_after_view',
        viewed,
        null,
      )?.toISOString(),
    ).toBe(viewed.toISOString()))
  it('expires five-minute messages five minutes after first view', () =>
    expect(
      calculateAfterViewExpiry(
        '5_minutes_after_view',
        viewed,
        null,
      )?.toISOString(),
    ).toBe('2026-08-20T10:05:00.000Z'))
  it('never resets an existing timer', () => {
    const existing = new Date('2026-08-20T10:03:00.000Z')
    expect(
      calculateAfterViewExpiry(
        '5_minutes_after_view',
        new Date('2026-08-20T11:00:00.000Z'),
        existing,
      ),
    ).toBe(existing)
  })
})
