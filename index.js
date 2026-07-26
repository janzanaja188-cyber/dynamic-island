// path: public/scripts/extensions/third-party/ios-virtual-phone/index.js

const MODULE_NAME = 'iosVirtualPhoneSettings';

// ตั้งค่าพื้นฐาน
let settings = {
    iconBase64: '',
    posX: null, // ใช้ null เพื่อให้ระบบคำนวณขวาล่างอัตโนมัติในครั้งแรก
    posY: null
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

function saveSettings() {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME] = settings;
    context.saveSettingsDebounced();
}

// 2. ฟังก์ชันล็อกปุ่มให้อยู่ในหน้าจอเสมอ (กันตกขอบ)
function clampButtonPosition() {
    if (!$floatingBtn || $floatingBtn.length === 0) return;
    
    const btnW = $floatingBtn.outerWidth() || 60;
    const btnH = $floatingBtn.outerHeight() || 60;
    const maxLeft = window.innerWidth - btnW;
    const maxTop = window.innerHeight - btnH;
    
    let currentLeft = parseFloat($floatingBtn.css('left')) || settings.posX;
    let currentTop = parseFloat($floatingBtn.css('top')) || settings.posY;
    
    // บังคับไม่ให้น้อยกว่า 0 และไม่เกินขอบจอ
    currentLeft = Math.max(0, Math.min(currentLeft, maxLeft));
    currentTop = Math.max(0, Math.min(currentTop, maxTop));
    
    $floatingBtn.css({ left: `${currentLeft}px`, top: `${currentTop}px` });
    
    settings.posX = currentLeft;
    settings.posY = currentTop;
}

// 3. สร้าง Elements ของมือถือลงในหน้าจอ
function injectUI() {
    // กำหนดค่าเริ่มต้นให้อยู่มุมขวาล่าง (เว้นขอบ 20px) ถ้ายังไม่เคยตั้งค่า
    if (settings.posX === null || settings.posY === null) {
        settings.posX = window.innerWidth - 80;
        settings.posY = window.innerHeight - 80;
    }

    // ปุ่มลอย (ใช้ left, top แทน right, bottom เพื่อการคำนวณที่แม่นยำ)
    const btnHtml = `<div id="ios-vp-floating-btn" style="left: ${settings.posX}px; top: ${settings.posY}px;"></div>`;
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
    clampButtonPosition(); // บังคับเช็คขอบจอตอนสร้างเสร็จทันที
}

