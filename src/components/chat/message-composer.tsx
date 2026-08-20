'use client'

import EmojiPicker, { Theme } from 'emoji-picker-react'
import {
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Paperclip,
  Send,
  Smile,
  Video,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { LocationMap } from '@/components/chat/location-map'
import { VoiceRecorder } from '@/components/chat/voice-recorder'
import { validateFile, type FileKind } from '@/lib/validation'
import type { PendingAttachment } from '@/types/database'

type Location = { latitude: number; longitude: number; label?: string }

export function MessageComposer({
  disabled,
  onSendText,
  onSendAttachment,
  onSendLocation,
}: {
  disabled?: boolean
  onSendText: (text: string) => Promise<void>
  onSendAttachment: (attachment: PendingAttachment) => Promise<void>
  onSendLocation: (location: Location) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [pending, setPending] = useState<PendingAttachment | null>(null)
  const [location, setLocation] = useState<Location | null>(null)
  const [locating, setLocating] = useState(false)
  const [sending, setSending] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const { resolvedTheme } = useTheme()

  const sendText = async () => {
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    setText('')
    try {
      await onSendText(value)
    } catch {
      setText(value)
    } finally {
      setSending(false)
    }
  }

  const chooseFile = (file: File | undefined, kind: FileKind) => {
    setAttachOpen(false)
    if (!file) return
    const validation = validateFile(file, kind)
    if (!validation.valid) {
      toast.error(validation.message)
      return
    }
    setPending({
      file,
      kind,
      previewUrl:
        kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null,
    })
  }

  const confirmAttachment = async () => {
    if (!pending) return
    const current = pending
    setSending(true)
    setPending(null)
    try {
      await onSendAttachment(current)
    } finally {
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl)
      setSending(false)
    }
  }

  const requestLocation = () => {
    setAttachOpen(false)
    if (!navigator.geolocation) {
      toast.error('Location sharing is not supported in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: 'Current location',
        })
        setLocating(false)
      },
      (error) => {
        setLocating(false)
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied.'
            : error.code === error.TIMEOUT
              ? 'Location request timed out.'
              : 'Your location is unavailable.',
        )
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }

  const insertEmoji = (emoji: string) => {
    const element = textarea.current
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? text.length
    setText(`${text.slice(0, start)}${emoji}${text.slice(end)}`)
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  return (
    <>
      <div className="safe-bottom relative border-t border-border bg-card px-2 pt-2 sm:px-4">
        {locating && (
          <div className="absolute inset-x-0 -top-10 flex h-10 items-center justify-center gap-2 bg-card text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Finding your
            current location…
          </div>
        )}
        <div className="mx-auto flex max-w-4xl items-end gap-1.5">
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Add attachment"
              onClick={() => setAttachOpen((value) => !value)}
              disabled={disabled || sending}
            >
              <Paperclip className="size-5" />
            </Button>
            {attachOpen && (
              <div className="absolute bottom-14 left-0 z-30 w-52 rounded-2xl border border-border bg-card p-2 shadow-xl">
                <AttachmentOption
                  icon={ImageIcon}
                  label="Image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onFile={(file) => chooseFile(file, 'image')}
                />
                <AttachmentOption
                  icon={Video}
                  label="Video"
                  accept="video/mp4,video/webm,video/quicktime"
                  onFile={(file) => chooseFile(file, 'video')}
                />
                <AttachmentOption
                  icon={FileText}
                  label="Document"
                  accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                  onFile={(file) => chooseFile(file, 'document')}
                />
                <button
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-muted"
                  onClick={requestLocation}
                >
                  <MapPin className="size-4 text-primary" /> Share location
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Choose emoji"
              onClick={() => setEmojiOpen((value) => !value)}
              disabled={disabled}
            >
              <Smile className="size-5" />
            </Button>
            {emojiOpen && (
              <div className="absolute bottom-14 left-0 z-30 sm:left-auto sm:right-0">
                <EmojiPicker
                  theme={resolvedTheme === 'dark' ? Theme.DARK : Theme.LIGHT}
                  lazyLoadEmojis
                  width={320}
                  height={400}
                  onEmojiClick={(emoji) => insertEmoji(emoji.emoji)}
                />
              </div>
            )}
          </div>
          <textarea
            ref={textarea}
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 4000))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendText()
              }
            }}
            rows={1}
            disabled={disabled || sending}
            placeholder={
              disabled
                ? 'You must be friends to send messages'
                : 'Write a message'
            }
            aria-label="Message"
            className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-muted px-4 py-3 text-sm shadow-none focus:ring-2 focus:ring-ring"
          />
          {text.trim() ? (
            <Button
              size="icon"
              onClick={() => void sendText()}
              disabled={disabled || sending}
              aria-label="Send message"
            >
              <Send className="size-5" />
            </Button>
          ) : (
            <VoiceRecorder
              onReady={(attachment) => void onSendAttachment(attachment)}
            />
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && pending?.previewUrl)
            URL.revokeObjectURL(pending.previewUrl)
          if (!open) setPending(null)
        }}
      >
        <DialogContent>
          <DialogTitle>Send attachment?</DialogTitle>
          <DialogDescription>
            Review the file before it is uploaded to private storage.
          </DialogDescription>
          {pending && (
            <div className="mt-5 overflow-hidden rounded-2xl bg-muted p-3">
              {pending.kind === 'image' && pending.previewUrl ? (
                <img
                  src={pending.previewUrl}
                  alt="Attachment preview"
                  className="max-h-72 w-full object-contain"
                />
              ) : pending.kind === 'video' && pending.previewUrl ? (
                <video
                  src={pending.previewUrl}
                  controls
                  className="max-h-72 w-full"
                />
              ) : (
                <div className="flex min-h-32 items-center justify-center gap-3">
                  <FileText className="size-7 text-primary" />
                  <span className="max-w-xs truncate font-semibold">
                    {pending.file.name}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmAttachment()}>
              <Send className="size-4" /> Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(location)}
        onOpenChange={(open) => {
          if (!open) setLocation(null)
        }}
      >
        <DialogContent>
          <DialogTitle>Share this location?</DialogTitle>
          <DialogDescription>
            WHAPPI sends this single coordinate once. It does not track your
            movement.
          </DialogDescription>
          {location && (
            <div className="mt-5">
              <LocationMap
                latitude={location.latitude}
                longitude={location.longitude}
                interactive
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </p>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLocation(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!location) return
                const current = location
                setLocation(null)
                await onSendLocation(current)
              }}
            >
              <MapPin className="size-4" /> Share location
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AttachmentOption({
  icon: Icon,
  label,
  accept,
  onFile,
}: {
  icon: typeof ImageIcon
  label: string
  accept: string
  onFile: (file?: File) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-muted">
      <Icon className="size-4 text-primary" /> {label}
      <input
        type="file"
        className="sr-only"
        accept={accept}
        onChange={(event) => {
          onFile(event.target.files?.[0])
          event.currentTarget.value = ''
        }}
      />
    </label>
  )
}
