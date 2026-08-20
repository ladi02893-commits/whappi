import { createAuthClient } from "better-auth/react"

const NEON_AUTH_URL = "https://ep-silent-cloud-axqp36sl.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth";

export const authClient = createAuthClient({
    baseURL: NEON_AUTH_URL,
})
