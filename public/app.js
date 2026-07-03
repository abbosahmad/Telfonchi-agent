// State Management
let inventory = [];
let orders = [];
let chatHistory = [];
let appSettings = {
    engine: 'simulated' // 'simulated' or 'deepseek'
};

// Simulation State (for rule-based bot)
let simulationState = {
    step: 'greeting', // 'greeting', 'shopping', 'collecting_name', 'collecting_phone', 'confirming'
    orderInProgress: {
        customerName: '',
        phoneModel: '',
        quantity: 1,
        phoneNumber: ''
    }
};

// Admin Authentication helpers
let authCallback = null;

function getAdminHeaders() {
    const password = localStorage.getItem('ss_admin_password') || '';
    return {
        'Content-Type': 'application/json',
        'X-Admin-Password': password
    };
}

function isAdminLoggedIn() {
    return !!localStorage.getItem('ss_admin_password');
}

function updateAdminUI() {
    const btnText = document.getElementById('admin-auth-btn-text');
    const lockIcon = document.getElementById('admin-lock-icon');
    if (!btnText || !lockIcon) return;
    if (isAdminLoggedIn()) {
        btnText.textContent = 'Admin Chiqish';
        lockIcon.setAttribute('data-lucide', 'unlock');
        lockIcon.style.color = 'var(--success)';
    } else {
        btnText.textContent = 'Admin Kirish';
        lockIcon.setAttribute('data-lucide', 'lock');
        lockIcon.style.color = '';
    }
    lucide.createIcons();
}

function checkAdminOrPrompt(onAuthorized) {
    if (isAdminLoggedIn()) {
        onAuthorized();
    } else {
        triggerAuthModal(onAuthorized);
    }
}

window.triggerAuthModal = (callback = null) => {
    authCallback = callback;
    document.getElementById('admin-password-input').value = '';
    document.getElementById('auth-modal').classList.add('open');
};

