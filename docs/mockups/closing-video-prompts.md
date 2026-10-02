# Closing video prompts

Two short silent films, one to close each part, in the style of the suspects' portraits. Each is a handful of
shots of 4-6 seconds, cross-faded, with captions in the paper's voice added afterwards (never ask the model to
render text: it misspells). Total 30-40 seconds each.

- **Part I, "The Boat Train"**: top of the Chapter VIII extra edition (`showExtra` in `site/app.js`).
- **Part II, "Case Closed, Twice"**: after chapter XII, above the ending text.

## How to make them

1. **Keyframes first.** Generate each shot as a still with the image prompt (16:9, 1920x1080), using the
   committed portraits as reference images so faces match: `site/portraits/blakeney.jpg`,
   `site/portraits/comtesse.jpg`. Pick the best still per shot.
2. **Then animate each still** (image-to-video) with the shot's motion prompt, 4-6 s, no audio.
3. **Fallback**: if a tool cannot keep a face consistent, ship the stills as a slideshow (cross-fade 0.8 s,
   slow 3% zoom) instead. The page must work with stills alone.
4. **Export**: MP4 (H.264) and WebM, 1280x720, under 4 MB each, plus a poster JPEG (the first frame).
   Files go to `site/video/part1.mp4|webm|jpg` and `site/video/part2...`; the page plays them muted, once,
   with a "Replay" link, and shows the poster if the video cannot play.

## Shared style (prefix every prompt)

> Painterly cinematic scene in the style of Sir John Lavery, Paris, May 1912, oil on canvas brought to life,
> loose confident brushwork, rich warm colour, soft natural light, visible paint texture in the backgrounds
> and highly detailed lifelike faces, shallow depth of field, period-accurate costume and architecture,
> 16:9 wide frame, no text, no letters, no captions, no signature, no frame.

Negative prompt (where the tool takes one): *text, lettering, captions, subtitles, watermark, logo, frame,
gold frame, modern clothing, cars, electric signs, plastic, smartphone, cartoon, anime, 3D render look,
oversaturated colours, extra fingers, distorted faces, two copies of the same person.*

## Characters (keep identical in every shot)

- **Rupert Blakeney / Arsene Lupin**: an Englishman of about 25, slim, handsome, clean-shaven, dark tousled
  hair, calm amused eyes; a cream three-piece suit with black lapels, white shirt, black silk tie. Match
  `blakeney.jpg`.
- **Inspector Ganimard**: a Frenchman of about 55, stocky, ruddy, a thick grey walrus moustache, tired
  shrewd eyes, a black bowler hat, a dark wool overcoat buttoned up, a furled umbrella. Always slightly rumpled.
- **The Comtesse de Cagliostro**: a woman of about 30, pale, dark hair in a low loose chignon with a few strands
  free, red lips, a faint knowing half-smile; a sapphire-blue silk and lace gown off the shoulders, a high black
  lace collar, long drop earrings. Match `comtesse.jpg`.
- **The Blue Star**: a large cushion-cut sapphire, deep cornflower blue, about the size of a quail's egg.

---

## Part I: "The Boat Train" (about 34 s)

The arrest at the Gare du Nord, 20 May 1912, 09:10. Ganimard has the man, not the stone: the sapphire is
already on the train, in a trunk Lord Ashcombe does not know he carries (chapter IX). The film must not show
the stone, only its absence.

**Shot 1: The station (5 s)**
- Image: The Gare du Nord concourse at 9 in the morning, seen from high on the platform end: the great iron and
  glass roof, shafts of morning light cutting through steam, a dark green boat train with brass fittings waiting at
  the platform, porters with luggage trolleys, travellers in long coats and hats, a large station clock.
- Motion: slow push in towards the train; steam drifts upwards through the light; a porter crosses frame.
- Caption: *GARE DU NORD, 20 MAY, 09:10.*

**Shot 2: The gentleman (5 s)**
- Image: Medium shot on the platform: Rupert Blakeney walks beside the train towards a first-class carriage,
  unhurried, a slim leather case in one hand, his cream suit bright against the dark carriages; a few
  steps behind him, out of focus, a stocky man in a bowler hat follows.
- Motion: tracking shot alongside Blakeney at walking pace; the follower slowly comes into focus.
- Caption: *Mr. Blakeney had a train to catch.*

**Shot 3: The hand (4 s)**
- Image: Close shot over Blakeney's shoulder: Ganimard's broad hand in a worn leather glove lands on the cream
  shoulder of his suit; Ganimard's moustache and bowler at the edge of frame.
- Motion: the hand settles; a slight tightening of the grip; steam passes behind.
- Caption: *Inspector Ganimard had not slept in three days.*

**Shot 4: The smile (5 s)**
- Image: Two-shot, faces in profile to each other: Blakeney has turned, perfectly calm, smiling; Ganimard,
  red-faced and grim, very close. Morning light from the roof between them.
