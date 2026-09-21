# Part I chapters: require real multi-query investigation

Decided 2026-09-22. Amends the plot content from `docs/superpowers/specs/2026-09-20-sql-mystery-game-design.md`
(section 2, chapter table) — that spec's chapter descriptions and answers are unchanged; this spec
changes how a player *reaches* each answer.

## 1. Problem

Comparing `solution.sql` (generated) against the reference `SQL Murder Mystery` solved with only
`SELECT`/`WHERE` (`../SQL/3-Corrections/2.1 Correction SQL Murder Mystery (SELECT-WHERE).sql`) showed
our chapters are too shallow: every chapter is solvable with exactly one query, because the
objective text hands the player every constant the `WHERE` clause needs. The reference file's
investigation instead chains several queries across several tables per stage — you read one
result, then use it to filter the next query — which is the actual skill the course wants to teach.

Concretely: chapter 3's objective already claims "read the neighbour's statement in `interview`,"
but the cab's plate prefix is also stated directly in the chapter's own story text, so the
`interview` table is never actually necessary to query. That pattern (a fact stated in prose that
should instead require a query to discover) repeats across most of Part I.

## 2. Decisions

- **Scope: Part I only (chapters 1-8).** Chapters 9-12 (Part II) and Compete mode's parallel
  objectives (`docs/superpowers/plans/2026-09-22-plan-3-compete.md`, PR #3/#4) are unchanged by this
  spec. Compete mode getting the same treatment is a named follow-up, not silently dropped — it
  depends on `site/app.js` for its UI regardless (per that plan's own scope note) and shouldn't
  block on this content pass.
- **Final answers are stable.** Every chapter still ends at exactly the value it does today
  (report id 4127, Lord Ashcombe, plate 75-2041, etc. at seed 1912). Only the *path* to each answer
  changes. This keeps Compete mode's existing planted data, `solution.sql`'s downstream consumers,
  and the merged Plan 2 site's answer-checking (SHA-256 of the same final values) untouched.
- **No site changes.** The site's mechanic (Terminal: run any number of queries; Notepad: jot
  facts down; one Answer box submitted per chapter) already supports multi-query investigation —
  today's shallowness is a `plot.py` content problem, not a site limitation. `site/app.js`,
  `index.html`, `chapters.json`'s shape, and the ERD/ table-reveal-per-chapter mechanism are
  unchanged.
- **Mechanism: withhold constants, source them from a query.** For each chapter, at least one
  `WHERE`-clause constant that is today stated directly in the objective/story text must instead be
  discoverable only by running a query against real data (either a different table, or the same
  table with a different, preliminary query — e.g. previewing raw counts before deciding a `HAVING`
  threshold). Prefer reusing data that already exists (a row's own text/description field the
  player already has access to) over planting new rows; only chapter 1 needs new data, since it has
  no earlier chapter's output to draw on.
- **Discovery is verified, not just narrated.** Each chapter dict in `plot.py` gains a `discovery`
  list: one or more `dict(query=..., must_contain=<template ref into V>)` entries. `self_check` runs
  each discovery query against the built database and asserts the expected fact is actually present
  in its result — the same rigor already applied to `solution`/`naive`, extended to the new
  discovery step so a reseed or refactor that breaks a clue's discoverability fails loudly instead
  of silently.
- **Hints are removed, for now (2026-09-22, user decision: "students should struggle").** Every
  chapter's `hints` list becomes `[]` — this sidesteps the original plan to restructure hints away
  from handing out the complete final query (tier 3, "Ganimard's notebook," today gives the whole
  answer with blanks, which would have made the discovery step optional). Removing hints entirely
  is simpler and stronger. This is the one place this spec *does* touch the site: `site/app.js`'s
  `renderWitnesses()` unconditionally renders an "Ask the concierge" button whenever
  `opened < 3`, regardless of whether `ch.hints` has any content — with `hints: []` shipped, that
  button would sit there doing nothing when clicked. Add one guard: skip rendering the witness
  button entirely when `ch.hints.length === 0`. No other site change (rank/badge scoring already
  takes a `hints` count parameter that will now simply always be 0, which needs no code change).
  Bringing hints back later is a content-only change (fill `hints` back in) plus reverting that one
  guard.

## 3. Per-chapter changes

| Ch | Construct | What's hidden | Discovery source | New data? |
|---|---|---|---|---|
| 1 | SELECT / WHERE | exact date (story only says "May 1912") | new `interview` row: night porter Marcel Duroc's statement names the date | 1 new row |
| 2 | ORDER BY / LIMIT | "floor 2, priciest" framing | chapter 1's own `police_report.description` (already contains this text; the player must read the full row, not just `id`) | none |
| 3 | LIKE | the plate prefix | `interview` row 1 (Lord Ashcombe's statement) already contains it | none |
| 4 | GROUP BY / HAVING | the `HAVING` count threshold | preview query: `GROUP BY dropoff` without `HAVING` on the same table, to see the actual counts before deciding the threshold | none |
| 5 | JOIN | the tenant's name | two-step manual lookup: resolve `address.id` from number+street, then list `person` rows at that `address_id` to spot the jeweller by occupation, *before* the one-query JOIN | none |
| 6 | JOIN x3 + SUM | the receiving account | two-step lookup: resolve the fence's `bank_account.id`, then preview `bank_transaction` totals per counterparty for that account, before the full 3-way JOIN | none |
| 7 | CASE WHEN | (lightest touch — the time boundaries are the lesson itself) | preview raw `time` values for that office/date before classifying them | none |
| 8 | RANK() OVER + subquery | the champagne brand | chapter 7's own telegram `text` (already contains it; the player must read the full row, not just find its `id`) | none |

Worked example (chapter 1, full discovery + final pair) and the complete draft `solution.sql` for
all 8 chapters were reviewed and approved in chat during brainstorming; the implementation plan
should reproduce that exact pairing of discovery/final queries per chapter rather than re-deriving
it.

## 4. Files touched

- `plot.py`: `TEXT[1..12]` (`hints` becomes `[]` in every chapter), `TEXT[1..8]` (story/objective
  rewrites), `CHAPTERS[0..7]` (new `discovery` field per the format above).
- `generate_db.py`: `plant_part1` (one new `interview` row for chapter 1's night-porter statement);
  `check_chapter`/`self_check` (run and assert each chapter's `discovery` queries); `solution_sql`
  (print discovery queries alongside the final query, matching the draft reviewed in chat).
- `site/app.js`: one guard in `renderWitnesses()` to skip the witness button when `ch.hints.length
  === 0` (see the hints decision above — this is the only site change in this spec).
  `site/chapters.json`'s shape is otherwise unchanged (`hints: []`, `discovery` is a
  dev/generator-only field, never shipped to the client).
- Tests: extend `python3 -m unittest -v`'s existing plot/self-check coverage with assertions for the
  new `discovery` field's presence and correctness; `python3 generate_db.py` (seed 1912) must still
  print `ok: seed 1912, 12 chapters` and regenerate `solution.sql`/`chapters.json`/`schema.svg`
  correctly.
- ASCII check unchanged: `LC_ALL=C grep -n '[^ -~]' plot.py generate_db.py erd.py solution.sql site/chapters.json` must print nothing.

## 5. Out of scope (named follow-ups)

- Compete mode's parallel Part-I objectives (PR #3/#4) getting the same multi-query treatment.
- Any change to Part II (chapters 9-12) beyond emptying their `hints` — already multi-table/multi-CTE
  by construction.
- Restoring hints once chapters are validated as appropriately hard (content-only, plus reverting
  the `renderWitnesses()` guard).
