// quiz.js — CivExit Idea Validation Survey

const QUESTIONS = [
    {
        id: 'age_group',
        number: 1,
        label: 'How old are you?',
        type: 'radio',
        options: ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+']
    },
    {
        id: 'panic_response',
        number: 2,
        label: 'How prepared do you feel to make a critical decision within 10 seconds during a disaster?',
        subtitle: 'You may select more than one.',
        type: 'multi',
        options: [
            "I panic easily and don't know what to do",
            "I can't make decisions under pressure",
            "I try to stay calm, but don't always make the right choice",
            "I keep my composure and act immediately"
        ]
    },
    {
        id: 'first_item',
        number: 3,
        label: 'You have one backpack to fill in 2 minutes. What is the first item you would put in it?',
        type: 'text',
        placeholder: 'e.g. water, documents, phone charger...'
    },
    {
        id: 'simulation_prepares',
        number: 4,
        label: 'Do you think a simulation can prepare you — or someone else — for a real emergency?',
        type: 'radio',
        options: ['Yes', 'No']
    },
    {
        id: 'simulation_effectiveness',
        number: 5,
        label: 'How effective do you think a simulation would be for training survival skills?',
        type: 'radio',
        options: ['Very effective', 'Somewhat effective', 'Not very effective', 'Not effective at all']
    },
    {
        id: 'trusted_ally',
        number: 6,
        label: 'In a chaotic situation, who would you trust the most?',
        type: 'radio',
        options: ['Myself', 'Family', 'Friends', 'Authorities / Emergency Services', 'No one']
    },
    {
        id: 'child_simulation',
        number: 7,
        label: 'Would you let a child play a survival simulation to teach them about emergencies?',
        type: 'radio',
        options: ['Yes', 'No', 'Maybe, with supervision']
    }
];

const CHART_COLORS = [
    '#f59e0b', '#fbbf24', '#d97706', '#b45309',
    '#92400e', '#6b7280', '#9ca3af', '#4b5563',
    '#374151', '#e5e7eb'
];

const CHART_LABELS = {
    age_group:              'Age Distribution',
    panic_response:         'Crisis Decision Readiness',
    first_item:             'First Item Packed',
    simulation_prepares:    'Can a Simulation Prepare You?',
    simulation_effectiveness: 'Simulation Effectiveness',
    trusted_ally:           'Most Trusted in Chaos',
    child_simulation:       'Child Survival Training?'
};

// ─── State ────────────────────────────────────────────────────────────────────

let currentIndex = 0;
const answers = {};
let multiSelected = new Set();
const multiAnswers = {}; // stores Set of selected indices per question id

// ─── Supabase ─────────────────────────────────────────────────────────────────

