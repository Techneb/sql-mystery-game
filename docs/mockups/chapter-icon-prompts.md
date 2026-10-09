# Chapter icons (replace the line-drawn `PROPS` in `site/app.js`)

One small painted object per chapter, shown at 44 x 44 px beside the chapter title, by day and in the night
edition. Made by the owner on OpenGen; Claude then cuts out the background, sizes them and wires them in.

## Setup (same for all twelve)

- OpenGen > **Image**, model **Nano Banana Pro** (38 credits each), aspect ratio **1:1**, largest size offered.
- **Reference:** the style frame from Video 1 (Creations: the sunny Place Vendome painting) as `@image1`.
  For icon 12 add `site/blue-star.jpg` (upload it) as `@image2`.
- Generate one at a time; keep the best of each; download to `assets-source/icons/` named
  `ch01.png` ... `ch12.png`.
- Check before keeping: one object only, centred, nothing cut off at the edges, **no letters or numbers
  anywhere** (they would hand out clues: chapter 3's answer is a plate number), no signature in a corner,
  plain flat background.

## The shared ending (paste after every prompt)

```
A single object, centred, filling about two thirds of the frame, seen slightly from above, painted in the style of @image1: oil on canvas in the manner of Sir John Lavery, loose confident brushwork, warm rich colour, soft light from the upper left. Plain flat cream background, colour #F3E9D2, with no shadow, no table, no texture and nothing else in the frame. Strong simple silhouette that stays readable when shown very small, as an icon. Paris, 1912. No text, no letters, no numbers, no readable writing, no signature or artist's name in any corner, no border, no frame.
```

## The twelve prompts (each followed by the shared ending)

1. **The Night of the 17th** (a police report): `@image1 A single sheet of an old Paris police report, cream paper slightly curled, rows of illegible handwritten scribble, a round red ink stamp in one corner.`
2. **The Neighbouring Suite** (the balcony next door): `@image1 A small curved wrought-iron hotel balcony railing in black iron with a gilded top rail, under a thin crescent moon.`
3. **A Plate in the Dark** (the cab's plate): `@image1 A dark enamel licence plate of a 1912 Paris taxi cab, blue-black with a thin white border, completely blank with no characters on it, two rivets, lit by a small brass carriage lamp beside it.`
4. **The Cab's Week** (the cab's log): `@image1 A brass taximeter of a 1912 Paris taxi cab, round-topped, with a small red flag on its side and a blank dial.`
5. **The Boarding House** (the jeweller): `@image1 A jeweller's brass loupe lying beside a small pair of fine tweezers on a folded square of black velvet.`
6. **Follow the Francs** (the bank): `@image1 A small stack of gold twenty-franc coins beside a folded banknote, the coins blank and unreadable.`
7. **The Quietest Hour** (the telegraph desk): `@image1 A brass telegraph key on a small mahogany base, with a coil of thin wire.`
8. **The First Order Before Dawn** (champagne): `@image1 A dark green champagne bottle with gold foil on its neck and a plain blank label, beside one crystal coupe glass of champagne.`
9. **The Trunk** (the boat train): `@image1 A travelling steamer trunk of 1912, brown canvas with wooden slats and brass corners, a blank paper luggage tag tied to its handle.`
10. **Never Seen Together** (two names, one man): `@image1 Two identical black silk top hats side by side, one slightly in front of the other.`
11. **The Silence** (the hotel at night): `@image1 A silver room-service cloche on a small silver tray, its dome catching a cold blue night light.`
12. **Follow the Money** (where it all went): `@image1 @image2 The sapphire ring of @image2: a large oval cornflower-blue sapphire in an ornate gold setting with small diamonds, lying alone.`

## What Claude does with them

Cut the cream background to transparency (so the night edition shows them on its dark paper), trim and size
them to 96 x 96 px (sharp at 44 px on high-density screens), save as `site/icons/ch01.png` ...,
replace `#chapter-icon`'s SVG by an `<img>`, keep `PROPS` as the fallback if an image is missing, and check
both editions and a phone in Chrome.
