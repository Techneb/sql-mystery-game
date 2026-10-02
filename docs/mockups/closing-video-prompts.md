# Closing video prompts (OpenGen)

Two short films, one to close each part, made on OpenGen (opengen.ai) in the style of the suspects' portraits.
Each block below is ready to paste. Work in this order: the two reference sheets once, then for each shot a
keyframe image, then the video from it, then assemble.

- **Part I, "The Boat Train"**: top of the Chapter VIII extra edition (`showExtra` in `site/app.js`).
- **Part II, "Case Closed, Twice"**: after chapter XII, above the ending text.

## The tools on OpenGen, and why

- **Keyframes: Nano Banana Pro** (image model). It takes several reference images and keeps faces and
  costumes consistent, so each shot starts from a still where everyone already looks right. Upload the portraits
  from `site/portraits/` as references. Seedream 4.5 is the second choice for painterly texture.
- **Animation: Veo 3.1**, image-to-video. Use the shot's keyframe as the **first frame**; where a shot names
  an **end frame**, give it too (Veo interpolates between them: the hand landing, the case opening). Veo also
  accepts up to **three reference images** for faces: add the character's portrait each time. Clips: 8 s
  (or 6 s where noted), 16:9, 1080p if offered. **Veo 3.1 Fast** for drafts, full Veo 3.1 for the keepers.
- **Fallback: Kling 2.6 Pro** (image-to-video, start and end frame) if Veo drifts on a face; **Sora 2** is not
  needed here (it is strongest at dialogue scenes, and these films have none).
- **Sound**: Veo generates sound with the picture. Keep only ambience (steam, footsteps, rain, a clock); no
  music, no speech. The game plays the film muted with an unmute button, so sound is a bonus, never needed.
- **Captions are not generated** (models misspell). They are added in assembly, in the paper's typeface.

Settings to check in OpenGen's interface before starting (they are not public on its site): the image size for
Nano Banana Pro (pick 16:9, 1920x1080 or the largest 16:9), whether Veo's reference images and first/last
frame can be used together (if not, prefer the first frame and put the portrait as a reference image in a
separate generation of the keyframe), and whether there is a negative-prompt field (if not, append the
"Avoid" line to the prompt).

## Step 0: two reference sheets (once)

Ganimard and the Comtesse appear in several shots; Blakeney too. Blakeney and the Comtesse already have
portraits; Ganimard has none, so make his first, then reuse it everywhere.

**0.1 Ganimard, Nano Banana Pro** (references: `site/portraits/ashcombe.jpg` for the painting style only)
```
Character reference sheet, oil painting in the style of Sir John Lavery, Paris 1912, warm brown background.
The same man shown three times side by side: head and shoulders facing the viewer, three-quarter view, full
figure standing. Inspector Ganimard of the Paris Surete, about 55, stocky and broad, ruddy weathered face, a
thick grey walrus moustache, tired shrewd grey eyes, heavy eyebrows, a black bowler hat, a dark wool overcoat
buttoned to the neck, a white collar and dark tie, a furled black umbrella. Slightly rumpled, a man who has
not slept. Use the reference image only for the painting style, not for the face. No text, no labels.
```
Save the result as `ganimard_ref.png`. Use it as a reference in every shot with Ganimard.

**0.2 Style frame, Nano Banana Pro** (references: `site/portraits/blakeney.jpg`, `site/portraits/comtesse.jpg`)
```
A wide painted establishing image to set the look of a short film: Paris, May 1912, the arcades of the Place
Vendome in soft morning light, a few figures in period dress, a horse cab. Oil on canvas in the style of Sir
John Lavery: loose confident brushwork, rich warm colour, visible paint texture, soft natural light, the faces
lifelike and detailed like the two reference portraits. 16:9. No text, no signs with letters.
```
Save it as `style_ref.png`. Add it as a reference to every keyframe below, so all shots share one look.

## Shared lines (append to every keyframe and video prompt)

Style (append to keyframe prompts):
```
Oil on canvas in the style of Sir John Lavery, Paris 1912, loose confident brushwork, rich warm colour, visible
paint texture in the background, highly detailed lifelike faces matching the reference portraits, soft natural
light, shallow depth of field, period-accurate costume and architecture, 16:9, no text anywhere.
```
Motion style (append to video prompts):
```
The painting comes alive: subtle realistic motion, the painted texture stays visible, no morphing faces,
steady cinematic camera, 24 fps.
```
Avoid (negative field, or append as "Avoid: ..."):
```
text, letters, captions, subtitles, signs with writing, watermark, logo, picture frame, modern clothing, cars,
electric lights, plastic, cartoon, anime, 3D render, oversaturated colour, extra fingers, distorted or
changing faces, duplicated people, music, speech.
```

