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
console.log('Telegram bot is listening...');

// Keep track of sessions for simulation mode
const sessions = {};
// Keep track of chat history for DeepSeek mode
const botHistories = {};

// Handle incoming messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore empty/system messages
    if (!text) return;

    // Handle commands
    if (text === '/start') {
        sessions[chatId] = {
            step: 'shopping',
            orderInProgress: { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' }
        };
        botHistories[chatId] = [];

        await bot.sendMessage(chatId,
            `<b>Assalomu alaykum! SmartStore AI do'koniga xush kelibsiz!</b> 😊\n\n` +
            `Men savdo yordamchisiman. Sizga telefon tanlash va buyurtma berishda yordamlashaman.\n\n` +
            `🔍 <b>Sotuvda nimalar borligini bilish uchun:</b> "Qanday telefonlar bor?" deb yozing.\n` +
            `🛒 <b>Buyurtma berish uchun:</b> istalgan telefon nomini yozing (masalan, "iPhone 15 Pro Max olmoqchiman").\n\n` +
            `📋 /help — yordam\n` +
            `❌ /cancel — joriy buyurtmani bekor qilish`,
            { parse_mode: 'HTML' }
        );
        return;
    }

    if (text === '/help') {
        await bot.sendMessage(chatId,
            `<b>📖 Yordam</b>\n\n` +
            `• <b>Mavjud telefonlar:</b> "Qanday telefonlar bor?" yozing\n` +
            `• <b>Buyurtma:</b> Telefon nomini yozing va ko'rsatmalarni bajaring\n` +
            `• <b>Bekor qilish:</b> /cancel yozing\n` +
            `• <b>Qayta boshlash:</b> /start yozing\n\n` +
            `Muammo bo'lsa: @abboscoder`,
            { parse_mode: 'HTML' }
        );
        return;
    }

    if (text === '/cancel') {
        sessions[chatId] = {
            step: 'shopping',
            orderInProgress: { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' }
        };
        botHistories[chatId] = [];
        await bot.sendMessage(chatId, '❌ Joriy buyurtma bekor qilindi. Yangi buyurtma uchun "/start" ni bosing.');
        return;
    }

    // Session mavjud bo'lmasa, avtomatik boshlash
    if (!sessions[chatId]) {
        sessions[chatId] = {
            step: 'shopping',
            orderInProgress: { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' }
        };
    }
    if (!botHistories[chatId]) {
        botHistories[chatId] = [];
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
        await handleDeepSeekBot(chatId, text);
    } else {
        await handleSimulationBot(chatId, text);
    }
});

// DEEPSEEK BOT ENGINE
async function handleDeepSeekBot(chatId, text) {
    // Send typing action
    bot.sendChatAction(chatId, 'typing');

    if (!botHistories[chatId]) {
        botHistories[chatId] = [];
    }

    const history = botHistories[chatId];
    
    // Call the shared ai.js getAIResponse
    const res = await getAIResponse(text, history);
    
    if (res.reply) {
        const tgMessage = formatMarkdownToTelegram(res.reply);
        await bot.sendMessage(chatId, tgMessage, { parse_mode: 'HTML' });
        
        // Append turns to history
        history.push({ role: 'user', content: text });
        history.push({ role: 'agent', content: res.reply });
    } else {
        console.error("DeepSeek empty or failed response:", res.error);
        // Fallback to simulation
        await handleSimulationBot(chatId, text);
    }
}

// SIMULATION ENGINE FOR TELEGRAM (Fallback if API fails/missing)
async function handleSimulationBot(chatId, text) {
    if (!sessions[chatId]) {
        sessions[chatId] = {
            step: 'shopping',
            orderInProgress: { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' }
        };
    }

    const session = sessions[chatId];
    const cleanedText = text.toLowerCase().trim();
    let reply = "";

    // Cancel check
    if (cleanedText.includes("bekor") || (cleanedText === "yo'q" && session.step === 'confirming')) {
        session.step = 'shopping';
        session.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
        const phonesList = await getPhonesListText();
        reply = "Xo'p, buyurtmangiz bekor qilindi. Qayta tanlashingiz mumkin.\n\nMavjud telefonlar:\n" + phonesList;
        await bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
        return;
    }

    // State transitions
    switch (session.step) {
        case 'shopping':
            if (cleanedText.includes("qanday") || cleanedText.includes("nimalar") || cleanedText.includes("ro'yxat") || cleanedText.includes("bor") || cleanedText.includes("sotuvda")) {
                const list = await getPhonesListText();
                reply = "Hozirda do'konimizda quyidagi telefonlar bor:\n\n" + list;
            } else {
                const matchedPhone = await findPhoneInDB(cleanedText);
                if (matchedPhone) {
                    if (matchedPhone.stock <= 0) {
                        const list = await getPhonesListText();
                        reply = `Kechirasiz, <b>${matchedPhone.name}</b> hozircha sotuvda qolmagan. Bor telefonlarni taklif qila olaman:\n\n` + list;
                    } else {
                        session.orderInProgress.phoneModel = matchedPhone.name;
                        session.step = 'collecting_name';
                        reply = `Ajoyib tanlov! <b>${matchedPhone.name}</b> omborda bor.\n\nBuyurtmani rasmiylashtirish uchun <b>ismingizni</b> yozib yuboring.`;
                    }
                } else {
                    reply = "Kechirasiz, gapingizni unchalik tushunmadim. Ombordagi bor telefonlarni bilish uchun 'Qanday telefonlar bor?' deb yozing.";
                }
            }
            break;

        case 'collecting_name':
            session.orderInProgress.customerName = text;
            session.step = 'collecting_phone';
            reply = `Rahmat, ${text}. Bog'lanishimiz uchun <b>telefon raqamingizni</b> kiriting.`;
            break;

        case 'collecting_phone':
            session.orderInProgress.phoneNumber = text;
            session.step = 'confirming';
            
            const order = session.orderInProgress;
            reply = `🛒 <b>Buyurtma tafsilotlari:</b>\n\n` +
                    `• <b>Mijoz:</b> ${escapeHTML(order.customerName)}\n` +
                    `• <b>Telefon:</b> ${escapeHTML(order.phoneNumber)}\n` +
                    `• <b>Model:</b> ${order.phoneModel}\n` +
                    `• <b>Soni:</b> 1 ta\n\n` +
                    `Buyurtmani rasmiylashtirishni tasdiqlaysizmi? (<b>Ha</b> / <b>Yo'q</b> deb javob bering)`;
            break;

        case 'confirming':
            if (cleanedText === "ha" || cleanedText.includes("tasdiq") || cleanedText.includes("ok")) {
                const order = session.orderInProgress;
                const res = await placeOrderDB(order.customerName, order.phoneModel, 1, order.phoneNumber);
                
                if (res.status === "success") {
                    reply = `🎉 <b>Buyurtmangiz qabul qilindi!</b>\n\nBuyurtma ID raqami: <code>${res.order_id}</code>. Yaqin orada xodimlarimiz siz bilan bog'lanishadi. Rahmat!`;
                } else {
                    reply = `Xatolik yuz berdi: ${res.message}`;
                }
                session.step = 'shopping';
                session.orderInProgress = { customerName: '', phoneModel: '', quantity: 1, phoneNumber: '' };
            } else {
                reply = "Iltimos, buyurtmani tasdiqlash uchun 'Ha' yoki bekor qilish uchun 'Yo'q' deb yozing.";
            }
            break;
    }

    await bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
}

// DATABASE UTILITIES FOR BOT
async function getPhonesListText() {
    try {
        const rows = await dbQuery.all('SELECT * FROM inventory');
        return rows.map(p => {
            const stockText = p.stock > 0 ? `(${p.stock} ta bor)` : `<b>(tugagan)</b>`;
            return `• <b>${p.name}</b> - $${p.price.toLocaleString()} ${stockText}`;
        }).join('\n');
    } catch (e) {
        return "Xatolik yuz berdi.";
    }
}

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

        // Update database
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

// Formatter helper
function formatMarkdownToTelegram(text) {
    if (!text) return '';
    let formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^\s*[-*]\s+(.*)$/gm, '• $1');
    return formatted;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
