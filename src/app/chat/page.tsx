import { redirect } from 'next/navigation'
import { ChatShell } from '@/components/chat/chat-shell'
import { ensureProfile } from '@/actions/chat'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Chats' }

export default async function ChatPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await ensureProfile()
  if (!profile)
    throw new Error('Your WHAPPI profile could not be prepared.')
    
  return <ChatShell key={profile.id} initialProfile={profile} />
}
