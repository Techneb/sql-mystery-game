# Questions for the course owner (2026-09-22 night session)

Written after implementing `docs/superpowers/plans/2026-09-22-part1-multi-query-chapters.md` on branch
`claude/beautiful-fermat-ks3hvt` and drafting `docs/mockups/illustrations.html`.

## Blocking (decides the next work)

1. **Compete-mode PRs.** PR #3 and PR #4 (Plan 3, compete mode) are both open and both branch from an
   older main; #4 looks like a superset of #3. They rewrite `plot.py` / `generate_db.py` and will conflict
   with this branch (discovery fields, ch. 1 `interview` reveal, hints emptied). Which one survives, and
   do you want me to rebase it onto this branch once this is merged? The spec already names "compete
   objectives get the same multi-query treatment" as a follow-up: do that in the same rebase or later?
2. **Hints stay off?** The spec says "students should struggle". With `hints: []`, the Clean Sweep badge
   is automatic and the rank's hint dimension is always 0. Keep as is for the first class, or drop the
   badge and the hint term from the rank now?
3. **Chapter 1 reveals `interview` from the start** (plan decision). The ERD therefore shows two tables
   on the first screen instead of one. Fine, or should Duroc's statement live in `police_report` instead?

## Illustrations (see the mockup page, section 6 lists the same in context)

4. Drawing style: A engraved line, B flat silhouette, or C line plus one colour wash. I recommend C.
5. Assets: hand-drawn inline SVG (what the mock is; no files, ASCII, recolourable, prints) versus
   commissioned or generated raster art.
6. Suspect portraits: silhouettes only, or real faces? If faces, does Blakeney get one before chapter 8?
7. Night switch at the Part II code: whole page, or story column only (terminal and ERD unchanged)?
8. Case board: replace the index cards with the pinboard, or keep cards and add the board as an
   enlargeable view? Pinboard needs about 380 px; on phones it stacks under the story.
9. Thread: solve order only, or draggable cards with student-drawn threads (saved in localStorage)?
10. Masthead date for Part II: advance to 19 May, or keep 18 May?

## Noticed while playing (not blocking, your call)

11. **ERD is unreadable in its column.** The auto-layout is 6 tables wide, scaled to 340 px; boxes are
    about 45 px wide. Enlarge works, but the first impression is a smudge. Options: lay the ERD out
    vertically for the column (fewer per layer), or default to a per-chapter "new tables only" view.
12. Badge toasts stack when several fire on one query (five at once on the first JOIN). Cap at two
    visible, queue the rest?
13. The course folder `../SQL` is not in the repo, so the correction file
    `8. Correction SQL Mystery Game.sql` is not regenerated here. Regenerate locally after merging.
14. GitHub Pages: the spec says serve `site/` from `main`. Is Pages enabled yet? I cannot check
    repository settings from this session.
