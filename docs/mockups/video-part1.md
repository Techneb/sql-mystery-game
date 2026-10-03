# Video 1: "The Boat Train" (closes Part I)

Plays at the top of the Chapter VIII extra edition. About 28 s, 6 shots (4 s each, 6 s for the gestures). Gare du Nord, 20 May 1912, 09:10:
Ganimard arrests Rupert Blakeney (Lupin), but the stone has already left on the boat train. Never show the
stone: only the empty case.

Work top to bottom. Each step says where to go in OpenGen, what to set, what to upload, what to paste, and
what to save. Make a folder `~/Downloads/ritz-video/` and save everything there under the names given.

## Status (2026-10-02, made by Claude driving OpenGen in Chrome)

**Done 2026-10-03:** all six clips made (Veo 3.1, 720p; shots 3 and 5 at 6 s), downloaded by the owner and
assembled by `assemble-video.sh` into `site/video/part1.{mp4,webm,jpg}` (25.6 s, 5.2 MB / 4.0 MB), shown at
the top of the extra edition (`showExtra`: waits on its poster with a "Play with sound" button, then Replay and Full screen; breaks out of the card up to 1100px). Shots 2
and 6 carried a painted "Sir John Lavery" signature in a corner (the "in the style of" prompt invites it):
blurred with `delogo`; every still and video prompt now says "no signature". A 5 s Seedance test (a cafe
scene) was not used. The history below is kept for Video 2.

All in the owner's OpenGen **Creations** (Image library), Nano Banana Pro, 16:9:
- Step A Ganimard sheet, step B style frame: done.
- Stills: shot 1, shot 2, shot 3 end (hand on the shoulder) and shot 3 start (the same picture with the
  hand removed: removing worked where "raise the hand" did not), shot 4, shot 5 start (closed case); shot 6
  and shot 5 end (open, empty case) were generating at the end of the session: check them.
- Shot 5 end (open, empty case) and shot 6 came out well.
- Videos: shot 1 generated with **Veo 3.1, 8 s, 720p: 800 credits per clip** (the menu says "from 400",
  that is 4 s). Six clips for Part I is about 4,800 credits, both films about 9,600. Cheaper image-to-video
  models in the same tool: Kling 3.0 (from 126), Seedance 2.0 (from 60), Wan 2.7 (from 50). Decided: 4 s clips
  (6 s for shots 3 and 5); shot 1's 8 s clip is kept and trimmed to 4 s in assembly. Next: check it with the owner, then decide Veo vs a cheaper model (or 4-6 s clips) for the other five.
  Video 2 not started.
- Videos made (Veo 3.1, 720p, OpenGen Video library): shot 1 (8 s, trim to 4 s) and shot 2 (4 s, 400
  credits). **Veo 3.1 on OpenGen takes no end image** ("This model doesn't support end images"): shots 3 and
  5 use the start image only and describe the gesture (shot 3 starts from the clear shoulder, the hand comes
  in; shot 5 from the closed case, the lid opens on empty satin); if a gesture fails, redo that one shot on
  Kling 3.0, which takes start and end images. Shot 3 was refused for lack of credits. Left for Part I:
  shot 3 (6 s, 600), shot 4 (4 s, 400), shot 5 (6 s, 600), shot 6 (4 s, 400): about 2,000 credits.

How driving OpenGen works (for the next session): typing into the prompt box drops characters, so set the
textarea value by script (native value setter + input event), then type one space so the page registers it,
and check the value. Upload references one at a time, from the project folder (the browser extension only
uploads files this session may read, e.g. `site/portraits/`); earlier creations are picked from the
reference panel's Creations tab (newest first; take a zoomed look before clicking, the order shifts). The
send button stays grey until every reference has finished uploading. Each Nano Banana Pro image costs 38
credits; a "CREDIT BALANCE TOO LOW" card means stop and ask the owner (never click Unlock).

## Before you start: files to have at hand

From the project folder, `site/portraits/`: `blakeney.jpg`, `ashcombe.jpg`. Copy them into
`~/Downloads/ritz-video/`.

## Settings used everywhere

