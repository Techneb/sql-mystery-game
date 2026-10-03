# Video 2: "Case Closed, Twice" (closes Part II)

Plays after chapter XII, above the ending text. About 34 s, 7 clips (4 s, 6 s where someone speaks, 8 s for the tea scene's exchange). Unlike Video 1, **the characters speak**: Veo 3.1 generates the voices and the lip movement from the lines in the prompt. The forty thousand francs ended in the
Comtesse's account and the stone was insured for three hundred thousand: she hired the thief. Ganimard knows
it and cannot prove it. Lupin, in London, sends a telegram with a photograph. Night palette: dusk, then
lamplight.

Work top to bottom. Each step says where to go in OpenGen, what to set, what to upload, what to paste, and
what to save. Use the same folder as Video 1: `~/Downloads/ritz-video/`.

## Before you start: files to have at hand

- From Video 1: **`ganimard_ref.png`** and **`style_ref.png`** (steps A and B of `video-part1.md`; if Video 1
  is not made yet, do those two steps first).
- From the project folder, `site/portraits/`: `comtesse.jpg`, `blakeney.jpg`. Copy them into the folder.

## Settings used everywhere

| What | Image steps (stills) | Video steps |
|---|---|---|
| Tool in OpenGen | Image | Video |
| Model | **Nano Banana Pro** | **Veo 3.1**, the length each shot gives (4 s silent, 6 s for one or two short lines, 8 s only for the tea scene). Credits: 400 / 600 / 800; this film is about 3,800 plus the stills |
| Mode | Image to Image / with reference images | **Image to Video** |
| Aspect ratio | **16:9** | **16:9** |
| Size / resolution | the largest 16:9 offered (1920x1080 or more) | **1080p** if offered, else 720p |
| Number of results | 4, keep the best | 2, keep the best |
| Audio | (none) | **On**: the spoken line and the ambience the prompt names |
| Negative prompt | paste the **Avoid** line below if there is a field | same |

**Avoid** line (paste in the negative field; if there is none, add `Avoid: ...` at the end of the prompt):
```
text, letters, captions, signature, artist's signature in a corner, subtitles, signs with writing, watermark, logo, picture frame, modern clothing, cars, electric lights, plastic, cartoon, anime, 3D render, oversaturated colour, extra fingers, distorted or changing faces, duplicated people, music, subtitles
```

## The voices (keep them identical in every prompt)

- **Ganimard**: a gruff, gravelly, tired male voice, about 55, speaking English with a light French accent, slow and dry.
- **The Comtesse**: a low, velvety, amused female voice, about 30, English with a faint Italian accent, unhurried.
- **Lupin** (as the English gentleman): a light, warm, amused baritone, polished upper-class English accent.

Rules that keep Veo on track: one short line per speaker, the line in double quotes after `says:`, the speaker
named and described in the same sentence, and `no subtitles` (Veo otherwise sometimes writes the line on
screen). If a voice comes out wrong, regenerate that clip: the voice is not consistent across clips unless
the description is word for word the same. The film autoplays muted, so every spoken line is also burned in
as a subtitle at assembly (Claude times it from the clip's audio).

If Veo will not take a first frame and reference images together: keep the first frame, drop the references.
If a face drifts in Veo, redo that shot with **Kling 2.6 Pro**, Image to Video, same first frame, same prompt,
5 or 10 s.

---

## Shot 1: The Ritz at dusk (4 s)

**1a. Still**
- Image, Nano Banana Pro, 16:9. References: `style_ref.png`.
- Paste:
```
The Place Vendome in Paris at dusk, May 1912, seen from across the square: the bronze Vendome column against a deep blue evening sky, the arcaded stone facade of the Ritz with warm golden light in the second-floor windows, gas lamps, a single horse cab waiting, a lamplighter on a ladder. Oil on canvas in the style of Sir John Lavery, loose confident brushwork, rich colour, visible paint texture, soft evening light, period-accurate, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p2_s1.png`**.

**1b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **4 s**, audio on. First frame: `p2_s1.png`.
- Paste:
```
Slow drift towards the lit second-floor windows of the Ritz; the lamplighter's flame catches and a gas lamp begins to glow; the cab horse shifts its weight; the sky deepens towards night. Subtle realistic motion, the painted texture stays visible, steady cinematic camera. Sound: an evening square, hooves on cobbles, a far church bell. No music, no speech, no text or signature on screen.
```
- Save as **`p2_s1.mp4`**. Caption: *THE RITZ, 23 MAY 1912, EVENING.*

## Shot 2: The Comtesse receives Ganimard (6 s)

**2a. Still**
- Image, Nano Banana Pro, 16:9. References: `comtesse.jpg`, `ganimard_ref.png`, `style_ref.png`.
- Paste:
```
The Comtesse de Cagliostro's suite at the Ritz in lamplight: silk-panelled walls, a gilt mirror, tall windows with the Vendome column outside in the dusk. The Comtesse, about 30, pale, dark hair in a loose chignon, red lips, exactly as in her reference portrait, in a sapphire-blue silk gown off the shoulders with black lace and a high black lace choker, sits poised on a small sofa pouring tea from a silver pot into a porcelain cup. Near the door stands Inspector Ganimard, as in his reference sheet, rumpled, his bowler hat held against his chest, refusing to sit. Oil on canvas in the style of Sir John Lavery, warm lamplight, highly detailed lifelike faces, shallow depth of field, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p2_s2.png`**.

**2b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **8 s** (800 credits: two lines need the time), audio on. First frame: `p2_s2.png`. References (if allowed):
  `comtesse.jpg`, `ganimard_ref.png`.
- Paste:
```
She finishes pouring and offers the cup with a faint, perfectly polite smile. The Comtesse, in a low, velvety, amused female voice with a faint Italian accent, says: "Tea, Inspector? You look as if you have been reading all night." Ganimard does not move; in a gruff, gravelly, tired male voice with a light French accent, he says: "No, thank you, Madame." She sets the cup down without hurry. Slow push-in towards her. Faces stay exactly as in the first frame, no morphing; lips move only when that person speaks. Subtle realistic motion, painted texture visible. Sound: the two voices, china on china, a clock ticking. No music, no subtitles, no text or signature on screen.
```
- Save as **`p2_s2.mp4`**. Subtitles: the two spoken lines. Caption after them: *Ganimard declined, which was a first.*

## Shot 3: The insurance policy (4 s)

**3a. Still**
- Image, Nano Banana Pro, 16:9. References: `comtesse.jpg`, `style_ref.png`.
- Paste:
```
Close-up on a writing desk in the Comtesse's suite by candlelight: an insurance policy on thick cream paper with a red wax seal and an embossed lion stamp, its handwriting illegible; beside it an open, empty midnight-blue velvet jewel case and a fountain pen. The Comtesse's hand in a black lace glove rests on the policy, a sapphire-blue silk sleeve at the edge of the frame. Oil on canvas in the style of Sir John Lavery, warm candlelight, rich colour, detailed, no readable text anywhere, no signature or artist's name in any corner.
```
- Save as **`p2_s3.png`**.

**3b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **6 s**, audio on. First frame: `p2_s3.png`.
- Paste:
```
Her fingers tap the wax seal once, unhurried, then slide the policy an inch towards the empty jewel case. Off screen, a gruff, gravelly, tired male voice with a light French accent says: "Three hundred thousand francs, Madame. For a stone worth forty." A low, velvety, amused female voice with a faint Italian accent answers: "One insures what one loves, Inspector." The candle flame flickers; the camera tilts slowly from the policy to the empty case. Subtle realistic motion, painted texture visible. Sound: the two voices, paper on wood, the clock. No music, no subtitles, no text or signature on screen.
```
- Save as **`p2_s3.mp4`**. Subtitles: the two spoken lines (they replace the old caption).

## Shot 4: Ganimard leaves (4 s)

**4a. Still**
- Image, Nano Banana Pro, 16:9. References: `ganimard_ref.png`, `style_ref.png`.
- Paste:
```
A long lamplit corridor of the Ritz at night, red carpet, gilt wall sconces: Inspector Ganimard seen from behind walking away, bowler hat back on, shoulders heavy; beside the camera a suite door stands half open on warm golden light. Oil on canvas in the style of Sir John Lavery, warm lamplight, deep shadows, visible paint texture, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p2_s4.png`**.

**4b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **4 s**, audio on. First frame: `p2_s4.png`.
- Paste:
```
Ganimard walks slowly away down the corridor, then, without turning round, mutters in a gruff, gravelly, tired male voice with a light French accent: "Case closed. Twice." The door beside the camera swings shut and the warm slice of light narrows to nothing. Subtle realistic motion, painted texture visible, steady camera. Sound: the muttered line, footsteps on carpet, the door's soft click. No music, no subtitles, no text or signature on screen.
```
- Save as **`p2_s4.mp4`**. Subtitle: the spoken line.

## Shot 5: London (4 s)

**5a. Still**
- Image, Nano Banana Pro, 16:9. References: `blakeney.jpg`, `style_ref.png`.
- Paste:
```
A London telegraph office at night in gaslight, rain running down the window onto a wet street with a hansom cab outside. A man in a dark wool overcoat with a velvet collar and a top hat, as in the reference portrait, seen from behind and three-quarter with his face mostly turned away, slides a handwritten telegram form across the wooden counter to a clerk in sleeve garters. The form's writing is illegible. Oil on canvas in the style of Sir John Lavery, gaslight, rain, rich colour, no readable text anywhere, no signature or artist's name in any corner.
```
- Save as **`p2_s5.png`**.

**5b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **6 s**, audio on. First frame: `p2_s5.png`. Reference (if allowed):
  `blakeney.jpg`.
- Paste:
```
The form slides across the counter. The man in the top hat, face turned away, says in a light, warm, amused baritone with a polished upper-class English accent: "To the Prefecture of Police, Paris. For the curious clerk." The clerk answers "Very good, sir," and starts tapping the telegraph key; the man touches the brim of his hat and turns towards the door without showing his face. Rain streams down the glass. Subtle realistic motion, painted texture visible. Sound: the voices, rain, the tapping key, a small bell over the door. No music, no subtitles, no text or signature on screen.
```
- Save as **`p2_s5.mp4`**. Caption first: *LONDON.* Then the subtitle of his line.

## Shot 6: The ring, then the clerk's desk (4 s + 4 s)

**6a. Still: the photograph**
- Image, Nano Banana Pro, 16:9. References: `style_ref.png`.
- Paste:
```
A sepia photograph lying on a desk at the Paris Prefecture under a green banker's lamp, next to a torn-open telegram envelope; the photograph shows the Blue Star, a large cushion-cut cornflower-blue sapphire re-set as a ring, on dark velvet by a window over London rooftops. Oil on canvas in the style of Sir John Lavery, lamplight, rich colour, detailed, no readable text anywhere, no signature or artist's name in any corner.
```
- Save as **`p2_s6a.png`**.

**6b. Video: the photograph**
- Video, Veo 3.1, Image to Video, 16:9, **4 s**, audio on. First frame: `p2_s6a.png`.
- Paste:
```
Slow push-in on the photograph until the ring fills the frame; the lamp's light catches the sheen of the paper and the blue of the stone. Subtle realistic motion, painted texture visible. Sound: the hum of the lamp, a page turning somewhere. No music, no speech, no text or signature on screen.
```
- Save as **`p2_s6a.mp4`**. Caption: *Enclosed, a photograph. No message.*

**6c. Still: the desk with a window**
- Image, Nano Banana Pro, 16:9. References: `style_ref.png`.
- Paste:
```
Morning at the Paris Prefecture: a small tidy desk by a tall window over the rooftops of Paris, a neat stack of ledgers, a pen, a cup of coffee, a small blank brass nameplate, sunlight falling across the desk. Oil on canvas in the style of Sir John Lavery, morning light, rich warm colour, visible paint texture, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p2_s6b.png`**.

**6d. Video: the desk**
- Video, Veo 3.1, Image to Video, 16:9, **6 s**, audio on. First frame: `p2_s6b.png`.
- Paste:
```
The morning light slowly warms across the desk; a pigeon lands on the window sill; dust motes drift in the sun. Off screen, a gruff, gravelly, tired male voice with a light French accent says: "Your new desk, clerk. It has a window. Do not get used to it." Subtle realistic motion, painted texture visible, still camera. Sound: the voice, the city waking outside, a pigeon's wings. No music, no subtitles, no text or signature on screen.
```
- Save as **`p2_s6b.mp4`**. Subtitle: the spoken line, then on the held last frame: *Case closed. Twice. The stone was not.*

---

## When the clips are done

You should have in `~/Downloads/ritz-video/`: `p2_s1.mp4` to `p2_s5.mp4`, `p2_s6a.mp4`, `p2_s6b.mp4` (and the
stills). Tell Claude which seconds to keep in each (or "all"). Claude assembles them on the Mac with ffmpeg:
cuts, 0.8 s cross-fades, the captions above in the paper's typefaces, a poster image, MP4 and WebM under
6 MB, and puts the film above the Part II ending (decided 2026-10-03: it does not autoplay; it opens on its poster with a large "Play with sound" button, since browsers allow sound only after a click; then Replay and Full screen, exactly as Video 1 now does; subtitles stay for anyone with the sound off).

If a shot will not animate well, keep its still: the film can show it with a slow zoom instead.
