'use client'

import {
  CirclePause,
  CirclePlay,
  Mic,
  Send,
  Square,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { PendingAttachment } from '@/types/database'

function supportedMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return (
    [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
  )
}

export function VoiceRecorder({
  onReady,
}: {
  onReady: (attachment: PendingAttachment) => void
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<
    'idle' | 'recording' | 'paused' | 'preview'
  >('idle')
  const [seconds, setSeconds] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const blob = useRef<Blob | null>(null)

  useEffect(() => {
    if (state !== 'recording') return
    const timer = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [state])

  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }
  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    recorder.current = null
    chunks.current = []
    blob.current = null
    setPreview(null)
    setSeconds(0)
    setState('idle')
    release()
  }
  useEffect(
    () => () => {
      release()
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const start = async () => {
    const mimeType = supportedMime()
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice recording is not supported in this browser.')
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      const mediaRecorder = new MediaRecorder(
        stream.current,
        mimeType ? { mimeType } : undefined,
      )
      recorder.current = mediaRecorder
      chunks.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data)
      }
      mediaRecorder.onstop = () => {
        const result = new Blob(chunks.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        })
        blob.current = result
        setPreview(URL.createObjectURL(result))
        setState('preview')
        release()
      }
      mediaRecorder.start(250)
      setState('recording')
    } catch (error) {
      release()
      toast.error(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'The microphone could not be started.',
      )
    }
  }
  const togglePause = () => {
    if (!recorder.current) return
    if (state === 'recording') {
      recorder.current.pause()
      setState('paused')
    } else {
      recorder.current.resume()
      setState('recording')
    }
  }
  const stop = () => {
    if (recorder.current && recorder.current.state !== 'inactive')
      recorder.current.stop()
  }
  const useRecording = () => {
    if (!blob.current) return
    const extension = blob.current.type.includes('ogg')
      ? 'ogg'
      : blob.current.type.includes('mp4')
        ? 'm4a'
        : 'webm'
    const file = new File(
      [blob.current],
      `voice-note-${Date.now()}.${extension}`,
      { type: blob.current.type },
    )
    onReady({
      file,
      kind: 'voice',
      previewUrl: preview,
      durationSeconds: seconds,
    })
    setOpen(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value && state !== 'idle') reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Record voice note">
          <Mic className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Voice note</DialogTitle>
        <DialogDescription>
          Microphone access is requested only when you press record.
        </DialogDescription>
        <div className="mt-6 rounded-2xl bg-muted p-6 text-center">
          <div className="bg-primary/12 mx-auto grid size-20 place-items-center rounded-full text-primary">
            <Mic className="size-8" />
          </div>
          <p className="mt-4 font-mono text-2xl font-bold">
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {state === 'idle'
              ? 'Ready to record'
              : state === 'recording'
                ? 'Recording…'
                : state === 'paused'
                  ? 'Paused'
                  : 'Preview your voice note'}
          </p>
          {preview && <audio src={preview} controls className="mt-5 w-full" />}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          {state === 'idle' && (
            <Button onClick={start}>
              <Mic className="size-4" /> Start recording
            </Button>
          )}
          {(state === 'recording' || state === 'paused') && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={togglePause}
                aria-label={
                  state === 'paused' ? 'Resume recording' : 'Pause recording'
                }
              >
                {state === 'paused' ? (
                  <CirclePlay className="size-5" />
                ) : (
                  <CirclePause className="size-5" />
                )}
              </Button>
              <Button onClick={stop}>
                <Square className="size-4" /> Stop
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  recorder.current?.stop()
                  reset()
                }}
                aria-label="Cancel recording"
              >
                <Trash2 className="size-5" />
              </Button>
            </>
          )}
          {state === 'preview' && (
            <>
              <Button variant="outline" onClick={reset}>
                <Trash2 className="size-4" /> Discard
              </Button>
              <Button onClick={useRecording}>
                <Send className="size-4" /> Use recording
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
