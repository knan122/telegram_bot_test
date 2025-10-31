// bot.js
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ===== CONFIG =====
const BOT_TOKEN = "8178121189:AAE0b5K2iJiKn0nTRxrsUHoWguv3yIVgRZ8";
const OWNER_ID = 7811264611;
const REQUIRED_CHANNELS = ["@arkamm7", "@numbersms5"];
const ACTIVATION_CHANNEL = "@numbersms5";
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(__dirname, 'bot.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== Database =====
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS countries (
    code TEXT PRIMARY KEY, price REAL DEFAULT 0, file TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, username TEXT, country TEXT, code TEXT, status TEXT, created_at TEXT
  )`);
});

// ===== Helpers =====
function listCountries(callback) {
  db.all("SELECT code, price, file FROM countries", callback);
}

function addCountry(code, price, filename) {
  db.run("INSERT OR REPLACE INTO countries(code,price,file) VALUES (?,?,?)", [code, price, filename]);
}

function popCode(country, callback) {
  const filePath = path.join(DATA_DIR, country.toLowerCase() + '.txt');
  if (!fs.existsSync(filePath)) return callback(null);
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length === 0) return callback(null);
  const code = lines.shift();
  fs.writeFileSync(filePath, lines.join('\n'));
  callback(code);
}

function saveOrder(userId, username, country, code) {
  db.run("INSERT INTO orders(user_id,username,country,code,status,created_at) VALUES (?,?,?,?,?,datetime('now'))",
    [userId, username, country, code, "delivered"]);
}

function stats(callback) {
  db.all("SELECT country, count(*) AS cnt FROM orders GROUP BY country", callback);
}

// ===== Subscription Check =====
async function isSubscribed(userId) {
  try {
    for (const ch of REQUIRED_CHANNELS) {
      const member = await bot.getChatMember(ch, userId);
      if (["left","kicked"].includes(member.status)) return false;
    }
    return true;
  } catch (e) {
    console.log("Error checking subscription:", e);
    return false;
  }
}

// ===== Commands =====

// /start
bot.onText(/\/start/, (msg) => {
  listCountries((err, rows) => {
    if (err) return;
    const opts = { reply_markup: { inline_keyboard: [] } };
    rows.forEach(r => {
      opts.reply_markup.inline_keyboard.push([{ text: `${r.code.toUpperCase()} — ${r.price} USD`, callback_data: `country:${r.code}` }]);
    });
    opts.reply_markup.inline_keyboard.push([{ text: '🔄 تحديث', callback_data: 'refresh' }]);
    bot.sendMessage(msg.chat.id, 'أهلاً! اختر الدولة للحصول على الرمز:', opts);
  });
});

// /listcountries
bot.onText(/\/listcountries/, (msg) => {
  listCountries((err, rows) => {
    if (err || rows.length === 0) return bot.sendMessage(msg.chat.id, 'لا توجد دول مضافة بعد.');
    let txt = "قائمة الدول:\n" + rows.map(r => `- ${r.code.toUpperCase()}: ${r.price} USD`).join('\n');
    bot.sendMessage(msg.chat.id, txt);
  });
});

// /addcountry (owner only)
bot.onText(/\/addcountry (.+)/, (msg, match) => {
  if (msg.from.id !== OWNER_ID) return;
  try {
    const args = match[1].split(' ');
    const code = args[0].toLowerCase();
    const price = parseFloat(args[1]);
    const filename = `${code}.txt`;
    addCountry(code, price, filename);
    bot.sendMessage(msg.chat.id, `تمت إضافة/تحديث الدولة \`${code}\` بسعر ${price} USD. ضع ملف ${filename} داخل مجلد data/`, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'الاستخدام: /addcountry CODE PRICE');
  }
});

// /stats (owner only)
bot.onText(/\/stats/, (msg) => {
  if (msg.from.id !== OWNER_ID) return;
  stats((err, rows) => {
    if (err || rows.length === 0) return bot.sendMessage(msg.chat.id, 'لا توجد طلبيات بعد.');
    let txt = "إحصائيات الطلبات حسب الدولة:\n" + rows.map(r => `- ${r.country.toUpperCase()}: ${r.cnt} طلب`).join('\n');
    bot.sendMessage(msg.chat.id, txt);
  });
});

// /help
bot.onText(/\/help/, (msg) => {
  const txt = `
/start - ابدأ واختَر دولة
/listcountries - قائمة الدول المتاحة
/addcountry CODE PRICE - إضافة/تحديث دولة (للمالك)
/stats - إحصائيات (للمالك)
/uploadfile - رفع ملف الأرقام (للمالك)
`;
  bot.sendMessage(msg.chat.id, txt);
});

// ===== Upload files =====
bot.on('document', async (msg) => {
  if (msg.from.id !== OWNER_ID) return;
  const doc = msg.document;
  if (!doc) return;
  const filePath = path.join(DATA_DIR, doc.file_name);

  try {
    const fileLink = await bot.getFileLink(doc.file_id);
    const response = await axios({ method: 'get', url: fileLink, responseType: 'stream' });
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', () => {
      const code = doc.file_name.split('.')[0].toLowerCase();
      addCountry(code, 0.0, doc.file_name);
      bot.sendMessage(msg.chat.id, `حفظت الملف ${doc.file_name} وربطت بالدولة \`${code}\`.`, { parse_mode: 'Markdown' });
    });
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'حدث خطأ أثناء رفع الملف.');
    console.log(e);
  }
});

// ===== Callback Queries =====
bot.on('callback_query', async (q) => {
  const data = q.data;
  if (data === 'refresh') return bot.emit('text', { chat: q.message.chat, text: '/start' });
  if (data.startsWith('country:')) {
    const country = data.split(':')[1];
    const userId = q.from.id;

    if (!await isSubscribed(userId)) {
      return bot.sendMessage(q.message.chat.id, `يجب أن تكون مشتركاً في القنوات التالية أولاً:\n${REQUIRED_CHANNELS.join('\n')}`);
    }

    popCode(country, (code) => {
      if (!code) return bot.sendMessage(q.message.chat.id, 'عذراً، لا توجد أكواد متاحة حالياً لهذه الدولة.');
      saveOrder(userId, '', country, code); // بدون بيانات المستخدم
      bot.sendMessage(q.message.chat.id, `هذا رمزك (${country.toUpperCase()}):\n${code}`);
      bot.sendMessage(ACTIVATION_CHANNEL, `تم تسليم رمز لدولة ${country.toUpperCase()}:\n${code}\nالحالة: مُسلَّم`);
    });
  }
});

console.log('Bot started...');