## Characters (keep identical; these lines are already inside the prompts)

- **Rupert Blakeney (Lupin)**: about 30, slim, handsome, clean-shaven, dark hair neatly combed back, a knowing
  half-smile; a dark wool overcoat with a velvet collar, a white silk scarf at the throat, a top hat. Reference:
  `site/portraits/blakeney.jpg`.
- **Inspector Ganimard**: as in step 0.1. Reference: `ganimard_ref.png`.
- **The Comtesse de Cagliostro**: about 30, pale, dark hair in a loose chignon, red lips, a cool half-smile; a
  sapphire-blue silk gown off the shoulders with black lace, a high black lace choker, drop earrings.
  Reference: `site/portraits/comtesse.jpg`.
- **Lord Ashcombe** (seen once, far away): elderly, white mutton-chop whiskers, monocle. Reference:
  `site/portraits/ashcombe.jpg`.
- **The Blue Star**: a large cushion-cut sapphire, deep cornflower blue, the size of a quail's egg.

---

## Part I: "The Boat Train" (about 46 s, 6 shots)

Gare du Nord, 20 May 1912, 09:10. Ganimard has the man, not the stone: the sapphire is already on the train, in
a trunk Lord Ashcombe does not know he carries. Never show the stone in Part I, only its absence.

### Shot 1: The station (8 s)
Keyframe, Nano Banana Pro (references: `style_ref.png`)
```
The Gare du Nord in Paris at nine in the morning, May 1912, seen from high at the end of the platform: the
great iron and glass roof, shafts of morning sun cutting through drifting steam, a long dark green boat train
with polished brass fittings at the platform, porters pushing wooden luggage trolleys, travellers in long coats
and hats, a large station clock with Roman numerals and no readable lettering.
```
Video, Veo 3.1 (first frame: the keyframe; 8 s)
```
Slow push-in towards the boat train along the platform. Steam rises and drifts through the shafts of sunlight,
a porter crosses the frame from left to right with a trolley, pigeons flutter under the roof girders, travellers
walk at an unhurried morning pace. Sound: a large station's echo, a distant whistle, footsteps, steam hissing.
```
Caption: *GARE DU NORD, 20 MAY 1912, 09:10.*

### Shot 2: The gentleman, followed (8 s)
Keyframe, Nano Banana Pro (references: `blakeney.jpg`, `ganimard_ref.png`, `style_ref.png`)
```
Medium tracking view along the platform beside the boat train: Rupert Blakeney walks towards a first-class
carriage, unhurried and elegant, a slim leather document case in one gloved hand, dark overcoat with velvet
collar, white silk scarf, top hat, a faint smile. Several steps behind him, slightly out of focus, Inspector
Ganimard follows in his bowler hat and dark overcoat, eyes fixed on him. Steam and morning light around them.
```
Video, Veo 3.1 (first frame: the keyframe; references: `blakeney.jpg`, `ganimard_ref.png`; 8 s)
```
The camera tracks alongside Blakeney at walking pace as he strolls beside the carriages. Behind him Ganimard
quickens his step and slowly comes into focus, closing the distance. Blakeney does not look back.
Sound: footsteps on stone, the train's idling engine, a porter calling indistinctly in the distance.
```
Caption: *Mr. Blakeney had a train to catch.*

### Shot 3: The hand on the shoulder (6 s, start and end frames)
Start frame, Nano Banana Pro (references: `blakeney.jpg`, `ganimard_ref.png`, `style_ref.png`)
```
Close shot from behind and slightly above Blakeney's right shoulder: the dark wool of his overcoat and the
velvet collar fill the lower frame; Inspector Ganimard's broad hand in a worn brown leather glove is raised,
about to land on the shoulder; Ganimard's grey walrus moustache and bowler at the edge of the frame. Steam
behind.
```
End frame, Nano Banana Pro (same references; give it the start frame too, as a reference)
```
The same close shot, a moment later: Ganimard's gloved hand now rests firmly on Blakeney's shoulder, fingers
gripping the overcoat; Blakeney's head has just begun to turn.
```
Video, Veo 3.1 (first frame: start; last frame: end; 6 s)
```
The gloved hand comes down and settles on the shoulder, the grip tightens on the wool; the man under it stops
walking and slowly begins to turn his head. Steam drifts past.
Sound: the train's engine, one long hiss of steam, then a hush.
```
Caption: *Inspector Ganimard had not slept in three days.*

