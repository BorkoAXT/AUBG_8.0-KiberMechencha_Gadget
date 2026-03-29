// src/js/database.js
// Handles the user's local assessment profile chart only.
// All real-world data charts are rendered inline in database.html.

document.addEventListener('DOMContentLoaded', function () {

    Chart.defaults.color = '#71717a';
    Chart.defaults.font.family = "'Space Mono', monospace";

    var BORDER = '#09090b';
    var TIP = {
        backgroundColor: '#18181b',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#f59e0b',
        bodyColor: '#a1a1aa',
        padding: 10,
        cornerRadius: 2
    };

    var rawData     = localStorage.getItem('survival_pre_quiz_results');
    var calmScore   = 5;
    var panicScore  = 5;
    var statsEl     = document.getElementById('user-stats-text');

    if (rawData) {
        try {
            var userData = JSON.parse(rawData);
            calmScore  = userData.calmScore  || 5;
            panicScore = userData.panicLevel || 5;
            if (statsEl) {
                statsEl.innerHTML = 'CALM: ' + calmScore + ' &nbsp;|&nbsp; PANIC: ' + panicScore + '<br/><span class="text-zinc-600">Pulled from local storage</span>';
            }
        } catch (e) {
            if (statsEl) statsEl.innerHTML = 'Data parse error. <a href="quiz.html" class="text-amber-500 underline">Retake quiz</a>';
        }
    } else {
        if (statsEl) {
            statsEl.innerHTML = 'No local data found.<br/><a href="quiz.html" class="text-amber-500 underline">Take the readiness quiz first</a>';
        }
    }

    var ctxUser = document.getElementById('userChart');
    if (ctxUser) {
        new Chart(ctxUser, {
            type: 'doughnut',
            data: {
                labels: ['Calm / Logic', 'Panic / Instinct'],
                datasets: [{
                    data: [calmScore, panicScore],
                    backgroundColor: ['#f59e0b', '#ef4444'],
                    borderColor: BORDER,
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 14, font: { size: 9 }, color: '#71717a', boxWidth: 10 }
                    },
                    tooltip: TIP
                }
            }
        });
    }

});
