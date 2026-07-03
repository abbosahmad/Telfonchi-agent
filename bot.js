const TelegramBot = require('node-telegram-bot-api');
const { dbQuery } = require('./db');
const { getAIResponse } = require('./ai');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('CRITICAL ERROR: TELEGRAM_BOT_TOKEN is not defined in .env file!');
    process.exit(1);
}

// Create the bot
const bot = new TelegramBot(token, { polling: true });
console.log('Telegram bot is listening (enhanced with inline buttons)...');

// Clear old webhooks and commands to ensure polling works and menu is clean
bot.deleteWebHook()
    .then(() => {
        console.log('Webhook deleted successfully. Polling is active.');
        return bot.deleteMyCommands();
    })
    .then(() => {
        console.log('Old bot commands deleted successfully.');
    })
    .catch(err => {
        console.error('Error cleaning up webhook and commands:', err);
    });

// Log polling conflicts or API errors in real-time
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});


// Sessions & histories
const sessions = {};
const botHistories = {};

// Helper: Start/Main Menu markup
function getMainMenuMarkup() {
    return {
        inline_keyboard: [
            [
                { text: "🛍 Telefonlar", callback_data: "list_inventory" },
                { text: "📋 Yordam", callback_data: "help_info" }
            ],
            [
                { text: "👤 Admin bilan bog'lanish", url: "https://t.me/abbosa" }
            ]
        ]
    };
}

// Helper: Escape HTML
function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper: Format Markdown to HTML for Telegram
function formatMarkdownToTelegram(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^\s*[-*]\s+(.*)$/gm, '• $1');
}

// Send Main Menu
async function sendMainMenu(chatId, text) {
    await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: getMainMenuMarkup()
    });
}

