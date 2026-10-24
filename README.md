# RetroBall

A Retro Bowl-style 2.5D pixel-art basketball game. Plain HTML5 canvas and JavaScript: no build step, no dependencies.

## Play

Open `index.html` in a browser (double-clicking works), or serve the folder from any static host.

Two modes, picked in the pause menu's Gamemode tab: **3v3 Casual** (full court, AI teammates and opponents, half-court
defense) and **Free shot** (just you).

Reaching for a steal can be called a foul, more likely the closer you are to the ball handler. With **free throws** on
(Gamemode tab) the fouled player shoots one from the line for a point; with them off their team just keeps the ball.

Upgrades (pause menu, free while testing): each of the three players on your team has their own levels for speed,
shooting, dunking, defense and dash, and their own name. In 3v3 each AI opponent gets as many levels as your player in
the same spot, spread at random (the AI doesn't dash).

| Key | With the ball | On defense |
| --- | --- | --- |
| WASD / arrows | Move: keep holding a direction to speed up (faster after 0.5s, fastest after 1s) | Move |
| Double-tap W / A / S / D | Dash that way (3 second cooldown) | Dash |
| Space | Hold for a jump shot: release in the green zone. Hold away from the hoop for a fadeaway (jumps back, smaller green, harder to contest) | Jump to block or contest a shot |
| E | Dunk (range grows with your speed toward the rim) | Steal (reaching in too close risks a foul) |
| Q | Pass (to the teammate in the held direction, or the most open one) | Switch to the teammate nearest the ball |
| Esc / P | Pause menu: Player (customize), Upgrades, Gamemode (mode, free throws), Controls (keybinds, dash double-tap timing), Test (dunk odds, AI level, crowd) | |

All keys except Esc can be rebound in the Controls tab; the arrow keys always move.

## Embed on a website

Upload the folder, then:

```html
<iframe src="/retroball/index.html" width="960" height="540" style="border:0" allowfullscreen></iframe>
```

The game scales itself to fit the frame in whole pixels. Players click the frame once to give it keyboard focus.

## Code layout

| File | What it does |
| --- | --- |
| `src/config.js` | All tunable numbers: court size, speeds, shot timing, dunk odds, defense, AI, upgrades, camera, colors |
| `src/main.js` | Game loop, modes, keyboard controls, resets, rendering order |
| `src/player.js` | Player movement and the pixel-art sprite |
| `src/team.js` | Teams, rosters and team colors, which hoop each team attacks |
| `src/ai.js` | Computer players: offense, defense, chasing loose balls |
| `src/play.js` | Passing, steals, blocks, contests, pickups and possession |
| `src/shooting.js` | Shot meter, release grading, dunks |
| `src/ball.js` | Ball physics: arcs, rim/backboard bounces, scoring |
| `src/hoop.js` | Hoops, net, rim bend, shadows |
| `src/court.js` | Arena, crowd and court drawing |
| `src/camera.js` | Projection, zoom, tilt, panning |
| `src/menu.js` | Pause menu tabs: customization, per-player upgrades and names, game mode, controls, test sliders |
| `src/hud.js` | Score, meter, pop-up text |