### Shot 4: The smile and the case (8 s)
Keyframe, Nano Banana Pro (references: `blakeney.jpg`, `ganimard_ref.png`, `style_ref.png`)
```
Two-shot at the carriage door, faces in profile to each other and very close: Blakeney has turned and smiles,
perfectly calm, amused; Ganimard, red-faced and grim, glares at him from under his bowler. Blakeney holds up
between them a small midnight-blue velvet jewel case, closed. Morning light from the glass roof falls between
their faces.
```
Video, Veo 3.1 (first frame: the keyframe; references: `blakeney.jpg`, `ganimard_ref.png`; 8 s)
```
Blakeney's smile widens slightly; with exaggerated courtesy he offers the small velvet case to the inspector.
Ganimard hesitates, then takes it with his gloved hand without taking his eyes off Blakeney. Slow push-in.
Sound: low murmur of the platform, the engine, a distant whistle.
```
Caption: *'You have my name, Inspector.'*

### Shot 5: The empty case (6 s, start and end frames)
Start frame, Nano Banana Pro (references: `ganimard_ref.png`, `style_ref.png`)
```
Extreme close-up, top-down: Ganimard's gloved hands holding a small midnight-blue velvet jewel case, closed,
a small gilt clasp catching the light; the dark wool of his overcoat behind.
```
End frame, Nano Banana Pro (references: the start frame)
```
The same close-up: the case is open; inside, ivory satin with a deep oval hollow where a large stone once lay.
It is empty.
```
Video, Veo 3.1 (first frame: start; last frame: end; 6 s)
```
The thumb lifts the clasp and the lid opens slowly on the empty satin hollow; the hands hold still for a beat.
Sound: the small click of the clasp, then the station's distant echo.
```
Caption: *The case was empty.*

### Shot 6: The train leaves (10 s: 8 s, extended)
Keyframe, Nano Banana Pro (references: `ganimard_ref.png`, `blakeney.jpg`, `ashcombe.jpg`, `style_ref.png`)
```
Wide shot along the platform: the boat train beginning to pull out towards the bright opening at the end of the
station, steam rolling. Through the open door of the luggage van, a stack of leather steamer trunks with brass
corners. At a first-class window, far away and small, an elderly gentleman with white mutton-chop whiskers and
a monocle reads a newspaper. In the foreground, Ganimard holds Blakeney by the arm with one hand and the open
empty case in the other; Blakeney watches the train with quiet satisfaction.
```
Video, Veo 3.1 (first frame: the keyframe; 8 s; then Extend by 2-4 s if offered)
```
The train accelerates away towards the light, the luggage van and its trunks receding, steam filling the
platform. In the foreground the two men stand still; Blakeney's smile does not move. As the steam clears the
camera pulls slowly back and up; pigeons lift off the roof girders.
Sound: the train's whistle, the rhythm of wheels fading, then the quiet station.
```
Caption: *'The Blue Star has a train to catch.'* then, on the last seconds: *Part I closed. The stone was not.*

---

## Part II: "Case Closed, Twice" (about 46 s, 6 shots)

The forty thousand francs ended in the Comtesse's account; the stone was insured for three hundred thousand.
She hired the thief. Ganimard knows it and cannot prove it. Lupin, in London, sends a telegram with a
photograph. Night palette: dusk, then lamplight.

### Shot 1: The Ritz at dusk (8 s)
Keyframe, Nano Banana Pro (references: `style_ref.png`)
```
The Place Vendome in Paris at dusk, May 1912, seen from across the square: the bronze Vendome column against a
deep blue sky, the arcaded facade of the Ritz with warm golden light in the second-floor windows, gas lamps,
a single horse cab waiting, a lamplighter on a ladder.
```
Video, Veo 3.1 (first frame: the keyframe; 8 s)
```
Slow drift towards the lit second-floor windows; the lamplighter's flame catches and a gas lamp glows; the cab
horse shifts its weight; the sky deepens. Sound: evening square, hooves on cobbles, a far church bell.
```
Caption: *THE RITZ, 23 MAY 1912, EVENING.*

### Shot 2: The Comtesse receives (8 s)
Keyframe, Nano Banana Pro (references: `comtesse.jpg`, `ganimard_ref.png`, `style_ref.png`)
```
The Comtesse's suite at the Ritz in lamplight: silk-panelled walls, a gilt mirror, tall windows with the
column outside in the dusk. The Comtesse de Cagliostro sits poised on a small sofa in her sapphire-blue gown
and black lace choker, pouring tea from a silver pot into a porcelain cup. Near the door stands Inspector
Ganimard, rumpled, bowler held against his chest, refusing to sit.
```
Video, Veo 3.1 (first frame: the keyframe; references: `comtesse.jpg`, `ganimard_ref.png`; 8 s)
```
She finishes pouring and offers the cup with a faint, perfectly polite smile. Ganimard does not move, then
gives the smallest shake of the head. She sets the cup down without hurry. Slow push-in on her.
Sound: china on china, a clock ticking, the muffled square outside.
```
Caption: *She offered tea. Ganimard declined, which was a first.*

