import {
  CheckCircle2,
  LockKeyhole,
  MessageCircleMore,
  Sparkles,
  Users,
} from 'lucide-react'
import { redirect } from 'next/navigation'
import { AuthPanel } from '@/components/auth/auth-panel'
import { getCurrentUser } from '@/lib/auth'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/chat')

  return (
    <main className="min-h-dvh overflow-hidden bg-background">
      <div className="mx-auto grid min-h-dvh max-w-7xl lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden border-r border-border bg-[#17142a] px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-32 top-28 size-96 rounded-full bg-[#6d5df0]/30 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#7567ef]">
              <MessageCircleMore className="size-6" />
            </span>
            <span className="text-xl font-[var(--font-display)] font-extrabold tracking-[0.18em]">
              WHAPPI
            </span>
          </div>
          <div className="relative max-w-xl">
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.22em] text-[#a79ef8]">
              Close conversations, beautifully simple
            </p>
            <h1 className="text-5xl font-[var(--font-display)] font-extrabold leading-[1.08]">
              Your people.
              <br />
              Your pace.
              <br />
              Your space.
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-slate-300">
              A focused place for one-to-one conversations, rich sharing, and
              messages that can leave when their moment has passed.
            </p>
          </div>
          <div className="relative grid grid-cols-3 gap-3 text-sm text-slate-300">
            {[
              [LockKeyhole, 'Private by policy'],
              [Sparkles, 'Disappearing modes'],
              [Users, 'Friends only'],
            ].map(([Icon, label]) => {
              const FeatureIcon = Icon as typeof LockKeyhole
              return (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <FeatureIcon className="mb-3 size-5 text-[#a79ef8]" />
                  <span>{String(label)}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <MessageCircleMore className="size-6" />
              </span>
              <span className="text-xl font-[var(--font-display)] font-extrabold tracking-[0.18em]">
                WHAPPI
              </span>
            </div>
            <AuthPanel />
            <ul className="mt-7 space-y-3 text-sm text-muted-foreground">
              {[
                'Secure refresh tokens stay in HTTP-only cookies',
                'Only public-safe profile details appear in discovery',
                'Passwords are handled only by InsForge Auth',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-10 text-xs leading-5 text-muted-foreground">
              WHAPPI never stores your password in its public profile or chat
              database. Authentication is handled by InsForge Auth.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