let _supabase = null;
try {
    if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined'
        && SUPABASE_URL && SUPABASE_KEY) {
        _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.warn('Supabase not available — quiz will run without database sync.', e);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
    const q = QUESTIONS[currentIndex];
    multiSelected = new Set(multiAnswers[q.id] || []);

    const pct = Math.round((currentIndex / QUESTIONS.length) * 100);
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('progress-text').textContent = `${q.number} / ${QUESTIONS.length}`;

    const isLast = currentIndex === QUESTIONS.length - 1;
    const isFirst = currentIndex === 0;
    const nextLabel = isLast ? '[ Submit Survey ]' : '[ Next Question ]';

    const header = `
        <div class="mb-6">
            <span class="text-amber-500 font-mono text-xs uppercase tracking-widest">Question ${q.number} of ${QUESTIONS.length}</span>
            <h2 class="text-xl font-bold text-white mt-2 leading-snug">${q.label}</h2>
            ${q.subtitle ? `<p class="text-zinc-400 font-mono text-sm mt-1">${q.subtitle}</p>` : ''}
        </div>
    `;

    const prevBtn = isFirst ? '' : `
        <button id="prev-btn" onclick="goBack()"
            class="w-full mt-3 py-3 border border-zinc-700 text-zinc-400 font-mono text-sm uppercase tracking-widest
                   hover:border-amber-500 hover:text-amber-500 cursor-pointer transition-all">
            ← Previous Question
        </button>
    `;

    const nextBtn = `
        <button id="next-btn" onclick="advance()" disabled
            class="w-full mt-4 py-4 bg-amber-500 text-zinc-950 font-black font-mono text-base uppercase tracking-widest
                   opacity-30 cursor-not-allowed transition-all">
            ${nextLabel}
        </button>
        ${prevBtn}
    `;

    const container = document.getElementById('quiz-container');

    if (q.type === 'radio') {
        container.innerHTML = header + `
            <div class="space-y-3">
                ${q.options.map((opt, i) => `
                    <button onclick="selectRadio(${i})" data-index="${i}"
                        class="option-btn w-full text-left p-4 border border-zinc-700 font-mono text-base text-zinc-300
                               hover:border-amber-500 hover:bg-amber-500/10 transition-all">
                        <span class="text-amber-500/50 mr-3 text-sm">${String.fromCharCode(65 + i)})</span>${opt}
                    </button>
                `).join('')}
            </div>
            ${nextBtn}
        `;
        // Restore previous selection if going back
        if (answers[q.id]) {
            const idx = q.options.indexOf(answers[q.id]);
            if (idx >= 0) {
                document.querySelectorAll('.option-btn')[idx].classList.add('selected');
                setNextEnabled(true);
            }
        }
    } else if (q.type === 'multi') {
        container.innerHTML = header + `
            <div class="space-y-3">
                ${q.options.map((opt, i) => `
                    <button onclick="toggleMulti(${i})" data-index="${i}"
                        class="multi-btn w-full text-left p-4 border border-zinc-700 font-mono text-base text-zinc-300
                               hover:border-amber-500 transition-all flex items-start gap-3">
                        <span id="check-${i}" class="w-4 h-4 border border-zinc-600 flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px]"></span>
                        <span>${opt}</span>
                    </button>
                `).join('')}
            </div>
            ${nextBtn}
        `;
        // Restore previous multi selection
        if (multiSelected.size > 0) {
            multiSelected.forEach(i => {
                const btn = document.querySelectorAll('.multi-btn')[i];
                if (btn) btn.classList.add('selected');
                const box = document.getElementById(`check-${i}`);
                if (box) {
                    box.innerHTML = '✓';
                    box.classList.add('bg-amber-500', 'border-amber-500', 'text-zinc-950');
                    box.classList.remove('border-zinc-600');
                }
            });
            setNextEnabled(true);
        }
    } else if (q.type === 'text') {
        container.innerHTML = header + `
            <textarea id="text-answer" rows="3" placeholder="${q.placeholder}"
                class="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 font-mono text-base p-4 resize-none
                       focus:outline-none focus:border-amber-500 transition-colors placeholder-zinc-600"
                oninput="onTextInput()">${answers[q.id] || ''}</textarea>
            ${nextBtn}
        `;
        if (answers[q.id]) setNextEnabled(true);
    }
}

// ─── Interaction handlers ─────────────────────────────────────────────────────

function selectRadio(index) {
    const q = QUESTIONS[currentIndex];
    answers[q.id] = q.options[index];

    document.querySelectorAll('.option-btn').forEach((btn, i) => {
        btn.classList.toggle('selected', i === index);
    });
    setNextEnabled(true);
};

function toggleMulti(index) {
    const q = QUESTIONS[currentIndex];

    if (multiSelected.has(index)) {
        multiSelected.delete(index);
        document.querySelectorAll('.multi-btn')[index].classList.remove('selected');
        const box = document.getElementById(`check-${index}`);
        box.innerHTML = '';
        box.classList.remove('bg-amber-500', 'border-amber-500', 'text-zinc-950');
        box.classList.add('border-zinc-600');
    } else {
        multiSelected.add(index);
        document.querySelectorAll('.multi-btn')[index].classList.add('selected');
        const box = document.getElementById(`check-${index}`);
        box.innerHTML = '✓';
        box.classList.add('bg-amber-500', 'border-amber-500', 'text-zinc-950');
        box.classList.remove('border-zinc-600');
    }

    multiAnswers[q.id] = new Set(multiSelected);
    answers[q.id] = Array.from(multiSelected).map(i => q.options[i]).join(' | ');
    setNextEnabled(multiSelected.size > 0);
};

function onTextInput() {
    const val = document.getElementById('text-answer')?.value?.trim() ?? '';
    if (val) answers[QUESTIONS[currentIndex].id] = val;
    setNextEnabled(val.length > 0);
};

function setNextEnabled(enabled) {
    const btn = document.getElementById('next-btn');
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle('opacity-30', !enabled);
    btn.classList.toggle('cursor-not-allowed', !enabled);
    btn.classList.toggle('hover:bg-amber-400', enabled);
    btn.classList.toggle('cursor-pointer', enabled);
}

