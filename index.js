// path: public/scripts/extensions/third-party/st-screentime-stats/index.js

const MODULE_NAME = 'st_screentime_stats';
const STORE_NAME = 'ScreentimeStatsData';

let context;
let lastActiveTime = Date.now();
let trackingInterval = null;
let currentSessionMinutes = 0;
let statsData = {}; 

const defaultSettings = {
    idleTimeout: 5 
};

function resetIdleTimer() {
    lastActiveTime = Date.now();
}

function getTodayString() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

async function loadStatsData() {
    const stored = await SillyTavern.libs.localforage.getItem(STORE_NAME);
    if (stored) {
        statsData = stored;
    }
}

let saveTimeout;
function saveStatsData() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        await SillyTavern.libs.localforage.setItem(STORE_NAME, statsData);
    }, 2000); 
}

function incrementStat(type, amount = 1) {
    if (!context.characterId || !context.characters[context.characterId]) return;
    
    const char = context.characters[context.characterId];
    const charId = char.avatar || char.name; 
    const today = getTodayString();

    if (!statsData[charId]) statsData[charId] = {};
    if (!statsData[charId][today]) {
        statsData[charId][today] = { time: 0, msgs: 0, name: char.name };
    }

    statsData[charId][today].name = char.name; 
    statsData[charId][today][type] += amount;
    
    saveStatsData();
}

function startTrackingLoop() {
    if (trackingInterval) clearInterval(trackingInterval);
    
    trackingInterval = setInterval(() => {
        const settings = context.extensionSettings[MODULE_NAME] || defaultSettings;
        const timeoutMs = (settings.idleTimeout || 5) * 60 * 1000;
        
        if (context.characterId === undefined) return;
        
        if (Date.now() - lastActiveTime < timeoutMs) {
            currentSessionMinutes += (10 / 60); 
            if (currentSessionMinutes >= 1) {
                incrementStat('time', 1); 
                currentSessionMinutes -= 1;
            }
        }
    }, 10000);
}

