# English text review, 2026-10-25

Owner request: a review of sentence fluidity and coherence in every English text a player or reader sees, with the humanizer skill. Scope: the story and UI text (`plot.py`, `site/index.html`, `site/app.js`), the handbook prose (`site/learn/*.html`) and `site/privacy.html`. Out of scope: the desk pages, `docs/`, the README and code comments.

Method: every story, objective, telegram, ending, suspect card, wrong-answer line, badge, dialog, prologue and callout string, refusal sentence and SQLite help line was read against the humanizer's list (contrasts that argue with no one, one-line closers, sayings that sound deep, forced triads, dashes as connectors, inflated words, bold labels), then for coherence: names, dates, times and sums the same everywhere, story facts consistent across chapters and with the endings and the suspect notes, the 1912 voice kept in the game and plain reference prose in the handbook.

Result: the text was already in good shape. Twelve edits, none touching a clue, a value, an answer, a date, a name or any SQL. The build (`python3 generate_db.py`, `--seasons`), the ASCII check and the three test suites pass.

## plot.py (2)

Chapter 3, `story_compete`:

- before: `'He is sure how the plate began, and of one figure near the end.`
- after: `'He is sure of how the plate began, and of one figure near the end.`
- why: the two objects of "sure" now read in parallel.

Chapter 4, learn `objective`:

- before: `Where did the cab from chapter 3 keep going the week of the theft?`
- after: `Where did the cab from chapter 3 keep going, the week of the theft?`
- why: "keep going the week" read as one phrase; the comma matches the compete objective's shape. The objective stays bare.

## site/app.js (2)

- `JOIN_REFUSED["busy, try again"]`: "The archives are busy, press Join again." became two sentences (a comma splice).
- `PROLOGUE_STEPS[3]`: "The Inspector's archives" became "the inspector's archives": the game writes "the inspector" in lower case in narration (chapter 3, the Part I ending, the Ganimard badge) and capitalises only in address ("Delighted, Inspector").

## site/privacy.html (3), wording only, nothing it says is sent or loaded changed

Opening paragraph:

- before: `The page shows advertising from Google AdSense in one box beside the game, under the schema, never inside a chapter, and in one box under the schema of the handbook's exercises page.`
- after: `The page shows advertising from Google AdSense in one box under the schema beside the game, never inside a chapter, and in the same box under the schema of the handbook's exercises page.`
- why: "beside the game, under the schema" read as two places; the Advertising section already says "the same box".

Your consent, third paragraph:

- before: `So the page waits up to 3 seconds after that script loads (not at all if it fails): if Google's message is not active by then, a short question from the game itself, at the bottom of the page, asks every visitor who has not answered it yet whether to allow anonymous usage statistics (Yes or No).`
- after: `So the page waits up to 3 seconds after that script loads (not at all if it fails). If Google's message is not active by then, a short question from the game itself, at the bottom of the page, asks every visitor who has not yet answered it whether to allow anonymous usage statistics (Yes or No).`
- why: one long sentence split at the colon; same facts, same 3 seconds.

Usage statistics, the purpose:

- before: `Why: to improve the course &mdash; which chapters students drop out of, how long each takes, and to tune the difficulty and the ranks.`
- after: `Why: to improve the course. The figures show which chapters students drop out of and how long each takes, and they tune the difficulty and the ranks.`
- why: the dash joined a list of nouns to an infinitive; now two plain sentences.

## site/learn (5)

- `like.html`, Searching when you are not sure: "Searching is a conversation with the data: run a broad pattern, read what comes back, then tighten it." lost its aphorism; the instruction stays.
- `case-when.html`, grouping by a label: "The real power appears when you group by the label." became "`CASE` becomes most useful when you group by the label."
- `nulls.html`, the bakery's NULLs: "That is the honest way to record an absence, and it is why every rule on this page exists." became "Every rule on this page follows from recording an absence that way." (a closer that restated the paragraph).
- `schema.html`, primary keys: "id 7 is not "later" or "bigger" than id 6 in any meaningful sense, even if it often happens to have been inserted later." became "id 7 is not "later" or "bigger" than id 6, even if it was probably inserted later." (stacked qualifiers).
- `ctes.html`, what a CTE is: "Its value is in the reading. Instead of a subquery buried three levels deep, you get a list of steps..." became "What it buys you is readability: instead of a subquery buried three levels deep, you get a list of steps..." (an aphorism standing as its own sentence).

No code block, result table or refusal block was touched; `node colour_learn.mjs` was rerun and changed nothing else.

## Left as they are, on purpose

- `site/index.html`: the landing card, About this game and the dialogs read well; nothing changed.
- Game lines built on a contrast ("Lupin is vain, not stupid", "I do not want the list. I want the address.", "Not two different sums, and not three.") are Ganimard's voice and carry the clue's shape; kept.
- Handbook contrasts that teach ("an id is a label, not a measure", "columns are matched by position, not by name", "a mention is not proof") carry information on both sides; kept. "Five minutes spent this way save an hour later." (schema.html) is a genuine aside; kept.
- `<title>` and `og:title` values use " -- The Ritz Affair" as a title separator, and the mastheads use `&mdash;` as a typographic rule; these are not dashes in prose.
- `privacy.html`'s "this site and/or other sites on the Internet" and the third-party-vendor sentence are Google's required wording.

## Coherence checked, no problem found

- Chapter 4's "some sixty fares" is 61 in the learn database; chapter 7's "a hundred and seventy-odd wires" is 174 (46 + 48 + 36 + 44); the compete Bourse "sent dozens" is 85.
- The lift at 02:10 (Duroc, chapter 1; chapter 11's story), Blakeney's silence 02:05 to 03:10 (chapter 11's discovery, his suspect note at XII) and Velmont's 02:30 to 05:55 (his note at XII, the wrong-answer line) agree.
- The boat train of the 19th (chapter 9's story, Ashcombe's note at IX, the Part I ending's "it crossed yesterday" on the 20th), the Depot on the 21st (chapter 9) and Lupin writing from London (chapter 8's telegram, the Part II ending) agree.
- Nine fifteen in chapter 8's telegram against 09:10 in the ending: Ganimard is early, as the ending says.
- Learn and compete keep their own witnesses throughout (landlady and loupe in learn; concierge, statement and Societe Generale in compete), and "the inspector" / "Inspector" follow the narration-versus-address rule above after the one prologue fix.

## For the owner

- Nothing needs a decision. If the review is meant to go deeper than wording (for instance rewriting a chapter's story for pace), that is a separate pass: these stories were left whole because every sentence of them carries a fact or a clue shape.
