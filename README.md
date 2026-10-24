# RetroBall

A Retro Bowl-style 2.5D pixel-art basketball game. Plain HTML5 canvas and JavaScript: no build step, no dependencies.

## Play

Open `index.html` in a browser (double-clicking works), or serve the folder from any static host.

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Shift | Sprint |
| Hold Space | Jump shot: release in the green zone on the meter |
| F | Dunk (range grows with your speed toward the rim) |
| Esc / P | Pause menu: customize your player, plus a test panel for dunk odds |

## Embed on a website

Upload the folder, then:

```html
<iframe src="/retroball/index.html" width="960" height="540" style="border:0" allowfullscreen></iframe>
```

The game scales itself to fit the frame in whole pixels. Players click the frame once to give it keyboard focus.

## Code layout

| File | What it does |
| --- | --- |
| `src/config.js` | All tunable numbers: court size, speeds, shot timing, dunk odds, camera, colors |
| `src/main.js` | Game loop, resets, rendering order |
| `src/player.js` | Player movement and the pixel-art sprite |
| `src/shooting.js` | Shot meter, release grading, dunks |
| `src/ball.js` | Ball physics: arcs, rim/backboard bounces, scoring |
| `src/hoop.js` | Hoops, net, rim bend, shadows |
| `src/court.js` | Arena, crowd and court drawing |
| `src/camera.js` | Projection, zoom, tilt, panning |
| `src/menu.js` | Pause menu and player customization |
| `src/hud.js` | Score, meter, pop-up text |
