'use client'

import {
  Compass,
  LogOut,
  MessageCircleMore,
  MessagesSquare,
  Moon,
  Search,
  Send,
  Settings2,
  Sun,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { ConversationPanel } from '@/components/chat/conversation-panel'
import { ProfileDialog } from '@/components/chat/profile-dialog'
import { SocialPanel, type SocialView } from '@/components/chat/social-panel'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { logout } from '@/app/login/actions'
import { loadSocialState } from '@/lib/chat-api'

import { formatTime } from '@/lib/utils'
import type {
  Conversation,
  FriendRequest,
  Friendship,
  Profile,
} from '@/types/database'

type View = 'chats' | SocialView

export function ChatShell({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile)
  const [profiles, setProfiles] = useState<Profile[]>([initialProfile])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [view, setView] = useState<View>('chats')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [online, setOnline] = useState(true)
  const { resolvedTheme, setTheme } = useTheme()

  const refresh = useCallback(async () => {
    try {
      const state = await loadSocialState()
      setProfiles(state.profiles)
      setRequests(state.requests)
      setFriendships(state.friendships)
      setConversations(state.conversations)
      const me = state.profiles.find((item) => item.id === profile.id)
      if (me) setProfile(me)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'WHAPPI could not refresh',
      )
    } finally {
      setLoading(false)
    }
  }, [profile.id])

  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])
  // Use polling since we migrated away from InsForge Realtime
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [refresh])

  const profileById = useMemo(
    () => new Map(profiles.map((item) => [item.id, item])),
    [profiles],
  )
  const activeConversation =
    conversations.find((item) => item.id === activeId) ?? null
  const activeFriendId = activeConversation
    ? activeConversation.user_low_id === profile.id
      ? activeConversation.user_high_id
      : activeConversation.user_low_id
    : null
  const activeFriend = activeFriendId ? profileById.get(activeFriendId) : null
  const friendshipActive = activeFriendId
    ? friendships.some(
        (item) =>
          item.user_low_id === activeFriendId ||
          item.user_high_id === activeFriendId,
      )
    : false
  const incomingCount = requests.filter(
    (request) =>
      request.status === 'pending' && request.receiver_id === profile.id,
  ).length

  const chatRows = conversations
    .map((conversation) => {
      const friendId =
        conversation.user_low_id === profile.id
          ? conversation.user_high_id
          : conversation.user_low_id
      return { conversation, friend: profileById.get(friendId) }
    })
    .filter((row): row is { conversation: Conversation; friend: Profile } =>
      Boolean(row.friend),
    )
    .filter(
      ({ friend }) =>
        !query ||
        `${friend.display_name} ${friend.username}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )

  const chooseConversation = (conversation: Conversation) => {
    setConversations((current) =>
      current.some((item) => item.id === conversation.id)
        ? current.map((item) =>
            item.id === conversation.id ? conversation : item,
          )
        : [conversation, ...current],
    )
    setActiveId(conversation.id)
    setView('chats')
  }

  return (
    <main className="h-dvh overflow-hidden bg-muted p-0 lg:p-3">
      {!online && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[60] bg-destructive px-3 py-1.5 text-center text-xs font-semibold text-destructive-foreground"
        >
          You are offline. Pending messages can be retried after reconnecting.
        </div>
      )}
      <div className="mx-auto flex h-full max-w-[1500px] overflow-hidden bg-card shadow-soft lg:rounded-3xl lg:border lg:border-border">
        <aside
          className={`${activeId ? 'hidden lg:flex' : 'flex'} safe-top relative w-full shrink-0 flex-col border-r border-border bg-card lg:w-[390px]`}
        >
          <header className="flex min-h-16 items-center gap-2 border-b border-border px-3">
            <div className="flex flex-1 items-center gap-2">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <MessageCircleMore className="size-5" />
              </span>
              <span className="text-base font-[var(--font-display)] font-extrabold tracking-[0.16em]">
                WHAPPI
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
              }
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
            <ProfileDialog
              profile={profile}
              onUpdated={(updated) => {
                setProfile(updated)
                setProfiles((items) =>
                  items.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                )
              }}
            >
              <Button size="icon" variant="ghost" aria-label="Edit profile">
                <Settings2 className="size-4" />
              </Button>
            </ProfileDialog>
            <form action={logout}>
              <Button
                size="icon"
                variant="ghost"
                type="submit"
                aria-label="Log out"
              >
                <LogOut className="size-4" />
              </Button>
            </form>
          </header>

          {view === 'chats' ? (
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-4 pb-4 pt-5">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={profile.display_name}
                    src={profile.avatar_url}
                  />
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-[var(--font-display)] font-extrabold">
                      {profile.display_name}
                    </h1>
                    <p className="truncate text-xs text-muted-foreground">
                      @{profile.username}
                    </p>
                  </div>
                </div>
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search conversations"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {loading &&
                  Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="mb-2 flex items-center gap-3 p-3"
                    >
                      <Skeleton className="size-12" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="mt-2 h-3 w-44" />
                      </div>
                    </div>
                  ))}
                {!loading && chatRows.length === 0 && (
                  <div className="grid min-h-72 place-items-center px-6 text-center">
                    <div>
                      <div className="bg-primary/12 mx-auto grid size-16 place-items-center rounded-3xl text-primary">
                        <MessagesSquare className="size-7" />
                      </div>
                      <h2 className="mt-5 font-bold">No conversations yet</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Find a friend, then open a focused one-to-one chat.
                      </p>
                      <Button
                        className="mt-5"
                        size="sm"
                        onClick={() => setView('discover')}
                      >
                        <Compass className="size-4" /> Discover people
                      </Button>
                    </div>
                  </div>
                )}
                {chatRows.map(({ conversation, friend }) => (
                  <button
                    key={conversation.id}
                    onClick={() => setActiveId(conversation.id)}
                    className={`mb-1 flex min-h-16 w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${activeId === conversation.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    <Avatar
                      name={friend.display_name}
                      src={friend.avatar_url}
                      className="size-12"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="truncate text-sm font-bold">
                          {friend.display_name}
                        </h2>
                        <time className="text-[10px] text-muted-foreground">
                          {formatTime(conversation.updated_at)}
                        </time>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {conversation.retention_mode === 'never'
                          ? 'Messages stay'
                          : 'Disappearing messages on'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <SocialPanel
              view={view}
              currentUserId={profile.id}
              profiles={profiles}
              requests={requests}
              friendships={friendships}
              onChanged={refresh}
              onConversation={chooseConversation}
            />
          )}

          <nav
            aria-label="Main navigation"
            className="safe-bottom grid grid-cols-5 border-t border-border bg-card px-1 pt-1"
          >
            <NavButton
              active={view === 'chats'}
              label="Chats"
              icon={MessagesSquare}
              onClick={() => setView('chats')}
            />
            <NavButton
              active={view === 'discover'}
              label="Discover"
              icon={Compass}
              onClick={() => setView('discover')}
            />
            <NavButton
              active={view === 'incoming'}
              label="Requests"
              icon={UsersRound}
              badge={incomingCount}
              onClick={() => setView('incoming')}
            />
            <NavButton
              active={view === 'sent'}
              label="Sent"
              icon={Send}
              onClick={() => setView('sent')}
            />
            <NavButton
              active={view === 'friends'}
              label="Friends"
              icon={UserRoundCheck}
              onClick={() => setView('friends')}
            />
          </nav>
        </aside>

        {activeConversation && activeFriend ? (
          <ConversationPanel
            conversation={activeConversation}
            friend={activeFriend}
            currentUserId={profile.id}
            friendshipActive={friendshipActive}
            onBack={() => setActiveId(null)}
            onConversationChanged={(updated) =>
              setConversations((items) =>
                items.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
          />
        ) : (
          <section className="chat-grid hidden min-w-0 flex-1 place-items-center lg:grid">
            <div className="max-w-md text-center">
              <div className="mx-auto grid size-20 place-items-center rounded-[1.75rem] bg-primary text-primary-foreground shadow-lg">
                <MessageCircleMore className="size-9" />
              </div>
              <h1 className="mt-7 text-2xl font-[var(--font-display)] font-extrabold">
                A quieter place to catch up.
              </h1>
              <p className="mt-3 leading-7 text-muted-foreground">
                Choose a conversation, or make a new friend from Discover.
                Realtime updates arrive without reloading.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function NavButton({
  active,
  label,
  icon: Icon,
  badge,
  onClick,
}: {
  active: boolean
  label: string
  icon: typeof MessagesSquare
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      <Icon className="size-4" />
      {label}
      {badge ? (
        <Badge className="absolute right-2 top-1 min-w-5 justify-center bg-destructive px-1 text-[10px] text-destructive-foreground">
          {badge}
        </Badge>
      ) : null}
    </button>
  )
}
