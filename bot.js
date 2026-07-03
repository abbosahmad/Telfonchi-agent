const TelegramBot = require('node-telegram-bot-api');
const { dbQuery } = require('./db');
const { getAIResponse } = require('./ai');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('CRITICAL ERROR: TELEGRAM_BOT_TOKEN is not defined in .env file!');
    process.exit(1);
}

// Create the bot in WEBHOOK mode (no polling — avoids 409 Conflict)
const bot = new TelegramBot(token);
console.log('Telegram bot created in webhook mode...');

// AI conversation histories per user
const botHistories = {};

// ──────────────────────────────────────────────
// Helper: Main Menu inline markup
// ──────────────────────────────────────────────
function getMainMenuMarkup() {
    return {
        inline_keyboard: [
            [
                { text: '🛍 Telefonlar ro\'yxati', callback_data: 'list_inventory' },
                { text: '🤖 Yordamchi', callback_data: 'ai_assistant' }
            ],
            [
                { text: '📋 Yordam', callback_data: 'help_info' },
                { text: '👤 Admin bilan bog\'lanish', url: 'https://t.me/abboscoder' }
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

// Helper: Format Markdown → Telegram HTML
function formatMarkdownToTelegram(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^\s*[-*]\s+(.*)$/gm, '• $1');
}

// ──────────────────────────────────────────────
// Build inventory list message + keyboard
// ──────────────────────────────────────────────
async function buildInventoryContent() {
    const rows = await dbQuery.all('SELECT * FROM inventory');
    const keyboard = rows.map(p => {
        const status = p.stock > 0
            ? `$${p.price.toLocaleString()} (${p.stock} ta bor)`
            : 'Tugagan ❌';
        return [{ text: `${p.name} — ${status}`, callback_data: `buy_phone_${p.id}` }];
    });
    keyboard.push([{ text: '⬅️ Orqaga', callback_data: 'main_menu' }]);
    return {
        text: '<b>🛍 Ombordagi mavjud telefonlar:</b>\n\nBuyurtma berish uchun telefondan birini tanlang yoki AI sotuvchi bilan muloqot qiling:',
        reply_markup: { inline_keyboard: keyboard }
    };
}

// ──────────────────────────────────────────────
// Handle incoming text messages — AI FIRST
// ──────────────────────────────────────────────
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log(`[Msg] ChatId:${chatId} User:${msg.from?.username || 'none'} Text:${text || '[no text]'}`);

    if (!text) return;

    // Initialize history
    if (!botHistories[chatId]) botHistories[chatId] = [];

    // /start command
    if (text === '/start') {
        botHistories[chatId] = [];
        await bot.sendMessage(chatId,
            `<b>Assalomu alaykum! SmartStore AI do'koniga xush kelibsiz!</b> 😊\n\n` +
            `Men savdo yordamchisi <b>Malika</b>man. Telefonlar haqida istalgan savolingizni bering — narxlar, solishtirishlar, xususiyatlar va buyurtma berish bo'yicha yordamlashaman.\n\n` +
            `💬 <i>Shunchaki yozing — AI siz bilan gaplashadi!</i>\n` +
            `📋 <i>Yoki pastdagi Menu tugmasidan buyruqlarni tanlang.</i>`,
            {
                parse_mode: 'HTML',
                reply_markup: getMainMenuMarkup()
            }
        );
        return;
    }

    // /phones — inventory list
    if (text === '/phones') {
        try {
            const { text: invText, reply_markup } = await buildInventoryContent();
            await bot.sendMessage(chatId, invText, { parse_mode: 'HTML', reply_markup });
        } catch (e) {
            await bot.sendMessage(chatId, '⚠️ Telefonlarni yuklashda xatolik.');
        }
        return;
    }

    // /order — start ordering via AI
    if (text === '/order') {
        botHistories[chatId] = [];
        await bot.sendMessage(chatId,
            `🛒 <b>Buyurtma berish</b>\n\nQaysi telefonni xohlaysiz? Modelni, narx oralig'ini yoki xususiyatlarini ayting — men sizga eng mos variantlarni taklif qilaman!`,
            { parse_mode: 'HTML', reply_markup: getMainMenuMarkup() }
        );
        return;
    }

    // /popular — ask AI for popular phones
    if (text === '/popular') {
        await bot.sendChatAction(chatId, 'typing');
        const res = await getAIResponse('Ombordagi eng ko\'p sotilgan va mashhur telefonlarni tavsiya qilib bering. Har birining asosiy afzalliklarini ham ayting.', botHistories[chatId] || []);
        if (res.reply) {
            await bot.sendMessage(chatId, formatMarkdownToTelegram(res.reply), { parse_mode: 'HTML', reply_markup: getMainMenuMarkup() });
        }
        return;
    }

    // /compare — compare phones via AI
    if (text === '/compare') {
        await bot.sendMessage(chatId,
            `⚖️ <b>Telefonlarni solishtirish</b>\n\nQaysi telefonlarni solishtirmoqchisiz? Masalan:\n<i>"iPhone 15 Pro va Samsung Galaxy S24 Ultra ni solishtir"</i>`,
            { parse_mode: 'HTML', reply_markup: getMainMenuMarkup() }
        );
        return;
    }

    // /budget — budget-based recommendation
    if (text === '/budget') {
        await bot.sendMessage(chatId,
            `💰 <b>Byudjet bo'yicha tanlash</b>\n\nByudjetingizni ayting, men sizga eng mos telefonlarni tavsiya qilaman!\nMasalan: <i>"300-500 dollar orasida"</i> yoki <i>"500 dollardan arzon"</i>`,
            { parse_mode: 'HTML', reply_markup: getMainMenuMarkup() }
        );
        return;
    }

    // /help command
    if (text === '/help') {
        await bot.sendMessage(chatId,
            `<b>❓ Yordam va qo'llanma</b>\n\n` +
            `<b>Buyruqlar:</b>\n` +
            `• /start — Bosh sahifaga qaytish\n` +
            `• /phones — Barcha telefonlar ro'yxati\n` +
            `• /order — Buyurtma berish\n` +
            `• /popular — Eng mashhur telefonlar\n` +
            `• /compare — Telefonlarni solishtirish\n` +
            `• /budget — Byudjet bo'yicha tanlash\n` +
            `• /cancel — Suhbatni tozalash\n\n` +
            `<b>AI bilan gaplashish:</b>\n` +
            `💬 Istalgan savolni shunchaki yozing — AI sotuvchi Malika javob beradi. Buyurtmani ham AI orqali rasmiylashtirishingiz mumkin.`,
            { parse_mode: 'HTML', reply_markup: getMainMenuMarkup() }
        );
        return;
    }

    // /cancel command
    if (text === '/cancel') {
        botHistories[chatId] = [];
        await bot.sendMessage(chatId, '✅ Suhbat tozalandi. Yangi savolni yozing!', {
            parse_mode: 'HTML',
            reply_markup: getMainMenuMarkup()
        });
        return;
    }


    // All other messages → DeepSeek AI (no buttons shown during conversation)
    await bot.sendChatAction(chatId, 'typing');
    const history = botHistories[chatId];
    const res = await getAIResponse(text, history);

    if (res.reply) {
        const tgMessage = formatMarkdownToTelegram(res.reply);
        // No reply_markup — clean chat experience during AI conversation
        await bot.sendMessage(chatId, tgMessage, { parse_mode: 'HTML' });
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: res.reply });
        // Keep last 20 turns in memory
        if (history.length > 40) history.splice(0, 2);
    } else {
        console.error('AI error:', res.error);
        await bot.sendMessage(chatId,
            '⚠️ AI javob bera olmadi. Iltimos, qayta urinib ko\'ring.',
            { reply_markup: getMainMenuMarkup() }
        );
    }
});

