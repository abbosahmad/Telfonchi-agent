const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initDb();
    }
});

const dbQuery = {
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    },
    all: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
};

async function initDb() {
    try {
        await dbQuery.run(`
            CREATE TABLE IF NOT EXISTS inventory (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price INTEGER NOT NULL,
                stock INTEGER NOT NULL
            )
        `);

        await dbQuery.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                customerName TEXT NOT NULL,
                phoneModel TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                price INTEGER NOT NULL,
                phoneNumber TEXT NOT NULL,
                date TEXT NOT NULL
            )
        `);

        const countRow = await dbQuery.get('SELECT COUNT(*) as count FROM inventory');
        if (countRow.count === 0) {
            const defaults = [
                ['1', 'iPhone 15 Pro Max', 1200, 5],
                ['2', 'Samsung Galaxy S24 Ultra', 1100, 3],
                ['3', 'Xiaomi 14 Ultra', 900, 8],
                ['4', 'Google Pixel 8 Pro', 800, 0],
                ['5', 'OnePlus 12', 700, 4]
            ];
            for (const item of defaults) {
                await dbQuery.run('INSERT INTO inventory (id, name, price, stock) VALUES (?, ?, ?, ?)', item);
            }
            console.log('Pre-populated default phone inventory.');
        }
    } catch (err) {
        console.error('Error initializing tables:', err.message);
    }
}

module.exports = { dbQuery };
