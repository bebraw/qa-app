# ADR-032: Enable Worker Error Observability

**Status:** Implemented

**Date:** 2026-06-11

## Context

The panel app runs as a Cloudflare Worker with a Durable Object room. When a production reset crash occurred, the code path was small enough to reason about locally, but production evidence was limited to live `wrangler tail` output and deployment metadata. That made historical failures hard to diagnose after the fact.

Cloudflare Workers can persist observability logs, and unhandled exceptions can be logged before they are rethrown. The app needs enough production error context to debug route-level failures without logging request bodies, passcodes, auth cookies, or query-string notices.

## Decision

We will enable Worker observability in `wrangler.jsonc` with persisted invocation logs.

The Worker entry point and the `PanelRoom` Durable Object boundary will log unhandled errors before rethrowing them. Each log records only:

- source boundary: `worker` or `panel-room`
- request method
- URL pathname without query string
- Cloudflare Ray ID when present
- Cloudflare colo when present
- error name, message, and stack

The app must not log request bodies, form data, cookies, passcodes, auth headers, or query-string values in these boundary logs.

## Trigger

A production crash after moderator reset needed better operational evidence than the app currently emitted.

## Consequences

**Positive:**

- Future production crashes should leave searchable Cloudflare logs with route-level context.
- The original Worker error semantics remain intact because unhandled errors are rethrown.
- The logging boundary covers both top-level Worker failures and Durable Object room failures.

**Negative:**

- Persisted observability can retain operational metadata in Cloudflare for later review.
- Error messages and stacks may still include details from thrown exceptions, so code should avoid throwing secrets.

**Neutral:**

- This does not add a third-party logging dependency.
- This does not introduce a local log file or new repository write target.
- `wrangler tail --status error` remains useful for live debugging, but persisted observability becomes the default historical source.

## Alternatives Considered

### Rely Only On Cloudflare Runtime Error Logs

This keeps application code smaller, but runtime errors alone do not guarantee the route-level context needed to distinguish reset, hydration, asset, and live-fragment failures.

### Return Custom 500 Responses Instead Of Rethrowing

This could improve the browser response, but it would turn failed invocations into handled responses and make `--status error` less useful. Preserving the failed invocation status is more useful for production diagnosis.

### Add A Logging Service

This was rejected because the app is intentionally lightweight and already runs on Cloudflare. Native Worker observability is enough for the current operational need.