function advance() {
    if (QUESTIONS[currentIndex].type === 'text') {
        const val = document.getElementById('text-answer')?.value?.trim();
        if (val) answers[QUESTIONS[currentIndex].id] = val;
    }
    if (QUESTIONS[currentIndex].type === 'multi') {
        multiAnswers[QUESTIONS[currentIndex].id] = new Set(multiSelected);
    }

    currentIndex++;

    if (currentIndex < QUESTIONS.length) {
        render();
    } else {
        submitAndShowResults();
    }
};

function goBack() {
    if (currentIndex <= 0) return;
    // Save current text answer before going back
    if (QUESTIONS[currentIndex].type === 'text') {
        const val = document.getElementById('text-answer')?.value?.trim();
        if (val) answers[QUESTIONS[currentIndex].id] = val;
    }
    if (QUESTIONS[currentIndex].type === 'multi') {
        multiAnswers[QUESTIONS[currentIndex].id] = new Set(multiSelected);
    }
    currentIndex--;
    render();
}

// ─── Preparedness calculation ─────────────────────────────────────────────────

function calculatePreparedness() {
    const responses = answers.panic_response || '';

    let score = 50; // default neutral
    if (responses.includes('I keep my composure and act immediately')) score += 40;
    if (responses.includes("I try to stay calm, but don't always make the right choice")) score += 15;
    if (responses.includes("I can't make decisions under pressure")) score -= 20;
    if (responses.includes("I panic easily and don't know what to do")) score -= 30;

    if (answers.simulation_prepares === 'Yes') score += 5;
    if (answers.simulation_effectiveness === 'Very effective') score += 5;
    if (answers.simulation_effectiveness === 'Somewhat effective') score += 2;

    score = Math.max(5, Math.min(100, score));

    let label, desc, color, emoji;
    if (score >= 80) {
        label = 'HIGHLY PREPARED';
        desc = "You have strong crisis instincts and composure under pressure. You'd be an asset in an emergency — keep training.";
        color = '#4ade80';
        emoji = '🟢';
    } else if (score >= 55) {
        label = 'MODERATELY PREPARED';
        desc = "You have solid instincts but room to build mental resilience. Practice helps — consider simulation drills.";
        color = '#fbbf24';
        emoji = '🟡';
    } else if (score >= 30) {
        label = 'NEEDS TRAINING';
        desc = "Panic can be your biggest enemy. Regular emergency simulations will sharpen your decision-making under pressure.";
        color = '#fb923c';
        emoji = '🟠';
    } else {
        label = 'AT RISK';
        desc = "Acknowledging your limits is the first step. Emergency training and simulation practice are strongly recommended.";
        color = '#ef4444';
        emoji = '🔴';
    }

    return { score, label, desc, color, emoji };
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function submitAndShowResults() {
    // Show submitting state
    document.getElementById('progress-area').innerHTML = `
        <div class="flex items-center gap-3 font-mono text-sm text-amber-500 uppercase tracking-widest animate-pulse">
            <span class="w-2 h-2 bg-amber-500 rounded-full"></span>
            Transmitting to secure database...
        </div>
    `;
    document.getElementById('quiz-container').innerHTML = `
        <div class="py-8 text-center">
            <div class="w-full h-[2px] bg-zinc-800 overflow-hidden">
                <div class="h-full bg-amber-500 animate-pulse" style="width:100%"></div>
            </div>
        </div>
    `;

    // Insert into Supabase
    try {
        if (!_supabase) throw new Error('No Supabase client');
        const { error } = await _supabase.from('quiz_responses').insert([{
            age_group:               answers.age_group               ?? null,
            panic_response:          answers.panic_response          ?? null,
            first_item:              answers.first_item              ?? null,
            simulation_prepares:     answers.simulation_prepares     ?? null,
            simulation_effectiveness: answers.simulation_effectiveness ?? null,
            trusted_ally:            answers.trusted_ally            ?? null,
            child_simulation:        answers.child_simulation        ?? null,
        }]);
        if (error) console.error('Supabase insert error:', error);
    } catch (e) {
        console.error('Submit error:', e);
    }

    // Calculate preparedness
    const prep = calculatePreparedness();

    // Show preparedness card for 5 seconds
    document.getElementById('quiz-wrapper').innerHTML = `
        <div class="text-center py-6" id="prep-card">
            <div class="w-14 h-14 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-7 h-7 text-zinc-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                </svg>
            </div>
            <p class="font-mono text-xs text-amber-500 uppercase tracking-widest mb-5 animate-pulse">[ Response Logged ]</p>

            <div class="border border-zinc-700 bg-zinc-950/60 p-6 mb-6 text-left" style="border-left: 4px solid ${prep.color};">
                <p class="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">Your Crisis Preparedness</p>
                <div class="flex items-center gap-3 mb-3">
                    <span style="color: ${prep.color};" class="font-black text-2xl tracking-tight">${prep.label}</span>
                </div>
                <div class="w-full h-3 bg-zinc-800 rounded-full overflow-hidden mb-3">
                    <div class="h-full rounded-full transition-all duration-1000" style="width: ${prep.score}%; background: ${prep.color};"></div>
                </div>
                <p class="text-zinc-400 font-mono text-sm leading-relaxed">${prep.desc}</p>
            </div>

            <p class="text-zinc-500 font-mono text-xs mb-3">Loading collective intelligence in <span id="prep-countdown">5</span>s...</p>
            <div class="w-full h-[2px] bg-zinc-800 overflow-hidden">
                <div id="prep-timer-bar" class="h-full bg-amber-500 transition-none" style="width: 100%"></div>
            </div>
        </div>
    `;

    // Animate the score bar in
    setTimeout(() => {
        const bar = document.querySelector('#prep-card .h-3 div');
        if (bar) bar.style.width = prep.score + '%';
    }, 100);

    // Countdown
    await new Promise(resolve => {
        let remaining = 5;
        const countEl = document.getElementById('prep-countdown');
        const timerBar = document.getElementById('prep-timer-bar');
        if (timerBar) {
            timerBar.style.transition = 'width 5s linear';
            setTimeout(() => { timerBar.style.width = '0%'; }, 50);
        }
        const tick = setInterval(() => {
            remaining--;
            if (countEl) countEl.textContent = remaining;
            if (remaining <= 0) {
                clearInterval(tick);
                resolve();
            }
        }, 1000);
    });

    // Load charts in background
    const chartsPromise = loadAndRenderCharts();

    // Show analytics entrance for 5 seconds
    document.getElementById('quiz-phase').classList.add('hidden');
    const resultsPhase = document.getElementById('results-phase');
    resultsPhase.classList.remove('hidden');
    resultsPhase.style.opacity = '0';
    resultsPhase.style.transform = 'translateY(24px)';
    resultsPhase.style.transition = 'opacity 0.8s ease, transform 0.8s ease';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Show analytics entrance overlay
    const existingOverlay = document.getElementById('analytics-entrance');
    if (existingOverlay) existingOverlay.remove();

    const entranceOverlay = document.createElement('div');
    entranceOverlay.id = 'analytics-entrance';
    entranceOverlay.innerHTML = `
        <div style="
            position: fixed; inset: 0; z-index: 9999;
            background: #09090b;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 1.5rem;
        ">
            <p style="font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.3em; color: #f59e0b; text-transform: uppercase;">
                // Syncing Global Intelligence //
            </p>
            <p style="font-family: 'Outfit', sans-serif; font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: -0.02em; text-align: center;">
                Collective Survival Data
            </p>
            <div style="width: 280px; height: 2px; background: #27272a; overflow: hidden;">
                <div id="entrance-bar" style="height: 100%; background: #f59e0b; width: 0%; transition: width 4.5s cubic-bezier(0.4,0,0.2,1);"></div>
            </div>
            <p id="entrance-countdown" style="font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.2em; color: #52525b; text-transform: uppercase;">
                Loading charts... 5s
            </p>
        </div>
    `;
    document.body.appendChild(entranceOverlay);
    setTimeout(() => {
        const bar = document.getElementById('entrance-bar');
        if (bar) bar.style.width = '100%';
    }, 50);

    await new Promise(resolve => {
        let t = 5;
        const countEl = document.getElementById('entrance-countdown');
        const tick = setInterval(() => {
            t--;
            if (countEl) countEl.textContent = `Loading charts... ${t}s`;
            if (t <= 0) { clearInterval(tick); resolve(); }
        }, 1000);
    });

    await chartsPromise;

    // Fade out entrance overlay
    entranceOverlay.style.transition = 'opacity 0.6s ease';
    entranceOverlay.style.opacity = '0';
    setTimeout(() => entranceOverlay.remove(), 700);

    // Fade in results
    setTimeout(() => {
        resultsPhase.style.opacity = '1';
        resultsPhase.style.transform = 'translateY(0)';
    }, 100);
}

// ─── Charts ───────────────────────────────────────────────────────────────────

async function loadAndRenderCharts() {
    let data = [];
    try {
        if (!_supabase) throw new Error('No Supabase client');
        const { data: rows, error } = await _supabase.from('quiz_responses').select('*');
        if (error) { console.error('Fetch error:', error); }
        else { data = rows ?? []; }
    } catch (e) {
        console.error('Chart fetch error:', e);
    }

    document.getElementById('total-responses').innerHTML = `
        <span class="w-2 h-2 bg-green-500 rounded-full"></span>
        ${data.length} total response${data.length !== 1 ? 's' : ''} logged
    `;

    const chartsGrid = document.getElementById('charts-grid');
    chartsGrid.innerHTML = '';

    QUESTIONS.forEach(q => {
        const counts = {};

        data.forEach(row => {
            let val = row[q.id];
            if (!val) return;

            if (q.type === 'multi') {
                val.split(' | ').forEach(item => {
                    item = item.trim();
                    if (item) counts[item] = (counts[item] || 0) + 1;
                });
            } else {
                if (q.id === 'first_item') val = normalizeFirstItem(val);
                val = val.toString().trim();
                if (val) counts[val] = (counts[val] || 0) + 1;
            }
        });

        const top10 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (top10.length === 0) return;

        const labels = top10.map(([k]) => k);
        const values = top10.map(([, v]) => v);
        const total  = values.reduce((a, b) => a + b, 0);

        const card = document.createElement('div');
        card.className = 'bg-zinc-900/50 border border-zinc-800 p-5 hover:border-amber-500/30 transition-all';

        card.innerHTML = `
            <h3 class="font-mono text-xs text-amber-500 uppercase tracking-[0.2em] mb-4 border-b border-zinc-800 pb-2 flex justify-between">
                <span>${CHART_LABELS[q.id]}</span>
                <span class="text-zinc-600">Q${q.number}</span>
            </h3>
            <div class="relative mx-auto" style="height:200px; max-width:200px;">
                <canvas id="chart-${q.id}"></canvas>
            </div>
            <ul class="mt-5 space-y-1.5">
                ${top10.map(([label, count], i) => `
                    <li class="flex justify-between items-center font-mono text-xs">
                        <span class="flex items-center gap-2 min-w-0">
                            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
                            <span class="text-zinc-400 truncate" title="${label}">${label}</span>
                        </span>
                        <span class="text-amber-500 font-bold ml-3 flex-shrink-0">${count} <span class="text-zinc-600">(${Math.round(count/total*100)}%)</span></span>
                    </li>
                `).join('')}
            </ul>
        `;

        chartsGrid.appendChild(card);

        new Chart(document.getElementById(`chart-${q.id}`).getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: CHART_COLORS.slice(0, labels.length),
                    borderColor: '#09090b',
                    borderWidth: 2,
                    hoverBorderColor: '#f59e0b',
                    hoverBorderWidth: 3,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#18181b',
                        borderColor: '#3f3f46',
                        borderWidth: 1,
                        titleColor: '#f59e0b',
                        bodyColor: '#a1a1aa',
                        titleFont: { family: 'Space Mono', size: 10 },
                        bodyFont: { family: 'Space Mono', size: 10 },
                        callbacks: {
                            label: ctx => ` ${ctx.parsed} (${Math.round(ctx.parsed / total * 100)}%)`
                        }
                    }
                },
                cutout: '62%',
                animation: { animateRotate: true, duration: 900 }
            }
        });
    });
}