function renderOrdersLocked() {
    const list = document.getElementById('orders-list');
    const badge = document.getElementById('orders-count');
    if (!list) return;
    badge.textContent = '?';
    list.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">
        <div style="margin-bottom: 12px; color: var(--warning); display: flex; justify-content: center;"><i data-lucide="lock" style="width: 32px; height: 32px;"></i></div>
        <p style="color: var(--text-secondary); font-weight: 500; margin-bottom: 4px;">Buyurtmalar ro'yxati qulflangan</p>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 15px;">Ko'rish uchun admin parolini kiriting</p>
        <button class="btn btn-sm btn-primary" onclick="triggerAuthModal()">Kirish</button>
    </td></tr>`;
    lucide.createIcons();
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    await fetchInventory();
    initUI();
    lucide.createIcons();
    
    // Initial bot message
    sendAgentMessage("Salom! SmartStore AI do'konimizga xush kelibsiz. Men savdo maslahatchisi Malikaman. Sizga qanday telefon kerak? Hozirda mavjud telefonlar ro'yxatini ko'rish uchun 'Qanday telefonlar bor?' deb so'rashingiz mumkin.");
});

// Load settings from LocalStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('ss_settings');
    if (savedSettings) {
        appSettings = JSON.parse(savedSettings);
        updateStatusBadge();
    }
}

// Save settings to LocalStorage
function saveSettings() {
    localStorage.setItem('ss_settings', JSON.stringify(appSettings));
    updateStatusBadge();
}

// Fetch Inventory from API
async function fetchInventory() {
    try {
        const response = await fetch('/api/inventory');
        inventory = await response.json();
    } catch (err) {
        console.error('Error fetching inventory:', err);
    }
}

// UI Initialization & Event Listeners
function initUI() {
    // Chat suggestions
    const suggestionBtns = document.querySelectorAll('.suggest-btn');
    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.getAttribute('data-text');
            document.getElementById('chat-input').value = text;
            document.getElementById('chat-form').dispatchEvent(new Event('submit'));
        });
    });

    // Settings Modal
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const aiEngineSelect = document.getElementById('ai-engine-select');

    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            aiEngineSelect.value = appSettings.engine || 'simulated';
            settingsModal.classList.add('open');
        });
    }

    const closeModal = () => settingsModal && settingsModal.classList.remove('open');
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeModal);
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', closeModal);

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            appSettings.engine = aiEngineSelect.value;
            saveSettings();
            closeModal();
            showToast("Sozlamalar saqlandi!");
        });
    }

    // Chat submit
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const messageText = chatInput.value.trim();
            if (!messageText) return;

            // Render user message
            renderMessage(messageText, 'user');
            chatInput.value = '';

            // Add to history
            chatHistory.push({ role: 'user', content: messageText });

            // Trigger AI Agent
            handleAIResponse(messageText);
        });
    }

    // Clear chat
    const clearChatBtn = document.getElementById('clear-chat-btn');
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm("Chat yozishmalarini tozalashni xohlaysizmi?")) {
                const chatMessages = document.getElementById('chat-messages');
                chatMessages.innerHTML = '';
                chatHistory = [];
                simulationState = {
                    step: 'greeting',
                    orderInProgress: { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' }
                };
                sendAgentMessage("Chat tozalandi. Sizga qanday yordam bera olaman?");
            }
        });
    }

    // Periodically sync inventory (every 10 seconds)
    setInterval(async () => {
        await fetchInventory();
    }, 10000);
}

function updateStatusBadge() {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (appSettings.engine === 'deepseek') {
        badge.className = 'mode-badge gemini-active';
        text.textContent = 'DeepSeek AI faol';
    } else {
        badge.className = 'mode-badge simulation';
        text.textContent = 'Simulyatsiya rejimi';
    }
}

// Render inventory items in admin panel table
function renderInventory() {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';

    inventory.forEach(phone => {
        const tr = document.createElement('tr');
        const isInStock = phone.stock > 0;
        
        tr.innerHTML = `
            <td>
                <div class="phone-cell">
                    <div class="phone-icon-placeholder">
                        <i data-lucide="smartphone"></i>
                    </div>
                    <span class="phone-name">${escapeHTML(phone.name)}</span>
                </div>
            </td>
            <td><strong>$${phone.price.toLocaleString()}</strong></td>
            <td>${phone.stock} ta</td>
            <td>
                <span class="status-pill ${isInStock ? 'instock' : 'outstock'}">
                    ${isInStock ? 'Bor' : 'Tugagan'}
                </span>
            </td>
        `;
        list.appendChild(tr);
    });
    lucide.createIcons();
}

// Render orders in admin panel table
function renderOrders() {
    const list = document.getElementById('orders-list');
    const badge = document.getElementById('orders-count');
    list.innerHTML = '';
    badge.textContent = orders.length;

    if (orders.length === 0) {
        list.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Hozircha buyurtmalar yo'q. AI agent yoki Telegram bot orqali buyurtma bering.</td></tr>`;
        return;
    }

    orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${order.id}</code></td>
            <td>
                <div style="font-weight:600;">${escapeHTML(order.customerName)}</div>
                <div style="color:var(--text-secondary); font-size:11px;">${escapeHTML(order.phoneNumber)}</div>
            </td>
            <td><span style="color: var(--accent-blue); font-weight: 550;">${escapeHTML(order.phoneModel)}</span></td>
            <td>${order.quantity} ta</td>
            <td><strong>$${(order.price * order.quantity).toLocaleString()}</strong></td>
            <td style="color: var(--text-muted); font-size: 11px;">${order.date}</td>
        `;
        list.appendChild(tr);
    });
}

// Quick restock logic
window.quickRestock = async (id, count) => {
    checkAdminOrPrompt(async () => {
        try {
            const response = await fetch('/api/inventory/restock', {
                method: 'POST',
                headers: getAdminHeaders(),
                body: JSON.stringify({ id, count })
            });
            if (response.status === 401) {
                showToast("Xatolik: Admin paroli noto'g'ri!");
                localStorage.removeItem('ss_admin_password');
                updateAdminUI();
                return;
            }
            await fetchInventory();
            const phone = inventory.find(p => p.id === id);
            showToast(`${phone.name} zaxirasi +${count} taga ko'paytirildi!`);
            sendSystemMessage(`Tizim: ${phone.name} zaxirasi to'ldirildi. Hozirda qoldiq: ${phone.stock} ta.`);
        } catch (e) {
            showToast("Zaxirani yangilashda xatolik!");
        }
    });
};

// Edit product
window.editProduct = (id) => {
    checkAdminOrPrompt(() => {
        const phone = inventory.find(p => p.id === id);
        if (!phone) return;

        document.getElementById('product-modal-title').textContent = "Telefonni tahrirlash";
        document.getElementById('product-id').value = phone.id;
        document.getElementById('product-name').value = phone.name;
        document.getElementById('product-price').value = phone.price;
        document.getElementById('product-stock').value = phone.stock;

        document.getElementById('product-modal').classList.add('open');
    });
};

