<div align="center">

# ◆ RedCell

**A red-team operations console.**
Attack chains · C2 · phishing · payloads — with 100 tools as the building blocks.

![platform](https://img.shields.io/badge/platform-Windows%20x64-05080d?style=for-the-badge&labelColor=b3121b)
![electron](https://img.shields.io/badge/Electron-33-05080d?style=for-the-badge&labelColor=1b7f3b)
![license](https://img.shields.io/badge/License-MIT-05080d?style=for-the-badge&labelColor=17607f)

</div>

---

## What it is

RedCell is a native Windows desktop app (a real `.exe`, not `python script.py`) modelled on how real
red-team platforms are shaped — Cobalt Strike, Sliver, Havoc, GoPhish. The **operations** come first:
build attack chains, manage C2 listeners and sessions, run phishing campaigns, generate payloads. The
[amooryx](https://github.com/amooryx) arsenal of 100 tools sits underneath as the building blocks your
operations call on.

Every operations module works **standalone** — you do not need the 100 tool repos cloned to plan
chains, track C2 sessions, run phishing campaigns, or log activity. The tools are an optional
integration layer that individual steps can call.

The interface follows the **CrowdStrike Falcon** design language (tokens adapted from the open-source
`CrowdStrike/falcon-styles`): a pure-black SOC canvas, blue primary, red/orange/amber severity coding.
The 100 tools are organised into **15 categories and 35 subcategories**, browsable from a Falcon-style
category tree.

> **Honesty note.** RedCell is an operator console, not a from-scratch C2 beacon or a live phishing
> mailer. It **manages** listeners/sessions/campaigns and **drives your tools**; a live beacon callback
> or real email delivery uses your own infrastructure, configured per module. The 100 tools are
> labelled in three honest tiers — **pro · tested** (13, genuinely implemented on a shared `rclib`
> runtime and verified to do real work), **working** (49), and **scaffold** (38, under active
> development). Nothing is dressed up as more finished than it is; the pro tier grows each release.

## The operations

| Module | What it does |
|---|---|
| **Attack Chains** | Compose a kill-chain as executable steps across MITRE ATT&CK tactics (Recon → Initial Access → C2 → Lateral → Exfil). Bind a tool + target to each step, then **run the whole chain in order** with live output; every step is logged with its ATT&CK tactic ID. Export as a checklist. |
| **C2** | Manage listeners (HTTP/HTTPS/DNS/SMB/TCP) and track sessions. Start a listener (drives `phantom-c2`), copy its launch command, log sessions as beacons check in. |
| **Phishing** | Plan campaigns with pretext + target lists and track the funnel — sent / opened / clicked / submitted. Generate lures via `macro-gen` / `hta-builder`. |
| **Payloads** | One-click generation recipes through the arsenal — reverse shells, macros, HTA, LNK, shellcode, ISO packaging. |

## Workspace

| View | Purpose |
|---|---|
| **Dashboard** | Operations at a glance + recent ATT&CK-tagged activity |
| **Engagements** | Scope (enforced), targets, notes — the safety boundary all runs respect |
| **Activity Log** | Timestamped, ATT&CK-tagged record of everything you ran |
| **Arsenal** | All 100 tools — search, filter, favourite, run |
| **Settings** | Python interpreter, tools directory, scope enforcement, theme |

**Scope that bites.** Define an engagement's in-scope hosts once; RedCell refuses to launch anything at
an out-of-scope target, and handles suffix confusion (`corp.com.evil.com`). Light and dark themes;
Apple/IBM-Carbon design language throughout.

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
