# Import Reliability

## Batch and recovery

A selected, structurally valid CSV defines one batch. Each row keeps its original
slot and one outcome: added, skipped, failed, or unprocessed. Those counts always
sum to the parsed batch size. Progress counts settled rows in the current run,
which can be a subset of the original batch during recovery.

Cancel stops before the next row. An already-started save settles first; the
terminal status remains Cancelled, even if that was the last row. Resume processes
only unprocessed rows; Retry failed processes only failed rows. Cancelling a retry
keeps untouched failed rows classified as failed. Recovery updates the original
slots rather than replacing the batch or accumulating repeated failure records.
Successful and skipped rows are never resubmitted by either recovery action.
Duplicates are checked against the current notebook and within each run. The Add
Note daily goal is marked after the first success per batch and local day, so an
overnight recovery can still satisfy the new day's goal without per-row writes.

## CSV structure

The complete file is structurally validated before import can start. Vocabulary
retains its existing 18 headers, in any order, without duplicates or extra headers.
Phrase files accept two columns, or three with tags; optional headers use French,
Translation/English/Meaning, and Tags/Usage. All records must match the file's
column count. Empty optional cells still need their delimiters.

Unclosed/misplaced quotes, text after closing quotes, ambiguous headers, and wrong
row widths reject the file. Diagnostics identify physical source lines and CSV
column numbers, including records following quoted multiline fields. BOM, LF,
CRLF, escaped quotes, Unicode, and both tag separators remain supported. Otherwise
well-formed records retain the existing per-row semantic validation.

## Boundaries

Jobs and file reads are scoped to their account and operation identity. A new file
or mode invalidates older reads and clears its old rows before reading. Demo can
preview a file but cannot run an import. Imports remain direct note saves with no
AI or Wiktionary requests, schema changes, or deployment changes.

Recovery state survives navigation within this workspace, not a full reload,
closed tab, or account switch. Re-uploading uses normal duplicate checks. Cancel
does not roll back committed rows or guarantee an in-flight network request will
finish promptly. A response lost after a server commit remains subject to existing
database uniqueness protections; this is not a server-side import transaction or
idempotency protocol. Regression tests use synthetic services, not production RLS.