// Handle Incoming Messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log(`[Telegram Msg] ChatId: ${chatId}, Username: ${msg.from?.username || 'none'}, Text: ${text || '[No Text/Contact]'}`);

    // Handled contact sharing
    if (msg.contact && sessions[chatId] && sessions[chatId].step === 'collecting_phone') {
        const phoneNumber = msg.contact.phone_number;
        sessions[chatId].orderInProgress.phoneNumber = phoneNumber;
        await showOrderConfirmation(chatId);
        return;
    }

    if (!text) return;

    // Initialize session if not exists
    if (!sessions[chatId]) {
        sessions[chatId] = {
            step: 'shopping',
            orderInProgress: { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' }
        };
    }
    if (!botHistories[chatId]) {
        botHistories[chatId] = [];
    }

    const session = sessions[chatId];

    // Global commands
    if (text === '/start') {
        session.step = 'shopping';
        session.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
        botHistories[chatId] = [];

        await sendMainMenu(chatId, 
            `<b>Assalomu alaykum! SmartStore AI do'koniga xush kelibsiz!</b> 😊\n\n` +
            `Men savdo yordamchisi Malikaman. Sizga telefon tanlash va buyurtma berishda yordamlashaman.\n\n` +
            `👇 Quyidagi tugmalarni tanlang yoki o'zingiz xohlagan savolni yozing:`
        );
        return;
    }

    if (text === '/help') {
        await sendHelpMessage(chatId);
        return;
    }

    if (text === '/cancel' || text === '❌ Bekor qilish') {
        session.step = 'shopping';
        session.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
        botHistories[chatId] = [];
        await bot.sendMessage(chatId, '❌ Buyurtma bekor qilindi.', {
            reply_markup: { remove_keyboard: true }
        });
        await sendMainMenu(chatId, 'Bosh sahifa:');
        return;
    }

    // Process structured flow step by step
    if (session.step === 'collecting_name') {
        session.orderInProgress.customerName = text.trim();
        session.step = 'collecting_phone';
        
        await bot.sendMessage(chatId, 
            `Rahmat, <b>${escapeHTML(text)}</b>. Endi bog'lanish uchun <b>telefon raqamingizni</b> yuboring.\n\n` +
            `Quyidagi <b>"📱 Raqamni yuborish"</b> tugmasini bosib kontakt yuborishingiz yoki raqamingizni yozib yuborishingiz mumkin:`, {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [
                    [{ text: "📱 Raqamni yuborish", request_contact: true }],
                    [{ text: "❌ Bekor qilish" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    if (session.step === 'collecting_phone') {
        if (text.trim().length < 7) {
            await bot.sendMessage(chatId, 'Iltimos, telefon raqamingizni to\'g\'ri formatda yuboring!');
            return;
        }
        session.orderInProgress.phoneNumber = text.trim();
        await showOrderConfirmation(chatId);
        return;
    }

    // Default step: Handle with DeepSeek AI
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
        bot.sendChatAction(chatId, 'typing');
        const history = botHistories[chatId];
        const res = await getAIResponse(text, history);

        if (res.reply) {
            const tgMessage = formatMarkdownToTelegram(res.reply);
            await bot.sendMessage(chatId, tgMessage, { parse_mode: 'HTML' });
            history.push({ role: 'user', content: text });
            history.push({ role: 'agent', content: res.reply });
        } else {
            console.error("DeepSeek empty or failed response:", res.error);
            await handleSimulationBot(chatId, text);
        }
    } else {
        await handleSimulationBot(chatId, text);
    }
});

// Handle Callback Queries (Inline Buttons)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    console.log(`[Telegram Callback] ChatId: ${chatId}, Username: ${query.from?.username || 'none'}, Data: ${data}`);

    if (!sessions[chatId]) {
        sessions[chatId] = {
            step: 'shopping',
            orderInProgress: { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' }
        };
    }
    const session = sessions[chatId];

    await bot.answerCallbackQuery(query.id);

    if (data === 'main_menu') {
        session.step = 'shopping';
        session.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
        await sendMainMenu(chatId, 'Bosh menyu:');
    } 
    else if (data === 'help_info') {
        await sendHelpMessage(chatId);
    } 
    else if (data === 'list_inventory') {
        await sendInventoryList(chatId);
    } 
    else if (data.startsWith('buy_phone_')) {
        const phoneId = data.replace('buy_phone_', '');
        const phone = await dbQuery.get('SELECT * FROM inventory WHERE id = ?', [phoneId]);
        
        if (!phone) {
            await bot.sendMessage(chatId, "⚠️ Mahsulot topilmadi.");
            return;
        }
        if (phone.stock <= 0) {
            await bot.sendMessage(chatId, `Kechirasiz, <b>${phone.name}</b> hozirda tugagan!`);
            return;
        }

        session.step = 'collecting_name';
        session.orderInProgress.phoneModel = phone.name;
        
        await bot.sendMessage(chatId, 
            `Ajoyib tanlov! <b>${phone.name}</b> omborda bor.\n\n` +
            `Buyurtmani rasmiylashtirish uchun <b>ismingizni</b> yozib yuboring:`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "cancel_order" }]]
            }
        });
    } 
    else if (data === 'confirm_order') {
        const order = session.orderInProgress;
        const res = await placeOrderDB(order.customerName, order.phoneModel, 1, order.phoneNumber);
        
        if (res.status === "success") {
            await bot.sendMessage(chatId, 
                `🎉 <b>Buyurtmangiz muvaffaqiyatli qabul qilindi!</b>\n\n` +
                `• Buyurtma ID: <code>${res.order_id}</code>\n` +
                `• Mahsulot: ${order.phoneModel}\n\n` +
                `Tez orada operatorlarimiz bog'lanishadi. Rahmat!`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: "🛍 Bosh sahifa", callback_data: "main_menu" }]]
                }
            });
        } else {
            await bot.sendMessage(chatId, `❌ Buyurtmada xatolik: ${res.message}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "🛍 Bosh sahifa", callback_data: "main_menu" }]]
                }
            });
        }
        session.step = 'shopping';
        session.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
    } 
    else if (data === 'cancel_order') {
        session.step = 'shopping';
        session.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
        await bot.sendMessage(chatId, "❌ Buyurtma bekor qilindi.", {
            reply_markup: {
                inline_keyboard: [[{ text: "🛍 Bosh sahifa", callback_data: "main_menu" }]]
            }
        });
    }
});

// Show Order Summary for Confirmation
async function showOrderConfirmation(chatId) {
    const session = sessions[chatId];
    const order = session.orderInProgress;
    session.step = 'confirming';

    // Remove any reply keyboard
    await bot.sendMessage(chatId, "Tasdiqlash oynasiga o'tilmoqda...", {
        reply_markup: { remove_keyboard: true }
    });

    const summary = 
        `🛒 <b>Buyurtma tafsilotlari:</b>\n\n` +
        `• <b>Mijoz:</b> ${escapeHTML(order.customerName)}\n` +
        `• <b>Telefon:</b> ${escapeHTML(order.phoneNumber)}\n` +
        `• <b>Model:</b> ${order.phoneModel}\n` +
        `• <b>Soni:</b> 1 ta\n\n` +
        `Buyurtmani rasmiylashtirishni tasdiqlaysizmi?`;

    await bot.sendMessage(chatId, summary, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Tasdiqlash", callback_data: "confirm_order" },
                    { text: "❌ Bekor qilish", callback_data: "cancel_order" }
                ]
            ]
        }
    });
}

// Send Help Info
async function sendHelpMessage(chatId) {
    await bot.sendMessage(chatId,
        `<b>📖 Botdan foydalanish qo'llanmasi</b>\n\n` +
        `• 🛍 <b>Telefonlar</b> tugmasi orqali ombordagi bor mahsulotlarni tanlashingiz mumkin.\n` +
        `• 💬 <b>AI sotuvchi</b> bilan to'g'ridan-to'g'ri yozishib, savollar berishingiz, telefonlarni solishtirishingiz va buyurtma berishingiz mumkin.\n` +
        `• Biron buyurtmani boshlasangiz, istalgan bosqichda <b>/cancel</b> deb yozib yoki <b>"❌ Bekor qilish"</b> tugmasini bosib bekor qilishingiz mumkin.`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: "🛍 Telefonlarni ko'rish", callback_data: "list_inventory" }]]
            }
        }
    );
}

