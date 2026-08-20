import { redirect } from 'next/navigation'
import { ChatShell } from '@/components/chat/chat-shell'
import { getInsForgeServerClient } from '@/lib/insforge/server'
import type { Profile } from '@/types/database'

export const metadata = { title: 'Chats' }

export default async function ChatPage() {
  const client = await getInsForgeServerClient()
  const { data: authData } = await client.auth.getCurrentUser()
  if (!authData?.user) redirect('/login')
  const { data, error } = await client.database.rpc('ensure_profile').single()
  if (error || !data)
    throw new Error('Your WHAPPI profile could not be prepared.')
  const profile = data as Profile
  return <ChatShell key={profile.id} initialProfile={profile} />
}
