# Carmine Granata — Landing scrollytelling

Static landing page (no build step). The four Firefly clips are joined into one continuous
video that is scrubbed by scroll: vineyard → house → doorway → cellar → glass.

```
index.html        page + chapter copy (edit the Spanish text here)
css/style.css     palette tokens in :root — retune to match the main site
js/main.js        scroll → video engine, chapters, rail, reveals
assets/video/     scene-1..4-1080.mp4 (full res) · scene-1..4-720.mp4 (phones held upright)
assets/img/       poster, stills for the cards, og.jpg
```

Preview: `npx http-server . -p 8080` and open http://localhost:8080. Any static host works
(the video must be served over http(s), not opened via `file://`).

## Chapters
Each `.chapter` in `index.html` has `data-range="fadeInStart fadeInEnd fadeOutStart fadeOutEnd"`,
expressed as scroll progress 0–1 through the video (38 s ≈ 913 frames).
Scroll length is `.hero { height: 1000vh }` in `css/style.css`.

## Re-encoding the video
Each of the four source clips is its own file, played back to back. The page loads
scene 1 first, opens, and loads the rest behind it. A keyframe every 4 frames keeps
scrubbing smooth while keeping each file under 15 MB:

```
ffmpeg -i clip.mp4 -c:v libx264 -preset slow -crf 19 -g 4 -keyint_min 4 -bf 0 \
       -pix_fmt yuv420p -movflags +faststart -an scene-1-1080.mp4
```
Clips 2–4 drop their first frame (`-vf trim=start_frame=1,setpts=PTS-STARTPTS`),
because it repeats the last frame of the clip before. If you have higher-resolution
masters, re-encode from those; the page picks 1080 or 720 by screen size.

## To review before publishing
- Hero chapter text is the winery's own copy. The sections below the video (cards, visits,
  contact) reuse those facts in draft wording; review before publishing.
- Logos live in `assets/img/logo-*.webp` (tinted cream for the dark page) and `favicon.png`.
- Contact section links to the main site; replace with the real WhatsApp / email.
- Fonts: Cormorant Garamond (headings), Jost (body), Marcellus (labels; close to the wordmark).
