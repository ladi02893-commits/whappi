import { createBrowserClient } from '@insforge/sdk/ssr'
import { getInsForgeConfig } from '@/lib/insforge/config'

let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function getInsForgeBrowserClient() {
  browserClient ??= createBrowserClient(getInsForgeConfig())
  return browserClient
}
