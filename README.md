<p align="center">
  <a href="https://clamp.sh">
    <img src="https://raw.githubusercontent.com/clamp-sh/analytics/main/.github/banner.png" alt="Clamp" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@clamp-sh/analytics"><img src="https://img.shields.io/npm/v/@clamp-sh/analytics?style=flat-square&color=B8E847&labelColor=1a1a1a" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@clamp-sh/analytics"><img src="https://img.shields.io/npm/dm/@clamp-sh/analytics?style=flat-square&color=B8E847&labelColor=1a1a1a" alt="npm downloads" /></a>
  <a href="https://bundlephobia.com/package/@clamp-sh/analytics"><img src="https://img.shields.io/bundlephobia/minzip/@clamp-sh/analytics?style=flat-square&color=B8E847&labelColor=1a1a1a&label=size" alt="bundle size" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@clamp-sh/analytics?style=flat-square&color=B8E847&labelColor=1a1a1a" alt="license" /></a>
</p>

# @clamp-sh/analytics

Analytics SDK for [Clamp](https://clamp.sh), agentic analytics your coding agent can read, query, and act on. Track pageviews, custom events, and server-side actions. No cookies, no personal data collected, no consent banner required.

## Install

```bash
npm install @clamp-sh/analytics
```

## Browser

```ts
import { init, track, getAnonymousId } from "@clamp-sh/analytics"

init("proj_xxx")

// Custom events
track("signup", { plan: "pro" })

// Get visitor ID (for linking server-side events)
const anonId = getAnonymousId()
```

After `init()`, pageviews are tracked automatically, including SPA navigations.

## React

```tsx
import { Analytics } from "@clamp-sh/analytics/react"

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics projectId="proj_xxx" />
      </body>
    </html>
  )
}
```

Add to your root layout. Pageviews are tracked automatically. Use `track()` from `@clamp-sh/analytics` anywhere in your app for custom events.

## Server

```ts
import { init, track } from "@clamp-sh/analytics/server"

init({ projectId: "proj_xxx", apiKey: "sk_proj_..." })

await track("account_created", {
  anonymousId: "anon_abc123",
  properties: { plan: "pro" },
})
```

Server events require an API key (found in your project settings).

## Script tag

```html
<script src="https://cdn.jsdelivr.net/npm/@clamp-sh/analytics@0.2.0/dist/cdn.global.js"></script>
<script>
  clamp.init("proj_xxx")
</script>
```

## Custom events

Track any action with `track(name, properties)`. Properties are flat string key-value pairs.

```ts
import { track } from "@clamp-sh/analytics"

track("signup", { plan: "pro", source: "pricing_page" })
track("feature_used", { name: "csv_export" })
track("invite_sent", { role: "editor", team: "acme" })
```

On the server:

```ts
import { track } from "@clamp-sh/analytics/server"

await track("subscription_created", {
  anonymousId: "anon_abc123",
  properties: { plan: "pro", interval: "monthly" },
})
```

Pageviews are tracked automatically. Everything else goes through `track()`.

## Typed events

Define your event map once and get autocomplete and type checking across your app. Zero runtime cost.

```ts
type Events = {
  signup: { plan: string; source: string }
  purchase: { amount: string; currency: string }
  feature_used: { name: string }
  invite_sent: { role: string }
}

init<Events>("proj_xxx")

track("signup", { plan: "pro", source: "homepage" })   // autocomplete
track("signup", { wrong: "field" })                     // type error
track("unknown_event")                                  // type error
```

Works the same way with the server SDK:

```ts
import { init, track } from "@clamp-sh/analytics/server"

init<Events>({ projectId: "proj_xxx", apiKey: "sk_proj_..." })

await track("purchase", {
  properties: { amount: "49", currency: "usd" },
})
```

## Properties limits

Event properties are flat `string → string` maps. Nested objects, arrays, and non-string values are rejected.

| Constraint     | Limit    |
| -------------- | -------- |
| Max keys       | 20       |
| Key length     | 128 chars |
| Value length   | 512 chars |
| Payload size   | 64 KB    |

## Debug mode

Log every tracked event, pageview, and flush to the browser console.

```ts
init("proj_xxx", { debug: true })
```

Or with React:

```tsx
<Analytics projectId="proj_xxx" debug />
```

Console output looks like:

```
[clamp] Initialized { projectId: "proj_xxx", endpoint: "https://api.clamp.sh", ... }
[clamp] track: pageview {}
[clamp] track: signup { plan: "pro" }
[clamp] flush: 2 event(s)
```

Disable before deploying to production.

## Examples

### Track signups with plan info

```ts
track("signup", { plan: "pro", source: "pricing_page" })
```

### Track feature usage

```ts
track("feature_used", { name: "csv_export" })
```

### Track button clicks

```tsx
<button onClick={() => track("cta_clicked", { label: "Get started", page: "/pricing" })}>
  Get started
</button>
```

### Link browser visitor to server events

Pass the anonymous ID from the browser to your API, then include it in server-side events to connect the two.

```ts
// Browser: send anonymous ID with your API call
const anonId = getAnonymousId()
await fetch("/api/checkout", {
  method: "POST",
  body: JSON.stringify({ plan: "pro", anonId }),
})
```

```ts
// Server: include it in the event
await track("checkout_completed", {
  anonymousId: req.body.anonId,
  properties: { plan: "pro", amount: "49" },
})
```

### Track form submissions

```tsx
function ContactForm() {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    track("form_submitted", { form: "contact", page: location.pathname })
  }
  return <form onSubmit={handleSubmit}>...</form>
}
```

### Next.js App Router

```tsx
// app/layout.tsx
import { Analytics } from "@clamp-sh/analytics/react"

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics projectId="proj_xxx" />
      </body>
    </html>
  )
}

// app/pricing/page.tsx (client component)
"use client"
import { track } from "@clamp-sh/analytics"

export default function Pricing() {
  return (
    <button onClick={() => track("plan_selected", { plan: "growth" })}>
      Choose Growth
    </button>
  )
}
```

### Next.js Server Actions

```ts
// app/actions.ts
"use server"
import { track } from "@clamp-sh/analytics/server"

export async function createTeam(name: string, anonId: string) {
  const team = await db.teams.create({ name })
  await track("team_created", {
    anonymousId: anonId,
    properties: { team_id: team.id },
  })
  return team
}
```

### Express / Node.js backend

```ts
import express from "express"
import { init, track } from "@clamp-sh/analytics/server"

init({ projectId: "proj_xxx", apiKey: "sk_proj_..." })

const app = express()

app.post("/api/subscribe", async (req, res) => {
  await track("subscription_started", {
    anonymousId: req.body.anonId,
    properties: { plan: req.body.plan },
  })
  res.json({ ok: true })
})
```

## License

MIT
