// path: public/scripts/extensions/third-party/st-screentime-stats/index.js
import { getContext } from '../../../../scripts/extensions.js';

const MODULE_NAME = 'st_screentime_stats';
const STORE_NAME = 'ScreentimeStatsData';
let context;
let db;

// State สำหรับการ Track
let lastActiveTime = Date.now();
let trackingInterval = null;
let currentSessionMinutes = 0;
let statsData = {}; // โครงสร้าง: { charAvatar: { "YYYY-MM-DD": { time: 0, msgs: 0, name: "" } } }

// Default Settings
const defaultSettings = {
    idleTimeout: 5 // นาที
};

// อัปเดตการเคลื่อนไหวเพื่อรีเซ็ต Idle
function resetIdleTimer() {
    lastActiveTime = Date.now();
}

// ฟังก์ชันแปลงวันที่ปัจจุบันเป็น YYYY-MM-DD (อิงตามเวลาเครื่อง local)
function getTodayString() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

// โหลดข้อมูลทั้งหมดจาก IndexedDB (ผ่าน localforage ของ ST)
async function loadStatsData() {
    const stored = await SillyTavern.libs.localforage.getItem(STORE_NAME);
    if (stored) {
        statsData = stored;
    }
}

// บันทึกข้อมูล (Debounce)
let saveTimeout;
function saveStatsData() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        await SillyTavern.libs.localforage.setItem(STORE_NAME, statsData);
    }, 2000); // เซฟเมื่อข้อมูลนิ่ง 2 วินาที
}

// ฟังก์ชันเพิ่มสถิติ
function incrementStat(type, amount = 1) {
    if (!context.characterId || !context.characters[context.characterId]) return;
    
    const char = context.characters[context.characterId];
    const charId = char.avatar; // ใช้ชื่อรูป avatar เป็น ID ถาวร
    const today = getTodayString();

    if (!statsData[charId]) statsData[charId] = {};
    if (!statsData[charId][today]) {
        statsData[charId][today] = { time: 0, msgs: 0, name: char.name };
    }

    statsData[charId][today].name = char.name; // อัปเดตชื่อเผื่อมีการเปลี่ยน
    statsData[charId][today][type] += amount;
    
    saveStatsData();
}

// ลูปนับเวลาหลัก
function startTrackingLoop() {
    if (trackingInterval) clearInterval(trackingInterval);
    
    // ทำงานทุก 10 วินาที
    trackingInterval = setInterval(() => {
        const settings = context.extensionSettings[MODULE_NAME];
        const timeoutMs = (settings.idleTimeout || 5) * 60 * 1000;
        
        // ถ้าไม่อยู่หน้าแชท (ไม่มี character) ให้ข้าม
        if (context.characterId === undefined) return;
        
        // ถ้ายัง Active อยู่ (ไม่เกินเวลา Idle)
        if (Date.now() - lastActiveTime < timeoutMs) {
            currentSessionMinutes += (10 / 60); // เพิ่มทีละ 10 วินาที
            if (currentSessionMinutes >= 1) {
                incrementStat('time', 1); // บวก 1 นาทีเต็มลงฐานข้อมูล
                currentSessionMinutes -= 1;
            }
        }
    }, 10000);
}

