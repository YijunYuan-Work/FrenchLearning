# Note Integrity and Rich Text

## Application Contract

Full editor, Demo and import saves share `normalizeNoteInput`. Vocabulary and
Short Phrases require nonblank French and meaning/translation. Pronunciation
retains its existing French/meaning contract. Grammar requires a title and
non-empty sanitized explanation, not a translation. Grammar/phrase saves still
clear their intentionally hidden vocabulary fields.

Confidence is an integer from 1 through 4. Tags must be text labels; editor tag
text is explicitly split on commas. Existing CSV tag separators and row validation
remain unchanged. Word type/gender accept only the existing choices, including
Unknown/unselected for manual entry. Vocabulary CSV still requires word type.
Conjugation/adjective forms must be objects of supported string-valued fields;
omitted forms are filled with empty strings. Blank optional fields remain valid.

Titles are outer-trimmed and NFC-normalized; duplicate identity is this title
lowercased in French, within the same category. Imports and editor/hook checks use
the same key. Database unique violations are presented as actionable duplicate
errors. Internal spaces, newlines, accents, translation text and note content are
not flattened. Failed validation leaves the editor draft open.

Note mutation queues and owner filters remain unchanged. Confidence-only updates
validate and write only their owned fields, not full snapshots. Queued content
edits validate against the latest visible note before persistence.

## Reading Legacy Data

Each row is normalized independently before it reaches views. Invalid tags,
confidence, enums and form shapes receive safe display defaults. Rows without a
usable ID, supported category, French title, or required translation are hidden;
unreadable grammar HTML is also isolated. A visible warning counts affected rows.
Unknown rows are not assigned a guessed category. Read normalization never writes
repairs to Supabase or deletes original content. Hidden notes are not available
for Quiz/Study. Their original data requires a separately reviewed repair path.

## Rich Text Boundary

`parse5` is a pinned HTML5 parser used identically by browser code and unit tests.
It replaces regex-based HTML parsing, not the editor or toolbar. The sanitizer
emits only fixed paragraphs, headings, blockquotes, bold, italic, underline,
line breaks and list tags, plus escaped text. No source attributes or URLs are
emitted. Useful pasted span styles become fixed semantic tags; executable,
embedded, template and foreign-namespace subtrees are discarded.

Text-node spaces and newlines, including spaces between inline elements, remain
intact. Tables become paragraph rows with ` | ` between cells; table layout,
borders, images, links and arbitrary fonts/styles are intentionally unsupported.
Entities are decoded by the parser and safely escaped once. Saving, displaying,
editing and reloading all use the same sanitizer. Sanitization cannot recover
spaces or content already removed by an older saved version.

The HTML5 parser adds about 46 KB to the gzipped main bundle in the local build.
The existing large-chunk warning remains. Parser loading/bundle splitting can be
reviewed separately; this task does not change routing or deployment settings.

## Future Schema Hardening (Proposal Only)

No migration or production query is included or applied. Client validation is
not an authorization or database integrity boundary: a caller with REST access
can bypass application helpers. Existing RLS and owner filters remain essential.

Before proposing constraints, perform an authorized read-only legacy-data review:

- Count unknown categories and null, non-text or Unicode-whitespace-only titles
  and category-specific required content. Inspect empty/sanitized-empty grammar.
- Group duplicate titles per user and category using an agreed trim, Unicode NFC
  and case policy. The current lower-only index does not cover all these cases.
- Inspect tag/form JSON types, non-string members, unknown form keys, unsupported
  word types/genders and out-of-range confidence. Verify deployed constraints;
  the checked-in schema already has a confidence range check.
- Preserve IDs, ownership, dependent daily session references and original values
  when planning repairs. Do not guess categories or blanket-delete duplicates.
- Obtain approval for per-row resolution, a backup and rollback plan before any
  cleanup or constraint/index changes.

A later reviewed migration could add category/required-text checks, JSON shape
checks, enum checks and a canonical per-user/category title uniqueness policy.
Define database Unicode normalization and whitespace semantics explicitly rather
than assuming PostgreSQL `btrim`/`lower` exactly matches JavaScript. Retain RLS and
existing account boundaries. Do not automatically apply these proposals.
