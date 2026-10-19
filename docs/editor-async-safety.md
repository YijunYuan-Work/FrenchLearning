# Editor Async Safety

Each editor opening has a separate identity. Closing it or opening another note
invalidates its form callbacks, errors, and save-completion UI. Same-account Auth
refreshes do not replace an editor; actual account changes retain the existing
workspace-generation isolation.

Auto-fill is tied to that opening, the French input, category, and UI language.
Changing any request context cancels and invalidates the request, even if the
input later returns to its original value. Cancellation is checked around Auth
preflight as well as the HTTP request. Late results and errors are discarded even
when the transport cannot cancel.

An applicable result replaces fields not edited during the request. Manual edits,
including clearing a field or restoring its original value, win. Word type,
gender, conjugation, and adjective forms are preserved together when one of them
is edited, to avoid mixing incompatible forms. Ordinary French edits never clear
other fields. A subsequent explicit Auto-fill starts a fresh review of the fields.

Save has a synchronous, per-opening pending guard. Controls are locked while the
submitted snapshot is saving; failure retains the draft and permits retry.
Existing owner-scoped note mutation queues and partial-deletion guards are unchanged.

## Boundaries

Closing a pending save dismisses the editor, not an already-started server write.
That write may still update the original account's notebook and Add Note goal,
but cannot close, unlock, or replace a newer editor. An accepted AI request may
still consume quota after cancellation; cancellation does not refund quota or
guarantee server-side work stops. There is no automatic AI retry.

This is client-side operation safety, not a new server idempotency protocol.
An ambiguous save failure after server commit still relies on existing duplicate
constraints and retry behavior. Tests use synthetic Auth/PostgREST/AI responses;
no production database, live quota, or paid AI request is involved.
