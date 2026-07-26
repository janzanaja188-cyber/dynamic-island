// path: public/scripts/extensions/third-party/ios-virtual-phone/index.js

const extensionName = 'ios-virtual-phone';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const MODULE_NAME = 'iosVirtualPhoneSettings';

// ตั้งค่าพื้นฐาน
let settings = {
    iconBase64: '',
    posX: 20,
    posY: 20
};

let isDragging = false;
let isPhoneOpen = false;
let notifTimeout = null;

// HTML Elements
let $floatingBtn, $notification, $modal, $chatArea;

// 1. โหลดและจัดการ Settings
async function loadSettings() {
    const context = SillyTavern.getContext();
    settings = Object.assign(settings, context.extensionSettings[MODULE_NAME] || {});
}

async function saveSettings() {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME] = settings;
    context.saveSettingsDebounced();
}

// 2. สร้าง Elements ของมือถือลงในหน้าจอ
function injectUI() {
    // ปุ่มลอย
    const btnHtml = `<div id="ios-vp-floating-btn" style="right: ${settings.posX}px; bottom: ${settings.posY}px;"></div>`;
    $('body').append(btnHtml);
    $floatingBtn = $('#ios-vp-floating-btn');

    if (settings.iconBase64) {
        $floatingBtn.css('background-image', `url(${settings.iconBase64})`);
    }

    // แจ้งเตือน
    const notifHtml = `
        <div id="ios-vp-notification">
            <div class="ios-vp-notif-icon">💬</div>
            <div class="ios-vp-notif-content">
                <div class="ios-vp-notif-title">New Message</div>
                <div class="ios-vp-notif-text" id="ios-vp-notif-preview">...</div>
            </div>
        </div>`;
    $('body').append(notifHtml);
    $notification = $('#ios-vp-notification');

    // หน้าจอมือถือ
    const modalHtml = `
        <div id="ios-vp-modal">
            <div class="ios-vp-notch"></div>
            <div class="ios-vp-app-header">
                <div class="ios-vp-close-btn"><i class="fa-solid fa-chevron-left"></i> Back</div>
                Messages
            </div>
            <div class="ios-vp-chat-area" id="ios-vp-chat-area"></div>
            <div class="ios-vp-input-area">
                <input type="text" id="ios-vp-input" placeholder="Text Message" autocomplete="off">
                <button id="ios-vp-send-btn"><i class="fa-solid fa-arrow-up"></i></button>
            </div>
        </div>`;
    $('body').append(modalHtml);
    $modal = $('#ios-vp-modal');
    $chatArea = $('#ios-vp-chat-area');

    setupEvents();
}

// 3. จัดการ Events (ลากปุ่ม, คลิก, ส่งข้อความ)
function setupEvents() {
    // Drag & Drop ปุ่มลอย
    let startX, startY, initialRight, initialBottom;

    $floatingBtn.on('mousedown touchstart', function (e) {
        isDragging = false;
        const event = e.type === 'touchstart' ? e.originalEvent.touches[0] : e;
        startX = event.clientX;
        startY = event.clientY;
        initialRight = parseInt($floatingBtn.css('right'), 10);
        initialBottom = parseInt($floatingBtn.css('bottom'), 10);

        $(document).on('mousemove.iosvp touchmove.iosvp', onMouseMove);
        $(document).on('mouseup.iosvp touchend.iosvp', onMouseUp);
    });

    function onMouseMove(e) {
        const event = e.type === 'touchmove' ? e.originalEvent.touches[0] : e;
        const dx = startX - event.clientX;
        const dy = startY - event.clientY;
        
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDragging = true; // แยกคลิกกับการลาก

        if (isDragging) {
            let newRight = initialRight + dx;
            let newBottom = initialBottom + dy;

            // กันทะลุขอบ
            const maxRight = window.innerWidth - $floatingBtn.outerWidth();
            const maxBottom = window.innerHeight - $floatingBtn.outerHeight();
            newRight = Math.max(0, Math.min(newRight, maxRight));
            newBottom = Math.max(0, Math.min(newBottom, maxBottom));

            $floatingBtn.css({ right: `${newRight}px`, bottom: `${newBottom}px` });
        }
    }

    function onMouseUp() {
        $(document).off('mousemove.iosvp touchmove.iosvp mouseup.iosvp touchend.iosvp');
        if (isDragging) {
            settings.posX = parseInt($floatingBtn.css('right'), 10);
            settings.posY = parseInt($floatingBtn.css('bottom'), 10);
            saveSettings();
        }
    }

    // เปิด/ปิดมือถือ
    $floatingBtn.on('click', (e) => {
        if (!isDragging) togglePhone();
    });
    $notification.on('click', () => {
        hideNotification();
        if (!isPhoneOpen) togglePhone();
    });
    $('.ios-vp-close-btn').on('click', () => togglePhone(false));

    // ส่งข้อความจากมือถือ
    $('#ios-vp-send-btn').on('click', sendSMS);
    $('#ios-vp-input').on('keypress', (e) => {
        if (e.key === 'Enter') sendSMS();
    });
}

// 4. ฟังก์ชันแสดง/ซ่อน แบะแจ้งเตือน
function togglePhone(forceState) {
    isPhoneOpen = forceState !== undefined ? forceState : !isPhoneOpen;
    if (isPhoneOpen) {
        $modal.addClass('open');
        refreshPhoneChat();
    } else {
        $modal.removeClass('open');
    }
}

