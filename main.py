import os
import asyncio
import logging
import json
from aiohttp import web

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

import database

BOT_TOKEN = "8811889833:AAFbvBerdSfU9KnreoW-N__u4kBwGBY6Ru0"
WEB_APP_URL = "https://dimadotnl.github.io/habit-tracker-bot/"

logging.basicConfig(level=logging.INFO)
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# ==========================================
# 1. ТЕЛЕГРАМ БОТ
# ==========================================
@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    user_name = message.from_user.first_name or "Друг"
    await database.add_user(user_id, user_name)

    args = message.text.split()
    if len(args) > 1 and args[1].startswith("pair_"):
        try:
            partner_id = int(args[1].replace("pair_", ""))
            if partner_id != user_id:
                await database.link_pair(user_id, partner_id)
                await message.answer("Вы успешно объединили трекер с партнером! Теперь цели в совместном пространстве общие.")
                try:
                    await bot.send_message(partner_id, f"{user_name} присоединился(ась) к вашему совместному трекеру!")
                except Exception:
                    pass
        except ValueError:
            pass

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 Открыть трекер привычек", web_app=WebAppInfo(url=WEB_APP_URL))],
        [InlineKeyboardButton(text="👥 Пригласить партнёра", callback_data="invite_partner")]
    ])
    await message.answer(
        f"Привет, {user_name}! 👋\n\n"
        "Это твой личный и совместный трекер привычек.\n"
        "Отслеживай прогресс, прокачивай дисциплину и достигай целей вместе!",
        reply_markup=kb
    )

@dp.callback_query(lambda c: c.data == "invite_partner")
async def process_invite(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    me = await bot.get_me()
    invite_link = f"https://t.me/{me.username}?start=pair_{user_id}"
    text = (
        "<b>🔗 Приглашение в совместный круг:</b>\n\n"
        "Отправь эту ссылку своей половинке или другу:\n"
        f"<code>{invite_link}</code>\n\n"
        "Когда партнер перейдет по ней и нажмет «Старт», ваши совместные цели объединятся в общую базу!"
    )
    await callback.message.answer(text, parse_mode="HTML")
    await callback.answer()

# ==========================================
# 2. REST API ДЛЯ МИНИ-АППА С НАДЕЖНЫМ CORS
# ==========================================

# Middleware для автоматической простановки CORS-заголовков ко всем ответам
@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        response = web.Response(status=200)
    else:
        try:
            response = await handler(request)
        except Exception as e:
            logging.error(f"Ошибка в API {request.path}: {e}")
            response = web.json_response({"error": str(e)}, status=500)

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, ngrok-skip-browser-warning"
    return response

async def handle_get_state(request):
    try:
        user_id = int(request.query.get('user_id', 12345))
    except ValueError:
        user_id = 12345

    partner_id = await database.get_partner_id(user_id)
    personal = await database.get_habits(user_id, is_couple=False)

    if partner_id:
        couple = await database.get_couple_habits(user_id, partner_id)
    else:
        couple = await database.get_habits(user_id, is_couple=True)

    all_habits = personal + couple
    habit_ids = [h['id'] for h in all_habits]
    history = await database.get_history(habit_ids)

    print(f"-> Загрузка данных для user_id={user_id} (найдено {len(all_habits)} привычек)")

    return web.json_response({
        "personalHabits": personal,
        "coupleHabits": couple,
        "historyData": history,
        "hasPair": partner_id is not None
    })

async def handle_add_habit(request):
    data = await request.json()
    user_id = int(data.get('user_id', 12345))
    name = str(data.get('name', 'Новая цель'))
    icon = str(data.get('icon', '✨'))
    target = int(data.get('target', 3))
    color = str(data.get('color', '#3b82f6'))
    is_couple = bool(data.get('is_couple', 0))

    new_id = await database.add_habit(user_id, name, icon, target, color, is_couple)
    print(f"-> ДОБАВЛЕНА ПРИВЫЧКА: '{name}' (id={new_id}) для user_id={user_id}")

    return web.json_response({"success": True, "id": new_id})

async def handle_toggle_day(request):
    data = await request.json()
    habit_id = int(data.get('habit_id'))
    iso_date = str(data.get('iso_date'))

    status = await database.toggle_history(habit_id, iso_date)
    print(f"-> ОТМЕТКА: habit_id={habit_id}, дата={iso_date}, активна={status}")
    return web.json_response({"success": True, "status": status})

async def handle_delete_habit(request):
    data = await request.json()
    habit_id = int(data.get('habit_id'))
    await database.delete_habit(habit_id)
    print(f"-> УДАЛЕНА ПРИВЫЧКА: habit_id={habit_id}")
    return web.json_response({"success": True})

async def start_web_server():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get('/api/state', handle_get_state)
    app.router.add_post('/api/habit/add', handle_add_habit)
    app.router.add_post('/api/toggle', handle_toggle_day)
    app.router.add_post('/api/habit/delete', handle_delete_habit)

    port = int(os.environ.get("PORT", 8080))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    print(f"API сервер успешно запущен на порту {port}!")

async def main():
    await database.init_db()
    await start_web_server()
    print("Запуск Telegram-бота...")
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