function normalizeFirstItem(val) {
    const low = val.toLowerCase().trim();
    if (low.includes('water') || low.includes('вода') || low.includes('шише') || low.includes('бутилка')) return 'Water';
    if (low.includes('food') || low.includes('храна') || low.includes('conserv') || low.includes('кутия')) return 'Food';
    if (low.includes('document') || low.includes('passport') || low.includes('паспорт') || low.includes('документ') || low.includes('id card')) return 'Documents / ID';
    if (low.includes('phone') || low.includes('телефон') || low.includes('charger') || low.includes('зарядно')) return 'Phone / Charger';
    if (low.includes('knife') || low.includes('нож') || low.includes('tool') || low.includes('брадва')) return 'Tools / Knife';
    if (low.includes('medic') || low.includes('first aid') || low.includes('аптечка') || low.includes('лекарств')) return 'First Aid Kit';
    if (low.includes('cloth') || low.includes('jacket') || low.includes('blanket') || low.includes('дреха') || low.includes('яке')) return 'Clothes / Blanket';
    if (low.includes('money') || low.includes('cash') || low.includes('пари')) return 'Money / Cash';
    if (low.includes('flashlight') || low.includes('torch') || low.includes('фенер')) return 'Flashlight';
    if (low.includes('backpack') || low.includes('раница') || low.includes('bag')) return 'Backpack / Bag';
    return val.length > 22 ? val.substring(0, 20) + '…' : val;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', render);
