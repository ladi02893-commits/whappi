import { isMessageVisibleAfterClear } from '@/lib/domain/visibility'

describe('clear-chat visibility cutoff', () => {
  const cutoff = '2026-08-20T12:00:00.000Z'
  it('hides messages created before or exactly at the cutoff', () => {
    expect(isMessageVisibleAfterClear('2026-08-20T11:59:59.999Z', cutoff)).toBe(
      false,
    )
    expect(isMessageVisibleAfterClear(cutoff, cutoff)).toBe(false)
  })
  it('keeps new messages and all messages without a cutoff', () => {
    expect(isMessageVisibleAfterClear('2026-08-20T12:00:00.001Z', cutoff)).toBe(
      true,
    )
    expect(isMessageVisibleAfterClear('2020-01-01T00:00:00Z', null)).toBe(true)
  })
})
