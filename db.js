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
        if (countRow.count <= 5) {
            await dbQuery.run('DELETE FROM inventory');
            const defaults = [
                ['1', 'iPhone 15 Pro Max', 1200, 5],
                ['2', 'iPhone 15 Pro', 1000, 8],
                ['3', 'Samsung Galaxy S24 Ultra', 1100, 4],
                ['4', 'Samsung Galaxy A55', 400, 12],
                ['5', 'Xiaomi 14 Ultra', 950, 6],
                ['6', 'Redmi Note 13 Pro+', 350, 15],
                ['7', 'Poco F6 Pro', 480, 10],
                ['8', 'Google Pixel 8 Pro', 850, 3],
                ['9', 'Google Pixel 8a', 500, 7],
                ['10', 'OnePlus 12', 750, 5],
                ['11', 'Realme GT 6', 550, 4],
                ['12', 'Nothing Phone (2)', 600, 6]
            ];
            for (const item of defaults) {
                await dbQuery.run('INSERT INTO inventory (id, name, price, stock) VALUES (?, ?, ?, ?)', item);
            }
            console.log('Pre-populated rich default phone inventory.');
        }
    } catch (err) {
        console.error('Error initializing tables:', err.message);
    }
}

module.exports = { dbQuery };
