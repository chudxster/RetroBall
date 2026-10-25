# RetroBall

A Retro Bowl-style 2.5D pixel-art basketball game. Plain HTML5 canvas and JavaScript: no build step, no dependencies.

## Play

Open `index.html` in a browser (double-clicking works), or serve the folder from any static host.

The game opens on the **main menu**, with the computer playing a game against itself behind it. A dock on the left
holds the modes: **Career**, **Locker room**, **Casual** and **2 Player** (each slides a drawer out beside the dock:
Casual has a 3v3 game with its options under it, the daily game and the practice drills; 2 Player has Local and
Online tabs), **Customize** (your team's look
and names) and **Settings** (controls and display), plus a Fullscreen button. Along the bottom runs your career
season as a road, a stop for every game: played weeks show their score (green for a win, red for a loss), this
week's stop is yellow, and the semifinal and final come last. Above this week's stop are its matchup and three
challenges: pick one to tip off straight from the menu (Upgrades opens the Career screen).
Click, or use the arrow keys / WASD and Enter or Space; Esc goes back. In a game, Esc (or P) opens the pause menu, whose **Main menu** button leaves the game (in a career game it asks first: a game
left early is a forfeit loss, also if the page is closed mid-game) and **Restart** starts it over (not in career).

**Career** is a season in an 8-team league: every team plays every other once, then the top 4 play semifinals and a
final, and the next season starts with tougher opponents. Each AI team has its own colors and strength; their other
games are simulated for the standings. The Career screen shows the season, the next opponent and the standings.
Before each game pick one of three challenges from different tiers, in random order (Easy x1.1, Medium x1.25, Hard
x1.5, Pro x2), shown top left during the game. Meet a
stat challenge (threes, steals, dunks, blocks, points) and a little jingle plays as its box flashes and floats away; a
win, win-by or hold-them goal can still slip until the buzzer, so its jingle plays then. A game pays a token per point your team scores, x1.25 for a win or
x0.75 for a loss, times the challenge's multiplier if you completed it, rounded up. Spend tokens on the Career screen
(a level costs 10 x its number); the career team has its own names and levels, separate from the free testing
upgrades. After a career game, shoot takes you back to the Career screen for the next one. Career progress saves
automatically in the browser after every game and upgrade (the Career screen warns if the browser can't save, as in
some private windows).

The **Locker room** (main menu) is a room you walk around in as your player: the coach at the whiteboard, your two
teammates at their lockers and a reporter by the TV camera each hand out quests (walk up and press your dunk key,
Enter or Space to talk). A quest is a goal for your games, in one game or added up over several (Quick game, career,
the daily game and 2 Player co-op count); a yellow ! means a quest to pick up, a bouncing green one tokens to claim.
Claiming pays career tokens and counts toward the Locker Room trophy. The trophy case on the right wall holds
every trophy you've earned: pick which ones (up to 13) stand on the scoreboard's shelf in games. You come in through
the black EXIT door on the left wall; walk back out of it (or press Esc) to leave. The glowing arch on the right wall is the tunnel to the
court: walk into it to be asked "Ready for the next game?" and pick a challenge to tip off your next career game.
Talking shows the speaker's portrait, their line and a quest card (goal, progress, reward) while the room dims;
markers show a speech bubble for a new quest, the progress for one under way and a spinning gold token for tokens
to claim. The room remembers your last game, once: streamers, confetti and the score on the whiteboard after a win,
towels over heads and a blue half-light after a loss. Once your first career season is finished it becomes the
**Dynasty Room**: a banner for every title, open wood stalls with your jerseys, a trophy wall with the Finals cup
and a DYNASTY rug (with `?dev=1`, the UI tab can switch it on to test).

**Quick game** is 3v3 Casual (full court, AI teammates and opponents, half-court defense), with a difficulty
(Rookie, Pro or All-Star: how good the AI opponents are; 2 Player co-op uses it too) and the game options (free
throws, half length, shot clock: Career and 2 Player games use them too) before you tip off.

The **Daily game** (on the Quick game screen) is one short game a day, the same for everyone: today's date picks
the opponent (a league team in its colors), how good they are, their upgrades and a goal, and seeds every random
roll after tip-off. It always plays two 1.5-minute halves with no upgrades on your side. Your first game each day
counts: meet the goal on consecutive days to build a streak. Replays are fine but don't change the day's result, and
leaving a daily game early counts as a miss.

**2 Player** is two people on one keyboard: **Versus 3v3** (each runs a team with two AI teammates), **Versus 1v1**,
or **Co-op** (together, plus an AI teammate, against three AI players). Player 1 plays with WASD, R (shoot), E
(dunk/steal) and Q (pass/switch); player 2 with IJKL, P, O and U; both sets can be changed in Settings (the Controls tab), and only Esc pauses. Before tip-off both players get the same random number of upgrade points and spend them
on a split screen at the same time (up/down to pick, right to add, left to take back, shoot when ready), with both
players' keys drawn on a shared keyboard below (each player's in their color, lighting up while held): in versus
they upgrade their whole team, in co-op their own player. At halftime they get more. After the final buzzer player
1's shoot key **runs it back** with the same pre-game upgrades, player 2's starts a new draft.

