# 404 artwork for alephb.uk

The picture on alephb.uk's "page not found" page, in a day and a night version. The page itself lives in the
alephb-site repo (Supermain builds it); this repo keeps the prompts and the source files. Owner's pick,
2026-11-22: a neutral AlephB still life (not the 1912 Ritz look), since the 404 serves the whole site.

## Files

In `assets-source/404/` (gitignored, on the owner's Mac only):

- `day-original.png`, `night-original.png`: OpenGen's downloads, 1376x768 (16:9).
- `404-day.webp`, `404-night.webp`: what the site uses, cropped to 3:2 from the right edge
  (`cwebp -q 80 -crop 224 0 1152 768 <original> -o <webp>`), 1152x768, about 21 KB each.
  Same framing in both, objects on the right, the left half empty for the "404" and the text.

Markup suggested for the page (decorative, so `alt=""`):

```html
<picture><source srcset="404-night.webp" media="(prefers-color-scheme: dark)">
<img src="404-day.webp" alt="" width="1152" height="768"></picture>
```

## How they were made

OpenGen > Image, model **Nano Banana Pro** (32 credits each on 2026-11-22), format **16:9** (OpenGen has no 3:2).
Both came out right first time: 64 credits in all.

Day:

> A quiet still life on a plain off-white background: a closed linen notebook, a fountain pen resting across it, a white cup of coffee and one small potted plant, seen from slightly above, soft morning daylight from the left, gentle shadows, a single muted teal accent on the notebook cover, calm minimal editorial illustration, soft painterly texture, lots of empty space around the objects, objects grouped on the right third, no people, no text, no letters, no numbers, no logos.

Night, with the day picture added as reference (Ajouter des references > Creations), so the framing matches:

> @image1 The exact same still life, same objects, same positions, same camera angle and framing, same painterly illustration style, but at night: the background is a plain very dark charcoal blue-grey (hex 101415), soft warm light from a small desk lamp out of frame on the left, gentle glow on the notebook, cup and plant, deep soft shadows, the teal band slightly brighter, the whole left half stays empty dark background, no people, no text, no letters, no numbers, no logos.

The colours aim at alephb.uk's tokens: `--bg` #fbfbf9 by day and #101415 by night, the teal `--accent` #1d7f92.
