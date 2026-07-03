// State Management
let inventory = [];
let orders = [];
let chatHistory = [];
let appSettings = {
    engine: 'simulated', // 'simulated' or 'gemini'
    apiKey: ''
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

// Initial Data
const defaultInventory = [
    { id: '1', name: 'iPhone 15 Pro Max', price: 1200, stock: 5 },
    { id: '2', name: 'Samsung Galaxy S24 Ultra', price: 1100, stock: 3 },
    { id: '3', name: 'Xiaomi 14 Ultra', price: 900, stock: 8 },
    { id: '4', name: 'Google Pixel 8 Pro', price: 800, stock: 0 },
    { id: '5', name: 'OnePlus 12', price: 700, stock: 4 }
];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initUI();
    renderInventory();
    renderOrders();
    lucide.createIcons();
    
    // Initial bot message
    sendAgentMessage("Salom! SmartStore AI do'konimizga xush kelibsiz. Men savdo maslahatchisi Malikaman. Sizga qanday telefon kerak? Hozirda mavjud telefonlar ro'yxatini ko'rish uchun 'Qanday telefonlar bor?' deb so'rashingiz mumkin.");
});

// Load from LocalStorage
function loadData() {
    const savedInventory = localStorage.getItem('ss_inventory');
    if (savedInventory) {
        inventory = JSON.parse(savedInventory);
    } else {
        inventory = [...defaultInventory];
        localStorage.setItem('ss_inventory', JSON.stringify(inventory));
    }

    const savedOrders = localStorage.getItem('ss_orders');
    if (savedOrders) {
        orders = JSON.parse(savedOrders);
    } else {
        orders = [];
        localStorage.setItem('ss_orders', JSON.stringify(orders));
    }

    const savedSettings = localStorage.getItem('ss_settings');
    if (savedSettings) {
        appSettings = JSON.parse(savedSettings);
        // Apply settings UI changes
        const apiGroup = document.getElementById('api-key-group');
        if (appSettings.engine === 'gemini') {
            apiGroup.style.display = 'flex';
        } else {
            apiGroup.style.display = 'none';
        }
        updateStatusBadge();
    }
}

// Save to LocalStorage
function saveData() {
    localStorage.setItem('ss_inventory', JSON.stringify(inventory));
    localStorage.setItem('ss_orders', JSON.stringify(orders));
    localStorage.setItem('ss_settings', JSON.stringify(appSettings));
    renderInventory();
    renderOrders();
}

// Reset Database to default
function resetDatabase() {
    if (confirm("Haqiqatan ham ma'lumotlar bazasini boshlang'ich holatiga qaytarmoqchimisiz? Barcha buyurtmalar va o'zgarishlar o'chib ketadi.")) {
        inventory = [...defaultInventory];
        orders = [];
        saveData();
        showToast("Ma'lumotlar bazasi muvaffaqiyatli tiklandi!");
        location.reload();
    }
}

