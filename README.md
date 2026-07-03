# 🤖 Telfonchi Agent — AI Phone Store Assistant

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-store.abboscoder.uz-blue?style=for-the-badge)](https://store.abboscoder.uz)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-2CA5E0?style=for-the-badge&logo=telegram)](https://t.me/telfonchi_bot)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![DeepSeek AI](https://img.shields.io/badge/AI-DeepSeek_V4_Pro-purple?style=for-the-badge)](https://deepseek.com)

> **Telfonchi Agent** — bu sun'iy intellekt yordamida telefon do'konini boshqaruvchi chatbot. Mijozlar Telegram va veb-sayt orqali agent bilan muloqot qilib, mavjud telefonlarni ko'rishi va buyurtma berishi mumkin.

---

## ✨ Asosiy Imkoniyatlar

| Funksiya | Tavsif |
|----------|--------|
| 🧠 **AI Agent (Malika)** | DeepSeek V4 Pro modeli asosida ishlaydi, o'zbek tilida suhbat yuritadi |
| 📦 **Inventar boshqaruvi** | Real vaqtda ombordagi mahsulotlar ro'yxatini ko'rish |
| 🛒 **Buyurtma qabul qilish** | Mijoz ismi, tel. raqami, model va soni — to'liq buyurtma jarayoni |
| 💬 **Telegram Bot** | Telegram orqali to'liq AI-agent suhbati |
| 🌐 **Web Panel** | Admin panel orqali buyurtmalar va inventarni boshqarish |
| 🔒 **Xavfsizlik** | API kalitlar `.env` faylida, bazada SQL injection himoyasi |

---

## 🏗️ Texnologiyalar

```
Backend:   Node.js + Express.js
Database:  SQLite (better-sqlite3)
AI:        DeepSeek V4 Pro API (Function Calling)
Bot:       node-telegram-bot-api
Frontend:  Vanilla HTML/CSS/JS
Server:    Nginx (Reverse Proxy) + PM2 (Process Manager)
SSL:       Let's Encrypt (Certbot)
```

---

## 🚀 O'rnatish va Ishga Tushirish

### 1. Repozitoriyani yuklab olish
```bash
git clone https://github.com/abbosahmad/Telfonchi-agent.git
cd Telfonchi-agent
```

### 2. Kutubxonalarni o'rnatish
```bash
npm install
```

### 3. Muhit o'zgaruvchilarini sozlash
`.env.example` faylini nusxalang va to'ldiring:
```bash
cp .env.example .env
```

`.env` fayli ichiga quyidagilarni yozing:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
PORT=3005
```

### 4. Serverni ishga tushirish
```bash
# Development rejimida
node server.js

# Production (PM2 bilan)
pm2 start server.js --name store
pm2 save
```

---

## 📁 Loyiha Tuzilmasi

```
Telfonchi-agent/
├── server.js          # Express server — asosiy kirish nuqtasi
├── ai.js              # DeepSeek AI engine (Function Calling)
├── bot.js             # Telegram bot mantiqiy qismi
├── db.js              # SQLite baza ulanishi va jadval yaratish
├── package.json       # NPM paketlar ro'yxati
├── .gitignore         # Maxfiy fayllar ro'yxati
├── .env.example       # Muhit o'zgaruvchilar namunasi
└── public/
    ├── index.html     # Admin web panel
    ├── app.js         # Frontend JavaScript
    └── style.css      # Dizayn stillari
```

---

## 🔒 Xavfsizlik

- ✅ Barcha API kalitlar va tokenlar `.env` faylida saqlanadi
- ✅ `.env` fayli `.gitignore` orqali GitHub'ga chiqib ketmaydi
- ✅ SQLite so'rovlari parametrlashtirilgan (SQL Injection himoyasi)
- ✅ HTTPS (SSL sertifikati) yoqilgan
- ✅ Telegram bot tokeni environment variable orqali yuklanadi
- ✅ DeepSeek API kaliti environment variable orqali yuklanadi

> ⚠️ **DIQQAT**: Hech qachon `.env` faylini GitHub'ga yoki ommaviy joylarga yuklamang!

---

## 🌐 API Endpointlar

| Method | Endpoint | Tavsif |
|--------|----------|--------|
| `GET` | `/api/inventory` | Barcha mahsulotlar ro'yxati |
| `POST` | `/api/inventory` | Yangi mahsulot qo'shish |
| `PUT` | `/api/inventory/:id` | Mahsulotni yangilash |
| `DELETE` | `/api/inventory/:id` | Mahsulotni o'chirish |
| `GET` | `/api/orders` | Barcha buyurtmalar ro'yxati |
| `POST` | `/api/chat` | AI bilan suhbat (veb panel) |

---

## 💬 AI Agent Qanday Ishlaydi?

```
Mijoz xabar yozadi
        ↓
DeepSeek V4 Pro qabul qiladi
        ↓
AI "get_inventory" funksiyasini chaqiradi (ombor tekshiruvi)
        ↓
SQLite bazasidan real ma'lumot olinadi
        ↓
AI javob tayyorlaydi (faqat bor mahsulotlarni taklif qiladi)
        ↓
Buyurtma uchun: ism → tel. raqam → model → tasdiqlash
        ↓
"place_order" funksiyasi chaqiriladi → bazaga yoziladi
        ↓
Buyurtma ID (ORD-XXXX) mijozga yuboriladi
```

---

## 👨‍💻 Muallif

**Abbos Ahmad** — [@abbosahmad](https://github.com/abbosahmad)

🌐 [abboscoder.uz](https://abboscoder.uz) | 💼 [Telegram](https://t.me/abboscoder)

---

## 📄 Litsenziya

MIT License — erkin foydalanishingiz mumkin.
