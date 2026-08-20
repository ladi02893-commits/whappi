# WHAPPI

WHAPPI is an original, mobile-first, one-to-one realtime chat application built with Next.js and InsForge. It supports Gmail/password registration and sign-in, email verification, password recovery, a safe public user directory, friend requests, direct friendships, realtime conversations, private attachments, voice notes, one-shot location sharing, sender-owned message deletion, per-user chat clearing, and server-authoritative disappearing messages.

WHAPPI does **not** claim end-to-end encryption. It deliberately excludes groups, calls, stories, channels, payments, public posts, and AI chat.

## Stack

- Next.js App Router, React, strict TypeScript
- Tailwind CSS 3.4, shadcn/ui-style primitives, Lucide icons
- InsForge Auth, PostgreSQL, RLS, Realtime, private Storage, Edge Functions, and Schedules
- `@insforge/sdk` and `@insforge/sdk/ssr`
- Zod, React Hook Form, `emoji-picker-react`
- MediaRecorder, Geolocation, MapLibre GL, and OpenStreetMap
- Vitest and Playwright

## Prerequisites

- Node.js 20.9 or newer
- npm
- An InsForge account and project
- Access to the linked InsForge project

Install dependencies:

```bash
npm install
```

## InsForge project setup

This repository is already structured for an InsForge project. The local link file is intentionally ignored because it identifies a developer's selected project.

```bash
npx -y @insforge/cli login
npx -y @insforge/cli current
```

To create or link a different project:

```bash
npx -y @insforge/cli create
# or
npx -y @insforge/cli link
```

Review project memory before changing backend infrastructure:

```bash
npx -y @insforge/cli memory list
```

For risky schema changes, create a schema-only branch, apply and test there, then merge it using the InsForge branch workflow.

## Environment variables

Copy `.env.example` to `.env.local` and fill it from `npx -y @insforge/cli current` and `npx -y @insforge/cli secrets get anon-key`:

