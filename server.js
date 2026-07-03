const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { dbQuery } = require('./db');

const app = express();
const PORT = process.env.PORT || 3005;

// Simple in-memory rate limiter for /api/chat (max 20 req/min per IP)
const chatRateLimit = {};
function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    if (!chatRateLimit[ip]) chatRateLimit[ip] = [];
    chatRateLimit[ip] = chatRateLimit[ip].filter(t => now - t < 60000);
    if (chatRateLimit[ip].length >= 20) {
        return res.status(429).json({ error: 'So\'rov limiti oshdi. 1 daqiqadan keyin qayta urinib ko\'ring.' });
    }
    chatRateLimit[ip].push(now);
    next();
}

// Middleware
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoints for Inventory
app.get('/api/inventory', async (req, res) => {
    try {
        const rows = await dbQuery.all('SELECT * FROM inventory');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/add', async (req, res) => {
    const { name, price, stock } = req.body;
    if (!name || isNaN(price) || isNaN(stock)) {
        return res.status(400).json({ error: 'Noto\'g\'ri ma\'lumotlar.' });
    }
    const id = Date.now().toString();
    try {
        await dbQuery.run('INSERT INTO inventory (id, name, price, stock) VALUES (?, ?, ?, ?)', [id, name, price, stock]);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/edit', async (req, res) => {
    const { id, name, price, stock } = req.body;
    if (!id || !name || isNaN(price) || isNaN(stock)) {
        return res.status(400).json({ error: 'Noto\'g\'ri ma\'lumotlar.' });
    }
    try {
        await dbQuery.run('UPDATE inventory SET name = ?, price = ?, stock = ? WHERE id = ?', [name, price, stock, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID kiritilmagan.' });
    try {
        await dbQuery.run('DELETE FROM inventory WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/restock', async (req, res) => {
    const { id, count } = req.body;
    if (!id || isNaN(count)) return res.status(400).json({ error: 'Noto\'g\'ri parametrlar.' });
    try {
        await dbQuery.run('UPDATE inventory SET stock = stock + ? WHERE id = ?', [count, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Endpoints for Orders
app.get('/api/orders', async (req, res) => {
    try {
        const rows = await dbQuery.all('SELECT * FROM orders ORDER BY date DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders/place', async (req, res) => {
    const { customerName, phoneModel, quantity, phoneNumber } = req.body;
    // Input validation
    if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
        return res.status(400).json({ error: 'Mijoz ismi noto\'g\'ri.' });
    }
    if (!phoneModel || typeof phoneModel !== 'string') {
        return res.status(400).json({ error: 'Telefon modeli kiritilmadi.' });
    }
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length < 7) {
        return res.status(400).json({ error: 'Telefon raqami noto\'g\'ri.' });
    }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1 || qty > 100) {
        return res.status(400).json({ error: 'Soni 1 dan 100 gacha bo\'lishi kerak.' });
    }

    try {
        // Find phone
        const phone = await dbQuery.get('SELECT * FROM inventory WHERE LOWER(name) = LOWER(?)', [phoneModel.trim()]);
        if (!phone) {
            return res.json({ status: 'error', message: `Bazamizda "${phoneModel}" nomli telefon topilmadi.` });
        }
        if (phone.stock <= 0) {
            return res.json({ status: 'error', message: `Kechirasiz, "${phone.name}" modelidan hozirda omborda qolmagan.` });
        }
        if (phone.stock < qty) {
            return res.json({ status: 'error', message: `Kechirasiz, omborda yetarli miqdorda "${phone.name}" yo\'q. Hozirda bor: ${phone.stock} ta.` });
        }

        // Decrement stock
        await dbQuery.run('UPDATE inventory SET stock = stock - ? WHERE id = ?', [qty, phone.id]);

        // Place order
        const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
        const dateStr = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });

        await dbQuery.run(
            'INSERT INTO orders (id, customerName, phoneModel, quantity, price, phoneNumber, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [orderId, customerName.trim(), phone.name, qty, phone.price, phoneNumber.trim(), dateStr]
        );

        res.json({
            status: 'success',
            order_id: orderId,
            message: 'Buyurtma saqlandi!',
            order: { id: orderId, customerName: customerName.trim(), phoneModel: phone.name, quantity: qty, price: phone.price, phoneNumber: phoneNumber.trim(), date: dateStr }
        });
    } catch (err) {
        console.error('Order placement error:', err.message);
        res.status(500).json({ error: 'Server xatosi yuz berdi.' });
    }
});

// NOTE: /api/orders/clear endpoint removed — requires admin auth panel for safety

const { getAIResponse } = require('./ai');

app.post('/api/chat', rateLimiter, async (req, res) => {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Xabar kiritilmadi.' });
    }
    if (message.length > 2000) {
        return res.status(400).json({ error: 'Xabar juda uzun (max 2000 belgi).' });
    }
    try {
        const result = await getAIResponse(message.trim(), Array.isArray(history) ? history.slice(-20) : []);
        res.json(result);
    } catch (err) {
        console.error('Chat API error:', err.message);
        res.status(500).json({ error: 'AI javobi olishda xato yuz berdi.' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint topilmadi.' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Server ichki xatosi.' });
});

// Start listening
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Export dbQuery for Telegram Bot module to use same database
module.exports = { dbQuery };

// Initialize Telegram Bot
require('./bot');
