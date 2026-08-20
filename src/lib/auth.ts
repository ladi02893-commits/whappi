import { cookies } from "next/headers"

// We initialize a minimal server-side representation of the Auth client
// just to get the session from Neon Auth if needed, or we just fetch manually.
const NEON_AUTH_URL = "https://ep-silent-cloud-axqp36sl.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth";

export async function getCurrentUser() {
    try {
        const cookieStore = await cookies();
        const headers = new Headers();
        cookieStore.getAll().forEach((cookie: any) => {
            headers.append('Cookie', `${cookie.name}=${cookie.value}`);
        });

        const res = await fetch(`${NEON_AUTH_URL}/get-session`, {
            headers
        });
        
        if (!res.ok) return null;
        const session = await res.json();
        return session.user || null;
    } catch (error) {
        console.error("Error fetching current user:", error);
        return null;
    }
}
