# Questions for the course owner (2026-09-22 night session)

Written after implementing `docs/superpowers/plans/2026-09-22-part1-multi-query-chapters.md` on branch
`claude/beautiful-fermat-ks3hvt` and drafting `docs/mockups/illustrations.html`.

**Status 2026-09-25: all fourteen answered or resolved. Kept as the record of what was asked; the
outcome is under each question, and the reasoning lives in the spec's section 8.**

## Blocking (decides the next work)

1. **Compete-mode PRs.** PR #3 and PR #4 (Plan 3, compete mode) are both open and both branch from an
   older main; #4 looks like a superset of #3. They rewrite `plot.py` / `generate_db.py` and will conflict
   with this branch (discovery fields, ch. 1 `interview` reveal, hints emptied). Which one survives, and
   do you want me to rebase it onto this branch once this is merged? The spec already names "compete
   objectives get the same multi-query treatment" as a follow-up: do that in the same rebase or later?
   - *Resolved:* #4 rebased onto the multi-query branch, #3 and #4 closed as superseded, merged via
     PR #5. Compete objectives got the same multi-query treatment in that pass. A parallel session's
     fuller compete flow (season link, clock, offline retry) then landed as PR #6.
2. **Hints stay off?** The spec says "students should struggle". With `hints: []`, the Clean Sweep badge
   is automatic and the rank's hint dimension is always 0. Keep as is for the first class, or drop the
   badge and the hint term from the rank now?
   - *Resolved:* hints stay off; Clean Sweep dropped; rank counts queries only.
3. **Chapter 1 reveals `interview` from the start** (plan decision). The ERD therefore shows two tables
   on the first screen instead of one. Fine, or should Duroc's statement live in `police_report` instead?
   - *Resolved:* stays in `interview`, revealed from chapter 1.

## Illustrations (see the mockup page, section 6 lists the same in context)

4. Drawing style: A engraved line, B flat silhouette, or C line plus one colour wash. I recommend C.
   - *Resolved:* C, for the twelve chapter props.
5. Assets: hand-drawn inline SVG (what the mock is; no files, ASCII, recolourable, prints) versus
   commissioned or generated raster art.
   - *Resolved:* inline SVG for the props; generated raster (a public no-login endpoint) for portraits.
6. Suspect portraits: silhouettes only, or real faces? If faces, does Blakeney get one before chapter 8?
   - *Resolved:* real painted faces (silhouettes rejected), colour after Sir John Lavery; Blakeney
     from chapter I like everyone else, so his absence is never the tell.
7. Night switch at the Part II code: whole page, or story column only (terminal and ERD unchanged)?
   - *Resolved:* whole page, via token overrides; portraits get their own gentler filter.
8. Case board: replace the index cards with the pinboard, or keep cards and add the board as an
   enlargeable view? Pinboard needs about 380 px; on phones it stacks under the story.
   - *Resolved:* cards kept and reskinned (cork, pins); no pinboard. Portraits went to a separate
     Suspects gallery instead, since board entries are not uniformly people.
9. Thread: solve order only, or draggable cards with student-drawn threads (saved in localStorage)?
   - *Resolved:* not built, a consequence of 8.
10. Masthead date for Part II: advance to 19 May, or keep 18 May?
    - *Resolved:* advances to 19 May.

## Noticed while playing (not blocking, your call)

11. **ERD is unreadable in its column.** The auto-layout is 6 tables wide, scaled to 340 px; boxes are
    about 45 px wide. Enlarge works, but the first impression is a smudge. Options: lay the ERD out
    vertically for the column (fewer per layer), or default to a per-chapter "new tables only" view.
    - *Resolved:* the SVG was being squished to the column (`width: 100%`); it now renders at natural
      size and the column scrolls. Legible at every chapter count.
12. Badge toasts stack when several fire on one query (five at once on the first JOIN). Cap at two
    visible, queue the rest?
    - *Resolved:* they clear 400 ms apart instead of as one block; no queue built.
13. The course folder `../SQL` is not in the repo, so the correction file
    `8. Correction SQL Mystery Game.sql` is not regenerated here. Regenerate locally after merging.
    - *Resolved:* the folder exists on the course owner's machine and every tie was already in place;
      `generate_db.py` refreshes the correction file whenever it runs there.
14. GitHub Pages: the spec says serve `site/` from `main`. Is Pages enabled yet? I cannot check
    repository settings from this session.
    - *Resolved:* enabled 2026-09-22 via an Actions workflow (classic deploy-from-branch cannot serve
      a `/site` subfolder), which also builds the seasons in `seasons.txt`. Live at
      <https://techneb.github.io/sql-mystery-game/>.
