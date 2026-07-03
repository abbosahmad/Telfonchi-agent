const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { dbQuery } = require('./db');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
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
    if (!customerName || !phoneModel || isNaN(quantity) || !phoneNumber) {
        return res.status(400).json({ error: 'Barcha maydonlarni to\'ldirish shart.' });
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
        if (phone.stock < quantity) {
            return res.json({ status: 'error', message: `Kechirasiz, omborda yetarli miqdorda "${phone.name}" yo\'q. Hozirda bor: ${phone.stock} ta.` });
        }

        // Decrement stock
        await dbQuery.run('UPDATE inventory SET stock = stock - ? WHERE id = ?', [quantity, phone.id]);

        // Place order
        const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
        const dateStr = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });

        await dbQuery.run(
            'INSERT INTO orders (id, customerName, phoneModel, quantity, price, phoneNumber, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [orderId, customerName, phone.name, quantity, phone.price, phoneNumber, dateStr]
        );

        res.json({
            status: 'success',
            order_id: orderId,
            message: 'Buyurtma saqlandi!',
            order: { id: orderId, customerName, phoneModel: phone.name, quantity, price: phone.price, phoneNumber, date: dateStr }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders/clear', async (req, res) => {
    try {
        await dbQuery.run('DELETE FROM orders');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const { getAIResponse } = require('./ai');

app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Xabar kiritilmadi.' });
    try {
        const result = await getAIResponse(message, history);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start listening
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Export dbQuery for Telegram Bot module to use same database
module.exports = { dbQuery };

// Initialize Telegram Bot
require('./bot');