// ──────────────────────────────────────────────
// Handle callback queries (inline button presses)
// ──────────────────────────────────────────────
bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const data = query.data;
        console.log(`[Callback] ChatId:${chatId} Data:${data}`);

        await bot.answerCallbackQuery(query.id);

        // ── AI Assistant button ── show intro and clear history
        if (data === 'ai_assistant') {
            botHistories[chatId] = [];
            await bot.editMessageText(
                `🤖 <b>AI Yordamchi — Malika</b>

Men sizga quyidagilarda yordam bera olaman:
• 📱 Telefon modellari haqida ma'lumot
• ⚖️ Telefonlarni narx va xususiyatlari bo'yicha solishtirish
• 💰 Byudjetingizga mos telefon tanlash
• 🛒 Buyurtma berish

Savolingizni yozing — javob beraman! 💬`,
                {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⬅️ Bosh menyu', callback_data: 'main_menu' }]
                        ]
                    }
                }
            );
        }

        // ── Main Menu (back button) ── edit existing message
        else if (data === 'main_menu') {
            await bot.editMessageText(
                `<b>SmartStore AI do'koni</b> 🏪\n\nSavdo yordamchisi <b>Malika</b> bilan muloqot qiling yoki quyidagi tugmalardan foydalaning:`,
                {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'HTML',
                    reply_markup: getMainMenuMarkup()
                }
            );
        }

        // ── Inventory List ── edit existing message
        else if (data === 'list_inventory') {
            const { text, reply_markup } = await buildInventoryContent();
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: msgId,
                parse_mode: 'HTML',
                reply_markup
            });
        }

        // ── Help ── edit existing message
        else if (data === 'help_info') {
            await bot.editMessageText(
                `<b>📖 Botdan foydalanish qo'llanmasi</b>\n\n` +
                `• 💬 <b>AI suhbat:</b> Istalgan savolingizni shunchaki yozing. Malika telefonlar haqida maslahat beradi, narxlarni solishtiradi va buyurtmangizni qabul qiladi.\n\n` +
                `• 🛍 <b>Telefonlar ro'yxati:</b> Ombordagi barcha telefonlarni ko'rish uchun tugmani bosing.\n\n` +
                `• 🛒 <b>Buyurtma berish:</b> AI bilan suhbatda telefon modelini aytib, ismingiz va raqamingizni yuboring — AI buyurtmani rasmiylashtiradi.\n\n` +
                `• /cancel — suhbat tarixini tozalash`,
                {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🛍 Telefonlarni ko\'rish', callback_data: 'list_inventory' }],
                            [{ text: '⬅️ Orqaga', callback_data: 'main_menu' }]
                        ]
                    }
                }
            );
        }

        // ── Buy Phone ── tell AI that user wants this phone
        else if (data.startsWith('buy_phone_')) {
            const phoneId = data.replace('buy_phone_', '');
            const phone = await dbQuery.get('SELECT * FROM inventory WHERE id = ?', [phoneId]);

            if (!phone) {
                await bot.sendMessage(chatId, '⚠️ Mahsulot topilmadi.');
                return;
            }
            if (phone.stock <= 0) {
                await bot.editMessageText(
                    `❌ Kechirasiz, <b>${escapeHTML(phone.name)}</b> hozirda tugagan.\n\nBoshqa telefonlarni ko'rish uchun quyidagi tugmani bosing:`,
                    {
                        chat_id: chatId,
                        message_id: msgId,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🛍 Boshqa telefonlar', callback_data: 'list_inventory' }],
                                [{ text: '⬅️ Orqaga', callback_data: 'main_menu' }]
                            ]
                        }
                    }
                );
                return;
            }

            // Edit to show phone info, then start AI conversation
            await bot.editMessageText(
                `<b>${escapeHTML(phone.name)}</b>\n💰 Narx: <b>$${phone.price.toLocaleString()}</b>\n📦 Omborda: <b>${phone.stock} ta</b>\n\nBuyurtma berish uchun quyida <b>ismingizni</b> yozing:`,
                {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: 'list_inventory' }]]
                    }
                }
            );

            // Prime AI with context about this phone
            if (!botHistories[chatId]) botHistories[chatId] = [];
            botHistories[chatId].push({
                role: 'user',
                content: `Men ${phone.name} telefonini sotib olmoqchiman. Narxi $${phone.price}, omborda ${phone.stock} ta bor.`
            });
            botHistories[chatId].push({
                role: 'assistant',
                content: `Ajoyib tanlov! ${phone.name} — $${phone.price}. Buyurtmani rasmiylashtirish uchun ismingizni ayting.`
            });
        }

    } catch (err) {
        console.error('Callback query error:', err.message);
    }
});

module.exports = { bot };
