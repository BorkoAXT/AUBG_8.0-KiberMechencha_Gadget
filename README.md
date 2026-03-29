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

## Deploying to Vercel

1. Push your repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Set **Framework Preset:** `Other`
3. Set **Build Command:** `npm install && npm run build`
4. Set **Output Directory:** `.` (root)
5. Add your Supabase credentials as environment variables in the Vercel project settings (`SUPABASE_URL`, `SUPABASE_KEY`).
6. Click **Deploy** — Vercel auto-deploys on every push to `main`.

---

## Market Research

### The Problem

Emergency preparedness education in Bulgaria is almost entirely theoretical. Students read about what to do in a fire or earthquake — they don't practice it. When a real event happens, the gap between knowing and doing becomes life-threatening.

### Target Audience

Bulgaria has approximately **716,000 students** enrolled in primary and secondary education (grades 1–12) as of 2025. Sofia alone accounts for roughly **135,000–140,000** of those students, making it by far the largest single urban market. A smaller but high-purchasing-power segment — students in private schools — numbers around **15,000–16,000 nationally**, representing just over 2% of total enrollment but with significantly higher institutional budgets and willingness to adopt ed-tech tools.

### How Students Would
Modern students already spend significant time in browser-based environments — Google Classroom, Khan Academy, Kahoot, and similar platforms are daily tools. CivExit fits naturally into that habit:

- **In the classroom** — a teacher assigns a scenario before a civil safety lesson. Students run it on school laptops or tablets, fail, discuss why, and run it again. The debrief screen gives the teacher immediate talking points.
- **At home on a phone** — the simulation is mobile-optimised and requires no install. A student can run a 3–5 minute earthquake scenario during a free period the same way they'd open a game.
- **As a quiz supplement** — the standalone quiz page measures self-assessed crisis readiness and feeds anonymous data back to the analytics dashboard, which a teacher can pull up live to show the class how prepared (or unprepared) everyone actually is.
- **Competitive replay** — the scoring and debrief system creates natural replayability. Students compare outcomes, try different decision paths, and develop genuine intuition about prioritisation under pressure — which is the core skill emergency training tries to build.

### Why This Market, Why Now

Civil protection awareness has been a growing policy focus in Southeast Europe following recent natural disasters and geopolitical instability. Schools are looking for low-cost, zero-install tools they can deploy without IT overhead. CivExit runs entirely in a browser with no accounts required for the simulation itself — the barrier to adoption is as close to zero as possible.

The private school segment (~15,000 students) is a practical beachhead: smaller, easier to reach through direct institutional outreach, and more likely to fund pilot programs. From there, the path to the broader 716,000-student national market runs through the Ministry of Education's digital learning initiatives, which have been actively expanding since 2022.

---

## License

[GPL-3.0](LICENSE)