- Motion: Blakeney's smile widens slightly; he raises a small midnight-blue velvet jewel case between them.
- Caption: *'You have my name, Inspector.'*

**Shot 5: The empty case (5 s)**
- Image: Close-up of Ganimard's gloved hands opening a small midnight-blue velvet jewel case: the satin lining
  shows the impression where a large stone sat. It is empty.
- Motion: the lid opens slowly; a beat on the empty hollow; the light glints on the clasp.
- Caption: *The case was empty.*

**Shot 6: The train leaves (5 s)**
- Image: Wide shot from the platform: the boat train pulls away into the bright opening at the end of the
  station, steam rolling; in the luggage van's open door, a stack of leather trunks with brass corners.
- Motion: the train accelerates away; the trunks recede; steam fills the frame.
- Caption: *'The Blue Star has a train to catch.'*

**Shot 7: Afterwards (5 s)**
- Image: Ganimard alone on the emptying platform, holding Blakeney by the arm with one hand and the open empty
  case in the other; Blakeney looking after the train with quiet satisfaction; a newspaper boy in the
  background holding up the morning paper.
- Motion: very slow pull back and up; the last steam clears; pigeons lift off the roof girders.
- Caption: *Part I closed. The stone was not.*

---

## Part II: "Case Closed, Twice" (about 36 s)

The truth: the forty thousand francs ended in the Comtesse's account, and the stone was insured for three
hundred thousand. She hired the thief. Ganimard knows it and cannot prove it. Lupin, in London, sends a
telegram and a photograph. Night edition palette: the Ritz at dusk, then lamplight.

**Shot 1: The Ritz at dusk (5 s)**
- Image: The Place Vendome at dusk, seen from across the square: the Vendome column, the Ritz's arcaded facade
  with warm lit windows on the second floor, gas lamps being lit, a single cab waiting.
- Motion: slow drift towards the lit windows; a lamplighter's flame catches.
- Caption: *THE RITZ, 23 MAY, EVENING.*

**Shot 2: The Comtesse receives (6 s)**
- Image: The Comtesse's suite: silk walls, a gilt mirror, tall windows with the column beyond; the Comtesse,
  seated, poised, pours tea from a silver pot into a porcelain cup; Ganimard stands near the door holding his
  bowler, rumpled, refusing to sit.
- Motion: the tea pours; she offers the cup with a faint smile; Ganimard does not move.
- Caption: *She offered tea. Ganimard declined, which was a first.*

**Shot 3: The policy (5 s)**
- Image: Close-up on a writing desk in the suite: an insurance policy on thick cream paper with a red wax seal and
  an embossed lion stamp, beside an empty velvet jewel case and a fountain pen; the Comtesse's gloved hand rests
  on the policy. (Keep the paper's writing illegible: no readable text.)
- Motion: her fingers tap the seal once, unhurried; candlelight flickers.
- Caption: *Insured for three hundred thousand francs. Worth forty.*

**Shot 4: Ganimard leaves (5 s)**
- Image: The Ritz corridor at night, long and lamplit, red carpet, Ganimard walking away from the camera with
  his bowler back on, shoulders heavy; behind him, the suite door closing on a slice of warm light.
- Motion: slow follow; the door closes and the light narrows to nothing.
- Caption: *Case closed. Twice.*

**Shot 5: London (5 s)**
- Image: A London telegraph office at night, gaslight, wet street outside the window; a man in a cream suit
  seen from behind (Blakeney's figure, face turned away) hands a telegram form across the counter to a clerk.
- Motion: the form slides across; the clerk begins tapping the key; rain runs down the window.
- Caption: *LONDON. A TELEGRAM, REPLY PAID.*

**Shot 6: The photograph (5 s)**
- Image: A photograph lying on a Prefecture desk under a green banker's lamp, beside a torn-open telegram
  envelope: the photograph shows the Blue Star re-set as a ring, on dark velvet, a window over London behind it.
- Motion: slow push in on the photograph until the ring fills the frame; the sapphire catches the lamplight.
- Caption: *Enclosed, a photograph. No message. The jeweller had been busy.*

**Shot 7: The clerk's desk (5 s)**
- Image: Morning light on a small desk by a tall window at the Prefecture: a neat stack of police ledgers, a
  pen, a cup of coffee, a small brass nameplate on the desk (blank, no lettering), Paris rooftops outside.
- Motion: the light slowly warms; a pigeon lands on the window sill; dust motes drift.
- Caption: *You were promoted to a desk with a window.*

---

## Stills only (fallback)

If the films are not made, the same shots as stills are enough: Part I shots 1, 4, 5 and 6; Part II shots 2,
3 and 6. Use the image prompts above, 3:2 (1500x1000) to match the landing photograph, JPEG under 200 KB each.
