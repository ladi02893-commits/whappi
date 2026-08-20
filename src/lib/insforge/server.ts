import { createAuthActions, createServerClient } from '@insforge/sdk/ssr'
import { cookies } from 'next/headers'
import { getInsForgeConfig } from '@/lib/insforge/config'

export async function getInsForgeServerClient() {
  return createServerClient({
    ...getInsForgeConfig(),
    cookies: await cookies(),
  })
}

export async function getInsForgeAuthActions() {
  return createAuthActions({
    ...getInsForgeConfig(),
    cookies: await cookies(),
  })
}
