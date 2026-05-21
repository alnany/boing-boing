# Boing Boing — Source Handoff

Live: https://cailei-boing.vercel.app
Repo (icons only): https://github.com/alnany/boing-boing-assets

## What this is

A 4×4 grid of bouncy spheres. Tap to pop. One is a bomb — pops it and milk erupts everywhere, game over. Already shipped as an installable PWA (iOS + Android + desktop). Goal of this handoff: native wrappers for App Store + Google Play.

## Stack

- Pure HTML + CSS + vanilla JS — no build step, no framework
- Web Audio API for sounds (5 synthesized — boing/pop/warn/gush/win, no audio files)
- PWA: `manifest.webmanifest` + `sw.js` (network-first HTML/JS/CSS, cache-first assets)
- Currently deployed as a static site on Vercel

## Files

| File | What |
|---|---|
| `index.html` | Markup, viewport meta with `viewport-fit=cover`, manifest + SW registration |
| `style.css` | Layout, ball gradients, animations (jello physics, eruption shake, title) |
| `game.js` | Game logic, device-motion physics, milk-particle canvas, multi-touch input |
| `audio.js` | Web Audio synthesis (lazy-init on first pointerdown for iOS) |
| `manifest.webmanifest` | PWA manifest — icons reference raw.githubusercontent.com |
| `sw.js` | Service worker (cache name: `boing-boing-v37`) |
| `icons/` | Source icon at all 7 PWA sizes |

## Native wrapping notes for July

- **iOS**: easiest path is **Capacitor** (`npx cap init` → `npx cap add ios`) wrapping the existing static folder as the web layer. WebView already does the heavy lifting; haptics + status-bar plugins optional. Bundle ID and Apple Dev account: not yet decided — Chris had separate Bonbon listing (App Store ID `6760094591`), confirm with him whether to reuse that team or create a new one for Boing Boing.
- **Android**: same Capacitor project → `npx cap add android`. Or use **Bubblewrap** for a TWA (Trusted Web Activity) since this is already a working PWA — fastest Play Store path, smaller binary.
- **Audio + iOS**: `audio.js` already lazy-inits AudioContext on first `pointerdown`. That's the only iOS gotcha.
- **Safe area**: `viewport-fit=cover` is set; CSS uses `env(safe-area-inset-*)` on `.frame` padding. Native wrapper should respect this.
- **Known issue (unresolved)**: on iPhone 17 PWA-standalone, the milk fountain doesn't quite reach the home-indicator strip. Latest deploy mitigates by flipping the page background to milk-cream during the eruption (`body.erupting` class). Native WebView may not have this exact issue since it controls the chrome.

## Cache-bust convention

Every deploy bumps query params on `style.css`/`game.js`/`audio.js` AND the SW `CACHE` constant. Current: `?v=55` / `boing-boing-v37`.

## Deploy

```bash
# whatever vercel deployment flow Chris is using; static drop of this folder
```
