import { redirect } from 'next/navigation'
import { getInsForgeServerClient } from '@/lib/insforge/server'

export default async function HomePage() {
  const client = await getInsForgeServerClient()
  const { data } = await client.auth.getCurrentUser()
  redirect(data?.user ? '/chat' : '/login')
}