// Delete product
window.deleteProduct = async (id) => {
    checkAdminOrPrompt(async () => {
        const phone = inventory.find(p => p.id === id);
        if (!phone) return;

        if (confirm(`Haqiqatan ham ${phone.name} modelini bazadan o'chirmoqchimisiz?`)) {
            try {
                const response = await fetch('/api/inventory/delete', {
                    method: 'POST',
                    headers: getAdminHeaders(),
                    body: JSON.stringify({ id })
                });
                if (response.status === 401) {
                    showToast("Xatolik: Admin paroli noto'g'ri!");
                    localStorage.removeItem('ss_admin_password');
                    updateAdminUI();
                    return;
                }
                await fetchInventory();
                showToast("Telefon bazadan o'chirildi!");
            } catch (e) {
                showToast("O'chirishda xatolik!");
            }
        }
    });
};

// Render message to screen
function renderMessage(text, role) {
    const container = document.getElementById('chat-messages');
    
    // Remove typing indicator if exists
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = text; // Allowed for markdown formatting later
    container.appendChild(msgDiv);
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// Show System notification inside chat
function sendSystemMessage(text) {
    const container = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message system`;
    msgDiv.innerHTML = `<i data-lucide="info"></i> <span>${escapeHTML(text)}</span>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
}

// Render typing indicator
function showTypingIndicator() {
    const container = document.getElementById('chat-messages');
    
    // check if already exists
    if (document.getElementById('typing-indicator')) return;

    const indDiv = document.createElement('div');
    indDiv.className = 'typing-indicator';
    indDiv.id = 'typing-indicator';
    indDiv.innerHTML = `
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
    `;
    container.appendChild(indDiv);
    container.scrollTop = container.scrollHeight;
}

// Send Agent message with typing animation
function sendAgentMessage(text, delay = 800) {
    showTypingIndicator();
    setTimeout(() => {
        renderMessage(text, 'agent');
    }, delay);
}

// Toast Notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-message');
    msg.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Place order via API
async function placeOrderAPI(customerName, phoneModel, quantity, phoneNumber) {
    try {
        const response = await fetch('/api/orders/place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerName, phoneModel, quantity, phoneNumber })
        });
        const res = await response.json();
        if (res.status === "success") {
            await fetchInventory();
            await fetchOrders();
        }
        return res;
    } catch (e) {
        return { status: 'error', message: 'API bilan aloqa uzildi.' };
    }
}

// AI Agent Response Dispatcher
function handleAIResponse(userText) {
    if (appSettings.engine === 'deepseek') {
        callBackendAI(userText);
    } else {
        // Fallback to simulated rules
        callSimulationEngine(userText);
    }
}

