# FamChat Platform - Development Guide

## Reference Project

UI patterns, Tailwind conventions, and architecture follow **doordrop/platform** (`~/dev/doordrop/platform`). When in doubt about styling or structure, check that project.

## Project Structure

```
platform/
├── web/              # React web application
├── server/           # Node.js WebSocket server
└── shared/           # Shared types (flat index.ts)
```

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 3 (dark theme, utility-first, no inline styles)
- Firebase (Auth, Firestore, Hosting)
- WebSocket server for real-time messaging
- pnpm monorepo with workspaces

## Commands

```bash
pnpm dev                    # Start web dev server
pnpm -r run type:check      # TypeScript type checking (all packages)
pnpm --filter web build     # Production build
pnpm --filter web lint       # ESLint
```

## Deployment

```bash
firebase deploy --only firestore:rules    # Deploy Firestore rules
firebase deploy --only hosting            # Deploy web app
```

## UI Conventions

- **Dark theme by default** — black/gray-900 backgrounds, gray-100 text
- **Emerald primary** — `bg-emerald-600 hover:bg-emerald-700` for buttons
- **No inline styles** — all styling via Tailwind utility classes
- **Consistent patterns** — `rounded-lg`, `text-sm`, `transition-colors`, `focus:ring-2 focus:ring-emerald-500`
- Inputs: `border border-gray-700 rounded-lg bg-gray-800 text-gray-100`
- Borders: `border-gray-800` for dividers, `border-gray-700` for inputs

## Firestore Security

- Rules in `firestore.rules` at repo root
- All writes validated with `keys().hasOnly(...)` to prevent extra fields
- Contacts: owner can read/delete; either party can create (for mutual add on accept)
- Contact requests: sender creates/updates, recipient reads/deletes

## Shared Types

All shared types live in `shared/src/index.ts` (flat file, not subdirectories). Import as `@famchat/shared`.
