# RetroBall

A Retro Bowl-style 2.5D pixel-art basketball game. Plain HTML5 canvas and JavaScript: no build step, no dependencies.

## Play

Open `index.html` in a browser (double-clicking works), or serve the folder from any static host.

The pause menu's Gamemode tab has **3v3 Casual** (full court, AI teammates and opponents, half-court defense) and,
under Practice, **Free shot** (just you, either hoop) and **Around the world**: 15 shots in order (three across under
the hoop, two from each elbow, three free throws, five threes around the arc), make each to move on, timed, with your
best time saved.

A 3v3 game is two 2.5-minute halves (teams switch ends at halftime), with 1-minute overtimes while tied and a
14-second shot clock; the clock stops for dead balls (free throws, resets, halftime). Half length and the shot clock
are in the 3v3 game options (the arrow beside 3v3 Casual), along with Restart game. At the final buzzer you get the
result and both teams' stats; press shoot to play again.

Reaching for a steal can be called a foul, more likely the closer you are to the ball handler. With **free throws** on
(Gamemode tab: the arrow beside 3v3 Casual opens its game options) the fouled player shoots one from the line for a point: the ref hands them the ball after two seconds.
With them off their team just keeps the ball. The rest of the time the ref walks the sideline in front of the
scorer's table, following the play.

Click a face (Player and Upgrades tabs) to pick which of your three players to customize: each has their own skin,
hair and number (Randomize rolls a new one), while the jersey, shorts and shoe colors are the whole team's.

Upgrades (pause menu, free while testing): each of the three players on your team has their own levels for speed,
shooting, dunking, defense and dash, and their own name. In 3v3 each AI opponent gets as many levels as your player in
the same spot, spread at random (the AI doesn't dash).

| Key | With the ball | On defense |
| --- | --- | --- |
| WASD / arrows | Move: keep holding a direction to speed up (faster after 0.5s, fastest after 1s) | Move |
| Double-tap W / A / S / D | Dash that way (3 second cooldown) | Dash |
| Space | Hold for a jump shot: release in the green zone. Hold away from the hoop for a fadeaway (jumps back, smaller green, harder to contest) | Jump to block or contest a shot |
| E | Dunk (range grows with your speed toward the rim) | Steal (reaching in too close risks a foul) |
| Q | Pass (to the teammate in the held direction, or the most open one) | Switch to the teammate nearest the ball (free shot: get the ball back where you stand) |
| Esc / P | Pause menu: Player (customize), Upgrades, Gamemode (3v3 and its game options, practice modes, testing, player tuning), Controls (keybinds, dash double-tap timing), UI (stats box) | |

All keys except Esc can be rebound in the Controls tab; the arrow keys always move.

The bottom of the Gamemode tab has testing sliders (dunk odds, AI level, crowd) and **Player tuning**: every number
that shapes how players move, shoot, dunk, dash, pass and defend, most important first, each with a tip and its
default. Changes are saved; reset one or all to go back to the defaults.

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
| `src/clock.js` | 3v3 game clock: halves, overtime, shot clock, final buzzer |
| `src/practice.js` | Practice drills: Around the World |
| `src/ref.js` | The referee: wanders the sideline, passes the ball in for free throws |
| `src/play.js` | Passing, steals, blocks, contests, pickups and possession |
| `src/shooting.js` | Shot meter, release grading, dunks |
| `src/ball.js` | Ball physics: arcs, rim/backboard bounces, scoring |
| `src/hoop.js` | Hoops, net, rim bend, shadows |
| `src/court.js` | Arena, crowd and court drawing |
| `src/camera.js` | Projection, zoom, tilt, panning |
| `src/tuning.js` | The player-tuning list (which config values the menu exposes, with tips and limits) |
| `src/menu.js` | Pause menu tabs: customization, per-player upgrades and names, game mode, controls, test sliders |
| `src/hud.js` | Score, meter, pop-up text |
