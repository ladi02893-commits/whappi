'use client'

import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronUp,
  CircleAlert,
  LoaderCircle,
  MoreVertical,
  RotateCcw,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AttachmentView } from '@/components/chat/attachment-view'
import { LocationMap } from '@/components/chat/location-map'
import { MessageComposer } from '@/components/chat/message-composer'
import { RetentionDialog } from '@/components/chat/retention-dialog'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  clearConversation,
  classifyText,
  deleteOwnMessage,
  loadMessage,
  loadMessages,
  markViewed,
  removeOrphanAttachment,
  sendMessage,
  uploadAttachment,
} from '@/lib/chat-api'
import { formatTime, safeExternalUrl, generateId } from '@/lib/utils'
import type {
  Conversation,
  Message,
  PendingAttachment,
  Profile,
  RetentionMode,
} from '@/types/database'

type RetryData =
  | { type: 'text'; text: string }
  | { type: 'location'; latitude: number; longitude: number; label?: string }

export function ConversationPanel({
  conversation,
  friend,
  currentUserId,
  friendshipActive,
  onBack,
  onConversationChanged,
}: {
  conversation: Conversation
  friend: Profile
  currentUserId: string
  friendshipActive: boolean
  onBack: () => void
  onConversationChanged: (conversation: Conversation) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [connection, setConnection] = useState<
    'connecting' | 'connected' | 'offline'
  >('connecting')
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const retries = useRef(new Map<string, RetryData>())
  const cancelledUploads = useRef(new Set<string>())

  const scrollBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = scrollRef.current
    if (element) element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessages([])
    setHasOlder(true)
    loadMessages(conversation.id)
      .then((items) => {
        if (active) {
          setMessages(items)
          setHasOlder(items.length === 40)
          requestAnimationFrame(() => scrollBottom())
        }
      })
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : 'Messages could not be loaded',
        ),
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [conversation.id, scrollBottom])

  // Use polling for new messages since we migrated away from InsForge Realtime
  useEffect(() => {
    let mounted = true
    const pollMessages = async () => {
      if (!mounted || document.visibilityState !== 'visible') return
      try {
        const latestMessages = await loadMessages(conversation.id)
        if (mounted) {
          setMessages(latestMessages)
          setConnection('connected')
        }
      } catch (err) {
        if (mounted) setConnection(navigator.onLine ? 'connecting' : 'offline')
      }
    }
    
    // Initial fetch handled elsewhere, just poll periodically
    const interval = setInterval(pollMessages, 3000)
    
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [conversation.id])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const seen = new Set<string>()
    let timer: number | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.receipt
            if (id) seen.add(id)
          }
        })
        if (seen.size && !timer)
          timer = window.setTimeout(() => {
            const ids = [...seen]
            seen.clear()
            timer = undefined
            void markViewed(conversation.id, ids).catch(() => undefined)
          }, 500)
      },
      { root: container, threshold: 0.65 },
    )
    container
      .querySelectorAll('[data-receipt]')
      .forEach((node) => observer.observe(node))
    return () => {
      observer.disconnect()
      if (timer) window.clearTimeout(timer)
    }
  }, [conversation.id, messages])

  const addOptimistic = (message: Message) => {
    setMessages((current) => [...current, message])
    requestAnimationFrame(() => scrollBottom('smooth'))
  }

  const optimisticBase = (
    id: string,
    type: Message['message_type'],
  ): Message => ({
    id,
    conversation_id: conversation.id,
    sender_id: currentUserId,
    message_type: type,
    text_content: null,
    link_url: null,
    latitude: null,
    longitude: null,
    location_label: null,
    retention_mode: conversation.retention_mode,
    retention_seconds: conversation.retention_seconds,
    is_system: false,
    created_at: new Date().toISOString(),
    expires_at: null,
    deleted_at: null,
    delivery: 'pending',
  })

  const sendText = async (value: string, reuseId?: string) => {
    const id = reuseId ?? generateId()
    const classified = classifyText(value)
    if (!reuseId) {
      retries.current.set(id, { type: 'text', text: value })
      addOptimistic({
        ...optimisticBase(id, classified.type),
        text_content: classified.type === 'text' ? classified.text : null,
        link_url: classified.type === 'link' ? classified.link : null,
      })
    } else
      setMessages((items) =>
        items.map((item) =>
          item.id === id ? { ...item, delivery: 'pending' } : item,
        ),
      )
    try {
      const sent = await sendMessage({
        conversationId: conversation.id,
        messageId: id,
        type: classified.type,
        text: classified.type === 'text' ? classified.text : null,
        link: classified.type === 'link' ? classified.link : null,
      })
      retries.current.delete(id)
      setMessages((items) =>
        items.map((item) =>
          item.id === id ? { ...sent, delivery: 'sent' } : item,
        ),
      )
    } catch (error) {
      setMessages((items) =>
        items.map((item) =>
          item.id === id ? { ...item, delivery: 'failed' } : item,
        ),
      )
      toast.error(error instanceof Error ? error.message : 'Message failed')
      throw error
    }
  }

  const sendLocation = async (
    location: { latitude: number; longitude: number; label?: string },
    reuseId?: string,
  ) => {
    const id = reuseId ?? generateId()
    if (!reuseId) {
      retries.current.set(id, { type: 'location', ...location })
      addOptimistic({
        ...optimisticBase(id, 'location'),
        latitude: location.latitude,
        longitude: location.longitude,
        location_label: location.label ?? null,
      })
    }
    try {
      const sent = await sendMessage({
        conversationId: conversation.id,
        messageId: id,
        type: 'location',
        latitude: location.latitude,
        longitude: location.longitude,
        locationLabel: location.label,
      })
      retries.current.delete(id)
      setMessages((items) =>
        items.map((item) =>
          item.id === id ? { ...sent, delivery: 'sent' } : item,
        ),
      )
    } catch (error) {
      setMessages((items) =>
        items.map((item) =>
          item.id === id ? { ...item, delivery: 'failed' } : item,
        ),
      )
      throw error
    }
  }

  const sendAttachment = async (attachment: PendingAttachment) => {
    const id = generateId()
    addOptimistic({
      ...optimisticBase(id, attachment.kind),
      text_content: attachment.file.name,
    })
    setProgress((value) => ({ ...value, [id]: 2 }))
    let uploaded: Awaited<ReturnType<typeof uploadAttachment>> | null = null
    try {
      uploaded = await uploadAttachment(
        conversation.id,
        id,
        attachment,
        (value) => setProgress((current) => ({ ...current, [id]: value })),
      )
      if (cancelledUploads.current.has(id)) {
        await removeOrphanAttachment(uploaded.bucket, uploaded.storage_key)
        setMessages((items) => items.filter((item) => item.id !== id))
        return
      }
      const sent = await sendMessage({
        conversationId: conversation.id,
        messageId: id,
        type: attachment.kind,
        attachment: uploaded,
      })
      setProgress((current) => ({ ...current, [id]: 100 }))
      const full = await loadMessage(sent.id)
      setMessages((items) =>
        items.map((item) =>
          item.id === id ? { ...(full ?? sent), delivery: 'sent' } : item,
        ),
      )
    } catch (error) {
      if (uploaded)
        await removeOrphanAttachment(uploaded.bucket, uploaded.storage_key)
      setMessages((items) =>
        items.map((item) =>
          item.id === id ? { ...item, delivery: 'failed' } : item,
        ),
      )
      toast.error(error instanceof Error ? error.message : 'Attachment failed')
    } finally {
      setProgress((current) => {
        const copy = { ...current }
        delete copy[id]
        return copy
      })
      cancelledUploads.current.delete(id)
    }
  }

  const retry = (id: string) => {
    const data = retries.current.get(id)
    if (!data) return
    if (data.type === 'text') void sendText(data.text, id)
    else void sendLocation(data, id)
  }

  const loadOlder = async () => {
    const element = scrollRef.current
    const oldest = messages[0]
    if (!element || !oldest || loadingOlder || !hasOlder) return
    const oldHeight = element.scrollHeight
    setLoadingOlder(true)
    try {
      const older = await loadMessages(conversation.id, oldest.created_at)
      setMessages((current) => [...older, ...current])
      setHasOlder(older.length === 40)
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight - oldHeight
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Older messages could not be loaded',
      )
    } finally {
      setLoadingOlder(false)
    }
  }

  const clear = async () => {
    try {
      await clearConversation(conversation.id)
      setMessages([])
      setClearOpen(false)
      toast.success('Chat cleared for you')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Chat could not be cleared',
      )
    }
  }

  const deleteMessage = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteOwnMessage(deleteTarget.id)
      setMessages((items) =>
        items.filter((message) => message.id !== deleteTarget.id),
      )
      setDeleteTarget(null)
      toast.success('Message deleted for both people')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Message could not be deleted',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      className="flex h-full min-w-0 flex-1 flex-col bg-card"
      aria-label={`Conversation with ${friend.display_name}`}
    >
      <header className="safe-top flex min-h-16 items-center gap-2 border-b border-border px-2 sm:px-4">
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <Avatar name={friend.display_name} src={friend.avatar_url} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold">{friend.display_name}</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {connection === 'connected' ? (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500" />{' '}
                Realtime connected
              </>
            ) : (
              <>
                <WifiOff className="size-3" />{' '}
                {connection === 'offline' ? 'Offline' : 'Reconnecting…'}
              </>
            )}
          </p>
        </div>
        <div className="relative">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Conversation options"
          >
            <MoreVertical className="size-5" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-30 w-60 rounded-2xl border border-border bg-card p-2 shadow-xl">
              <RetentionDialog
                conversation={conversation}
                onChanged={(mode, seconds) =>
                  onConversationChanged({
                    ...conversation,
                    retention_mode: mode,
                    retention_seconds: seconds,
                  })
                }
              />
              <button
                onClick={() => {
                  setClearOpen(true)
                  setMenuOpen(false)
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" /> Clear all messages for me
              </button>
            </div>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget
          nearBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            180
        }}
        className="chat-grid min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-8"
      >
        <div className="mx-auto max-w-4xl">
          {hasOlder && messages.length > 0 && (
            <div className="mb-5 text-center">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
              >
                {loadingOlder ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ChevronUp className="size-4" />
                )}{' '}
                Older messages
              </Button>
            </div>
          )}
          {loading && (
            <div className="grid min-h-80 place-items-center">
              <LoaderCircle className="size-6 animate-spin text-primary" />
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div className="grid min-h-[55dvh] place-items-center text-center">
              <div className="max-w-sm">
                <div className="bg-primary/12 mx-auto grid size-16 place-items-center rounded-3xl text-primary">
                  <ArrowDown className="size-6" />
                </div>
                <h2 className="mt-5 text-xl font-[var(--font-display)] font-extrabold">
                  Start something good
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Messages live here only as long as this conversation’s current
                  setting allows.
                </p>
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const previous = messages[index - 1]
            const grouped =
              previous?.sender_id === message.sender_id &&
              new Date(message.created_at).getTime() -
                new Date(previous.created_at).getTime() <
                5 * 60_000
            return (
              <MessageBubble
                key={message.id}
                message={message}
                outgoing={message.sender_id === currentUserId}
                grouped={grouped}
                progress={progress[message.id]}
                onCancel={() => cancelledUploads.current.add(message.id)}
                onRetry={() => retry(message.id)}
                onDelete={
                  message.sender_id === currentUserId &&
                  message.delivery !== 'pending' &&
                  message.delivery !== 'failed'
                    ? () => setDeleteTarget(message)
                    : undefined
                }
              />
            )
          })}
        </div>
      </div>
      {!friendshipActive && (
        <div
          role="status"
          className="border-t border-amber-500/25 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-800 dark:text-amber-300"
        >
          You are no longer friends. Existing history remains visible, but new
          messages are disabled.
        </div>
      )}
      <MessageComposer
        disabled={!friendshipActive || connection === 'offline'}
        onSendText={(value) => sendText(value)}
        onSendAttachment={sendAttachment}
        onSendLocation={sendLocation}
      />

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogTitle>Clear all messages for you?</DialogTitle>
          <DialogDescription>
            Messages up to this moment will disappear from your view only.{' '}
            {friend.display_name} keeps their history, and new messages remain
            visible.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void clear()}>
              <Trash2 className="size-4" /> Clear all for me
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogTitle>Delete this message?</DialogTitle>
          <DialogDescription>
            This permanently removes your message for both you and{' '}
            {friend.display_name}. This action cannot be undone.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void deleteMessage()}
            >
              {deleting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}{' '}
              Delete for everyone
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function MessageBubble({
  message,
  outgoing,
  grouped,
  progress,
  onCancel,
  onRetry,
  onDelete,
}: {
  message: Message
  outgoing: boolean
  grouped: boolean
  progress?: number
  onCancel: () => void
  onRetry: () => void
  onDelete?: () => void
}) {
  if (message.is_system)
    return (
      <div className="my-4 text-center">
        <span className="inline-flex rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground">
          {message.text_content}
        </span>
      </div>
    )
  const safeLink = message.link_url ? safeExternalUrl(message.link_url) : null
  const viewed = message.message_receipts?.some(
    (receipt) => receipt.user_id !== message.sender_id,
  )
  return (
    <div
      data-receipt={
        !outgoing && !message.message_receipts?.length ? message.id : undefined
      }
      className={`${grouped ? 'mt-1' : 'mt-4'} flex animate-message-in ${outgoing ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[72%] ${outgoing ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card text-card-foreground'} ${message.delivery === 'failed' ? 'ring-2 ring-destructive/60' : ''}`}
      >
        {message.message_type === 'text' && (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {message.text_content}
          </p>
        )}
        {message.message_type === 'link' && safeLink && (
          <a
            href={safeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm font-semibold underline underline-offset-2"
          >
            {safeLink}
          </a>
        )}
        {message.message_type === 'location' &&
          message.latitude !== null &&
          message.longitude !== null && (
            <div className="min-w-64">
              <LocationMap
                latitude={message.latitude}
                longitude={message.longitude}
                className="h-36"
              />
              <a
                className="mt-2 block text-xs font-semibold underline"
                href={`https://www.openstreetmap.org/?mlat=${message.latitude}&mlon=${message.longitude}#map=16/${message.latitude}/${message.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {message.location_label ?? 'Open location'}
              </a>
            </div>
          )}
        {(['image', 'video', 'voice', 'document'] as const).includes(
          message.message_type as never,
        ) &&
          message.message_attachments?.[0] && (
            <AttachmentView
              attachment={message.message_attachments[0]}
              type={message.message_type}
            />
          )}
        {progress !== undefined && (
          <div className="mt-2 min-w-52">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/15">
              <div
                className="h-full rounded-full bg-current transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span>Uploading {progress}%</span>
              <button
                onClick={onCancel}
                className="inline-flex items-center gap-1 font-semibold"
              >
                <X className="size-3" /> Cancel
              </button>
            </div>
          </div>
        )}
        {message.delivery === 'failed' && (
          <button
            onClick={onRetry}
            className="mt-2 flex items-center gap-1 text-xs font-bold"
          >
            <RotateCcw className="size-3" /> Retry failed message
          </button>
        )}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${outgoing ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
        >
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mr-1 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              aria-label="Delete message"
              title="Delete message"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <time dateTime={message.created_at}>
            {formatTime(message.created_at)}
          </time>
          {message.delivery === 'pending' ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : message.delivery === 'failed' ? (
            <CircleAlert className="size-3" />
          ) : outgoing ? (
            viewed ? (
              <CheckCheck className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