function renderDashboard() {
    let charId = null;
    let charName = "สถิติรวม";
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        const char = context.characters[context.characterId];
        charId = char.avatar || char.name;
        charName = char.name;
    }

    if ($('#screentime-modal').length === 0) {
        $('body').append(`
            <div id="screentime-modal" class="screentime-modal-overlay">
                <div class="screentime-dashboard">
                    <div class="screentime-close-btn" id="st-modal-close-btn">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                    <div class="screentime-header">
                        ✨ Screen Time Stats
                        <span id="st-db-subtitle">ข้อมูลการโต้ตอบของคุณ</span>
                    </div>
                    
                    <div class="screentime-tabs">
                        <div class="screentime-tab active" data-tab="weekly">สัปดาห์นี้</div>
                        <div class="screentime-tab" data-tab="leaderboard">อันดับสูงสุด (ตลอดกาล)</div>
                    </div>

                    <div id="tab-weekly" class="screentime-content active">
                        <div style="text-align:center; margin-bottom:10px;">
                            <b>${charId ? 'เฉพาะ: ' + DOMPurify.sanitize(charName) : 'กรุณาเลือกตัวละครก่อน'}</b>
                        </div>
                        <div class="screentime-chart" id="st-chart-container"></div>
                    </div>

                    <div id="tab-leaderboard" class="screentime-content">
                        <div class="screentime-leaderboard" id="st-lb-container"></div>
                    </div>
                </div>
            </div>
        `);

        $('#st-modal-close-btn').on('click', function() {
            $('#screentime-modal').removeClass('show');
        });

        $('.screentime-tab').on('click', function() {
            $('.screentime-tab').removeClass('active');
            $('.screentime-content').removeClass('active');
            $(this).addClass('active');
            $('#tab-' + $(this).data('tab')).addClass('active');
            
            if($(this).data('tab') === 'weekly') {
                animateBars();
            }
        });
    }

    const chartContainer = $('#st-chart-container');
    chartContainer.empty();
    
    if (charId && statsData[charId]) {
        const last7Days = [];
        let maxTime = 1; 
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const displayDay = d.toLocaleDateString('th-TH', { weekday: 'short' });
            
            const timeVal = statsData[charId][dateStr] ? statsData[charId][dateStr].time : 0;
            const msgsVal = statsData[charId][dateStr] ? statsData[charId][dateStr].msgs : 0;
            if (timeVal > maxTime) maxTime = timeVal;
            
            last7Days.push({ date: displayDay, time: timeVal, msgs: msgsVal });
        }

        last7Days.forEach(day => {
            const heightPercent = Math.max((day.time / maxTime) * 100, 2); 
            const tooltip = `${day.time.toFixed(1)} นาที | ${day.msgs} ข้อความ`;
            
            chartContainer.append(`
                <div class="screentime-bar-wrapper">
                    <div class="screentime-bar" data-val="${tooltip}" data-target-height="${heightPercent}%"></div>
                    <div class="screentime-label">${day.date}</div>
                </div>
            `);
        });
    } else {
        chartContainer.html('<div style="margin: auto; opacity: 0.5;">ยังไม่มีข้อมูลสถิติของตัวละครนี้</div>');
    }

    const lbContainer = $('#st-lb-container');
    lbContainer.empty();
    
    const allBots = [];
    for (const [avatarId, days] of Object.entries(statsData)) {
        let totalTime = 0;
        let totalMsgs = 0;
        let botName = "Unknown";
        for (const [date, data] of Object.entries(days)) {
            totalTime += data.time || 0;
            totalMsgs += data.msgs || 0;
            if (data.name) botName = data.name;
        }
        if (totalTime > 0 || totalMsgs > 0) {
            allBots.push({ avatarId, botName, totalTime, totalMsgs });
        }
    }

    allBots.sort((a, b) => b.totalTime - a.totalTime);

    allBots.slice(0, 5).forEach((bot, index) => { 
        let rankMedal = `${index + 1}`;
        if (index === 0) rankMedal = "👑";
        if (index === 1) rankMedal = "🥈";
        if (index === 2) rankMedal = "🥉";

        const avatarSrc = bot.avatarId.includes('.') ? `/characters/${bot.avatarId}` : '/img/ai-icons/bot.png';

        lbContainer.append(`
            <div class="leaderboard-item">
                <div class="leaderboard-rank">${rankMedal}</div>
                <img class="leaderboard-avatar" src="${avatarSrc}" onerror="this.src='/img/ai-icons/bot.png'">
                <div class="leaderboard-details">
                    <div class="leaderboard-name">${DOMPurify.sanitize(bot.botName)}</div>
                    <div class="leaderboard-stats">คุยไปแล้ว ${bot.totalTime.toFixed(0)} นาที • ${bot.totalMsgs} ข้อความ</div>
                </div>
            </div>
        `);
    });
    
    if (allBots.length === 0) lbContainer.html('<div style="text-align:center; opacity: 0.5;">ยังไม่มีประวัติการพูดคุย</div>');

    $('#screentime-modal').addClass('show');
    setTimeout(animateBars, 50);
}

function animateBars() {
    $('.screentime-bar').each(function() {
        const target = $(this).attr('data-target-height');
        $(this).css('height', target);
    });
}

jQuery(async () => {
    context = SillyTavern.getContext();

    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = defaultSettings;
    }

    const repoName = 'st-screentime-stats'; // ควรสอดคล้องกับชื่อโฟลเดอร์ repository บน GitHub
    const settingsHtml = await context.renderExtensionTemplateAsync(`third-party/${repoName}`, 'settings', {});
    $('#extensions_settings').append(settingsHtml);

    $('#screentime_idle_timeout').on('input', function () {
        context.extensionSettings[MODULE_NAME].idleTimeout = parseInt($(this).val()) || 5;
        context.saveSettingsDebounced();
    });
    $('#screentime_idle_timeout').val(context.extensionSettings[MODULE_NAME].idleTimeout);

    // ผูกปุ่มในหน้าตั้งค่าเข้ากับฟังก์ชันเปิด Dashboard
    $('#screentime_show_dashboard').on('click', renderDashboard);

    await loadStatsData();

    ['mousemove', 'keydown', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
        resetIdleTimer();
        currentSessionMinutes = 0; 
    });

    context.eventSource.on(context.event_types.MESSAGE_SENT, () => {
        resetIdleTimer();
        incrementStat('msgs', 1);
    });

    context.eventSource.on(context.event_types.MESSAGE_RECEIVED, () => {
        incrementStat('msgs', 1);
    });

    startTrackingLoop();
});