// Send Inventory with Inline Buttons
async function sendInventoryList(chatId) {
    try {
        const rows = await dbQuery.all('SELECT * FROM inventory');
        const keyboard = rows.map(p => {
            const status = p.stock > 0 ? `$${p.price.toLocaleString()} (${p.stock} ta bor)` : 'Tugagan ❌';
            return [{ text: `${p.name} — ${status}`, callback_data: `buy_phone_${p.id}` }];
        });
        keyboard.push([{ text: "⬅️ Orqaga", callback_data: "main_menu" }]);

        await bot.sendMessage(chatId, "<b>🛍 Ombordagi mavjud telefonlar:</b>\n\nBuyurtma qilish uchun telefonlardan birini tanlang:", {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (err) {
        await bot.sendMessage(chatId, "Ma'lumot olishda xatolik yuz berdi.");
    }
}

// Rule-based simulation bot (Fallback)
async function handleSimulationBot(chatId, text) {
    const session = sessions[chatId];
    const cleanedText = text.toLowerCase().trim();
    let reply = "";

    if (cleanedText.includes("qanday") || cleanedText.includes("nimalar") || cleanedText.includes("ro'yxat") || cleanedText.includes("bor") || cleanedText.includes("sotuvda")) {
        await sendInventoryList(chatId);
        return;
    }

    const matchedPhone = await findPhoneInDB(cleanedText);
    if (matchedPhone) {
        if (matchedPhone.stock <= 0) {
            reply = `Kechirasiz, <b>${matchedPhone.name}</b> hozirda sotuvda qolmagan.`;
            await bot.sendMessage(chatId, reply);
            await sendInventoryList(chatId);
        } else {
            session.step = 'collecting_name';
            session.orderInProgress.phoneModel = matchedPhone.name;
            await bot.sendMessage(chatId, 
                `Ajoyib tanlov! <b>${matchedPhone.name}</b> omborda bor.\n\n` +
                `Buyurtma berish uchun <b>ismingizni</b> yozib yuboring:`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "cancel_order" }]]
                }
            });
        }
    } else {
        reply = "Kechirasiz, gapingizni tushunmadim. Ombordagi telefonlarni bilish uchun pastdagi <b>🛍 Telefonlar</b> tugmasini bosing yoki AI maslahatchi bilan gaplashish uchun istalgan savolni yozing.";
        await bot.sendMessage(chatId, reply, {
            parse_mode: 'HTML',
            reply_markup: getMainMenuMarkup()
        });
    }
}

// DB Helpers
async function findPhoneInDB(text) {
    try {
        const rows = await dbQuery.all('SELECT * FROM inventory');
        return rows.find(p => text.includes(p.name.toLowerCase()) || 
                           text.includes(p.name.replace(/galaxy\s*/i, '').toLowerCase()) || 
                           text.includes(p.name.replace(/pro\s*max/i, '').toLowerCase().trim()));
    } catch (e) {
        return null;
    }
}

async function placeOrderDB(customerName, phoneModel, quantity, phoneNumber) {
    try {
        const phone = await dbQuery.get('SELECT * FROM inventory WHERE LOWER(name) = LOWER(?)', [phoneModel.trim()]);
        if (!phone) {
            return { status: 'error', message: 'Telefon topilmadi.' };
        }
        if (phone.stock < quantity) {
            return { status: 'error', message: 'Omborda yetarli qoldiq yo\'q.' };
        }

        await dbQuery.run('UPDATE inventory SET stock = stock - ? WHERE id = ?', [quantity, phone.id]);
        
        const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
        const dateStr = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });

        await dbQuery.run(
            'INSERT INTO orders (id, customerName, phoneModel, quantity, price, phoneNumber, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [orderId, customerName, phone.name, quantity, phone.price, phoneNumber, dateStr]
        );

        return {
            status: 'success',
            order_id: orderId
        };
    } catch (e) {
        return { status: 'error', message: e.message };
    }
}