function showNotification(text, title = "New Message") {
    $('.ios-vp-notif-title').text(title);
    $('#ios-vp-notif-preview').text(text);
    $notification.addClass('show');
    
    if (notifTimeout) clearTimeout(notifTimeout);
    notifTimeout = setTimeout(hideNotification, 4000); // ซ่อนหลัง 4 วินาที
}

function hideNotification() {
    $notification.removeClass('show');
}

// 5. ดึงแชททั้งหมด และดักจับ [SMS: ...]
function refreshPhoneChat() {
    const context = SillyTavern.getContext();
    const chat = context.chat || [];
    $chatArea.empty();

    const smsRegex = /\[SMS:\s*([\s\S]*?)\]/gi;

    chat.forEach(mes => {
        let match;
        // ใช้ RegExp loop เผื่อมีหลาย SMS ใน 1 ข้อความ
        const regex = new RegExp(smsRegex);
        while ((match = regex.exec(mes.mes)) !== null) {
            const smsText = match[1].trim();
            const isUser = mes.is_user;
            const bubbleHtml = `<div class="ios-vp-bubble ${isUser ? 'sent' : 'received'}">${DOMPurify.sanitize(smsText)}</div>`;
            $chatArea.append(bubbleHtml);
        }
    });
    
    // เลื่อนลงล่างสุดเสมอ
    $chatArea.scrollTop($chatArea[0].scrollHeight);
}

// 6. การส่งข้อความกลับเข้าแชทหลัก
function sendSMS() {
    const text = $('#ios-vp-input').val().trim();
    if (!text) return;
    
    // แปลงสิ่งที่พิมพ์ให้เป็นฟอร์แมต [SMS: ...] แล้วยัดลงแชทหลัก
    const formattedText = `[SMS: ${text}]`;
    const textarea = document.getElementById('send_textarea');
    const sendBtn = document.getElementById('send_but');
    
    if (textarea && sendBtn) {
        textarea.value = formattedText;
        $(textarea).trigger('input'); // กระตุ้น event
        sendBtn.click();
        $('#ios-vp-input').val(''); // ล้างช่องพิมพ์
        
        // จำลองการเพิ่มแชทฝั่งเราชั่วคราวก่อนแชทหลักอัปเดต
        $chatArea.append(`<div class="ios-vp-bubble sent">${DOMPurify.sanitize(text)}</div>`);
        $chatArea.scrollTop($chatArea[0].scrollHeight);
    }
}

// 7. จัดการรูปไอคอน (ย่อรูป + แปลง Base64)
function setupSettingsUI() {
    $('#ios_vp_icon_upload').on('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                // สร้าง Canvas เพื่อย่อขนาดรูป (กันไฟล์เซฟใหญ่เกินไป)
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 120;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const base64 = canvas.toDataURL('image/png');
                settings.iconBase64 = base64;
                saveSettings();
                
                $floatingBtn.css('background-image', `url(${base64})`);
                toastr.success('เปลี่ยนรูปไอคอนปุ่มลอยสำเร็จ!');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    $('#ios_vp_reset_btn').on('click', () => {
        settings.iconBase64 = '';
        settings.posX = 20;
        settings.posY = 20;
        saveSettings();
        $floatingBtn.css({
            right: '20px', 
            bottom: '20px',
            'background-image': `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23333"><path d="M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 18H7V5h10v14z"/></svg>')`
        });
        toastr.info('รีเซ็ตการตั้งค่าเรียบร้อย');
    });
}

// 8. Hook ST Events: ซ่อน [SMS] จากแชทหลัก และแจ้งเตือน
function onMessageRendered(data) {
    // data คือ object ของ event { mesId, message (HTML element), etc. }
    const htmlEl = $(data.message).find('.mes_text');
    let textHtml = htmlEl.html();
    
    if (textHtml && textHtml.includes('[SMS:')) {
        const smsRegex = /\[SMS:\s*([\s\S]*?)\]/gi;
        
        // ซ่อนข้อความ SMS จากหน้าจอหลัก
        const newHtml = textHtml.replace(smsRegex, '<span style="display:none;" class="ios-vp-hidden">$&</span>');
        htmlEl.html(newHtml);
    }
}

function onMessageReceived(data) {
    const mes = data; // data คือข้อความล่าสุด
    const smsRegex = /\[SMS:\s*([\s\S]*?)\]/i;
    const match = mes.mes.match(smsRegex);
    
    if (match) {
        const smsText = match[1].trim();
        const sender = mes.name || 'Unknown';
        
        // แจ้งเตือน!
        showNotification(smsText, sender);
        
        // อัปเดตแชทในมือถือถ้าเปิดอยู่
        if (isPhoneOpen) refreshPhoneChat();
    }
}

// === จุดเริ่มต้นการทำงาน (Init) ===
jQuery(async () => {
    const context = SillyTavern.getContext();
    
    await loadSettings();
    injectUI();

    // Render หน้าตั้งค่า
    const settingsHtml = await context.renderExtensionTemplateAsync(extensionFolderPath, 'settings.html', {});
    $('#extensions_settings').append(settingsHtml);
    setupSettingsUI();

    // ซ่อนข้อความจากทั้งฝ่ายเราและตัวละคร
    context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
    context.eventSource.on(context.event_types.USER_MESSAGE_RENDERED, onMessageRendered);
    
    // ดักแจ้งเตือนตอนบอทส่งข้อความมาใหม่
    context.eventSource.on(context.event_types.MESSAGE_RECEIVED, onMessageReceived);
});
