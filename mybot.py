import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command
from datetime import datetime, timedelta

# ----------- إعدادات أساسية -----------
BOT_TOKEN = "8553666624:AAHi_cUUw5BEahRvhJ45ksSln8LZGnrxuI8"  # ضع توكن البوت هنا
OWNER_ID = 8438668450         # معرفك كمالك البوت
ADMINS = [Knwoej]           # قائمة المدراء (يمكن إضافة يوزرات لاحقاً)

bot = Bot(BOT_TOKEN, parse_mode="HTML")
dp = Dispatcher()

# ----------- تخزين مؤقت للرسائل والجداول -----------
scheduled_jobs = {}
pending_message = {}
groups_list = ["-1001234567890", "-1009876543210"]  # معرفات القروبات الحقيقية

# ----------- لوحة التحكم ذهبي فاخر -----------
def panel_keyboard():
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🟡 📝 إرسال رسالة جديدة", callback_data="new_msg")],
        [InlineKeyboardButton(text="🟡 ⏱ جدولة الرسائل", callback_data="set_time")],
        [InlineKeyboardButton(text="🟡 🔁 النشر المتكرر", callback_data="repeat")],
        [InlineKeyboardButton(text="🟡 🧩 اختيار المجموعات", callback_data="choose_groups")],
        [InlineKeyboardButton(text="🟡 📂 الرسائل المجدولة", callback_data="scheduled")],
        [InlineKeyboardButton(text="🟡 ⚙️ الإعدادات", callback_data="settings")],
        [InlineKeyboardButton(text="🟡 ➕ إضافة مدير جديد", callback_data="add_admin")],
        [InlineKeyboardButton(text="🟡 🛑 إيقاف جميع العمليات", callback_data="stop_all")]
    ])
    return kb

# ----------- /start -----------
@dp.message(Command("start"))
async def start_cmd(msg: types.Message):
    if msg.from_user.id in ADMINS:
        await msg.answer("🔧 <b>لوحة التحكم — المطور: @kc_t5</b>", reply_markup=panel_keyboard())
    else:
        await msg.answer("❌ هذا البوت مخصص للمدراء فقط.")

# ----------- إرسال رسالة جديدة -----------
@dp.callback_query(lambda c: c.data=="new_msg")
async def ask_for_message(cb: types.CallbackQuery):
    await cb.message.answer("✏️ أرسل الرسالة التي تريد نشرها:")
    pending_message[cb.from_user.id] = "awaiting_msg"
    await cb.answer()

# ----------- حفظ الرسالة المرسلة -----------
@dp.message(lambda m: m.from_user.id in pending_message and pending_message[m.from_user.id]=="awaiting_msg")
async def save_pending_message(msg: types.Message):
    uid = msg.from_user.id
    pending_message["content"] = msg.text
    pending_message[uid] = None

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📤 إرسال الآن", callback_data="send_now")],
        [InlineKeyboardButton(text="⏱ جدولة لاحقاً", callback_data="set_time")],
        [InlineKeyboardButton(text="🔁 جعلها متكررة", callback_data="repeat")]
    ])
    await msg.answer("✅ تم حفظ الرسالة.\nاختر طريقة النشر:", reply_markup=kb)

# ----------- إرسال فوري -----------
@dp.callback_query(lambda c: c.data=="send_now")
async def send_now(cb: types.CallbackQuery):
    text = pending_message.get("content")
    if not text:
        await cb.answer("❌ لا يوجد رسالة!", show_alert=True)
        return

    for group_id in groups_list:
        await bot.send_message(chat_id=group_id, text=text)

    await cb.message.answer("✅ تم إرسال الرسالة لجميع القروبات المحددة.")
    await cb.answer()

# ----------- إضافة مدير جديد عبر اليوزر -----------
@dp.callback_query(lambda c: c.data=="add_admin")
async def add_admin(cb: types.CallbackQuery):
    await cb.message.answer("📤 أرسل معرف اليوزر الخاص بالمدير الجديد بدون @:")
    pending_message[cb.from_user.id] = "awaiting_new_admin"
    await cb.answer()

@dp.message(lambda m: m.from_user.id in pending_message and pending_message[m.from_user.id]=="awaiting_new_admin")
async def save_new_admin(msg: types.Message):
    try:
        new_admin_id = int(msg.text)
        if new_admin_id not in ADMINS:
            ADMINS.append(new_admin_id)
            await msg.answer(f"✅ تم إضافة المدير الجديد بنجاح: {new_admin_id}")
        else:
            await msg.answer("⚠️ هذا المدير موجود مسبقاً.")
    except:
        await msg.answer("❌ خطأ، أرسل رقم معرف صالح.")
    pending_message[msg.from_user.id] = None

# ----------- إيقاف كل العمليات -----------
@dp.callback_query(lambda c: c.data=="stop_all")
async def stop_all(cb: types.CallbackQuery):
    scheduled_jobs.clear()
    await cb.message.answer("🛑 تم إيقاف كل عمليات النشر.")
    await cb.answer()

# ----------- تشغيل البوت -----------
async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
