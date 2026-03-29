# Ours - Project Context

## Overview
**Ours** is a private, feature-rich personal web application designed for couples to document their relationship journey, manage shared goals, and capture special moments. It provides a dedicated space for photos, messages, and collaborative todo lists.

## Tech Stack
- **Framework:** [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- **Language:** [TypeScript](https://www.typescriptlang.org)
- **Runtime:** [Node.js](https://nodejs.org) (v18+)
- **Database ORM:** [Prisma](https://www.prisma.io) (configured for SQLite/LibSQL)
- **Database:** [Turso](https://turso.tech) (LibSQL)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com), [Radix UI](https://www.radix-ui.com), [Shadcn/UI](https://ui.shadcn.com)
- **Icons:** [Lucide React](https://lucide.dev)
- **Authentication:** Custom session-based auth with `InviteCode` registration system.
- **Storage:** Cloudflare R2 / AWS S3 (via `@aws-sdk/client-s3`)
- **Data Fetching:** [SWR](https://swr.vercel.app), [Ky](https://github.com/sindresorhus/ky)
- **Validation:** [Zod](https://zod.dev)
- **Forms:** [React Hook Form](https://react-hook-form.com)
- **Package Manager:** [pnpm](https://pnpm.io/)

## Key Directories & Architecture
The project follows a modern, feature-based modular architecture:
- `app/`: Next.js App Router (pages, layouts, and API routes).
- `features/`: Core business logic organized by feature (Auth, Moments, Profile, Two-Dos).
  - Each feature contains its own `components/`, `hooks/`, and `models/`.
- `components/`: Shared UI components (Shadcn/UI in `components/ui/`) and providers.
- `lib/`: Shared utilities, API clients (Prisma, S3, Rate Limit), and environment config.
- `prisma/`: Database schema and migrations.
- `public/`: Static assets.
- `hooks/`: Global React hooks.

## Data Models
Main entities in `prisma/schema.prisma`:
- **User**: Core profile and auth data.
- **InviteCode**: Controls access to the application via an invite system.
- **Todo**: Shared tasks with priority and optional image keys.
- **MomentPhoto**: Shared photo gallery entries.
- **BulletinMessage**: Shared message board content.
- **Session**: Custom session management.

## Development Conventions
- **Feature-Based Organization:** Prefer putting feature-specific components, hooks, and types into `features/<feature-name>/` rather than global directories.
- **Type Safety:** Ensure all API responses and requests are typed using Zod schemas (found in `models/` within features).
- **Styling:** Use Tailwind 4 utility classes. Prefer Shadcn components for UI elements.
- **Data Fetching:** Use `SWR` for client-side data fetching and `Ky` for HTTP requests.
- **Environment Variables:** Access environment variables via `lib/env.ts` to ensure type-safe validation.
- **Authentication:** Protected routes should verify the session via `features/auth/session.ts` or middleware.

## Code Abstraction Rules

A function must justify its existence with real logic — transformation, error
handling, or branching. Do not extract functions that merely sequence or
forward calls, regardless of how many. If the function name teaches nothing
beyond what the call sites already make obvious, inline it.

**Before creating a function, ask:**
1. Does it contain real logic, or just sequence/forward calls?
2. Does its name tell the reader *what happens*, or do they still need to jump
   to the definition?
3. Is it reused, or just anticipating reuse that may never come?

If all three answers are "no" — don't create it.

**Patterns to avoid:**
- Wrappers with no added behavior: `getUser(id)` → `db.findUserById(id)`
- Sequential grouping with no conditionality: `init()` → `setupA(); setupB(); setupC()`
- Layers that add zero transformation, validation, or error handling

Abstraction should reduce complexity, not relocate it.

## Critical Files
- `package.json`: Project dependencies and scripts.
- `prisma/schema.prisma`: Source of truth for the database schema.
- `next.config.ts`: Next.js configuration.
- `.env`: Environment variables (Database URLs, R2 keys, etc.).
- `lib/database-client.ts`: Prisma client singleton.
- `lib/s3-client.ts`: S3/R2 storage client.
