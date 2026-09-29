# Carmine Granata — Landing scrollytelling

Static landing page (no build step). The four Firefly clips are joined into one continuous
video that is scrubbed by scroll: vineyard → house → doorway → cellar → glass.

```
index.html        page + chapter copy (edit the Spanish text here)
css/style.css     palette tokens in :root — retune to match the main site
js/main.js        scroll → video engine, chapters, rail, reveals
assets/video/     journey-1280.mp4 (desktop) · journey-854.mp4 (mobile / data saver)
assets/img/       poster, stills for the cards, og.jpg
```

Preview: `npx http-server . -p 8080` and open http://localhost:8080. Any static host works
(the video must be served over http(s), not opened via `file://`).

## Chapters
Each `.chapter` in `index.html` has `data-range="fadeInStart fadeInEnd fadeOutStart fadeOutEnd"`,
expressed as scroll progress 0–1 through the video (38 s ≈ 913 frames).
Scroll length is `.hero { height: 900vh }` in `css/style.css`.

## Re-encoding the video
Scrubbing needs every frame to be a keyframe (`-g 1`), otherwise seeking stutters:

```
ffmpeg -i in.mp4 -vf scale=1280:720 -c:v libx264 -preset slow -crf 27 -g 1 -bf 0 \
       -pix_fmt yuv420p -movflags +faststart -an journey-1280.mp4
```

## To review before publishing
- Logo: the header uses a text wordmark + red dot; swap in the real logo.
- Copy is a draft written from the footage; check tone and facts with the winery.
- Contact section links to the main site; replace with the real WhatsApp / email.
- Palette and fonts (Cormorant Garamond + Jost) were chosen from the brand name and footage.