// UI Initialization & Event Listeners
function initUI() {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

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
    const apiKeyInput = document.getElementById('api-key-input');
    const resetDbBtn = document.getElementById('reset-db-btn');
    const apiGroup = document.getElementById('api-key-group');

    openSettingsBtn.addEventListener('click', () => {
        aiEngineSelect.value = appSettings.engine;
        apiKeyInput.value = appSettings.apiKey || '';
        apiGroup.style.display = appSettings.engine === 'gemini' ? 'flex' : 'none';
        settingsModal.classList.add('open');
    });

    const closeModal = () => settingsModal.classList.remove('open');
    closeSettingsBtn.addEventListener('click', closeModal);
    cancelSettingsBtn.addEventListener('click', closeModal);

    aiEngineSelect.addEventListener('change', () => {
        if (aiEngineSelect.value === 'gemini') {
            apiGroup.style.display = 'flex';
        } else {
            apiGroup.style.display = 'none';
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        appSettings.engine = aiEngineSelect.value;
        appSettings.apiKey = apiKeyInput.value.trim();
        saveData();
        updateStatusBadge();
        closeModal();
        showToast("Sozlamalar saqlandi!");
    });

    resetDbBtn.addEventListener('click', resetDatabase);

    // Add Product Modal
    const addProductBtn = document.getElementById('add-product-btn');
    const closeProductBtn = document.getElementById('close-product-btn');
    const cancelProductBtn = document.getElementById('cancel-product-btn');
    const productModal = document.getElementById('product-modal');
    const productForm = document.getElementById('product-form');

    addProductBtn.addEventListener('click', () => {
        document.getElementById('product-modal-title').textContent = "Yangi telefon qo'shish";
        document.getElementById('product-id').value = '';
        productForm.reset();
        productModal.classList.add('open');
    });

    const closeProductModal = () => productModal.classList.remove('open');
    closeProductBtn.addEventListener('click', closeProductModal);
    cancelProductBtn.addEventListener('click', closeProductModal);

    productForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('product-id').value;
        const name = document.getElementById('product-name').value.trim();
        const price = parseInt(document.getElementById('product-price').value);
        const stock = parseInt(document.getElementById('product-stock').value);

        if (id) {
            // Edit mode
            const index = inventory.findIndex(p => p.id === id);
            if (index !== -1) {
                inventory[index] = { ...inventory[index], name, price, stock };
                showToast("Telefon ma'lumotlari tahrirlandi!");
            }
        } else {
            // Add mode
            const newId = Date.now().toString();
            inventory.push({ id: newId, name, price, stock });
            showToast("Yangi telefon bazaga qo'shildi!");
        }

        saveData();
        closeProductModal();
    });

    // Chat submit
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
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

    // Clear chat
    document.getElementById('clear-chat-btn').addEventListener('click', () => {
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

    // Clear orders
    document.getElementById('clear-orders-btn').addEventListener('click', () => {
        if (confirm("Barcha qabul qilingan buyurtmalarni o'chirib tashlamoqchimisiz?")) {
            orders = [];
            saveData();
            showToast("Barcha buyurtmalar o'chirildi!");
        }
    });
}

function updateStatusBadge() {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (appSettings.engine === 'gemini') {
        badge.className = 'mode-badge gemini-active';
        text.textContent = 'Gemini AI faol';
    } else {
        badge.className = 'mode-badge simulation';
        text.textContent = 'Simulyatsiya rejimi';
    }
}

// Render inventory items in admin panel table
function renderInventory() {
    const list = document.getElementById('inventory-list');
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
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>${phone.stock} ta</span>
                    <button class="btn btn-secondary btn-sm" onclick="quickRestock('${phone.id}', 5)" title="Zaxirani 5 taga to'ldirish">+5</button>
                </div>
            </td>
            <td>
                <span class="status-pill ${isInStock ? 'instock' : 'outstock'}">
                    ${isInStock ? 'Bor' : 'Tugagan'}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-icon btn-sm" onclick="editProduct('${phone.id}')" title="Tahrirlash">
                        <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-icon btn-sm btn-danger" onclick="deleteProduct('${phone.id}')" title="O'chirish">
                        <i data-lucide="trash" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
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
        list.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Hozircha buyurtmalar yo'q. AI agent orqali buyurtma bering.</td></tr>`;
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
window.quickRestock = (id, count) => {
    const index = inventory.findIndex(p => p.id === id);
    if (index !== -1) {
        inventory[index].stock += count;
        saveData();
        showToast(`${inventory[index].name} zaxirasi +${count} taga ko'paytirildi!`);
        // Notify chat system if it was out of stock
        sendSystemMessage(`Tizim: ${inventory[index].name} zaxirasi to'ldirildi. Hozirda qoldiq: ${inventory[index].stock} ta.`);
    }
};

// Edit product
window.editProduct = (id) => {
    const phone = inventory.find(p => p.id === id);
    if (!phone) return;

    document.getElementById('product-modal-title').textContent = "Telefonni tahrirlash";
    document.getElementById('product-id').value = phone.id;
    document.getElementById('product-name').value = phone.name;
    document.getElementById('product-price').value = phone.price;
    document.getElementById('product-stock').value = phone.stock;

    document.getElementById('product-modal').classList.add('open');
};

// Delete product
window.deleteProduct = (id) => {
    const phone = inventory.find(p => p.id === id);
    if (!phone) return;

    if (confirm(`Haqiqatan ham ${phone.name} modelini bazadan o'chirmoqchimisiz?`)) {
        inventory = inventory.filter(p => p.id !== id);
        saveData();
        showToast("Telefon bazadan o'chirildi!");
    }
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

// Function calling interface for Database updates
function getInventory() {
    return inventory;
}

function placeOrder(customerName, phoneModel, quantity, phoneNumber) {
    // Normalize case
    const phone = inventory.find(p => p.name.toLowerCase().trim() === phoneModel.toLowerCase().trim());
    
    if (!phone) {
        return {
            status: "error",
            message: `Kechirasiz, bazamizda "${phoneModel}" nomli telefon topilmadi. Iltimos, faqat ro'yxatdagilardan birini tanlang.`
        };
    }
    
    if (phone.stock <= 0) {
        return {
            status: "error",
            message: `Kechirasiz, "${phone.name}" modelidan hozirda omborda qolmagan. Boshqa modelni taklif qiling.`
        };
    }
    
    if (phone.stock < quantity) {
        return {
            status: "error",
            message: `Kechirasiz, omborda yetarli miqdorda "${phone.name}" yo'q. Hozirda maksimal qoldiq: ${phone.stock} ta.`
        };
    }
    
    // Decrement stock
    phone.stock -= quantity;
    
    // Generate Order
    const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toLocaleString('uz-UZ');
    
    const newOrder = {
        id: orderId,
        customerName: customerName,
        phoneModel: phone.name,
        quantity: quantity,
        price: phone.price,
        phoneNumber: phoneNumber,
        date: dateStr
    };
    
    orders.unshift(newOrder);
    saveData();
    
    // Play sound or show visual confirmation
    return {
        status: "success",
        order_id: orderId,
        message: "Buyurtma bazaga muvaffaqiyatli saqlandi!",
        order: newOrder
    };
}

// AI Agent Response Dispatcher
function handleAIResponse(userText) {
    if (appSettings.engine === 'gemini' && appSettings.apiKey) {
        callGeminiAPI(userText);
    } else {
        // Fallback to simulated rules
        callSimulationEngine(userText);
    }
}

// SIMULATION ENGINE: Chatbot State Machine
function callSimulationEngine(userText) {
    showTypingIndicator();
    
    setTimeout(() => {
        const text = userText.toLowerCase().trim();
        let reply = "";
        
        // 1. Cancel check
        if (text.includes("bekor") || text === "yo'q" && simulationState.step === 'confirming') {
            simulationState.step = 'shopping';
            simulationState.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
            reply = "Xo'p, buyurtma bekor qilindi. Qayta tanlashingiz mumkin. Do'konimizda quyidagi telefonlar mavjud:<br>" + listPhonesHTML();
            renderMessage(reply, 'agent');
            return;
        }

        // 2. State Machine transitions
        switch (simulationState.step) {
            case 'greeting':
            case 'shopping':
                // Check if user is asking for what is available
                if (text.includes("qanday") || text.includes("nimalar") || text.includes("ro'yxat") || text.includes("bor") || text.includes("sotuvda")) {
                    reply = "Hozirda do'konimizda quyidagi telefonlar mavjud:<br>" + listPhonesHTML();
                } 
                // Check if user specifies a phone name
                else {
                    const matchedPhone = findPhoneInText(text);
                    if (matchedPhone) {
                        if (matchedPhone.stock <= 0) {
                            reply = `Kechirasiz, <strong>${matchedPhone.name}</strong> hozircha sotuvda qolmagan. Bor telefonlarni taklif qila olaman:<br>` + listPhonesHTML();
                        } else {
                            simulationState.orderInProgress.phoneModel = matchedPhone.name;
                            simulationState.step = 'collecting_name';
                            reply = `Ajoyib tanlov! <strong>${matchedPhone.name}</strong> omborda bor. Buyurtmani rasmiylashtirish uchun <strong>ismingizni</strong> yozib yuboring.`;
                        }
                    } else {
                        reply = "Kechirasiz, savolingizni to'liq tushunmadim. Do'kondagi bor telefonlarni taklif qila olaman. Ro'yxatni ko'rish uchun 'Qanday telefonlar bor?' deb yozing.";
                    }
                }
                break;

            case 'collecting_name':
                simulationState.orderInProgress.customerName = userText; // Keep capitalization
                simulationState.step = 'collecting_phone';
                reply = `Rahmat, ${userText}. Endi esa siz bilan bog'lanishimiz uchun <strong>telefon raqamingizni</strong> kiritasiz.`;
                break;

            case 'collecting_phone':
                simulationState.orderInProgress.phoneNumber = userText;
                simulationState.step = 'confirming';
                
                const order = simulationState.orderInProgress;
                reply = `Barcha ma'lumotlar qabul qilindi. Buyurtmani tekshirib ko'ring:<br><br>` +
                        `• <strong>Mijoz</strong>: ${escapeHTML(order.customerName)}<br>` +
                        `• <strong>Telefon raqam</strong>: ${escapeHTML(order.phoneNumber)}<br>` +
                        `• <strong>Model</strong>: ${order.phoneModel}<br>` +
                        `• <strong>Soni</strong>: 1 ta<br><br>` +
                        `Buyurtmani rasmiylashtirishni <strong>tasdiqlaysizmi?</strong> (<strong>Ha</strong> / <strong>Yo'q</strong> deb yozing)`;
                break;

            case 'confirming':
                if (text === "ha" || text.includes("tasdiqlay") || text.includes("ok") || text.includes("ha, tasdiqlayman")) {
                    const order = simulationState.orderInProgress;
                    const res = placeOrder(order.customerName, order.phoneModel, 1, order.phoneNumber);
                    
                    if (res.status === "success") {
                        reply = `🎉 Buyurtmangiz qabul qilindi! Buyurtma ID raqami: <strong>${res.order_id}</strong>. Yaqin orada xodimlarimiz siz bilan bog'lanishadi. Rahmat!`;
                    } else {
                        reply = `Xatolik yuz berdi: ${res.message}`;
                    }
                    // Reset State
                    simulationState.step = 'shopping';
                    simulationState.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
                } else {
                    reply = "Iltimos, buyurtmani tasdiqlash uchun 'Ha' yoki bekor qilish uchun 'Yo'q' deb javob bering.";
                }
                break;
        }

        renderMessage(reply, 'agent');
    }, 800);
}

// Helpers for simulation
function listPhonesHTML() {
    return inventory.map(p => {
        const stockText = p.stock > 0 ? `<span style="color:var(--success)">(${p.stock} ta bor)</span>` : `<span style="color:var(--danger)">(tugagan)</span>`;
        return `• <strong>${p.name}</strong> - $${p.price.toLocaleString()} ${stockText}`;
    }).join('<br>');
}

function findPhoneInText(text) {
    // Find closest match
    return inventory.find(p => text.includes(p.name.toLowerCase()) || 
                               text.includes(p.name.replace(/galaxy\s*/i, '').toLowerCase()) || 
                               text.includes(p.name.replace(/pro\s*max/i, '').toLowerCase().trim()));
}

// GEMINI API FUNCTION CALLING
async function callGeminiAPI(userText) {
    showTypingIndicator();

    // Map history to Gemini structure
    // Convert session chatHistory array to API format
    // We only keep the last 15 messages to prevent token blowout
    const recentHistory = chatHistory.slice(-15);
    
    // Translate message formats
    const apiMessages = [];
    
    // We need to keep tracks of function call / response pairs correctly
    // The Gemini messages structure:
    // role: 'user' | 'model'
    // parts: [{text: "..."} | {functionCall: {...}} | {functionResponse: {...}}]
    
    // First message format conversion
    recentHistory.forEach(msg => {
        if (msg.role === 'user') {
            apiMessages.push({
                role: 'user',
                parts: [{ text: msg.content }]
            });
        } else if (msg.role === 'agent') {
            apiMessages.push({
                role: 'model',
                parts: [{ text: msg.content }]
            });
        }
    });

    const systemInstructionText = `Siz "SmartStore AI" do'konining sotuvchi agentisiz. Ismingiz Malika. 
Vazifangiz telefon sotib olmoqchi bo'lgan mijozlar bilan muloqot qilish, ularning buyurtmalarini qabul qilishdir.

QOIDALAR:
1. Omborda nimalar borligini tekshirish uchun har doim 'get_inventory' funksiyasidan foydalaning. Mijoz so'raganida yoki o'zingiz taklif kiritayotganda faqat omborda bor (stock > 0 bo'lgan) telefonlarni taklif qiling.
2. Agar mijoz omborda yo'q (stock = 0) bo'lgan yoki bazada umuman mavjud bo'lmagan telefonni so'rasa, hozircha u model yo'qligini ayting va get_inventory orqali boshqa bor modellarni taklif eting.
3. Buyurtma qabul qilishdan oldin siz mijozdan to'liq quyidagi ma'lumotlarni so'rashingiz shart:
   - Mijozning ismi
   - Telefon raqami
   - Telefon modeli (omborda bo'lishi va zaxira yetarli bo'lishi kerak)
   - Soni (nechta olmoqchi ekanligi)
4. Barcha 4 ta ma'lumot (ism, telefon raqam, model, soni) to'liq olinganidan keyin va mijoz tasdiqlaganidan keyingina 'place_order' funksiyasini chaqiring. Funksiya chaqirilishi bilan buyurtma jadvalga tushadi. Buyurtma saqlanganidan keyin mijozga Buyurtma ID (ORD-XXXX) raqamini ma'lum qiling.
5. Mijozlar bilan juda xushmuomila, o'zbek tilida, do'stona gaplashing. Har doim qisqa va lo'nda javob qaytaring.`;

    const requestBody = {
        contents: apiMessages,
        systemInstruction: {
            parts: [{ text: systemInstructionText }]
        },
        tools: [{
            functionDeclarations: [
                {
                    name: "get_inventory",
                    description: "Ombordagi barcha telefonlar ro'yxatini, ularning narxi va qoldiq sonini qaytaradi."
                },
                {
                    name: "place_order",
                    description: "Mijoz uchun telefon buyurtmasini rasmiylashtiradi va bazaga saqlaydi.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            customer_name: {
                                type: "STRING",
                                description: "Mijozning ismi"
                            },
                            phone_model: {
                                type: "STRING",
                                description: "Telefon modeli nomi (omborda bor telefonlar ro'yxatidan aniq mos kelishi kerak)"
                            },
                            quantity: {
                                type: "INTEGER",
                                description: "Buyurtma qilinayotgan telefonlar soni"
                            },
                            phone_number: {
                                type: "STRING",
                                description: "Bog'lanish uchun telefon raqami"
                            }
                        },
                        required: ["customer_name", "phone_model", "quantity", "phone_number"]
                    }
                }
            ]
        }]
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${appSettings.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'API request failed');
        }

        const data = await response.json();
        
        // Handle response with tool calls or text response
        const candidate = data.candidates?.[0];
        const content = candidate?.content;
        const parts = content?.parts || [];

        if (parts.length > 0 && parts[0].functionCall) {
            const funcCall = parts[0].functionCall;
            const funcName = funcCall.name;
            const args = funcCall.args;
            
            // Log function call in chat
            sendSystemMessage(`AI tizim funksiyasini chaqirdi: ${funcName}`);

            let functionResult = null;

            // Execute local database function
            if (funcName === 'get_inventory') {
                functionResult = getInventory();
            } else if (funcName === 'place_order') {
                functionResult = placeOrder(
                    args.customer_name,
                    args.phone_model,
                    args.quantity,
                    args.phone_number
                );
            }

            // Send back function result to Gemini to get the conversational response
            apiMessages.push(content); // Add the functionCall node (model role)
            
            // Add functionResponse node (function role)
            apiMessages.push({
                role: 'function',
                parts: [{
                    functionResponse: {
                        name: funcName,
                        response: { result: functionResult }
                    }
                }]
            });

            // Call again
            const followUpResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${appSettings.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: apiMessages,
                    systemInstruction: {
                        parts: [{ text: systemInstructionText }]
                    },
                    // Keep tools definition so Gemini knows what those functions are
                    tools: requestBody.tools
                })
            });

            if (!followUpResponse.ok) {
                throw new Error("Follow-up response to function failed");
            }

            const followUpData = await followUpResponse.json();
            const finalContent = followUpData.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (finalContent) {
                renderMessage(formatMarkdown(finalContent), 'agent');
                chatHistory.push({ role: 'agent', content: finalContent });
            } else {
                renderMessage("Buyurtma bajarildi, ammo AI javob qaytarishda xatolikka uchradi.", 'agent');
            }

        } else if (parts.length > 0 && parts[0].text) {
            // Standard conversational response
            const textResponse = parts[0].text;
            renderMessage(formatMarkdown(textResponse), 'agent');
            chatHistory.push({ role: 'agent', content: textResponse });
        } else {
            renderMessage("Kechirasiz, serverdan bo'sh javob qaytdi. Sozlamalarni tekshiring.", 'agent');
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        renderMessage(`⚠️ <strong>Xatolik:</strong> API so'rov yuborishda muammo yuz berdi. Iltimos, Sozlamalarda API kalitingiz to'g'riligini va internet aloqasini tekshiring. 
        <br><br><em>Avtomatik tarzda Simulyatsiya rejimiga o'tildi.</em>`, 'agent');
        // Fallback to simulated engine
        callSimulationEngine(userText);
    }
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
    // Bold formats
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Bullet points
    formatted = formatted.replace(/^\s*[-*]\s+(.*)$/gm, '• $1');
    // Newlines
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}
