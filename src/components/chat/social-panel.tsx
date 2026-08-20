'use client'

import {
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Search,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  cancelFriendRequest,
  removeFriend,
  respondToFriendRequest,
  searchProfiles,
  sendFriendRequest,
  startConversation,
} from '@/lib/chat-api'
import type {
  Conversation,
  FriendRequest,
  Friendship,
  Profile,
} from '@/types/database'

export type SocialView = 'discover' | 'incoming' | 'sent' | 'friends'

type Props = {
  view: SocialView
  currentUserId: string
  profiles: Profile[]
  requests: FriendRequest[]
  friendships: Friendship[]
  onChanged: () => Promise<void>
  onConversation: (conversation: Conversation) => void
}

export function SocialPanel({
  view,
  currentUserId,
  profiles,
  requests,
  friendships,
  onChanged,
  onConversation,
}: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [discover, setDiscover] = useState<Profile[]>([])
  const [loading, setLoading] = useState(view === 'discover')
  const [busy, setBusy] = useState<string | null>(null)
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  )

  useEffect(() => {
    if (view !== 'discover') return
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const result = await searchProfiles(query, page)
        if (active)
          setDiscover(result.filter((profile) => profile.id !== currentUserId))
      } catch (error) {
        if (active)
          toast.error(
            error instanceof Error ? error.message : 'Could not search people',
          )
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [currentUserId, page, query, view])

  useEffect(() => setPage(0), [query, view])

  const run = async (
    id: string,
    action: () => Promise<void>,
    success: string,
  ) => {
    setBusy(id)
    try {
      await action()
      await onChanged()
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const statusFor = (userId: string) => {
    const friendship = friendships.find(
      (item) => item.user_low_id === userId || item.user_high_id === userId,
    )
    if (friendship) return { kind: 'friend' as const, item: friendship }
    const request = requests.find(
      (item) =>
        item.status === 'pending' &&
        (item.sender_id === userId || item.receiver_id === userId),
    )
    if (!request) return { kind: 'none' as const }
    return request.receiver_id === currentUserId
      ? { kind: 'incoming' as const, item: request }
      : { kind: 'sent' as const, item: request }
  }

  let rows: Array<{ profile: Profile; request?: FriendRequest }> = []
  if (view === 'discover') rows = discover.map((profile) => ({ profile }))
  if (view === 'incoming')
    rows = requests
      .filter(
        (request) =>
          request.status === 'pending' && request.receiver_id === currentUserId,
      )
      .map((request) => ({
        profile: profileById.get(request.sender_id),
        request,
      }))
      .filter((row): row is { profile: Profile; request: FriendRequest } =>
        Boolean(row.profile),
      )
  if (view === 'sent')
    rows = requests
      .filter(
        (request) =>
          request.status === 'pending' && request.sender_id === currentUserId,
      )
      .map((request) => ({
        profile: profileById.get(request.receiver_id),
        request,
      }))
      .filter((row): row is { profile: Profile; request: FriendRequest } =>
        Boolean(row.profile),
      )
  if (view === 'friends')
    rows = friendships
      .map((friendship) => ({
        profile: profileById.get(
          friendship.user_low_id === currentUserId
            ? friendship.user_high_id
            : friendship.user_low_id,
        ),
      }))
      .filter((row): row is { profile: Profile } => Boolean(row.profile))

  const titles: Record<SocialView, [string, string]> = {
    discover: ['Discover', 'Find someone by name or username.'],
    incoming: ['Requests', 'People who would like to connect.'],
    sent: ['Sent requests', 'Pending invitations you can cancel.'],
    friends: ['Friends', 'Only friends can open a conversation.'],
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="social-title"
    >
      <div className="border-b border-border px-4 pb-4 pt-5">
        <h2
          id="social-title"
          className="text-xl font-[var(--font-display)] font-extrabold"
        >
          {titles[view][0]}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{titles[view][1]}</p>
        {view === 'discover' && (
          <div className="relative mt-4">
            <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="Search people"
              aria-label="Search people"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="mb-2 flex items-center gap-3 rounded-2xl p-3"
              >
                <Skeleton className="size-11" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </div>
                <Skeleton className="h-10 w-24" />
              </div>
            ))
          : null}
        {!loading && rows.length === 0 && (
          <div className="grid min-h-64 place-items-center px-6 text-center">
            <div>
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted">
                <UserPlus className="size-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 font-bold">Nothing here yet</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {view === 'discover'
                  ? 'Try another search, or invite friends after they join WHAPPI.'
                  : 'This list will update in real time.'}
              </p>
            </div>
          </div>
        )}
        {!loading &&
          rows.map(({ profile, request }) => {
            const status = statusFor(profile.id)
            return (
              <article
                key={profile.id}
                className="mb-1 flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-muted/70"
              >
                <Avatar name={profile.display_name} src={profile.avatar_url} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold">
                    {profile.display_name}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    @{profile.username}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {view === 'discover' && status.kind === 'none' && (
                    <Button
                      size="sm"
                      onClick={() =>
                        run(
                          profile.id,
                          () => sendFriendRequest(profile.id),
                          'Friend request sent',
                        )
                      }
                      disabled={busy === profile.id}
                    >
                      <UserPlus className="size-4" /> Add
                    </Button>
                  )}
                  {view === 'discover' && status.kind === 'sent' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          profile.id,
                          () => cancelFriendRequest(status.item.id),
                          'Request cancelled',
                        )
                      }
                      disabled={busy === profile.id}
                    >
                      <X className="size-4" /> Cancel
                    </Button>
                  )}
                  {view === 'discover' && status.kind === 'incoming' && (
                    <Button
                      size="sm"
                      onClick={() =>
                        run(
                          profile.id,
                          () =>
                            respondToFriendRequest(status.item.id, 'accepted'),
                          'You are now friends',
                        )
                      }
                      disabled={busy === profile.id}
                    >
                      <Check className="size-4" /> Accept
                    </Button>
                  )}
                  {view === 'discover' && status.kind === 'friend' && (
                    <Badge>Friends</Badge>
                  )}
                  {view === 'incoming' && request && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Reject ${profile.display_name}`}
                        onClick={() =>
                          run(
                            profile.id,
                            () =>
                              respondToFriendRequest(request.id, 'rejected'),
                            'Request rejected',
                          )
                        }
                      >
                        <X className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          run(
                            profile.id,
                            () =>
                              respondToFriendRequest(request.id, 'accepted'),
                            'You are now friends',
                          )
                        }
                      >
                        <Check className="size-4" /> Accept
                      </Button>
                    </>
                  )}
                  {view === 'sent' && request && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          profile.id,
                          () => cancelFriendRequest(request.id),
                          'Request cancelled',
                        )
                      }
                    >
                      <X className="size-4" /> Cancel
                    </Button>
                  )}
                  {view === 'friends' && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Message ${profile.display_name}`}
                        onClick={() =>
                          run(
                            profile.id,
                            async () =>
                              onConversation(
                                await startConversation(profile.id),
                              ),
                            'Conversation ready',
                          )
                        }
                      >
                        <MessageCircle className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Unfriend ${profile.display_name}`}
                        onClick={() =>
                          run(
                            profile.id,
                            () => removeFriend(profile.id),
                            'Friend removed',
                          )
                        }
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </article>
            )
          })}
      </div>
      {view === 'discover' && (
        <div className="flex items-center justify-between border-t border-border p-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={discover.length < 20}
            onClick={() => setPage((value) => value + 1)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </section>
  )
}
