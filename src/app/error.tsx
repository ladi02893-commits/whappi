'use client'

import { CircleAlert, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-destructive/10 text-destructive">
          <CircleAlert className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">WHAPPI hit a snag</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your private data is safe. Try the request again, or return after
          checking your connection.
        </p>
        <Button className="mt-6" onClick={reset}>
          <RotateCcw className="size-4" /> Try again
        </Button>
      </div>
    </main>
  )
}
