<div align="center">

# ◆ RedCell

**A unified command console for red-team tooling.**
One desktop app. 100 tools. Engagement-scoped. Apple-clean.

![platform](https://img.shields.io/badge/platform-Windows%20x64-05080d?style=for-the-badge&labelColor=b3121b)
![electron](https://img.shields.io/badge/Electron-33-05080d?style=for-the-badge&labelColor=1b7f3b)
![license](https://img.shields.io/badge/License-MIT-05080d?style=for-the-badge&labelColor=17607f)

</div>

---

## What it is

RedCell is a native Windows desktop app (a real `.exe`, not `python script.py`) that puts the
whole [amooryx](https://github.com/amooryx) red-team arsenal behind one clean interface. Instead of
remembering 100 command lines, you browse, search, scope, launch, and read output from a single
console built for daily engagement work.

It is a **launcher and workspace**, not a re-implementation: it drives the actual tool repos, so every
tool stays independently versioned and auditable.

> **Honesty note.** Of the 100 catalogued tools, **60 are working** and **40 are scaffolds** under
> active development. RedCell labels each one — `working` or `scaffold` — so you always know what
> you are about to run. Nothing here is dressed up as more finished than it is.

## Why it helps on a normal engagement day

- **One surface.** Every tool, categorised and searchable, with favourites — no context-switching.
- **Scope that bites.** Define an engagement's in-scope hosts once; RedCell refuses to launch a tool
  at an out-of-scope target. Suffix confusion (`corp.com.evil.com`) is handled.
- **Live output.** Tools spawn as child processes and stream `stdout`/`stderr` into the console in
  real time; stop a run with one click.
- **Engagement memory.** Targets, scope, and notes persist per engagement on disk.
- **No lock-in.** Tools remain plain repos; RedCell just orchestrates them.

## Screens

| View | Purpose |
|---|---|
| **Dashboard** | Arsenal at a glance, active engagement, category breakdown |
| **Arsenal** | All 100 tools — filter by category, search, favourite, one-click run |
| **Runner** | Pick a tool, set target + args, execute, watch live output |
| **Engagements** | Create engagements, define scope + targets, keep notes |
| **Settings** | Python interpreter, tools directory, scope enforcement, theme |

Light and dark themes; the whole thing follows an Apple/IBM-Carbon design language — one accent,
real type scale, generous space.

## Install

**Option A — run the packaged app (recommended)**

Download `RedCell.exe` from the [latest release](https://github.com/amooryx/RedCell/releases) and run it.

**Option B — from source**

```bash
git clone https://github.com/amooryx/RedCell.git
cd RedCell
npm install
npm start          # launch the app
npm run smoke      # headless sanity checks
```

**Build your own exe**

```bash
npx electron-packager . RedCell --platform=win32 --arch=x64 --out=dist --overwrite
# -> dist/RedCell-win32-x64/RedCell.exe
```

## First-run setup

1. Open **Settings** → set your **Python interpreter** and a **tools directory**.
2. Clone the tools into that directory (PowerShell):
   ```powershell
   gh repo list amooryx --limit 200 --json name -q '.[].name' | % { gh repo clone amooryx/$_ "TOOLS/$_" }
   ```
3. Create an **Engagement**, set its in-scope hosts, and start running.

## Architecture

```
RedCell.exe  (Electron main — Node)
  ├── app/main.js        window · IPC · the ONLY place tools are spawned · scope gate · persistence
  ├── app/preload.js     contextBridge — the sole renderer↔Node surface
  └── app/renderer/      UI (no Node access)
        ├── index.html
        ├── styles.css   design system (light/dark)
        ├── app.js       views, state, live console
        └── tools.json   the 100-tool catalog
```

Security posture: `contextIsolation` on, `nodeIntegration` off, a strict CSP, and a single audited IPC
surface. The renderer can never shell out on its own — every spawn goes through `main.js`, which
enforces engagement scope first.

## Disclaimer

> **Authorised security testing only.** RedCell and the tools it launches are for systems you own or
> have explicit written permission to test. Engagement scope is a safety feature, not a licence.

## Author

**Omar Khalid Ali Mohamed Ahmed** — OSCP+ · OSCP · CRTP · eWPTX · eCPPT · eCDFP · eCIR · eJPT
[omareldemery.com](https://omareldemery.com) · [@amooryx](https://github.com/amooryx)

MIT licensed.
