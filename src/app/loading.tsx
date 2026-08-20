import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <main className="flex h-dvh">
      <div className="w-full border-r border-border p-4 lg:w-96">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="mt-6 h-11 w-full" />
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="mt-3 h-16 w-full" />
        ))}
      </div>
      <div className="hidden flex-1 place-items-center lg:grid">
        <Skeleton className="size-20 rounded-3xl" />
      </div>
    </main>
  )
}