// 4. ฝังโค้ดหน้าต่างตั้งค่า (Inline Settings UI) เพื่อเลี่ยงปัญหาชื่อโฟลเดอร์ไม่ตรง
function injectSettingsUI() {
    const settingsHtml = `
    <div class="ios-vp-settings-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📱 iOS Virtual Phone Settings</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p>เปลี่ยนไอคอนของปุ่มมือถือลอย (แนะนำรูปสี่เหลี่ยมจัตุรัส)</p>
                <div class="flex-container alignitemscenter margin-bottom-1">
                    <input type="file" id="ios_vp_icon_upload" accept="image/png, image/jpeg, image/gif, image/webp" class="text_pole">
                </div>
                <div class="margin-bottom-1">
                    <button id="ios_vp_reset_btn" class="menu_button">รีเซ็ตตำแหน่ง & ไอคอนกลับเป็นค่าเริ่มต้น</button>
                </div>
                <hr>
                <p><b>วิธีใช้งาน:</b></p>
                <ul style="font-size: 0.9em; opacity: 0.8; padding-left: 20px;">
                    <li>พิมพ์ <code>[SMS: ข้อความ]</code> ลงในแชทเพื่อส่งเข้ามือถือ</li>
                    <li>ข้อความจะไม่โชว์ในแชทปกติ แต่จะเด้งเข้ามือถือแทน</li>
                </ul>
            </div>
        </div>
    </div>`;
    
    $('#extensions_settings').append(settingsHtml);

    // ระบบอัปโหลดและย่อรูปไอคอน
    $('#ios_vp_icon_upload').on('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
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
                toastr.success('เปลี่ยนรูปไอคอนสำเร็จ!');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // ปุ่มรีเซ็ต
    $('#ios_vp_reset_btn').on('click', () => {
        settings.iconBase64 = '';
        settings.posX = window.innerWidth - 80;
        settings.posY = window.innerHeight - 80;
        saveSettings();
        
        $floatingBtn.css({
            left: `${settings.posX}px`, 
            top: `${settings.posY}px`,
            'background-image': `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23333"><path d="M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 18H7V5h10v14z"/></svg>')`
        });
        toastr.info('รีเซ็ตตำแหน่งและไอคอนเรียบร้อย');
    });
}

// 5. จัดการ Events (ลากปุ่ม, คลิก, ส่งข้อความ)
function setupEvents() {
    let startMouseX, startMouseY, initialLeft, initialTop;

    $floatingBtn.on('mousedown touchstart', function (e) {
        isDragging = false;
        const event = e.type === 'touchstart' ? e.originalEvent.touches[0] : e;
        startMouseX = event.clientX;
        startMouseY = event.clientY;
        initialLeft = parseFloat($floatingBtn.css('left')) || 0;
        initialTop = parseFloat($floatingBtn.css('top')) || 0;

        $(document).on('mousemove.iosvp touchmove.iosvp', onMouseMove);
        $(document).on('mouseup.iosvp touchend.iosvp', onMouseUp);
    });

    function onMouseMove(e) {
        const event = e.type === 'touchmove' ? e.originalEvent.touches[0] : e;
        const dx = event.clientX - startMouseX;
        const dy = event.clientY - startMouseY;
        
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDragging = true; 

        if (isDragging) {
            const btnW = $floatingBtn.outerWidth() || 60;
            const btnH = $floatingBtn.outerHeight() || 60;
            const maxLeft = window.innerWidth - btnW;
            const maxTop = window.innerHeight - btnH;

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            // กันทะลุขอบหน้าจอ 100%
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            $floatingBtn.css({ left: `${newLeft}px`, top: `${newTop}px` });
        }
    }

    function onMouseUp() {
        $(document).off('mousemove.iosvp touchmove.iosvp mouseup.iosvp touchend.iosvp');
        if (isDragging) {
            settings.posX = parseFloat($floatingBtn.css('left'));
            settings.posY = parseFloat($floatingBtn.css('top'));
            saveSettings();
        }
    }

    // เด้งปุ่มกลับเข้าจออัตโนมัติเมื่อหมุนหน้าจอ หรือเปลี่ยนขนาดหน้าต่าง
    $(window).on('resize', clampButtonPosition);

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

// 6. ฟังก์ชันแสดง/ซ่อน และแจ้งเตือน
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
    notifTimeout = setTimeout(hideNotification, 4000);
}

function hideNotification() {
    $notification.removeClass('show');
}

// 7. ดึงแชททั้งหมด และดักจับ [SMS: ...]
function refreshPhoneChat() {
    const context = SillyTavern.getContext();
    const chat = context.chat || [];
    $chatArea.empty();

    const smsRegex = /\[SMS:\s*([\s\S]*?)\]/gi;

    chat.forEach(mes => {
        let match;
        const regex = new RegExp(smsRegex);
        while ((match = regex.exec(mes.mes)) !== null) {
            const smsText = match[1].trim();
            const isUser = mes.is_user;
            // ใช้ DOMPurify (มีมาให้ใน ST) เพื่อความปลอดภัย
            const bubbleHtml = `<div class="ios-vp-bubble ${isUser ? 'sent' : 'received'}">${SillyTavern.libs.DOMPurify.sanitize(smsText)}</div>`;
            $chatArea.append(bubbleHtml);
        }
    });
    
    $chatArea.scrollTop($chatArea[0].scrollHeight);
}

// 8. การส่งข้อความกลับเข้าแชทหลัก
function sendSMS() {
    const text = $('#ios-vp-input').val().trim();
    if (!text) return;
    
    const formattedText = `[SMS: ${text}]`;
    const textarea = document.getElementById('send_textarea');
    const sendBtn = document.getElementById('send_but');
    
    if (textarea && sendBtn) {
        textarea.value = formattedText;
        $(textarea).trigger('input'); 
        sendBtn.click();
        $('#ios-vp-input').val('');
        
        $chatArea.append(`<div class="ios-vp-bubble sent">${SillyTavern.libs.DOMPurify.sanitize(text)}</div>`);
        $chatArea.scrollTop($chatArea[0].scrollHeight);
    }
}

// 9. Hook ST Events: ซ่อน [SMS] จากแชทหลัก และแจ้งเตือน
function onMessageRendered(data) {
    const htmlEl = $(data.message).find('.mes_text');
    let textHtml = htmlEl.html();
    
    if (textHtml && textHtml.includes('[SMS:')) {
        const smsRegex = /\[SMS:\s*([\s\S]*?)\]/gi;
        const newHtml = textHtml.replace(smsRegex, '<span style="display:none;" class="ios-vp-hidden">$&</span>');
        htmlEl.html(newHtml);
    }
}

function onMessageReceived(data) {
    const mes = data;
    const smsRegex = /\[SMS:\s*([\s\S]*?)\]/i;
    const match = mes.mes.match(smsRegex);
    
    if (match) {
        const smsText = match[1].trim();
        const sender = mes.name || 'Unknown';
        showNotification(smsText, sender);
        if (isPhoneOpen) refreshPhoneChat();
    }
}

// === จุดเริ่มต้นการทำงาน ===
jQuery(async () => {
    const context = SillyTavern.getContext();
    
    await loadSettings();
    injectUI();
    injectSettingsUI(); // โหลด UI หน้าตั้งค่าโดยตรง

    context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
    context.eventSource.on(context.event_types.USER_MESSAGE_RENDERED, onMessageRendered);
    context.eventSource.on(context.event_types.MESSAGE_RECEIVED, onMessageReceived);
});
