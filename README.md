# CivExit — Offline Crisis Simulation Engine

> A high-fidelity survival simulation built to train calm, sequential decision-making under total blackout and urban collapse scenarios.

Built for the **AUBG 8.0 Hackathon** — Survival Category.

---

## What is CivExit?

Most people have never practiced what to do when infrastructure collapses. CivExit fills that gap with a browser-based simulation that puts you in the middle of a real disaster — with real consequences for every choice you make.

You pick a scenario (earthquake, fire, or wilderness evacuation), manage survival stats in real time, answer embedded knowledge checkpoints, and get a debrief on what you did right and what got you killed. The goal is not just to survive — it's to learn *why* certain decisions work.

---

## Scenarios

| Scenario | Setting | Key Hazards |
|---|---|---|
| Earthquake | Urban collapse | Aftershocks, structural failure, gas leaks |
| Fire | Building evacuation | Smoke inhalation, panic spread, blocked exits |
| Woods | Wilderness survival | Exposure, dehydration, navigation failure |

Each scenario has its own hazard array, event sequencing, and decision tree.

---

## Core Systems

**Decision Engine** — Every action updates health, stamina, oxygen, and panic in real time. Decisions compound; a bad call early makes the next one harder.

**Quiz Checkpoints** — Knowledge prompts embedded mid-simulation. Getting them wrong costs you stats. Getting them right unlocks hints for future runs.

**Analytics Dashboard** — Tracks panic vs. calm ratios, success rates, and common failure points across all sessions via Supabase. Persists a session leaderboard in local storage.

**Modular Scenario Engine** — New disaster scenarios can be added by dropping a new JS module into `src/js/` and registering it in the config.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, Tailwind CSS, Vanilla JavaScript |
| Fonts | Outfit + Space Mono (Google Fonts) |
| Backend / DB | Supabase (PostgreSQL, REST API) |
| Build | Tailwind CLI (`npm run build`) |
| Deployment | Render (Static Site) / GitHub Pages |

No frameworks. No bundler required for the simulation itself — just a static file server.

---

## Project Structure

```
├── index.html              # Landing page
├── game.html               # Scenario selection + simulation engine
├── quiz.html               # Standalone quiz page
├── database.html           # Analytics dashboard
├── admin-migrate.html      # Admin data migration utility
├── supabase-client.js      # Supabase client initialization
├── src/
│   ├── js/
│   │   ├── config.js       # Environment config (secrets — gitignored)
│   │   ├── config.example.js  # Template for local setup
│   │   ├── main.js         # Core simulation loop
│   │   ├── earthquake.js   # Earthquake scenario logic
│   │   ├── fire.js         # Fire scenario logic
│   │   ├── woods.js        # Wilderness scenario logic
│   │   ├── quiz.js         # Quiz engine
│   │   ├── database.js     # Supabase read/write helpers
│   │   └── ui.js           # HUD updates, animations, DOM utilities
│   ├── css/
│   │   └── tailwind-input.css
│   └── assets/
│       ├── data/
│       │   └── survival.json   # Simulation parameter data
│       └── images/             # Icons, backgrounds, favicon
├── style.css               # Compiled Tailwind output
├── tailwind.config.js
└── package.json
```

---

## Running Locally

**Prerequisites:** Node.js (for Tailwind build) and a Supabase project.

```bash
git clone https://github.com/BorkoAXT/AUBG_8.0-KiberMechencha_CivExit.git
cd AUBG_8.0-KiberMechencha_CivExit
```

Copy the config template and fill in your Supabase credentials:

```bash
cp src/js/config.example.js src/js/config.js
# Edit config.js with your SUPABASE_URL and SUPABASE_KEY
```

Install dependencies and build Tailwind:

```bash
npm install
npm run build
```

Serve the static files:

```bash
npx serve
# or
python3 -m http.server 5500
```

Open `http://127.0.0.1:5500/`.

For active development with live Tailwind rebuilds:

```bash
npm run dev
```

---

## Deploying to Render

1. Create a **Static Site** web service in Render and connect your GitHub repo.
2. Set **Build Command:** `npm install && npm run build`
3. Set **Publish Directory:** `/`
4. Add environment variables for your Supabase credentials in the Render dashboard.
5. Deploy — Render auto-deploys on every push to `main`.

---

## License

[GPL-3.0](LICENSE)
