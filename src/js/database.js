// src/js/database.js

document.addEventListener('DOMContentLoaded', () => {
    
    Chart.defaults.color = '#a1a1aa'; // zinc-400 text
    Chart.defaults.font.family = "'Space Mono', monospace";
    
    // --- 2. Load User Data from Local Storage ---
    const rawData = localStorage.getItem('survival_pre_quiz_results');
    let calmScore = 0;
    let panicScore = 3; // default fallback if they haven't taken the quiz
    
    const userStatsText = document.getElementById('user-stats-text');

    if (rawData) {
        const userData = JSON.parse(rawData);
        calmScore = userData.calmScore;
        panicScore = userData.panicLevel;
        userStatsText.innerHTML = `CALM: ${calmScore} // PANIC: ${panicScore}<br/>Data pulled from Local Matrix`;
    } else {
        userStatsText.innerHTML = `NO LOCAL DATA FOUND.<br/><a href="quiz.html" class="text-amber-500 underline">Take Pre-Assessment</a>`;
    }

    // --- 3. Render User Stats Chart ---
    const ctxUser = document.getElementById('userChart').getContext('2d');
    new Chart(ctxUser, {
        type: 'doughnut',
        data: {
            labels: ['Calm/Logic', 'Panic/Instinct'],
            datasets: [{
                data: [calmScore, panicScore],
                backgroundColor: ['#f59e0b', '#ef4444'], // Amber-500, Red-500
                borderColor: '#18181b', // Zinc-900 to match background
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: true }
    });

    // --- 4. Render Global Survival Rate Chart ---
    const ctxGlobal = document.getElementById('globalSurvivalChart').getContext('2d');
    new Chart(ctxGlobal, {
        type: 'doughnut',
        data: {
            labels: ['Survived (>72hrs)', 'Failed (<72hrs)'],
            datasets: [{
                data: [32, 68], // Mock Global Stats
                backgroundColor: ['#22c55e', '#52525b'], // Green-500, Zinc-600
                borderColor: '#18181b',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: true }
    });

    // --- 5. Render Primary Failure Causes Chart ---
    const ctxFailure = document.getElementById('failureCausesChart').getContext('2d');
    new Chart(ctxFailure, {
        type: 'pie',
        data: {
            labels: ['Dehydration', 'Hypothermia', 'Contaminated Water', 'Violence/Panic'],
            datasets: [{
                data: [15, 25, 20, 40], // Mock stats showing Panic is the real killer
                backgroundColor: ['#3b82f6', '#06b6d4', '#84cc16', '#ef4444'], 
                borderColor: '#18181b',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
});