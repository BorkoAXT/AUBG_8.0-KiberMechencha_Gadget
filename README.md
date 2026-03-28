# AUBG_8.0 - KiberMechencha Gadget

**A survival‑tool prototype that turns panic into calm during global crises.**

This project was built for the **AUBG 8.0 Hackathon** with the theme “Survival”.  
It explores what happens if a **total world blackout** occurs and how people who rely on technology react and survive.

## Overview

The website presents a **story‑driven survival experience** centered around a fictional gadget called the **“KiberMechencha Gadget”** – an offline AI survival encyclopedia.

Users go through three main parts:
1. **Intro page** – explains what the gadget does and why it helps you survive.
2. **Quiz** – a short survival‑knowledge quiz about earthquakes, blackouts, and basic skills.
3. **Statistics / Database page** – shows how different people answered the quiz and highlights common mistakes.
4. **Simulation** – an interactive survival game where users experience life before and after the blackout, using the gadget to make calm, correct choices.

## Tech stack

- **Frontend:** HTML, CSS, Tailwind CSS, vanilla JavaScript  
- **Static deployment:** GitHub Pages
- **Fake “AI”**: Canned‑answer knowledge base (JSON) + simple keyword matching  
- **Visuals:** Interactive UI elements, progress bars, charts, and game‑like choices  

## Features

- **Survival quiz**  
  - Short set of scenario‑based questions (e.g., earthquakes, blackouts, basic survival skills).  
  - Immediate feedback per question and an overall survival score.  

- **Statistics page**  
  - Shows how people answered questions (e.g., “panic vs calm” choices).  
  - Visual stats (bars, percentages) to highlight common mistakes.  

- **Interactive simulation**  
  - A narrative‑driven game where users:
    - Experience the blackout in the city.  
    - Escape to the forest.  
    - Use the gadget to make correct survival choices.  

- **“Offline survival” branding**  
  - The gadget is shown as an **offline‑mode tool** that works without internet, emphasizing the “survival with no panic” theme.  

## How to run locally

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/AUBG_8.0-KiberMechencha_Gadget.git
   cd AUBG_8.0-KiberMechencha_Gadget
   ```

2. Open `index.html` in your browser (no build required) or start a simple local server:
   ```bash
   npx serve
   ```

## How to use the website

1. **Intro page**  
   - Learn what the KiberMechencha Gadget does.  

2. **Quiz**  
   - Answer survival‑focused questions.  
   - See your score and get feedback.  

3. **Statistics page**  
   - See how your choices compare to others.  
   - Discover common “panic” vs “calm” mistakes.  

4. **Simulation**  
   - Play through the blackout‑survival story.  
   - Try to survive using the gadget’s guidance.  

## Why this project exists

If a total blackout happens, most people who rely on apps and technology will panic and not know how to survive.  
This project shows how a simple **offline survival‑guide gadget** can reduce panic and give step‑by‑step, calm guidance.

It was built as a **static, simple, but emotionally strong** hackathon project during **48 hours**.

## Future ideas

- Turn this into a real offline‑AI app that runs on phones without internet.  
- Collect real‑world data from crises and update the quiz and simulation.  
- Add more scenarios (floods, storms, etc.) and languages.  
- Мaybe add an option for it to immediately recognize a situation based on the surroundings

---

**Made by**  
KiberMechencha Team  
AUBG 8.0 Hackathon – Survival Theme