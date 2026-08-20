export function canonicalFriendshipPair(
  userA: string,
  userB: string,
): readonly [string, string] {
  if (userA === userB)
    throw new Error('A friendship requires two different users')
  return userA.localeCompare(userB) < 0 ? [userA, userB] : [userB, userA]
}

export type RequestAction = 'accept' | 'reject' | 'cancel'
export type RequestState = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export function transitionFriendRequest(
  current: RequestState,
  action: RequestAction,
): RequestState {
  if (current !== 'pending')
    throw new Error('Only pending requests can transition')
  if (action === 'accept') return 'accepted'
  if (action === 'reject') return 'rejected'
  return 'cancelled'
}
