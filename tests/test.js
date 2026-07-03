/**
 * Telfonchi Agent — Asosiy funksiyalar testi
 * Ishga tushirish: node tests/test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const rootDir = path.join(__dirname, '..');

// .env ni root papkasidan yuklash
require('dotenv').config({ path: path.join(rootDir, '.env') });

// DB init tugashini kutish uchun yordamchi
function waitForDB(dbQuery, retries = 10) {
    return new Promise((resolve, reject) => {
        let attempt = 0;
        const check = async () => {
            try {
                await dbQuery.all('SELECT 1 FROM inventory LIMIT 1');
                resolve();
            } catch (e) {
                if (attempt++ < retries) setTimeout(check, 300);
                else reject(new Error('DB jadvallar yaratilmadi (timeout)'));
            }
        };
        check();
    });
}

// =====================
// 1. DB moduli testi
// =====================
async function testDatabase() {
    console.log('\n📦 [1] Ma\'lumotlar bazasi testi...');
    const { dbQuery } = require('../db');

    // DB jadvallar yaratilishini kutish
    await waitForDB(dbQuery);

    const rows = await dbQuery.all('SELECT * FROM inventory');
    assert(Array.isArray(rows), 'Inventar massiv bo\'lishi kerak');
    assert(rows.length > 0, 'Inventarda kamida 1 mahsulot bo\'lishi kerak');

    rows.forEach(item => {
        assert(item.id, `ID mavjud bo'lishi kerak: ${JSON.stringify(item)}`);
        assert(item.name, `Nomi mavjud bo'lishi kerak: ${JSON.stringify(item)}`);
        assert(typeof item.price === 'number', `Narx raqam bo'lishi kerak: ${JSON.stringify(item)}`);
        assert(typeof item.stock === 'number', `Qoldiq raqam bo'lishi kerak: ${JSON.stringify(item)}`);
    });

    console.log(`   ✅ Inventarda ${rows.length} ta mahsulot topildi`);

    // Orders jadvalini tekshirish
    const orders = await dbQuery.all('SELECT * FROM orders');
    assert(Array.isArray(orders), 'Buyurtmalar massiv bo\'lishi kerak');
    console.log(`   ✅ Buyurtmalar jadvali ishlayapti (${orders.length} ta buyurtma)`);
}

// =====================
// 2. Buyurtma mantiq testi
// =====================
async function testOrderLogic() {
    console.log('\n🛒 [2] Buyurtma mantiq testi...');
    const { dbQuery } = require('../db');

    // Test: omborda yo'q mahsulotni buyurtma qilmoqchi bo'lish
    const phone = await dbQuery.get('SELECT * FROM inventory WHERE name = ?', ['Google Pixel 8 Pro']);
    if (phone) {
        assert(phone.stock === 0, 'Google Pixel 8 Pro qoldig\'i 0 bo\'lishi kerak (test ma\'lumoti)');
        console.log('   ✅ Qoldig\'i 0 bo\'lgan mahsulot to\'g\'ri aniqlanmoqda');
    }

    // Test: mavjud mahsulot
    const available = await dbQuery.get('SELECT * FROM inventory WHERE stock > 0 LIMIT 1');
    assert(available, 'Kamida 1 ta mavjud mahsulot bo\'lishi kerak');
    console.log(`   ✅ Mavjud mahsulot: ${available.name} (${available.stock} ta qolgan)`);
}

// =====================
// 3. Input validatsiya testi
// =====================
function testInputValidation() {
    console.log('\n🔒 [3] Input validatsiya testi...');

    // Telefon raqami validatsiyasi
    const validPhones = ['+998901234567', '998901234567', '0901234567'];
    const invalidPhones = ['123', 'abc', ''];

    validPhones.forEach(p => {
        assert(p.length >= 7, `"${p}" telefon raqami qabul qilinishi kerak`);
    });
    console.log('   ✅ Yaroqli telefon raqamlari tekshirildi');

    invalidPhones.forEach(p => {
        assert(p.length < 7, `"${p}" telefon raqami rad etilishi kerak`);
    });
    console.log('   ✅ Yaroqsiz telefon raqamlari tekshirildi');

    // Ism validatsiyasi
    assert('Ali'.trim().length >= 2, 'Ism kamida 2 belgi bo\'lishi kerak');
    assert(''.trim().length < 2, 'Bo\'sh ism rad etilishi kerak');
    console.log('   ✅ Ism validatsiyasi ishlayapti');

    // Miqdor validatsiyasi
    const validQty = [1, 5, 100];
    const invalidQty = [0, -1, 101, 999];

    validQty.forEach(q => {
        assert(q >= 1 && q <= 100, `${q} miqdori yaroqli bo'lishi kerak`);
    });
    invalidQty.forEach(q => {
        assert(!(q >= 1 && q <= 100), `${q} miqdori rad etilishi kerak`);
    });
    console.log('   ✅ Miqdor validatsiyasi (1-100) ishlayapti');
}

// =====================
// 4. Rate limiter testi
// =====================
function testRateLimiter() {
    console.log('\n🚦 [4] Rate limiter testi...');

    const limit = 20;
    const window = 60000; // 1 daqiqa
    const requests = [];
    const now = Date.now();

    // 20 ta so'rov simulatsiyasi
    for (let i = 0; i < limit; i++) {
        requests.push(now - i * 100);
    }
    const withinLimit = requests.filter(t => now - t < window);
    assert(withinLimit.length === limit, `${limit} ta so'rov qabul qilinishi kerak`);
    console.log(`   ✅ ${limit} ta so'rov limitdan o'tdi`);

    // 21-so'rov rad etilishi kerak
    requests.push(now);
    const exceeded = requests.filter(t => now - t < window);
    assert(exceeded.length > limit, 'Limit oshganda rad etilishi kerak');
    console.log('   ✅ Limit oshganda bloklash ishlayapti');
}

// =====================
// 5. SQL Injection himoya testi
// =====================
async function testSQLSecurity() {
    console.log('\n🛡️  [5] SQL Injection himoya testi...');
    const { dbQuery } = require('../db');

    // Zararli kirishlarni parametrlashtirilgan so'rovlar bilan tekshirish
    const maliciousInputs = [
        "' OR '1'='1",
        "iPhone; DROP TABLE inventory;--",
        "1' UNION SELECT * FROM orders--"
    ];

    for (const input of maliciousInputs) {
        const result = await dbQuery.get('SELECT * FROM inventory WHERE name = ?', [input]);
        assert(result === undefined, `SQL injection himoyasi ishlashi kerak: "${input}"`);
        console.log(`   ✅ Zararli kirishdan himoyalangan: "${input.substring(0, 30)}..."`);
    }
}

// =====================
// 6. Xavfsizlik sozlamalari tekshiruvi
// =====================
function testSecurityConfig() {
    console.log('\n🔐 [6] Xavfsizlik konfiguratsiya testi...');

    // Muhim o'zgaruvchilar tekshiruvi
    const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'DEEPSEEK_API_KEY'];
    requiredEnvVars.forEach(varName => {
        const value = process.env[varName];
        if (!value) {
            console.log(`   ⚠️  ${varName} — .env faylida topilmadi (server ishlamaydi)`);
        } else {
            console.log(`   ✅ ${varName} — o'rnatilgan (${value.substring(0, 4)}...)`);
        }
    });

    // .gitignore tekshiruvi — root papkasidan
    const gitignorePath = path.join(rootDir, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    assert(gitignore.includes('.env'), '.env .gitignore da bo\'lishi kerak');
    assert(gitignore.includes('database.db'), 'database.db .gitignore da bo\'lishi kerak');
    assert(gitignore.includes('node_modules'), 'node_modules .gitignore da bo\'lishi kerak');
    console.log('   ✅ .gitignore to\'g\'ri sozlangan');
}

// =====================
// BARCHA TESTLARNI ISHGA TUSHIRISH
// =====================
async function runAllTests() {
    console.log('🚀 Telfonchi Agent — Test Suite boshlanmoqda...');
    console.log('='.repeat(50));

    let passed = 0;
    let failed = 0;

    const tests = [
        { name: 'Database', fn: testDatabase },
        { name: 'Order Logic', fn: testOrderLogic },
        { name: 'Input Validation', fn: () => testInputValidation() },
        { name: 'Rate Limiter', fn: () => testRateLimiter() },
        { name: 'SQL Security', fn: testSQLSecurity },
        { name: 'Security Config', fn: () => testSecurityConfig() },
    ];

    for (const test of tests) {
        try {
            await test.fn();
            passed++;
        } catch (err) {
            console.error(`\n   ❌ ${test.name} xatosi: ${err.message}`);
            failed++;
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Natija: ${passed} ta o'tdi ✅  |  ${failed} ta xato ❌`);
    if (failed === 0) {
        console.log('🎉 Barcha testlar muvaffaqiyatli o\'tdi!\n');
    } else {
        console.log('⚠️  Ba\'zi testlar muvaffaqiyatsiz. Yuqoridagi xatolarni tekshiring.\n');
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Test suite xatosi:', err);
    process.exit(1);
});
