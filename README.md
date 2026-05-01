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

## Errors

Capture exceptions and unhandled rejections as `$error` events. Errors live in the same event stream as your custom tracking, so an agent can correlate "errors spiked" with "revenue dropped" in a single MCP call.

**Browser, manual:**

```ts
import { captureError } from "@clamp-sh/analytics"

try {
  riskyOperation()
} catch (err) {
  captureError(err, { feature: "checkout", retry: 1 })
}
```

**Browser, auto-capture** (off by default; opt in to forward `window.onerror` + `unhandledrejection`):

```ts
init("proj_xxx", { captureErrors: true })
```

**Browser, explicit subpath import** (for tighter bundling control):

```ts
import { captureError, installErrorCapture } from "@clamp-sh/analytics/errors"
```

**Server:**

```ts
import { captureError } from "@clamp-sh/analytics/server"

try {
  await processWebhook(payload)
} catch (err) {
  await captureError(err, { anonymousId, context: { webhook: "stripe" } })
}
```

The error-capture machinery (browser side) lives in a separate chunk that lazy-loads on first use, so users who never capture errors pay zero bytes for it. A per-session client-side rate limit caps duplicate-message captures at 5 to prevent runaway loops from blowing through the event quota; the server adds a stable `error.fingerprint` at ingest so the same bug groups across occurrences regardless of which session reported it.

## Script tag

```html
<script src="https://cdn.jsdelivr.net/npm/@clamp-sh/analytics@0.2.0/dist/cdn.global.js"></script>
<script>
  clamp.init("proj_xxx")
</script>
```

## Custom events

Track any action with `track(name, properties)`. Properties are flat key-value pairs. Each value is a string, finite number, boolean, or `Money`.

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
import type { Money } from "@clamp-sh/analytics"

type Events = {
  signup: { plan: string; source: string }
  purchase: { plan: string; total: Money; tax: Money }
  feature_used: { name: string }
  invite_sent: { role: string }
}

init<Events>("proj_xxx")

track("signup", { plan: "pro", source: "homepage" })   // autocomplete
track("signup", { wrong: "field" })                     // type error
track("unknown_event")                                  // type error
```

Past a handful of events, declare them in [`event-schema.yaml`](https://github.com/clamp-sh/event-schema) and let the CLI generate the type — same compile-time safety, one source of truth across your codebase and your team.

Works the same way with the server SDK:

```ts
import { init, track } from "@clamp-sh/analytics/server"

init<Events>({ projectId: "proj_xxx", apiKey: "sk_proj_..." })

await track("purchase", {
  properties: {
    plan:  "pro",
    total: { amount: 49, currency: "USD" },
    tax:   { amount: 7.35, currency: "USD" },
  },
})
```

## Revenue

Attach a `Money` value to any event property to make it queryable by `revenue.sum`. Clamp never mixes currencies in a single sum.

```ts
import { track } from "@clamp-sh/analytics"

track("purchase", {
  plan:  "pro",
  total: { amount: 29.00, currency: "USD" },
  tax:   { amount: 4.35,  currency: "USD" },
})
```

Server-side (e.g. from a Stripe webhook):

```ts
import { track } from "@clamp-sh/analytics/server"

await track("checkout_completed", {
  anonymousId: session.client_reference_id,
  properties: {
    plan:  session.metadata.plan,
    total: { amount: session.amount_total / 100, currency: session.currency.toUpperCase() },
  },
})
```

Auto-tracked clicks can also carry money via `data-clamp-money-<key>`:

```html
<button
  data-clamp-event="purchase"
  data-clamp-plan="pro"
  data-clamp-money-total="29.00 USD"
  data-clamp-money-tax="4.35 USD"
>Buy</button>
```

Your agent can now ask questions like "which source drove the most revenue last month" or "how much did European traffic spend on the Pro plan".

## Properties limits

Event properties are `string → (string | Money)` maps. Arrays and arbitrary nested objects are rejected; only the `{ amount, currency }` shape is accepted for Money values.

| Constraint     | Limit    |
| -------------- | -------- |
| Max keys       | 20       |
| Key length     | 128 chars |
| Value length   | 512 chars (strings) |
| Currency       | 3-letter ISO 4217 code |
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