// SIMULATION ENGINE: Chatbot State Machine
async function callSimulationEngine(userText) {
    showTypingIndicator();
    
    const text = userText.toLowerCase().trim();
    let reply = "";
    
    // 1. Cancel check
    if (text.includes("bekor") || (text === "yo'q" && simulationState.step === 'confirming')) {
        simulationState.step = 'shopping';
        simulationState.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
        reply = "Xo'p, buyurtma bekor qilindi. Qayta tanlashingiz mumkin. Do'konimizda quyidagi telefonlar mavjud:<br>" + listPhonesHTML();
        sendAgentMessage(reply);
        return;
    }

    // 2. State Machine transitions
    switch (simulationState.step) {
        case 'greeting':
        case 'shopping':
            if (text.includes("qanday") || text.includes("nimalar") || text.includes("ro'yxat") || text.includes("bor") || text.includes("sotuvda")) {
                reply = "Hozirda do'konimizda quyidagi telefonlar mavjud:<br>" + listPhonesHTML();
            } else {
                const matchedPhone = findPhoneInLocalList(text);
                if (matchedPhone) {
                    if (matchedPhone.stock <= 0) {
                        reply = `Kechirasiz, <strong>${matchedPhone.name}</strong> hozircha sotuvda qolmagan. Bor telefonlarni taklif qila olaman:<br>` + listPhonesHTML();
                    } else {
                        simulationState.orderInProgress.phoneModel = matchedPhone.name;
                        simulationState.step = 'collecting_name';
                        reply = `Ajoyib tanlov! <strong>${matchedPhone.name}</strong> omborda bor. Buyurtmani rasmiylashtirish uchun <strong>ismingizni</strong> yozib yuboring.`;
                    }
                } else {
                    reply = "Kechirasiz, gapingizni tushunmadim. Do'kondagi bor telefonlarni taklif qila olaman. Ro'yxatni ko'rish uchun 'Qanday telefonlar bor?' deb yozing.";
                }
            }
            break;

        case 'collecting_name':
            simulationState.orderInProgress.customerName = userText;
            simulationState.step = 'collecting_phone';
            reply = `Rahmat, ${userText}. Endi esa siz bilan bog'lanishimiz uchun <strong>telefon raqamingizni</strong> kiritasiz.`;
            break;

        case 'collecting_phone':
            simulationState.orderInProgress.phoneNumber = userText;
            simulationState.step = 'confirming';
            
            const order = simulationState.orderInProgress;
            reply = `Buyurtma ma'lumotlarini tasdiqlang:<br><br>` +
                    `• <strong>Mijoz</strong>: ${escapeHTML(order.customerName)}<br>` +
                    `• <strong>Telefon raqam</strong>: ${escapeHTML(order.phoneNumber)}<br>` +
                    `• <strong>Model</strong>: ${order.phoneModel}<br>` +
                    `• <strong>Soni</strong>: 1 ta<br><br>` +
                    `Buyurtmani rasmiylashtirishni <strong>tasdiqlaysizmi?</strong> (<strong>Ha</strong> / <strong>Yo'q</strong> deb yozing)`;
            break;

        case 'confirming':
            if (text === "ha" || text.includes("tasdiqlay") || text.includes("ok") || text.includes("tasdiq")) {
                const order = simulationState.orderInProgress;
                const res = await placeOrderAPI(order.customerName, order.phoneModel, 1, order.phoneNumber);
                
                if (res.status === "success") {
                    reply = `🎉 Buyurtmangiz qabul qilindi! Buyurtma ID raqami: <strong>${res.order_id}</strong>. Rahmat!`;
                } else {
                    reply = `Xatolik yuz berdi: ${res.message}`;
                }
                simulationState.step = 'shopping';
                simulationState.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
            } else {
                reply = "Iltimos, buyurtmani tasdiqlash uchun 'Ha' yoki bekor qilish uchun 'Yo'q' deb javob bekon qiling.";
            }
            break;
    }

    sendAgentMessage(reply);
}

// Call Backend AI Endpoint (DeepSeek)
async function callBackendAI(userText) {
    showTypingIndicator();
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userText, history: chatHistory })
        });
        
        if (!response.ok) throw new Error("API call failed");
        
        const res = await response.json();
        
        if (res.reply) {
            renderMessage(formatMarkdown(res.reply), 'agent');
            chatHistory.push({ role: 'agent', content: res.reply });
            
            // Sync inventory and orders in case orders were placed
            await fetchInventory();
            await fetchOrders();
        } else {
            renderMessage(`⚠️ <strong>Xatolik:</strong> DeepSeek javob qaytarishda xatolik yuz berdi.`, 'agent');
        }
    } catch (err) {
        console.error(err);
        renderMessage(`⚠️ <strong>Xatolik:</strong> Aloqa muvaffaqiyatsiz tugadi. Simulyatsiyaga o'tildi.`, 'agent');
        callSimulationEngine(userText);
    }
}

// Helpers for simulation
function listPhonesHTML() {
    return inventory.map(p => {
        const stockText = p.stock > 0 ? `<span style="color:var(--success)">(${p.stock} ta bor)</span>` : `<span style="color:var(--danger)">(tugagan)</span>`;
        return `• <strong>${p.name}</strong> - $${p.price.toLocaleString()} ${stockText}`;
    }).join('<br>');
}

function findPhoneInLocalList(text) {
    return inventory.find(p => text.includes(p.name.toLowerCase()) || 
                               text.includes(p.name.replace(/galaxy\s*/i, '').toLowerCase()) || 
                               text.includes(p.name.replace(/pro\s*max/i, '').toLowerCase().trim()));
}

// Helpers
function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatMarkdown(text) {
    if (!text) return '';
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/^\s*[-*]\s+(.*)$/gm, '• $1');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}
