'use client'

import { Clock3 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { retentionLabels } from '@/lib/domain/retention'
import { updateRetention } from '@/lib/chat-api'
import { retentionSchema } from '@/lib/validation'
import type { Conversation, RetentionMode } from '@/types/database'

export function RetentionDialog({
  conversation,
  onChanged,
}: {
  conversation: Conversation
  onChanged: (mode: RetentionMode, seconds: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RetentionMode>(conversation.retention_mode)
  const [minutes, setMinutes] = useState(
    Math.max(1, Math.round((conversation.retention_seconds ?? 3600) / 60)),
  )
  const [saving, setSaving] = useState(false)
  const save = async () => {
    const seconds = mode === 'custom' ? minutes * 60 : null
    const parsed = retentionSchema.safeParse({ mode, customSeconds: seconds })
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ?? 'Invalid retention setting',
      )
      return
    }
    setSaving(true)
    try {
      await updateRetention(conversation.id, mode, seconds)
      onChanged(mode, seconds)
      setOpen(false)
      toast.success('Disappearing messages updated')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Setting could not be saved',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-muted">
          <Clock3 className="size-4" /> Disappearing messages
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Disappearing messages</DialogTitle>
        <DialogDescription>
          This shared setting applies only to messages sent after you save it.
          Server time is authoritative.
        </DialogDescription>
        <div
          className="mt-5 space-y-2"
          role="radiogroup"
          aria-label="Retention mode"
        >
          {(Object.keys(retentionLabels) as RetentionMode[]).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center justify-between rounded-xl border border-border px-3 hover:bg-muted"
            >
              <span className="text-sm font-semibold">
                {retentionLabels[value]}
              </span>
              <input
                type="radio"
                name="retention"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="text-primary focus:ring-primary"
              />
            </label>
          ))}
        </div>
        {mode === 'custom' && (
          <label className="mt-4 block text-sm font-semibold">
            Duration in minutes
            <Input
              className="mt-2"
              type="number"
              min={1}
              max={525600}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </label>
        )}
        <div className="mt-6 flex justify-end">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save setting'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
