'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateProfile } from '@/actions/chat'
import { profileSchema } from '@/lib/validation'
import type { Profile } from '@/types/database'

type Values = z.infer<typeof profileSchema>

export function ProfileDialog({
  profile,
  onUpdated,
  children,
}: {
  profile: Profile
  onUpdated: (profile: Profile) => void
  children: React.ReactNode
}) {
  const form = useForm<Values>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url ?? '',
      bio: profile.bio ?? '',
    },
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      const updatedProfile = await updateProfile(profile.id, {
        ...values,
        avatar_url: values.avatar_url || null,
        bio: values.bio || null,
      })
      onUpdated(updatedProfile)
      toast.success('Your profile has been saved.')
    } catch (error) {
      toast.error(
        'Profile could not be saved. Your username might be taken by someone else.',
      )
    }
  })

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>
          Only these public-safe details appear to other WHAPPI users.
        </DialogDescription>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">
            Display name
            <Input
              className="mt-2"
              autoComplete="name"
              {...form.register('display_name')}
            />
          </label>
          {form.formState.errors.display_name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.display_name.message}
            </p>
          )}
          <label className="block text-sm font-semibold">
            Username
            <div className="relative mt-2">
              <span className="absolute left-3 top-3 text-muted-foreground">
                @
              </span>
              <Input
                className="pl-8"
                autoCapitalize="none"
                autoCorrect="off"
                {...form.register('username')}
              />
            </div>
          </label>
          {form.formState.errors.username && (
            <p className="text-sm text-destructive">
              Use 3–30 lowercase letters, numbers, dots, or underscores.
            </p>
          )}
          <label className="block text-sm font-semibold">
            Bio
            <Textarea
              className="mt-2"
              maxLength={160}
              {...form.register('bio')}
            />
          </label>
          <label className="block text-sm font-semibold">
            Avatar URL
            <Input
              className="mt-2"
              type="url"
              placeholder="https://…"
              {...form.register('avatar_url')}
            />
          </label>
          {form.formState.errors.avatar_url && (
            <p className="text-sm text-destructive">
              Use a valid HTTPS image URL.
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
