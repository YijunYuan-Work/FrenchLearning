# Daily Learning Persistence

## Day and ownership

Learning goals, Quiz, and Study share the user's **local calendar day**. A midnight
timer and resume checks (visibility, focus, pageshow, and a one-minute clock check)
detect a new day without refreshing. Only the learning views remount; imports and
the editor remain open. Each saved session retains its original day. Old-day
completion callbacks cannot complete today's goals or submit yesterday's session
under today's key. Old records are not deleted. Already-started saves can finish
under their original account and day; queued work is invalidated on account change.

AI quota remains a separate **UTC day**, unchanged by this feature.

## Save contract

- Hydration establishes a baseline, not a write. Failed reads never enable default
  writes. Learning views still wait for notes, daily state, and settings to load.
- Completed goals only move from false to true. Local saves merge under a Web Lock;
  cloud upserts send only completed flags, so independent completions do not unset
  each other.
- Each session field has one in-flight save. New changes are coalesced behind it.
  Quiz and Study save independently; they do not replace each other's state.
- Local session saves compare the last persisted JSON under a per-account/day
  Web Lock. Cloud saves use an atomic PostgREST JSONB equality filter on the session
  column. A unique-key race when creating a day is handled by comparing the existing
  session instead of blindly replacing it. No new database schema is needed.
- Conflicting session edits are **not automatically merged**. The user sees a
  conflict and can explicitly reload saved progress, discarding this tab's unsaved
  changes. Another tab/device's session is not silently overwritten.
- Read and write failures are visible. Retry saving retains the latest pending
  changes. An uncertain write is retried first so an already-committed response
  can be acknowledged before sending newer work. Unchanged state is not re-saved.
- While changes are pending or failed, leaving the page requests the browser's
  unsaved-changes warning. Browsers may suppress that warning.

## Storage modes and limitations

With daily sync disabled, localStorage is authoritative for this browser/origin.
With sync enabled, Supabase is authoritative. A missing daily table keeps the
existing local fallback; other cloud failures are errors, not an empty notebook.
Cloud mode does not silently switch to a divergent offline copy. Pending failed
changes remain in memory for retry, not in a durable offline outbox. Closing or
crashing the tab before a successful save can still lose them.

There is no polling or realtime subscription. Other devices' changes become visible
on reload; stale edits are detected on save. Devices must use compatible upgraded
clients. Local cross-tab locking requires the Web Locks API (available in supported
modern browsers on HTTPS/localhost); without it the fallback serializes only within
one tab and cannot guarantee atomic cross-tab read/modify/write.

JSON comparison prevents ordinary stale overwrites, but is not a monotonic revision:
an ABA change (state changes away and then back to the exact same JSON) cannot be
distinguished. For strict ordering across all clients, including older clients,
the minimum future database change would be per-session revision columns and an
authenticated compare-and-set RPC, with writes restricted to that RPC. This task
does not add migrations or change production infrastructure.

Browser regressions exercise the real hooks and API client against synthetic Auth
and PostgREST fixtures, plus real localStorage/Web Locks. They do not establish live
production RLS or database acceptance.
