import { createRefreshAuthRouter } from '@insforge/sdk/ssr'
import { getInsForgeConfig } from '@/lib/insforge/config'

export const { POST } = createRefreshAuthRouter(getInsForgeConfig())
