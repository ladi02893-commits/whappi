import { cn, initials } from '@/lib/utils'

export function Avatar({
  name,
  src,
  className,
}: {
  name: string
  src?: string | null
  className?: string
}) {
  return (
    <span
      className={cn(
        'bg-primary/12 relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl text-sm font-bold text-primary',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initials(name)
      )}
    </span>
  )
}
