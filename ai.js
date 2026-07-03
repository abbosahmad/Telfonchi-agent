const { dbQuery } = require('./db');
require('dotenv').config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// System Prompt for DeepSeek Shop Assistant
const systemInstruction = `Siz "SmartStore AI" do'konining sotuvchi agentisiz. Ismingiz Malika.
Vazifangiz mijozlar bilan muloqot qilish, ularga faqat omborda bor telefonlarni taklif qilish va buyurtmalarini qabul qilishdir.

QOIDALAR:
1. Omborda nimalar borligini tekshirish uchun har doim 'get_inventory' funksiyasidan foydalaning. Foydalanuvchiga bor telefonlarni ko'rsating va ularning narxi hamda qoldiq sonini to'g'ri ayting.
2. Agar mijoz omborda qoldig'i 0 bo'lgan yoki umuman yo'q telefonni so'rasa, u hozirda yo'qligini xushmuomilalik bilan tushuntiring va get_inventory orqali bor muqobil telefonlarni taklif qiling.
3. Buyurtma olish uchun quyidagi ma'lumotlarni so'rashingiz shart:
   - Mijozning ismi
   - Telefon raqami
   - Telefon modeli (omborda bor bo'lishi va qoldig'i yetarli bo'lishi shart)
   - Soni (kamida 1 ta)
4. Barcha 4 ta ma'lumot to'liq olinganidan keyingina 'place_order' funksiyasini chaqiring. Mijozga buyurtma ID (ORD-XXXX) raqamini va tafsilotlarni ma'lum qiling.
5. Mijozlar bilan juda xushmuomila, o'zbek tilida, do'stona gaplashing. Qisqa va lo'nda javob bering.`;

// Tools (OpenAI / DeepSeek Format)
const tools = [
    {
        type: "function",
        function: {
            name: "get_inventory",
            description: "Ombordagi barcha telefonlar ro'yxatini, ularning narxi va qoldiq sonini qaytaradi."
        }
    },
    {
        type: "function",
        function: {
            name: "place_order",
            description: "Mijoz uchun telefon buyurtmasini rasmiylashtiradi va bazaga saqlaydi.",
            parameters: {
                type: "object",
                properties: {
                    customer_name: {
                        type: "string",
                        description: "Mijozning ismi"
                    },
                    phone_model: {
                        type: "string",
                        description: "Telefon modeli nomi (ombordagi ro'yxatdan aniq mos kelishi kerak)"
                    },
                    quantity: {
                        type: "integer",
                        description: "Buyurtma qilinayotgan telefonlar soni"
                    },
                    phone_number: {
                        type: "string",
                        description: "Bog'lanish uchun telefon raqami"
                    }
                },
                required: ["customer_name", "phone_model", "quantity", "phone_number"]
            }
        }
    }
];

// Local DB executor for Tools
async function executeTool(name, args) {
    if (name === 'get_inventory') {
        return await dbQuery.all('SELECT * FROM inventory');
    } else if (name === 'place_order') {
        const { customer_name, phone_model, quantity, phone_number } = args;
        try {
            const phone = await dbQuery.get('SELECT * FROM inventory WHERE LOWER(name) = LOWER(?)', [phone_model.trim()]);
            if (!phone) {
                return { status: 'error', message: `Bazamizda "${phone_model}" nomli telefon topilmadi.` };
            }
            if (phone.stock < quantity) {
                return { status: 'error', message: `Omborda yetarli qoldiq yo'q. Hozirda qoldiq: ${phone.stock} ta.` };
            }
            // Decrement
            await dbQuery.run('UPDATE inventory SET stock = stock - ? WHERE id = ?', [quantity, phone.id]);
            
            const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
            const dateStr = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });

            await dbQuery.run(
                'INSERT INTO orders (id, customerName, phoneModel, quantity, price, phoneNumber, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [orderId, customer_name, phone.name, quantity, phone.price, phone_number, dateStr]
            );

            return {
                status: 'success',
                order_id: orderId,
                message: 'Buyurtma muvaffaqiyatli saqlandi!'
            };
        } catch (e) {
            return { status: 'error', message: e.message };
        }
    }
    return { error: 'Unknown function' };
}

// Format API history to OpenAI format
function formatHistory(history) {
    const formatted = [];
    formatted.push({ role: "system", content: systemInstruction });
    
    history.slice(-15).forEach(msg => {
        // Handle openai roles
        if (msg.role === 'user') {
            formatted.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'agent' || msg.role === 'assistant') {
            formatted.push({ role: 'assistant', content: msg.content });
        }
    });
    return formatted;
}

// Main AI response call
async function getAIResponse(messageText, history = []) {
    if (!DEEPSEEK_API_KEY) {
        return { reply: "⚠️ DeepSeek API kaliti ulanmagan. Iltimos server sozlamalarini tekshiring.", isSimulated: true };
    }

    const messages = formatHistory(history);
    
    // Add current user message if not already in history
    if (messages[messages.length - 1]?.content !== messageText) {
        messages.push({ role: 'user', content: messageText });
    }

    try {
        let response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-v4-pro',
                messages: messages,
                tools: tools
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} - ${errBody}`);
        }

        let data = await response.json();
        let message = data.choices[0].message;

        // Loop if DeepSeek requests tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            // Add assistant tool_calls message to history
            messages.push(message);

            for (const toolCall of message.tool_calls) {
                const funcName = toolCall.function.name;
                const funcArgs = JSON.parse(toolCall.function.arguments);
                
                console.log(`DeepSeek tool call requested: ${funcName}`, funcArgs);

                const result = await executeTool(funcName, funcArgs);

                // Add tool response to history
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }

            // Call again with tool results
            response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'deepseek-v4-pro',
                    messages: messages
                })
            });

            if (!response.ok) {
                throw new Error("Follow-up response to DeepSeek failed");
            }

            data = await response.json();
            message = data.choices[0].message;
        }

        return { reply: message.content, isSimulated: false };

    } catch (e) {
        console.error('DeepSeek connection error:', e);
        return { reply: null, error: e.message };
    }
}

module.exports = { getAIResponse };