### Shot 3: The policy (8 s)
Keyframe, Nano Banana Pro (references: `comtesse.jpg`, `style_ref.png`)
```
Close-up on a writing desk in the suite by candlelight: an insurance policy on thick cream paper with a red wax
seal and an embossed lion stamp, its writing illegible; beside it an empty midnight-blue velvet jewel case and
a fountain pen. The Comtesse's gloved hand rests on the policy, a sapphire-blue sleeve at the edge of frame.
```
Video, Veo 3.1 (first frame: the keyframe; 8 s)
```
Her fingers tap the wax seal once, unhurried, then slide the policy an inch towards the empty case. The
candle flame flickers; the camera tilts slowly from the policy to the empty case. Sound: paper, a candle, the
clock.
```
Caption: *Insured for three hundred thousand francs. Worth forty.*

### Shot 4: Ganimard leaves (6 s)
Keyframe, Nano Banana Pro (references: `ganimard_ref.png`, `style_ref.png`)
```
A long lamplit corridor of the Ritz at night, red carpet, gilt sconces: Ganimard seen from behind walking away,
bowler back on, shoulders heavy; behind him, at the camera's side, a suite door half open on warm light.
```
Video, Veo 3.1 (first frame: the keyframe; 6 s)
```
Ganimard walks slowly away down the corridor; the door beside the camera swings shut and the warm slice of
light narrows to nothing. Sound: footsteps on carpet, the door's soft click.
```
Caption: *Case closed. Twice.*

### Shot 5: London (8 s)
Keyframe, Nano Banana Pro (references: `blakeney.jpg`, `style_ref.png`)
```
A London telegraph office at night in gaslight, rain running down the window onto a wet street with a hansom
cab. A man in a dark overcoat with a velvet collar and a top hat, seen from behind and three-quarter, his face
mostly turned away, slides a handwritten telegram form across the wooden counter to a clerk in sleeve
garters. The form's writing is illegible.
```
Video, Veo 3.1 (first frame: the keyframe; references: `blakeney.jpg`; 8 s)
```
The form slides across; the clerk takes it and starts tapping the telegraph key; the man tips his hat and turns
towards the door without showing his face. Rain streams down the glass. Sound: rain, the tapping key, a bell
over the door.
```
Caption: *LONDON. A TELEGRAM, AND A PHOTOGRAPH.*

### Shot 6: The ring, then the clerk's desk (10 s: two clips, cross-faded)
6a keyframe, Nano Banana Pro (references: `style_ref.png`)
```
A sepia photograph lying on a desk at the Paris Prefecture under a green banker's lamp, next to a torn-open
telegram envelope; the photograph shows the Blue Star, a large cornflower-blue sapphire re-set as a ring, on
dark velvet by a window over London rooftops.
```
6a video, Veo 3.1 (first frame: 6a; 6 s)
```
Slow push-in on the photograph until the ring fills the frame; the lamp's light catches the paper's sheen.
Sound: the hum of the lamp, a page turning somewhere.
```
6b keyframe, Nano Banana Pro (references: `style_ref.png`)
```
Morning at the Prefecture: a small tidy desk by a tall window over Paris rooftops, a neat stack of ledgers, a
pen, a cup of coffee, a small blank brass nameplate. Sunlight.
```
6b video, Veo 3.1 (first frame: 6b; 4-6 s)
```
The morning light slowly warms; a pigeon lands on the sill; dust motes drift in the sun. Sound: the city waking,
a pigeon's wings.
```
Captions: *Enclosed, a photograph. No message.* then *You were promoted to a desk with a window.*

---

## Assembly

1. Download the keepers (MP4). Trim each to its best seconds; cross-fade 0.8 s between shots; Part I runs
   about 46 s, Part II about 46 s.
2. Captions: lower third, Playfair Display bold for datelines (*GARE DU NORD...*), Cormorant Garamond italic for
   the lines, cream (#f3ead7) on a soft dark shadow; 3 s each, faded.
3. Export: MP4 (H.264) and WebM (VP9), 1280x720, under 6 MB each, plus a poster JPEG (first frame). Put them in
   `~/Downloads` named `part1.mp4`, `part1.webm`, `part1.jpg`, `part2...`; the next session installs them in
   `site/video/` and wires them into the page (muted, plays once, Replay and Sound buttons, poster if it cannot
   play).

If a Mac with ffmpeg does the assembly, Claude can do steps 1-3 from the downloaded clips: name them
`p1_s1.mp4` ... `p2_s6b.mp4` and say which seconds to keep.

## Stills only (fallback)

If a shot will not animate well, its keyframe alone is fine: the page can show the keyframes as a slow
slideshow (cross-fade 0.8 s, 3% zoom). Minimum set: Part I shots 1, 4, 5 (end frame) and 6; Part II shots 2,
3 and 6a.
