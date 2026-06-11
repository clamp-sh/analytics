<div align="center">
  <a href="https://clamp.sh"><img src="https://clamp.sh/assets/repo-banner.png" alt="Clamp Analytics — privacy-first product analytics with a built-in MCP server" width="800" /></a>
</div>

<br />

<p align="center">
  <a href="https://www.npmjs.com/package/@clamp-sh/analytics"><img src="https://img.shields.io/npm/v/@clamp-sh/analytics?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@clamp-sh/analytics"><img src="https://img.shields.io/npm/dm/@clamp-sh/analytics?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="npm downloads" /></a>
  <a href="https://bundlephobia.com/package/@clamp-sh/analytics"><img src="https://img.shields.io/bundlephobia/minzip/@clamp-sh/analytics?style=flat-square&color=8cc1c5&labelColor=1a1a1a&label=size" alt="bundle size" /></a>
  <a href="https://www.npmjs.com/package/@clamp-sh/analytics"><img src="https://img.shields.io/npm/types/@clamp-sh/analytics?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="types: TypeScript" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@clamp-sh/analytics?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="license" /></a>
</p>

# @clamp-sh/analytics

Web analytics SDK for [Clamp Analytics](https://clamp.sh) — a privacy-first product analytics platform with a built-in [MCP](https://modelcontextprotocol.io) server, so the same events you track with this SDK are queryable by Claude, Cursor, VS Code, and any other Model Context Protocol client.

Auto-pageviews, sessions, custom events, `identify` for logged-in users, typed `revenue()` for subscriptions and one-time purchases, and error capture in under 2 KB gzipped. No cookies, no personal data, no consent banner. Works in the browser, on the server, with React and Next.js, and via a one-tag CDN install for hosted platforms.

Hosted at [clamp.sh](https://clamp.sh/signup) — free tier covers 100k events/month. MIT SDK; the platform itself is hosted by Clamp.

## Install

```bash
npm install @clamp-sh/analytics
```

Or paste one script tag for hosted platforms — see [Script tag (no build step)](#script-tag-no-build-step) below.

## Framework support

Install guides at [clamp.sh/docs/install](https://clamp.sh/docs/install) and [clamp.sh/docs/integrations](https://clamp.sh/docs/integrations):

| Path | Install |
|---|---|
| Next.js (App Router + Pages) | [`/docs/install/nextjs`](https://clamp.sh/docs/install/nextjs) |
| Vite + React | [`/docs/install/vite-react`](https://clamp.sh/docs/install/vite-react) |
| Nuxt 3 | [`/docs/install/nuxt`](https://clamp.sh/docs/install/nuxt) |
| SvelteKit | [`/docs/install/sveltekit`](https://clamp.sh/docs/install/sveltekit) |
| Astro | [`/docs/install/astro`](https://clamp.sh/docs/install/astro) |
| Webflow | [`/docs/integrations/webflow`](https://clamp.sh/docs/integrations/webflow) |
| Shopify | [`/docs/integrations/shopify`](https://clamp.sh/docs/integrations/shopify) |
| WordPress | [`/docs/integrations/wordpress`](https://clamp.sh/docs/integrations/wordpress) |
| Squarespace | [`/docs/integrations/squarespace`](https://clamp.sh/docs/integrations/squarespace) |
| Ghost | [`/docs/integrations/ghost`](https://clamp.sh/docs/integrations/ghost) |
| Framer | [`/docs/integrations/framer`](https://clamp.sh/docs/integrations/framer) |
| Wix | [`/docs/integrations/wix`](https://clamp.sh/docs/integrations/wix) |
| Carrd, Notion, Mintlify, Docusaurus, Hugo, Jekyll, Eleventy | [`/docs/integrations`](https://clamp.sh/docs/integrations) |

## Script tag (no build step)

For sites you can't `npm install` into — Webflow, Shopify, WordPress, Squarespace, Ghost, Framer, Wix, Notion-as-site services, and others — drop one script tag in the page `<head>`. The SDK reads the project ID from the tag's data attribute and starts tracking pageviews and sessions automatically.

```html
<!-- Clamp Analytics — https://clamp.sh -->
<script
  src="https://cdn.clamp.sh/v0/cdn.global.js"
  data-clamp-project="proj_xxx"
  defer
></script>
```

Replace `proj_xxx` with your project ID from the [Clamp dashboard](https://clamp.sh/dashboard). Platform-specific install guides live at [clamp.sh/docs/integrations](https://clamp.sh/docs/integrations).

### Opt into auto-tracking extensions

Add `data-clamp-extensions` (comma-separated):

```html
<script
  src="https://cdn.clamp.sh/v0/cdn.global.js"
  data-clamp-project="proj_xxx"
  data-clamp-extensions="outbound-links,downloads"
  defer
></script>
```

Available: `outbound-links`, `downloads`, `data-attributes`, `section-views`, `web-vitals`, `not-found`. See the [extensions reference](https://clamp.sh/docs/sdk/extensions).

### Manual init (for ESM or custom configuration)

If you need programmatic configuration — endpoint override, excluded paths, error capture toggle — use the manual API instead of the data attribute:

```html
<script src="https://cdn.clamp.sh/v0/cdn.global.js"></script>
<script>
  clamp.init("proj_xxx", {
    excludePaths: ["/dashboard"],
    captureErrors: true,
  });
</script>
```

Or import the ESM build directly:

```ts
import { init } from "@clamp-sh/analytics";
init("proj_xxx", { excludePaths: ["/dashboard"] });
```

## Browser

```ts
import { init, track, identify, reset, revenue, getAnonymousId, getUserId } from "@clamp-sh/analytics"

init("proj_xxx")

// Custom events
track("signup", { plan: "pro" })

// Bind the anonymous visitor to a known user (persists across sessions)
identify(user.id, { email: user.email, plan: user.plan })

// Record a payment
revenue({ amount: 29, currency: "USD", plan: "pro", billing: "monthly" })

// Logout — clears userId, rotates anonymous + session IDs
reset()

// Read IDs
getAnonymousId()  // rotating anon ID
getUserId()       // null before identify(), or the bound userId
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

await track("invite_accepted", {
  anonymousId: "anon_abc123",
  properties: {
    team_id: "team_42",
    role: "editor",
  },
})
```

Pageviews are tracked automatically. Everything else goes through `track()`, or `revenue()` for payments (see [Revenue](#revenue)). The canonical revenue event names (`subscription_started`, `purchase`, `refund_issued`, etc.) always go through `revenue()`, not `track()` — only events emitted through `revenue()` carry `mrr_delta` and land on the Revenue tab with the `$`-prefixed wire name the dashboard and MCP tools query against.

## Identify users

Call `clamp.identify(userId, traits?)` after login or signup. The userId persists across reloads and tabs, and attaches to every subsequent event automatically, so events from the same user across devices and sessions land under one identity.

```ts
import { identify, reset } from "@clamp-sh/analytics"

// After auth succeeds:
identify(user.id, {
  email: user.email,
  plan: user.plan,
  signup_date: user.createdAt,
})

// On logout — clears userId, rotates anonymous + session IDs:
reset()
```

Traits are optional user attributes sent once as an `$identify` event. Use them for slicing in the dashboard ("customers on the Pro plan", "users who signed up this month"). Never send PII (raw email beyond hashing, addresses, payment details).

Call `reset()` on signout, not on session expiry — it rotates the anonymous + session IDs so the next visitor on this device isn't conflated with the one who logged out.

## Typed events

Define your event map once and get autocomplete and type checking across your app. Zero runtime cost.

```ts
import type { Money } from "@clamp-sh/analytics"

type Events = {
  signup: { plan: string; source: string }
  checkout_completed: { plan: string; total: Money; tax: Money }
  feature_used: { name: string }
  invite_sent: { role: string }
}

init<Events>("proj_xxx")

track("signup", { plan: "pro", source: "homepage" })   // autocomplete
track("signup", { wrong: "field" })                     // type error
track("unknown_event")                                  // type error
```

The typed event map covers custom `track()` events only. Canonical revenue names (`subscription_started`, `purchase`, `refund_issued`, etc.) go through `revenue()`, which is already typed via the `RevenueArgs` discriminated union.

Past a handful of events, declare them in [`event-schema.yaml`](https://github.com/clamp-sh/event-schema) and let the CLI generate the type — same compile-time safety, one source of truth across your codebase and your team.

Works the same way with the server SDK:

```ts
import { init, track } from "@clamp-sh/analytics/server"

init<Events>({ projectId: "proj_xxx", apiKey: "sk_proj_..." })

await track("checkout_completed", {
  properties: {
    plan:  "pro",
    total: { amount: 49, currency: "USD" },
    tax:   { amount: 7.35, currency: "USD" },
  },
})
```

## Revenue

Call `clamp.revenue()` wherever a customer pays. The SDK emits a typed event with the canonical `total` Money property, reserved `plan` / `billing_period` / `subscription_id` / `mrr_delta` properties, and an inferred event name (`subscription_started` for monthly or annual, `purchase` for one_time).

```ts
import { revenue } from "@clamp-sh/analytics"

// Subscription start — mrr_delta inferred as 29.
revenue({
  amount: 29,
  currency: "USD",
  plan: "pro",
  billing: "monthly",
  subscriptionId: sub.id,
})

// Annual subscription — mrr_delta inferred as 290 / 12 = 24.17.
revenue({
  amount: 290,
  currency: "USD",
  plan: "pro",
  billing: "annual",
  subscriptionId: sub.id,
})

// One-time purchase — mrr_delta is 0.
revenue({
  amount: 49,
  currency: "USD",
  billing: "one_time",
  product: "Template Pack",
})
```

### Three shapes, type-enforced

`RevenueArgs` is a discriminated union — TypeScript rejects mixing the two breakdown dimensions at compile time (no `purchase` events with `plan`; no `subscription_*` events with `product`; no `{ amount: 29 }` without either).

**SubscriptionRevenueArgs** — for `subscription_started` / `_renewed` / `_upgraded` / `_downgraded` / `_canceled` / `_paused` / `_resumed`. `plan` required, `product` forbidden, `billing` is one of `"monthly" | "annual" | "weekly"`.

**PurchaseRevenueArgs** — for `purchase`. `product` required; `plan` and `subscriptionId` forbidden; `billing` is `"one_time"`.

**RefundRevenueArgs** — for `refund_issued`. Permissive — pass `plan` + `subscriptionId` for a subscription refund, or `product` for a one-time refund. `event` is required here (no sensible default).

| Field | Type | Notes |
|---|---|---|
| `amount` | `number` | Major units (29 for $29, not 2900). For cancel, typically 0 — pair with `previousAmount`. For refund, negative. |
| `currency` | `string` | ISO 4217 ("USD", "EUR", "JPY"). Defaults to `"USD"`. |
| `billing` | `BillingPeriod` | Narrowed by shape — subs are `"monthly" \| "annual" \| "weekly"`; purchase is `"one_time"`; refund accepts any. |
| `event` | canonical name | Optional except on `RefundRevenueArgs`. Defaults follow the shape: `subscription_started` for subs, `purchase` for one-time. |
| `plan` | `string` | Required for subscription events, forbidden on purchase. Drives the Plans card. |
| `product` | `string` | Required for purchase, forbidden on subscription events. Drives the Products card. |
| `subscriptionId` | `string` | Allowed on sub events and refunds; forbidden on purchase. Links events across renew, upgrade, cancel. |
| `previousAmount` | `number` | Required on sub events where the SDK derives `mrr_delta` from the diff (upgrade, downgrade, canceled). |
| `mrrDelta` | `number` | Override the inferred delta. Use for partial refunds or other cases the inference table doesn't fit. |

`mrr_delta` is derived from the event name plus billing:

| Event | mrr_delta inferred as |
|---|---|
| `subscription_started` | `+amount` (monthly) or `+amount/12` (annual) |
| `subscription_renewed` | `0` (balance unchanged, just cash collected) |
| `subscription_upgraded` | `new_mrr − previous_mrr` (requires `previousAmount`) |
| `subscription_downgraded` | same shape, negative diff |
| `subscription_canceled` | `−amount` (monthly) or `−amount/12` (annual) |
| `purchase` / `refund_issued` | `0` (not recurring) |

Anything billed `one_time` is always `0` regardless of event. Anything recurring with an unrecognised event name defaults to `+amount` so a custom event like `subscription_resumed` does the sensible thing without configuration. Override `mrrDelta` directly for the long-tail cases.

```ts
// Upgrade from $29 to $89 — mrr_delta inferred as +60.
revenue({
  amount: 89,
  previousAmount: 29,
  currency: "USD",
  event: "subscription_upgraded",
  plan: "growth",
  billing: "monthly",
})

// Cancellation — no cash collected. previousAmount drives mrr_delta = -29.
revenue({
  amount: 0,
  previousAmount: 29,               // what they WERE paying
  currency: "USD",
  event: "subscription_canceled",
  plan: "pro",
  billing: "monthly",
  subscriptionId: sub.id,
})

// Renewal — mrr_delta inferred as 0 (cash collected, balance unchanged).
revenue({
  amount: 29,
  currency: "USD",
  event: "subscription_renewed",
  plan: "pro",
  billing: "monthly",
  subscriptionId: sub.id,
})
```

### Canonical subscription events

`revenue()` is strict about event names. The Revenue tab, MCP tools, and analytics-skills pack all assume the names below, so the `CanonicalRevenueEvent` type only allows these — TypeScript catches anything else at compile time, and the runtime guard rejects non-canonical names from JS callers with a typo suggestion when one exists (`subscription_created` → `subscription_started`, `checkout_completed` → `purchase`, etc.).

| Public name (passed to `revenue()`) | Wire name (sent to ingest, used in MCP queries / dashboard filters) | When to send |
|---|---|---|
| `subscription_started`   | `$subscription_started`   | First paid invoice on a new subscription |
| `subscription_renewed`   | `$subscription_renewed`   | Recurring renewal invoice paid |
| `subscription_upgraded`  | `$subscription_upgraded`  | Plan change to a higher tier |
| `subscription_downgraded`| `$subscription_downgraded`| Plan change to a lower tier |
| `subscription_canceled`  | `$subscription_canceled`  | Subscription ends |
| `subscription_paused`    | `$subscription_paused`    | Subscription paused |
| `subscription_resumed`   | `$subscription_resumed`   | Subscription resumed |
| `purchase`               | `$purchase`               | One-shot purchase (default for `billing: "one_time"`) |
| `refund_issued`          | `$refund_issued`          | Refund webhook fires |

User code always passes the un-prefixed public name to `revenue()`. The SDK translates to the `$`-prefixed wire name before emission. The wire name is what shows up in the events table, in MCP queries (e.g. `revenue.retention({ cohort_event: "$subscription_started" })`), and in dashboard filter values.

If you need a custom revenue-shaped event, drop to `track()` with a Money property + `mrr_delta` numeric prop:

```ts
track("trial_started", {
  total: { amount: 0, currency: "USD" },
  plan: "pro",
  mrr_delta: 0,
  billing_period: "monthly",
})
```

### TypeScript

```ts
import type { Money, BillingPeriod, RevenueArgs } from "@clamp-sh/analytics"

const args: RevenueArgs = {
  amount: 29,
  currency: "USD",
  plan: "pro",
  billing: "monthly" satisfies BillingPeriod,
}
```

### Server-side (e.g. from a Stripe webhook)

```ts
import { revenue } from "@clamp-sh/analytics/server"

await revenue({
  userId: customer.id,                         // bind to the identified user
  amount: invoice.amount_paid / 100,           // Stripe ships cents
  currency: invoice.currency.toUpperCase(),
  event: "subscription_renewed",
  plan: sub.metadata.plan,
  billing: "monthly",
  subscriptionId: sub.id,
})
```

### Raw money on custom events

For anything outside the canonical revenue events, `track()` still accepts any property whose value is a `Money` object. Use this for tax, discount, refund-attribution amounts, or anything else `revenue()` doesn't model directly.

```ts
track("checkout_completed", {
  plan: "pro",
  total: { amount: 49, currency: "USD" },
  tax:   { amount: 7.35, currency: "USD" },
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

Your agent can now ask questions like "which source drove the most revenue last month", "what's our MRR this quarter", or "are subscribers expanding or contracting?" — see [the MCP revenue tools](https://clamp.sh/docs/mcp/tools#revenue) for the full set.

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

## Extensions

Opt-in auto-tracking features. Each extension lives at its own subpath and is dynamic-imported only when enabled, so projects that turn on one extension only download that chunk:

```ts
init("proj_xxx", {
  extensions: {
    outboundLinks: true,                                  // outbound_click events
    downloads: true,                                      // download events
    downloads: { extensions: ["pdf", "zip"] },            // (override file list)
    notFound: true,                                       // 404 events
    dataAttributes: true,                                 // any custom event from `data-clamp-event`
    webVitals: true,                                      // web_vital events (peer dep: `web-vitals`)
    webVitals: { sampleRate: 0.1 },                       // (10% sample)
    sectionViews: true,                                   // section_viewed events
    sectionViews: { threshold: 0.6 },                     // (60% visibility)
  }
})
```

Each is also importable directly for advanced use:

```ts
import { installOutboundLinks } from "@clamp-sh/analytics/extensions/outbound-links"
import { installDownloads }     from "@clamp-sh/analytics/extensions/downloads"
import { install404 }           from "@clamp-sh/analytics/extensions/not-found"
import { installDataAttributes } from "@clamp-sh/analytics/extensions/data-attributes"
import { installWebVitals }     from "@clamp-sh/analytics/extensions/web-vitals"
import { installSectionViews }  from "@clamp-sh/analytics/extensions/section-views"
```

See [the docs](https://clamp.sh/docs/sdk/extensions) for the per-extension event schema and edge cases.

## Examples

### Track signups with plan info

```ts
track("signup", { plan: "pro", source: "pricing_page" })
```

### Track feature usage

```ts
track("feature_used", { name: "csv_export" })
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
import { init, revenue } from "@clamp-sh/analytics/server"

init({ projectId: "proj_xxx", apiKey: "sk_proj_..." })

const app = express()

app.post("/api/subscribe", async (req, res) => {
  // subscription_started is a canonical revenue event — route through revenue()
  // so mrr_delta and the Revenue tab cards populate correctly.
  await revenue({
    anonymousId: req.body.anonId,
    amount: req.body.amount,
    currency: "USD",
    plan: req.body.plan,
    billing: "monthly",
    subscriptionId: req.body.subscriptionId,
  })
  res.json({ ok: true })
})
```

## Reference

Property limits, debug mode, the full API surface, and edge-case behaviour live in the [SDK reference docs](https://clamp.sh/docs/sdk/reference).

## License

MIT