| What | Image steps (stills) | Video steps |
|---|---|---|
| Tool in OpenGen | Image | Video |
| Model | **Nano Banana Pro** | **Veo 3.1**, **4 s** (6 s only where the shot says so); 8 s was too long and costs 800 credits a clip |
| Mode | Image to Image / with reference images | **Image to Video** |
| Aspect ratio | **16:9** | **16:9** |
| Size / resolution | the largest 16:9 offered (1920x1080 or more) | **1080p** if offered, else 720p |
| Number of results | 4, keep the best | 2, keep the best |
| Audio | (none) | **On** (ambience only; the prompt says which) |
| Negative prompt | paste the **Avoid** line below if there is a field | same |

**Avoid** line (paste in the negative field; if there is none, add `Avoid: ...` at the end of the prompt):
```
text, letters, captions, signature, artist's signature in a corner, subtitles, signs with writing, watermark, logo, picture frame, modern clothing, cars, electric lights, plastic, cartoon, anime, 3D render, oversaturated colour, extra fingers, distorted or changing faces, duplicated people, music, speech
```

If Veo will not take a first frame and reference images together: keep the first frame, drop the references
(the face is already in the frame). If a face drifts in Veo, redo that shot with **Kling 2.6 Pro**, Image to
Video, same first (and last) frame, same prompt, 5 or 10 s.

---

## Step A: Ganimard's reference sheet (once; Video 2 reuses it)

- OpenGen: **Image**, Nano Banana Pro, 16:9, 4 results.
- Upload as reference: `ashcombe.jpg` (for the painting style only).
- Paste:
```
Character reference sheet, oil on canvas in the style of Sir John Lavery, Paris 1912, plain warm brown background. The same man shown three times side by side: head and shoulders facing the viewer, a three-quarter view, and full figure standing. He is Inspector Ganimard of the Paris Surete, about 55, stocky and broad, a ruddy weathered face, a thick grey walrus moustache, tired shrewd grey eyes, heavy eyebrows, a black bowler hat, a dark wool overcoat buttoned to the neck, a white collar and dark tie, a furled black umbrella; slightly rumpled, a man who has not slept. Use the reference image only for the painting style, never for the face. No text, no labels.
```
- Save the best as **`ganimard_ref.png`**.

## Step B: the style frame (once; Video 2 reuses it)

- OpenGen: **Image**, Nano Banana Pro, 16:9, 4 results.
- Upload as references: `blakeney.jpg`, `ashcombe.jpg`.
- Paste:
```
A wide painted establishing image that sets the look of a short film: Paris, May 1912, the arcades of the Place Vendome in soft morning light, a few figures in period dress, a horse cab. Oil on canvas in the style of Sir John Lavery: loose confident brushwork, rich warm colour, visible paint texture, soft natural light, the faces lifelike and detailed like the reference portraits. No text, no signs with letters.
```
- Save the best as **`style_ref.png`**.

---

## Shot 1: The station (4 s)

**1a. Still**
- Image, Nano Banana Pro, 16:9. References: `style_ref.png`.
- Paste:
```
The Gare du Nord in Paris at nine in the morning, May 1912, seen from high at the end of the platform: the great iron and glass roof, shafts of morning sun cutting through drifting steam, a long dark green boat train with polished brass fittings at the platform, porters pushing wooden luggage trolleys, travellers in long coats and hats, a large station clock with Roman numerals. Oil on canvas in the style of Sir John Lavery, loose confident brushwork, rich warm colour, visible paint texture, soft natural light, shallow depth of field, period-accurate, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p1_s1.png`**.

**1b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **4 s**, audio on. First frame: `p1_s1.png`.
- Paste:
```
Slow push-in towards the boat train along the platform. Steam rises and drifts through the shafts of sunlight, a porter crosses the frame from left to right with a trolley, pigeons flutter under the roof girders, travellers walk at an unhurried morning pace. The painting comes alive with subtle realistic motion, the painted texture stays visible, steady cinematic camera. Sound: the echo of a large station, a distant whistle, footsteps, steam hissing. No music, no speech, no text or signature on screen.
```
- Save as **`p1_s1.mp4`**. Caption (added later): *GARE DU NORD, 20 MAY 1912, 09:10.*

## Shot 2: The gentleman, followed (4 s)

