# neon-siege

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/RoisChakim/neon-siege/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/RoisChakim/neon-siege/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

NEON SIEGE — Endless Evolution: a 2D neon arcade survival shooter. Hold the arena against endless waves, swap between three weapons with their own ammo and reload timers, level up and draft skills, and face a Siege Core boss every fifth wave. Desktop and mobile (landscape) with a virtual joystick.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open `game/index.html` directly in a desktop browser and it also plays — no build step, no network requests, no libraries.

## How to play

- **Move:** WASD / arrow keys, or the virtual joystick on touch screens.
- **Fire:** hold J / F, hold the left mouse button, or hold TEMBAK. No auto-fire — letting go stops the shooting, and drones and rockets stop too.
- **Weapons:** Q cycles, 1 / 2 / 3 select directly, or the GANTI button. Pulse Rifle (fast, balanced), Scatter Blaster (5 pellets), Rail Lance (piercing, heavy). Each has 100 ammo and its own 4-second reload timer; R reloads early.
- **Dash:** Space (or DASH) — a quick burst with brief invulnerability.
- **Ultimate (one per weapon, all instant-kill):** every shot charges the ULTI gauge; at 100% press E (or the ULTI button). Pulse fires a **LASER** that tracks the nearest enemy for 5 seconds; Scatter fires a **NOVA** of 24 piercing projectiles in every direction; Rail fires a **MEGA LANCE** along the aim line.
- **XP:** kills pay XP the moment the enemy dies — more for bigger and tougher kinds, and more per wave as the siege gets harder. Each level pauses the fight and offers 3 skills — Plasma Core, Rapid Trigger, Multi Barrel, Piercing Rounds, Radar Overclock, Drone Bay, Rocket Pod, Hull Plating.
- **Enemies:** HP comes from size (bigger = tougher), damage and spawn speed grow every wave.
- **Waves:** 20 enemies per wave, endless. A Siege Core boss arrives every 5th wave.
- **Keys:** P / Esc pause, R reload (or restart on the game-over screen), M mute, B build.

## What is inside

- `game/index.html` + `game/js/` — the whole game, vanilla JavaScript + Canvas 2D + procedural WebAudio, classic scripts that run from `file://`.
- `game/style.css` — page shell and letterboxing.
- `screenshots/` — 4 real renders of the running game (title, combat, boss, upgrade).
- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` to the output directory and writes `dossier.json`.
- `vendor/makefun-game.ts` — the vendored make.fun helper, unchanged.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yrxrfxte&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
