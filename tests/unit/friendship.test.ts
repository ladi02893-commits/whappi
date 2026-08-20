import {
  canonicalFriendshipPair,
  transitionFriendRequest,
} from '@/lib/domain/friendship'

describe('canonical friendships', () => {
  it('always returns the same ordered pair', () => {
    expect(canonicalFriendshipPair('b', 'a')).toEqual(['a', 'b'])
    expect(canonicalFriendshipPair('a', 'b')).toEqual(['a', 'b'])
  })
  it('rejects self friendship', () =>
    expect(() => canonicalFriendshipPair('a', 'a')).toThrow())
})

describe('friend request transitions', () => {
  it.each([
    ['accept', 'accepted'],
    ['reject', 'rejected'],
    ['cancel', 'cancelled'],
  ] as const)('transitions pending via %s', (action, result) =>
    expect(transitionFriendRequest('pending', action)).toBe(result),
  )
  it('does not transition terminal states', () =>
    expect(() => transitionFriendRequest('accepted', 'cancel')).toThrow())
})