**2a. Still**
- Image, Nano Banana Pro, 16:9. References: `blakeney.jpg`, `ganimard_ref.png`, `style_ref.png`.
- Paste:
```
Medium tracking view along the platform beside the boat train: Rupert Blakeney, about 30, slim, handsome, clean-shaven, dark hair combed back, exactly as in his reference portrait, walks towards a first-class carriage, unhurried and elegant, a slim leather document case in one gloved hand, dark wool overcoat with a velvet collar, white silk scarf, top hat, a faint smile. Several steps behind him, slightly out of focus, Inspector Ganimard as in his reference sheet follows in his bowler hat and dark overcoat, eyes fixed on him. Steam and morning light around them. Oil on canvas in the style of Sir John Lavery, loose brushwork, rich warm colour, highly detailed lifelike faces, shallow depth of field, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p1_s2.png`**.

**2b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **4 s**, audio on. First frame: `p1_s2.png`. Reference images (if
  allowed with a first frame): `blakeney.jpg`, `ganimard_ref.png`.
- Paste:
```
The camera tracks alongside Blakeney at walking pace as he strolls beside the carriages. Behind him Ganimard quickens his step and slowly comes into focus, closing the distance. Blakeney does not look back. Faces stay exactly as in the first frame, no morphing. Subtle realistic motion, painted texture visible, steady cinematic camera. Sound: footsteps on stone, the train's idling engine, a porter calling indistinctly far away. No music, no speech, no text or signature on screen.
```
- Save as **`p1_s2.mp4`**. Caption: *Mr. Blakeney had a train to catch.*

## Shot 3: The hand on the shoulder (6 s)

**3a. Start still**
- Image, Nano Banana Pro, 16:9. References: `blakeney.jpg`, `ganimard_ref.png`, `style_ref.png`.
- Paste:
```
Close shot from behind and slightly above Rupert Blakeney's right shoulder: the dark wool of his overcoat and its velvet collar fill the lower frame, the edge of his top hat at the top. Inspector Ganimard's broad hand in a worn brown leather glove is raised, about to land on the shoulder; Ganimard's grey walrus moustache and bowler hat at the edge of the frame. Steam behind. Oil on canvas in the style of Sir John Lavery, rich warm colour, detailed, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p1_s3_start.png`**.

**3b. End still**
- Image, Nano Banana Pro, 16:9. References: `p1_s3_start.png`, `ganimard_ref.png`.
- Paste:
```
The same close shot as the reference image, a moment later, same framing, same light: Ganimard's gloved hand now rests firmly on Blakeney's shoulder, the fingers gripping the overcoat; Blakeney's head has just begun to turn. No text anywhere.
```
- Save as **`p1_s3_end.png`**.

**3c. Video**
- Video, Veo 3.1, Image to Video with **first and last frame**, 16:9, **6 s**, audio on.
  First frame: `p1_s3_start.png`. Last frame: `p1_s3_end.png`.
- Paste:
```
The gloved hand comes down and settles on the shoulder, the grip tightens on the wool; the man under it stops and slowly begins to turn his head. Steam drifts past. Subtle realistic motion, painted texture visible, steady camera. Sound: the train's engine, one long hiss of steam, then a hush. No music, no speech, no text or signature on screen.
```
- Save as **`p1_s3.mp4`**. Caption: *Inspector Ganimard had not slept in three days.*

## Shot 4: The smile and the case (4 s)

**4a. Still**
- Image, Nano Banana Pro, 16:9. References: `blakeney.jpg`, `ganimard_ref.png`, `style_ref.png`.
- Paste:
```
Two-shot at the carriage door, faces in profile to each other and very close: Rupert Blakeney, exactly as in his portrait, has turned and smiles, perfectly calm and amused; Inspector Ganimard, red-faced and grim, glares at him from under his bowler hat. Blakeney holds up between them a small closed midnight-blue velvet jewel case. Morning light from the glass roof falls between their faces. Oil on canvas in the style of Sir John Lavery, rich warm colour, highly detailed lifelike faces, shallow depth of field, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p1_s4.png`**.

**4b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **4 s**, audio on. First frame: `p1_s4.png`. References (if
  allowed): `blakeney.jpg`, `ganimard_ref.png`.
