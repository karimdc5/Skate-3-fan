# Skate Fan 🛹

An **unofficial, fan-made skateboarding game inspired by Skate 3**, built to run in the browser and play well on **iPhone**, with full support for **Xbox and PS5 (DualSense) controllers**.

> Not affiliated with or endorsed by Electronic Arts. "Skate" is a trademark of its owner. All code and art here is original; no assets from the real game are used.

## Features

- 3D skatepark: plaza, ledges, rails, funbox, kickers, a 5-stair with handrail, a mini halfpipe, a big quarter pipe and a drop-in hill
- **Flick-it trick controls** on the right stick, like Skate: Ollie, Nollie, Kickflip, Heelflip, Shove-its, 360 Flip, Laser Flip, plus late flips
- Grinds and slides (50-50, 5-0, Nosegrind, Crooked, Feeble, Boardslide, Noseslide, Tailslide, Lipslide), manuals, grabs and spins
- Bails when you land sideways, don't finish your flip, or hold a grab too long
- Trick lines with multipliers, a saved best score, and 12 challenges
- Spawn marker (set your own spot and jump back to it), like Skate's session markers
- **iPhone-friendly**: touch controls, safe-area support for the notch, landscape layout, "Add to Home Screen" for full screen, and it works offline
- **Controller Connect tool**: pairing steps for Xbox and PS5 on iPhone, a list of detected controllers, a live button/stick tester, deadzone, swap sticks, rumble test and **button remapping**
- Sound effects are generated in code, so there are no audio files

## Play it on your iPhone

The game is a static website, so GitHub Pages can host it for free:

1. On GitHub open this repo → **Settings** → **Pages**.
2. Under **Build and deployment** choose **Deploy from a branch**, pick **`main`** and **`/ (root)`**, then **Save**.
3. After about a minute your game is at `https://karimdc5.github.io/skate-3-fan/`.
4. Open that link in **Safari** on your iPhone, tap **Share → Add to Home Screen**, and launch it from the home screen for full screen.

## Connecting a controller (iPhone)

**Xbox Wireless Controller**
1. Hold the **Xbox button** to turn it on.
2. Hold the **Pair button** (top edge) until the logo flashes fast.
3. iPhone **Settings → Bluetooth** → tap **Xbox Wireless Controller**.
4. Open the game and **press any button**.

**PS5 DualSense**
1. With the controller off, hold **Create + PS** until the light bar flashes.
2. iPhone **Settings → Bluetooth** → tap **DualSense Wireless Controller**.
3. Open the game and **press any button**.

Then tap the 🎮 button in the game to test buttons, adjust the deadzone, test rumble or remap buttons. (Safari only shows a controller after you press one of its buttons while the page is open.)

## Controls

| Action | Touch | Xbox | PS5 | Keyboard |
|---|---|---|---|---|
| Steer / spin | Left thumb drag | Left stick | Left stick | A / D |
| Push | PUSH | A | ✕ | W |
| Brake | BRAKE | X | □ | S |
| Ollie | Tap or swipe ↑ on the right side | RS ↓ then flick ↑ | RS ↓ then flick ↑ | Space |
| Kickflip / Heelflip | Swipe ↖ / ↗ | RS ↓ then flick ↖ / ↗ | same | Q / E |
| Pop Shove-it / FS Shove-it | Swipe ← / → | RS ↓ then ← / → and let go | same | R |
| 360 Flip / Laser Flip | Swipe ↙ / ↘ | RS ↓ then roll through ← / → to ↑ | same | F / X |
| Nollie tricks | (Pro flick mode) | Start the flick from RS ↑ | same | Shift + trick |
| Manual | Swipe ↓ and hold | Hold RS ↓ softly | same | – |
| Grab | GRAB (hold) | LT / RT (or LB / RB) | L2 / R2 (or L1 / R1) | Z / C |
| Back to marker | ⟲ | Y | △ | T |
| Set marker | 📍 | D-pad ↑ | D-pad ↑ | G |
| Switch camera | Settings | B | ○ | V |
| Pause | ❚❚ | Menu | Options | Esc |

Grab names change with the left stick direction (Indy, Melon, Nosegrab, Tailgrab, Stalefish, Method, Crail, Roast Beef). Grinds change with the left stick too (push it forward for a Nosegrind, back for a 5-0).

In **Settings** you can switch touch tricks to **Pro flick** (the real Skate-style pull back and flick), turn on **auto-push**, flip the layout for left-handed play, and choose the camera and graphics quality.

## Running it on a computer

It's plain HTML, CSS and JavaScript with no build step. Serve the folder with any static web server, for example:

```bash
npx http-server -p 8080 .
# then open http://localhost:8080
```

(Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.)

## Project layout

```
index.html            page, HUD, menus, controller tool UI
css/style.css         styles (mobile safe areas, touch controls)
js/main.js            renderer, camera, menus, game loop
js/world.js           skatepark geometry, height field, rails
js/skater.js          skater model, physics, tricks, grinds, bails
js/tricks.js          trick list + flick-it gesture recognizer
js/input.js           touch, keyboard and gamepad input
js/gamepad.js         Xbox / PlayStation detection, mapping, rumble
js/controllers.js     Controller Connect tool
js/score.js           trick lines, scoring, challenges
js/audio.js           generated sound effects
js/storage.js         saved settings
vendor/three.module.js  three.js r160 (MIT license)
sw.js, manifest.webmanifest, icons/   offline support and home-screen app
```

## Credits

- 3D rendering by [three.js](https://threejs.org) (MIT, see `vendor/three.LICENSE`).
- Inspired by EA's Skate series. This is a non-commercial fan project.