**Online** (prototype) is 2 Player versus (1v1 or 3v3) across two browsers: one person hosts a lobby and gets a
4-letter code, the other types the code or picks the lobby from the list of open games. Both then see the lobby (who's
in, the format) and the host presses **Start game**. The game runs on the host's computer: the guest's keys play
player 2 and the guest's screen shows the host's game. If the guest leaves, the host's lobby opens up again. **Internet** games go through a free public
relay (EMQX's public MQTT broker, `src/net.js` RELAY; the small mqtt.js library loads from a CDN only when you go
online), so they need an internet connection, and the traffic isn't private. A relay of our own can replace it in
one place. **This computer** connects two tabs of the same browser instead, with no internet (for testing). Leaving
with Main menu ends the game for both.

**Practice** has **Free shot** (just you, either hoop) and **Around the world**: 15 shots in order (three across
under the hoop, two from each elbow, three free throws, five threes around the arc), make each to move on, timed,
with your best time saved.

Every game but free shot starts with a 3-2-1 countdown (a beep on each number, GO! in green) while everyone holds
still; in 2 Player it runs once both players are done with the upgrade draft.

**Courts**: Quick game and Practice play on the court picked on their screens: Classic Hardwood, College
Fieldhouse, Sunset Blacktop, Neon Night, Rooftop Cage, Arcade Floor, Old School Gym, Park Afternoon or Throwback 77.
Career games are at home on Classic Hardwood, and the Final is on Finals Night: house lights down, the crowd's phones
flashing, and a spotlight that follows whoever has the ball. 2 Player and the daily game use Classic Hardwood.

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

**Trophies** count the things you do over and over, in every mode (both players in 2 Player add to the same
shelf): shots, points, threes, passes, dunks, steals, blocks, dashes, free throws and games finished. Each goes
Bronze, Silver, Gold, then Platinum, and a few secret ones stay hidden as ??? until you stumble into them. A new
trophy flashes a banner and the crowd cheers; earned ones stand on a shelf on top of the scorer's table. The pause
menu's UI tab lists them all with your counts, and turns the shelf off.

**Gear** (pause menu, Gear tab) is cosmetics your trophies unlock, each metal unlocking the next style: a headband and
wristbands (Pickpocket), a shooting sleeve (Shooter) and goggles (Rim Protector), worn per player; a shoe line with
a matching dash puff (Burst) and the Showtime kit, tube socks to the full road kit (Dime Dropper), for the team; and
for your games a ball (Long Range, plus the Brick ball from the Brick Mason secret), a dunk trail (Dunker), a banner
in the rafters over your home basket (Iron Man) and the rim and net pack (the Demolition secret). The AI demo behind
the main menu never wears any. A Showtime kit that clashes with the away team sends them out in its opposite color.

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
| Esc / P | Pause menu, a dock on the right with its tabs down a rail (Settings tabs always; the Customize tabs, Player, Upgrades and Gear, only in a Quick game; the main menu's Customize and Settings open just their own): Player (customize), Upgrades, Controls (dash double-tap timing, and a drawn keyboard showing each action's keys in its color: click an action, then press or click its new key; 1 Player or either 2 Player player), UI (stats box, sound, trophies), plus Resume, Restart and Main menu | |

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
| `src/courts.js` | The courts: each one's colors and features, the casual pick, which court a game uses |
| `src/court.js` | Arena, crowd and court drawing |
| `src/camera.js` | Projection, zoom, tilt, panning |
| `src/tuning.js` | The player-tuning list (which config values the menu exposes, with tips and limits) |
| `src/menu.js` | Pause menu tabs: customization, per-player upgrades and names, controls, UI, the Testing tab (tools, test sliders, tuning) |
| `src/hud.js` | Score, meter, pop-up text, the final screen's box score |
| `src/net.js` | Online play prototype: hosting, joining, the lobby finder, state snapshots |
| `src/cosmetics.js` | Cosmetics: every item's styles, which trophy unlocks them, what you picked |
| `src/quests.js` | Locker room quests: who gives which, progress from finished games, rewards |
| `src/locker.js` | The locker room: walking around, the people and their talk panel, the trophy case |

## Tests

`tests/` holds headless tests that run the real game in Microsoft Edge, no installs needed:

```
powershell -ExecutionPolicy Bypass -File tests\run.ps1          # everything
powershell -ExecutionPolicy Bypass -File tests\run.ps1 career   # just tests/career.test.js
```

Each `*.test.js` runs inside a page built from the current `index.html` (`tests/lib.js` loads first: it seeds
`Math.random`, clears storage and stops the frame loop so tests drive `update()` themselves). Covered: every mode
running with the AI playing everyone, the box score, popups, the Testing tab's tools, difficulty, 2 Player fairness,
calling for the ball, save versions, the career forfeit across a reload, the main menu's season road, the career goal jingle, the locker room's quests and trophy case
and an online match between two tabs.