- Paste:
```
Blakeney's smile widens slightly; with exaggerated courtesy he offers the small velvet case to the inspector. Ganimard hesitates, then takes it with his gloved hand without taking his eyes off Blakeney. Slow push-in. Faces stay exactly as in the first frame. Subtle realistic motion, painted texture visible. Sound: the low murmur of the platform, the engine, a distant whistle. No music, no speech, no text or signature on screen.
```
- Save as **`p1_s4.mp4`**. Caption: *'You have my name, Inspector.'*

## Shot 5: The empty case (6 s)

**5a. Start still**
- Image, Nano Banana Pro, 16:9. References: `ganimard_ref.png`, `style_ref.png`.
- Paste:
```
Extreme close-up, seen from above: Inspector Ganimard's hands in worn brown leather gloves holding a small closed midnight-blue velvet jewel case, a small gilt clasp catching the light; the dark wool of his overcoat behind. Oil on canvas in the style of Sir John Lavery, rich warm colour, detailed, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p1_s5_start.png`**.

**5b. End still**
- Image, Nano Banana Pro, 16:9. References: `p1_s5_start.png`.
- Paste:
```
The same close-up as the reference image, same framing and light: the jewel case is now open; inside, ivory satin with a deep oval hollow where a large stone once lay. It is empty. No text anywhere.
```
- Save as **`p1_s5_end.png`**.

**5c. Video**
- Video, Veo 3.1, Image to Video with **first and last frame**, 16:9, **6 s**, audio on.
  First frame: `p1_s5_start.png`. Last frame: `p1_s5_end.png`.
- Paste:
```
A gloved thumb lifts the clasp and the lid opens slowly on the empty satin hollow; the hands hold still for a beat. Subtle realistic motion, painted texture visible, steady camera. Sound: the small click of the clasp, then the distant echo of the station. No music, no speech, no text or signature on screen.
```
- Save as **`p1_s5.mp4`**. Caption: *The case was empty.*

## Shot 6: The train leaves (4 s)

**6a. Still**
- Image, Nano Banana Pro, 16:9. References: `ganimard_ref.png`, `blakeney.jpg`, `ashcombe.jpg`, `style_ref.png`.
- Paste:
```
Wide shot along the platform: the boat train beginning to pull out towards the bright opening at the end of the station, steam rolling. Through the open door of the luggage van, a stack of leather steamer trunks with brass corners. At a first-class window, far away and small, an elderly gentleman with white mutton-chop whiskers and a monocle, as in his portrait, reads a newspaper. In the foreground Inspector Ganimard holds Rupert Blakeney by the arm with one hand and the open empty jewel case in the other; Blakeney watches the train with quiet satisfaction. Oil on canvas in the style of Sir John Lavery, rich warm colour, visible paint texture, no text anywhere, no signature or artist's name in any corner.
```
- Save as **`p1_s6.png`**.

**6b. Video**
- Video, Veo 3.1, Image to Video, 16:9, **4 s**, audio on. First frame: `p1_s6.png`.
- Paste:
```
The train accelerates away towards the light, the luggage van and its trunks receding, steam filling the platform. In the foreground the two men stand still; Blakeney's smile does not change. As the steam clears the camera pulls slowly back and up; pigeons lift off the roof girders. Subtle realistic motion, painted texture visible. Sound: the train's whistle, the rhythm of wheels fading, then the quiet station. No music, no speech, no text or signature on screen.
```
- - Save as **`p1_s6.mp4`**. Captions: *'The Blue Star has a train to catch.'*, then on the last seconds:
  *Part I closed. The stone was not.*

---

## When the six clips are done

You should have in `~/Downloads/ritz-video/`: `p1_s1.mp4` to `p1_s6.mp4` (and the stills). Tell Claude which
seconds to keep in each (or "all"). Claude assembles them on the Mac with ffmpeg: cuts, 0.8 s cross-fades,
the captions above in the paper's typefaces, a poster image, MP4 and WebM under 6 MB, and puts the film at
the top of the Chapter VIII extra edition (muted, plays once, Replay and Sound buttons).

If a shot will not animate well, keep its still: the film can show it with a slow zoom instead.
