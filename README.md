# RetroBall

A Retro Bowl-style 2.5D pixel-art basketball game. Plain HTML5 canvas and JavaScript: no build step, no dependencies.

## Play

Open `index.html` in a browser (double-clicking works), or serve the folder from any static host.

The game opens on the **main menu**, with the computer playing a game against itself behind it: **Career**,
**Quick game**, **2 Player**, **Practice**, **Customize** (your team's look and names) and **Settings** (controls and
display), plus a Fullscreen button. Click, or use the arrow keys / WASD and Enter or Space; Esc goes back. In a game,
Esc (or P) opens the pause menu, whose **Main menu** button leaves the game (in a career game it asks first: a game
left early is a forfeit loss, also if the page is closed mid-game) and **Restart** starts it over (not in career).

**Career** is a season in an 8-team league: every team plays every other once, then the top 4 play semifinals and a
final, and the next season starts with tougher opponents. Each AI team has its own colors and strength; their other
games are simulated for the standings. The Career screen shows the season, the next opponent and the standings.
Before each game pick one of three challenges from different tiers, in random order (Easy x1.1, Medium x1.25, Hard
x1.5, Pro x2), shown top left during the game. A game pays a token per point your team scores, x1.25 for a win or
x0.75 for a loss, times the challenge's multiplier if you completed it, rounded up. Spend tokens on the Career screen
(a level costs 10 x its number); the career team has its own names and levels, separate from the free testing
upgrades. After a career game, shoot takes you back to the Career screen for the next one. Career progress saves
automatically in the browser after every game and upgrade (the Career screen warns if the browser can't save, as in
some private windows).

**Quick game** is 3v3 Casual (full court, AI teammates and opponents, half-court defense), with a difficulty
(Rookie, Pro or All-Star: how good the AI opponents are; 2 Player co-op uses it too) and the game options (free
throws, half length, shot clock: Career and 2 Player games use them too) before you tip off.

**2 Player** is two people on one keyboard: **Versus 3v3** (each runs a team with two AI teammates), **Versus 1v1**,
or **Co-op** (together, plus an AI teammate, against three AI players). Player 1 plays with WASD, R (shoot), E
(dunk/steal) and Q (pass/switch); player 2 with IJKL, P, O and U; both sets can be changed in Settings (the Controls
tab), and only Esc pauses. Before tip-off both players get the same random number of upgrade points and spend them
on a split screen at the same time (up/down to pick, right to add, left to take back, shoot when ready): in versus
they upgrade their whole team, in co-op their own player. At halftime they get more. After the final buzzer player
1's shoot key **runs it back** with the same pre-game upgrades, player 2's starts a new draft.

**Practice** has **Free shot** (just you, either hoop) and **Around the world**: 15 shots in order (three across
under the hoop, two from each elbow, three free throws, five threes around the arc), make each to move on, timed,
with your best time saved.

A 3v3 game is two 2.5-minute halves (teams switch ends at halftime), with 1-minute overtimes while tied and a
14-second shot clock; the clock stops for dead balls (free throws, resets, halftime). At the final buzzer you get the
result and a box score (points, FG, 3PT, FT, steals, blocks, dunks) for each team and each player; press shoot to
play again.

Reaching for a steal can be called a foul, more likely the closer you are to the ball handler. With **free throws** on
(Quick game options) the fouled player shoots one from the line for a point: the ref hands them the ball after two
seconds. With them off their team just keeps the ball. The rest of the time the ref walks the sideline in front of
the scorer's table, following the play.

**Sound**: every sound is made by the game itself with Web Audio (no sound files, nothing to license): dribbles
and bounces, rim clanks, backboard thuds, swishes, passes, dashes, steals, blocks, dunks, a shattering rim, the ref's
whistle, the period horn, airballs, the crowd's roar and menu clicks, panned toward where they happen. The demo
behind the main menu plays quieter. Sound on/off and volume are in the pause menu's UI tab. Browsers only allow
sound after a click or key press, so it starts with the first one.

The home crowd mostly sits on its hands, but jumps up for big plays: steals, blocks, baskets, threes and dunks, a
rim-hanging or rim-shattering dunk loudest of all (the other team's plays get half the cheer). After a basket some
fans may wave signs with the scorer's number.

Click a face (Player and Upgrades tabs) to pick which of your three players to customize: each has their own skin,
hair and number (Randomize rolls a new one), while the jersey, shorts and shoe colors are the whole team's.

Upgrades (pause menu, free while testing; career levels are bought on the Career screen): each of the three players
on your team has their own levels for speed, shooting, dunking, defense and dash, and their own name. In 3v3 each AI
opponent gets as many levels as your player in the same spot, spread at random (the AI doesn't dash).

| Key | With the ball | On defense |
| --- | --- | --- |
| WASD / arrows | Move: keep holding a direction to speed up (faster after 0.5s, fastest after 1s) | Move |
| Double-tap W / A / S / D | Dash that way (3 second cooldown) | Dash |
| Space | Hold for a jump shot: release in the green zone. Hold away from the hoop for a fadeaway (jumps back, smaller green, harder to contest) | Jump to block or contest a shot |
| E | Dunk (range grows with your speed toward the rim) | Steal (reaching in too close risks a foul) |
| Q | Pass (to the teammate in the held direction, or the most open one) | Switch to the teammate nearest the ball (free shot: get the ball back where you stand) |
| Esc / P | Pause menu: Player (customize), Upgrades, Controls (keybinds, dash double-tap timing), UI (stats box), plus Main menu, Restart and Resume | |

All keys except Esc can be rebound in the Controls tab; the arrow keys always move.

Add `?dev=1` to the address (e.g. `index.html?dev=1`) for the pause menu's **Testing** tab: playtesting tools (End game, End period, 10 s left, shot clock to 3 s,
Home/Away +3, Ball to me, Free throw, +100 career tokens), testing sliders (dunk odds,
AI level, crowd) and **Player tuning**: every number that shapes how players move, shoot, dunk, dash, pass and defend,
most important first, each with a tip and its default. Changes are saved; reset one or all to go back to the defaults.

## Embed on a website

Upload the folder, then:

```html
<iframe src="/retroball/index.html" width="960" height="540" style="border:0" allowfullscreen></iframe>
```

The game scales itself to fit the frame in whole pixels and opens on the main menu; players click the frame once to
give it keyboard focus.

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
| `src/title.js` | The main menu and its screens: career (challenges, upgrades, standings), quick game, 2 Player, practice |
| `src/sfx.js` | Sound effects, generated with Web Audio (no files) |
| `src/career.js` | Career mode: league, schedule, standings, playoffs, challenges, tokens and bought upgrades |
| `src/duo.js` | 2 Player mode: formats, the split-screen upgrade draft, run it back |
| `src/ref.js` | The referee: wanders the sideline, passes the ball in for free throws |
| `src/play.js` | Passing, steals, blocks, contests, pickups and possession |
| `src/shooting.js` | Shot meter, release grading, dunks |
| `src/ball.js` | Ball physics: arcs, rim/backboard bounces, scoring |
| `src/hoop.js` | Hoops, net, rim bend, shadows |
| `src/court.js` | Arena, crowd and court drawing |
| `src/camera.js` | Projection, zoom, tilt, panning |
| `src/tuning.js` | The player-tuning list (which config values the menu exposes, with tips and limits) |
| `src/menu.js` | Pause menu tabs: customization, per-player upgrades and names, controls, UI, the dev tab (test sliders, tuning) |
| `src/hud.js` | Score, meter, pop-up text |