```dotenv
NEXT_PUBLIC_INSFORGE_URL=https://your-project.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=your_public_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Only the public anon key belongs in the web application. Never expose an InsForge API/admin key through a `NEXT_PUBLIC_` variable. Refresh tokens are managed by the official SSR client and remain in secure HTTP-only cookies.

## Database, RLS, and realtime

Apply the versioned migrations in order:

```bash
npx -y @insforge/cli db migrations list
npx -y @insforge/cli db migrations up --to 20260820092145
```

The migrations create:

- normalized profiles, requests, friendships, direct conversations, members, messages, attachments, receipts, and cleanup queue tables;
- canonical friendship and direct-conversation pairs, validation constraints, indexes, and server-time retention snapshots;
- grants and RLS on every user-owned table;
- `SECURITY DEFINER` RPCs for profile creation, friendship transitions, messaging, sender-owned deletion, receipt batching, retention changes, clear-chat, and cleanup claiming;
- membership-authorized `conversation:{uuid}` and user-authorized `user:{uuid}` realtime channels and publish triggers;
- private storage object policies tied to conversation membership, live message state, and each member's clear-chat cutoff.

Do not run the migrations with an anon key. The application itself uses only the anon key and the authenticated user's session.

## Private storage

Create both buckets as private:

```bash
npx -y @insforge/cli storage create-bucket chat-media --private
npx -y @insforge/cli storage create-bucket chat-documents --private
```

Objects use randomized paths shaped like `conversations/{conversationId}/{messageId}/{randomName}`. The browser-supplied filename is metadata only. The client and the `send_message` RPC independently validate bucket, MIME type, size, and key ownership.

Current limits are 15 MiB for images, 50 MiB for videos, 15 MiB for voice notes, and 25 MiB for documents.

## Expiration worker and schedule

Create a strong server-only secret and deploy the cleanup function:

```bash
npx -y @insforge/cli secrets add WHAPPI_CLEANUP_SECRET <strong-random-value>
npx -y @insforge/cli functions deploy cleanup-expired --file functions/cleanup-expired.ts --name "WHAPPI expired-message cleanup"
```

Create a once-per-minute POST schedule targeting the function compatibility path shown by the deployment. Use a secret reference rather than a literal value:

```bash
npx -y @insforge/cli schedules create --name "WHAPPI expired-message cleanup" --cron "* * * * *" --url "https://YOUR_PROJECT_HOST/functions/cleanup-expired" --method POST --headers '{"x-whappi-cleanup":"${{secrets.WHAPPI_CLEANUP_SECRET}}"}' --body '{}'
```

Verify it:

```bash
npx -y @insforge/cli schedules list
npx -y @insforge/cli schedules logs <schedule-id> --limit 5
```

The worker atomically claims bounded batches, scrubs expired content, deletes private objects by storage key, retries failed object deletions, and emits realtime expiration events. Normal message queries hide expired records even if physical cleanup is delayed.

## Email/password Auth configuration

WHAPPI accepts Gmail addresses and uses InsForge Auth for password storage, verification, sessions, and recovery. The committed `insforge.toml` configures:

- signup enabled;
- required email verification using a 6-digit code;
- password reset using a 6-digit code;
- minimum 8 characters with uppercase, lowercase, and a number.

Apply and verify the configuration:

```bash
npx -y @insforge/cli config apply --file insforge.toml --dry-run
npx -y @insforge/cli config apply --file insforge.toml --auto-approve
npx -y @insforge/cli metadata --json
```

Verification and reset emails use InsForge's built-in Auth email delivery. Passwords and reset tokens are never stored in WHAPPI's public profile or chat tables. Refresh tokens remain in secure HTTP-only cookies.

## Local development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `/chat` is protected by session middleware and redirects anonymous visitors to `/login`.

## Tests and verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If a managed workstation already has Chrome and cannot download Playwright's
browser bundle, set `PLAYWRIGHT_EXECUTABLE_PATH` to the Chrome executable for
that test run. CI continues to use Playwright's bundled Chromium by default.

The real-backend RLS suite is opt-in because it creates disposable users and data. Run it only on an isolated InsForge branch, temporarily allowing fixture signup if required by that branch:

```bash
RUN_INSFORGE_INTEGRATION=true npm run test:integration
```

The integration suite uses three distinct user sessions and verifies private conversation isolation, active-friend message authorization, request ownership, private attachment access, receipt ownership, after-view hiding, uniqueness, and scheduled storage deletion. Restore normal Auth configuration immediately after the run.

Authenticated Playwright cases require an authenticated storage state:

```bash
PLAYWRIGHT_AUTH_STATE=playwright/.auth/user.json npm run test:e2e
```

Without it, the anonymous authentication cases run and authenticated cases are explicitly skipped rather than mocked.

## Production deployment

1. Apply or merge the tested migrations to the production project.
2. Create the two private buckets, deploy the Edge Function, create the server-only secret, and start the minute schedule.
3. Apply `insforge.toml` with production HTTPS origins and redirects:

   ```bash
   npx -y @insforge/cli config apply --file insforge.toml --dry-run
   npx -y @insforge/cli config apply --file insforge.toml --auto-approve
   ```

4. Set the three web environment variables in the hosting environment.
5. Confirm verification and password-reset email delivery from the production origin.
6. Build and deploy the Next.js application:

   ```bash
   npm ci
   npm run build
   npx -y @insforge/cli deployments deploy .
   ```

7. Re-run route protection, authorized storage, realtime, and expiration smoke tests against the deployed HTTPS origin. Microphone and geolocation APIs require a secure production context.

## Security notes

- Public directory rows contain profile-safe fields only—never email addresses, tokens, or private Auth records.
- RLS and RPC checks are the authorization boundary; hidden buttons are not treated as security controls.
- New messages require both conversation membership and a still-active friendship. Unfriending preserves old history but prevents future sends.
- `cleared_at` hides history per member without deleting the other participant's view.
- A user can permanently delete only their own live, non-system messages. The database scrubs their content immediately for both participants and queues any private attachment for privileged cleanup.
- Text renders as text, links are limited to HTTP/HTTPS, and external links use `noopener noreferrer`. WHAPPI performs no link crawling or HTML execution.
- Attachment buckets are private; access is authorized by conversation membership, and the admin credential never reaches the client.
- Server/database time controls retention. A sender viewing their own message cannot start an after-view timer, and repeat views cannot reset it.
- This application is not end-to-end encrypted. InsForge and the application backend can process message content as required for delivery and retention.

## Known limitations

- Authenticated browser automation needs a saved storage state; the repository does not commit sessions or credentials.
- Upload progress is represented by cancellable validation/upload/finalization phases because the current SDK upload method does not expose byte-level progress callbacks.
- OpenStreetMap tiles are loaded from the public tile service. A high-traffic deployment should use a production tile provider consistent with OpenStreetMap's usage policy.
- The product scope is one-to-one chat only and makes no end-to-end encryption claim.
