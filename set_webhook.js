const https = require('https');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

function apiPost(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: '/bot' + token + path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function setup() {
    // 1. Set Webhook
    console.log('\n📡 Webhook o\'rnatilmoqda...');
    const webhookRes = await apiPost('/setWebhook', {
        url: 'https://store.abboscoder.uz/bot/webhook',
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true
    });
    console.log(webhookRes.ok ? '✅ Webhook set: ' + (webhookRes.description || 'OK') : '❌ Webhook error: ' + webhookRes.description);

    // 2. Set Bot Commands (Menu button)
    console.log('\n📋 Bot buyruqlari o\'rnatilmoqda...');
    const commandsRes = await apiPost('/setMyCommands', {
        commands: [
            { command: 'start',    description: '🏠 Bosh sahifa — xush kelibsiz' },
            { command: 'phones',   description: '🛍 Barcha telefonlar ro\'yxati' },
            { command: 'order',    description: '🛒 Buyurtma berish' },
            { command: 'popular',  description: '🔥 Eng ko\'p sotilganlar' },
            { command: 'compare',  description: '⚖️ Telefonlarni solishtirish' },
            { command: 'budget',   description: '💰 Byudjet bo\'yicha telefon tanlash' },
            { command: 'cancel',   description: '❌ Suhbatni tozalash' },
            { command: 'help',     description: '❓ Yordam va qo\'llanma' },
        ]
    });
    console.log(commandsRes.ok ? '✅ Commands set!' : '❌ Commands error: ' + commandsRes.description);

    // 3. Set Menu Button
    console.log('\n🔘 Menu tugmasi o\'rnatilmoqda...');
    const menuRes = await apiPost('/setChatMenuButton', {
        menu_button: {
            type: 'commands'
        }
    });
    console.log(menuRes.ok ? '✅ Menu button set!' : '❌ Menu button error: ' + menuRes.description);

    // 4. Verify
    console.log('\n🔍 Tekshiruv...');
    const webhookInfo = await new Promise((resolve) => {
        https.get('https://api.telegram.org/bot' + token + '/getWebhookInfo', (r) => {
            let info = '';
            r.on('data', (c) => { info += c; });
            r.on('end', () => resolve(JSON.parse(info)));
        });
    });
    console.log('Webhook URL:', webhookInfo.result.url);
    console.log('Allowed updates:', webhookInfo.result.allowed_updates);
    console.log('\n✅ Barcha sozlamalar muvaffaqiyatli o\'rnatildi!');
}

setup().catch(console.error);
