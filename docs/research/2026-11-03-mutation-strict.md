# Mutation testing, site/strict.js lines 34-590 (declType, sqlTokens, parseSql, exprKey, firstAgg, analyse), 2026-11-03

Stryker 8.7.1 (installed in the scratchpad, not the repo), command runner
`node --test --test-skip-pattern=mystery.alephb.uk test_site.mjs test_handbook.mjs` (the skipped test runs `git grep`,
which the copy outside git cannot), every mutator, 2323 mutants, no sampling needed (about 50 min per run at concurrency 10).

| run | killed | timeout | survived | no coverage | score |
|---|---|---|---|---|---|
| before | 1364 | 14 | 945 | 0 | 59.3% |
| after (pass 1) | 2154 | 15 | 154 | 0 | 93.4% |
| after (pass 2, committed) | 2191 | 15 | 117 | 0 | 95.0% |

Survivor lists: surv1.txt, surv2.txt, surv3.txt in this folder; Stryker reports mutation1/2/3.json.

## The 117 left, all equivalent

- L35, L48, L55, L57, L82, L110, L120, L201, L218 (word guard), L252 (op guard), L268: placeholder strings and kinds no
  code reads (EOF's v/lv, "bad", "query", "compound", "select"), or guards whose other branch also ends in UNSUPPORTED.
- L39: UNSUPPORTED is compared by identity only.
- L43: `\s+` -> `\s` (whitespace is skipped token by token), `[\s\S]` -> `[\S\S]` in the catch-all (whitespace never
  gets there).
- L75, L94, L156, L165 (`|| !natural`), L177/L178/L282 (`order || by`): every other path throws UNSUPPORTED the same
  way, or the keyword pair cannot appear in that place.
- L127, L175, L285, L215, L473 (ons), L487, L477/L485 (pk flags): arrays and flags nothing reads (windows list, pk of a
  derived table, a non-node entry that T() types as null).
- L176: the frame skipper swallows ROWS/RANGE/GROUPS whether or not they are taken for a window name.
- L220: no other operator in the list ends or starts with LIKE.
- L239, L244 (`!type`), L247 (typeName parts, the " " join), L273, L280, L890: unreachable, or the same declType result.
- L261, L266, L560 (`"null"`): the "null" type behaves exactly like null everywhere (never numeric, never text, skipped by
  every find); a `{}` node types as null too.
- L302/L303: the key prefixes and the `res` drop cannot make two different columns collide.
- L306-L310 and L514-L520: the sub/exists guards are redundant with the `q` skip; `res` holds no node; the typeof guards
  have guarded callers; scalar MIN/MAX are refused by callType before firstAgg is ever asked.
- L336, L344, L351: `{unknown: true}` vs `{}` types alike; paren falling into collate does the same thing.
- L425 `[null, null]` -> `[]`; L472/L584 clause names "VALUES"/"LIMIT" (no alias map there); L481 (base tables are
  lower case); L486 `--ids` (ids stay unique); L497 (`e.k === "lit"`: only literals carry type "int"); L499; L509
  (HAVING alone already enters the group check); L512 "." (keys are always checked before gcols); L517; L543/L545
  ("SELECT"/"HAVING" only matter against "ORDER BY"); L549; L579 `/^c/` -> `/c/` (the string starts with "column").

## Wording slips found (behaviour unchanged, not pinned)

- `SELECT +x FROM t` is refused as `operator does not exist: - text`, "only numbers take a minus sign" (unary plus
  shares the minus node). Pinned by anchor only.
- `TRUE || 1`: "... are both numbers" although TRUE is boolean. Pinned by error line only.
- `COLLATE RTRIM` / `COLLATE BINARY`: the why says "to ignore case", which only fits NOCASE. Pinned by error line only.
- Boolean operands of arithmetic get the text advice ("compare text as text, or convert it with CAST(... AS INTEGER)
  when it holds digits"), e.g. `SELECT b + 1`. Pinned as is.