// วาด Dashboard UI
function renderDashboard() {
    // คำนวณข้อมูลย้อนหลัง 7 วัน สำหรับตัวละครปัจจุบัน
    let charId = null;
    let charName = "สถิติรวม";
    if (context.characterId !== undefined && context.characters[context.characterId]) {
        charId = context.characters[context.characterId].avatar;
        charName = context.characters[context.characterId].name;
    }

    // สร้างกล่อง Modal
    if ($('#screentime-modal').length === 0) {
        $('body').append(`
            <div id="screentime-modal" class="screentime-modal-overlay">
                <div class="screentime-dashboard">
                    <div class="screentime-close-btn" onclick="$('#screentime-modal').removeClass('show')">
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
                            <b>${charId ? 'เฉพาะ: ' + charName : 'กรุณาเลือกตัวละครก่อน'}</b>
                        </div>
                        <div class="screentime-chart" id="st-chart-container"></div>
                    </div>

                    <div id="tab-leaderboard" class="screentime-content">
                        <div class="screentime-leaderboard" id="st-lb-container"></div>
                    </div>
                </div>
            </div>
        `);

        // Tab Switching Logic
        $('.screentime-tab').on('click', function() {
            $('.screentime-tab').removeClass('active');
            $('.screentime-content').removeClass('active');
            $(this).addClass('active');
            $('#tab-' + $(this).data('tab')).addClass('active');
            
            // Trigger animation for bars again if weekly tab
            if($(this).data('tab') === 'weekly') {
                animateBars();
            }
        });
    }

    // 1. Render กราฟรายสัปดาห์ (ถ้ามีตัวละคร)
    const chartContainer = $('#st-chart-container');
    chartContainer.empty();
    
    if (charId && statsData[charId]) {
        const last7Days = [];
        let maxTime = 1; // กันหาร 0
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
            const heightPercent = Math.max((day.time / maxTime) * 100, 2); // ขั้นต่ำ 2% ให้เห็นแท่ง
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

    // 2. Render Leaderboard (ดึงจากทุกตัวละคร)
    const lbContainer = $('#st-lb-container');
    lbContainer.empty();
    
    const allBots = [];
    for (const [avatarId, days] for Object.entries(statsData)) {
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

    // เรียงตามเวลาสูงสุด
    allBots.sort((a, b) => b.totalTime - a.totalTime);

    allBots.slice(0, 5).forEach((bot, index) => { // แสดง Top 5
        let rankMedal = `${index + 1}`;
        if (index === 0) rankMedal = "👑";
        if (index === 1) rankMedal = "🥈";
        if (index === 2) rankMedal = "🥉";

        lbContainer.append(`
            <div class="leaderboard-item">
                <div class="leaderboard-rank">${rankMedal}</div>
                <img class="leaderboard-avatar" src="/characters/${bot.avatarId}" onerror="this.src='/img/ai-icons/bot.png'">
                <div class="leaderboard-details">
                    <div class="leaderboard-name">${bot.botName}</div>
                    <div class="leaderboard-stats">คุยไปแล้ว ${bot.totalTime.toFixed(0)} นาที • ${bot.totalMsgs} ข้อความ</div>
                </div>
            </div>
        `);
    });
    if (allBots.length === 0) lbContainer.html('<div style="text-align:center; opacity: 0.5;">ยังไม่มีประวัติการพูดคุย</div>');

    // แสดง Modal
    $('#screentime-modal').addClass('show');
    
    // หน่วงเวลาเล็กน้อยเพื่อให้ Animation กราฟแท่งทำงาน
    setTimeout(animateBars, 50);
}

function animateBars() {
    $('.screentime-bar').each(function() {
        const target = $(this).attr('data-target-height');
        $(this).css('height', target);
    });
}

// จุดเริ่มต้นของ Extension
jQuery(async () => {
    context = getContext();

    // Setup Default Settings
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = defaultSettings;
    }

    // Load UI for standard extensions menu
    const settingsHtml = await context.renderExtensionTemplateAsync('third-party/st-screentime-stats', 'settings');
    $('#extensions_settings').append(settingsHtml);

    // Bind settings events
    $('#screentime_idle_timeout').on('input', function () {
        context.extensionSettings[MODULE_NAME].idleTimeout = parseInt($(this).val()) || 5;
        context.saveSettingsDebounced();
    });
    $('#screentime_idle_timeout').val(context.extensionSettings[MODULE_NAME].idleTimeout);

    $('#screentime_show_dashboard').on('click', renderDashboard);

    // เพิ่มปุ่มลงบน Top Bar
    if ($('#screentime-topbar-btn').length === 0) {
        // แทรกปุ่มทางขวาบนแถบ nav
        $('#top-bar .nav-buttons').prepend(`
            <div id="screentime-topbar-btn" class="menu_button" title="Screen Time Stats">
                <i class="fa-solid fa-clock"></i>
            </div>
        `);
        $('#screentime-topbar-btn').on('click', renderDashboard);
    }

    // Load Database
    await loadStatsData();

    // Hook Events
    ['mousemove', 'keydown', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
        resetIdleTimer();
        currentSessionMinutes = 0; // เคลียร์เศษเวลาก่อนหน้าเมื่อเปลี่ยนแชท
    });

    context.eventSource.on(context.event_types.MESSAGE_SENT, () => {
        resetIdleTimer();
        incrementStat('msgs', 1);
    });

    context.eventSource.on(context.event_types.MESSAGE_RECEIVED, () => {
        incrementStat('msgs', 1);
    });

    // เริ่มทำงาน Loop นับเวลา
    startTrackingLoop();
});
