'use client'

import { Download, FileText, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { downloadAttachment } from '@/lib/chat-api'
import { formatBytes } from '@/lib/utils'
import type { Attachment, MessageType } from '@/types/database'

export function AttachmentView({
  attachment,
  type,
}: {
  attachment: Attachment
  type: MessageType
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(type !== 'document')

  useEffect(() => {
    if (type === 'document') return
    let active = true
    let objectUrl: string | undefined
    downloadAttachment(attachment)
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch(() => {
        if (active) toast.error('This attachment could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment, type])

  const download = async () => {
    try {
      const blob = await downloadAttachment(attachment)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = attachment.original_name
      anchor.rel = 'noopener noreferrer'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      toast.error('Download failed')
    }
  }

  if (loading)
    return (
      <div className="grid h-36 min-w-52 place-items-center rounded-xl bg-black/5">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    )
  if (type === 'image' && url)
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl"
      >
        <img
          src={url}
          alt={attachment.original_name}
          className="max-h-80 w-full object-contain"
        />
      </a>
    )
  if (type === 'video' && url)
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-80 w-full rounded-xl"
      />
    )
  if (type === 'voice' && url)
    return (
      <div className="min-w-64 py-1">
        <audio src={url} controls preload="metadata" className="h-10 w-full" />
      </div>
    )
  return (
    <div className="border-current/10 flex min-w-64 items-center gap-3 rounded-xl border bg-background/55 p-3">
      <span className="bg-primary/12 grid size-10 place-items-center rounded-xl text-primary">
        <FileText className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {attachment.original_name}
        </p>
        <p className="text-xs opacity-65">
          {attachment.mime_type.split('/').pop()?.toUpperCase()} ·{' '}
          {formatBytes(attachment.size_bytes)}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={download}
        aria-label={`Download ${attachment.original_name}`}
      >
        <Download className="size-4" />
      </Button>
    </div>
  )
}
