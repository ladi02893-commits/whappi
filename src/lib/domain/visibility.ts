export function isMessageVisibleAfterClear(
  messageCreatedAt: string | Date,
  clearedAt: string | Date | null,
): boolean {
  if (!clearedAt) return true
  return new Date(messageCreatedAt).getTime() > new Date(clearedAt).getTime()
}
