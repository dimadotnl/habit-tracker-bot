import os
import asyncio
import logging
from aiohttp import web
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

import database

logging.basicConfig(level=logging.INFO)

# Укажи здесь свой актуальный токен бота и юзернейм
BOT_TOKEN = "8811889833:AAFbvBerdSfU9KnreoW-N__u4kBwGBY6Ru0"  # Твой новый токен
BOT_USERNAME = "self_control_to_succesful_bot"
WEBAPP_URL = "https://dimadotnl.github.io/habit-tracker-bot/"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# --- КОРС МИДДЛВЕЙР ДЛЯ BROWSER/TELEGRAM WEBAPP ---
@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        response = web.Response(status=200)
    else:
        try:
            response = await handler(request)
        except Exception as e:
            logging.error(f"Ошибка в API: {e}")
            response = web.json_response({"error": str(e)}, status=500)
            
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

# --- ХЭНДЛЕРЫ TELEGRAM БОТА ---
@dp.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject):
    user_id = message.from_user.id
    name = message.from_user.first_name or "Пользователь"
    
    await database.add_user(user_id, name)
    
    # Обработка реферального приглашения пары: /start pair_USERID
    args = command.args
    if args and args.startswith("pair_"):
        try:
            partner_id = int(args.replace("pair_", ""))
            if partner_id != user_id:
                await database.link_pair(user_id, partner_id)
                await message.answer(f"🎉 Вы успешно создали пару с пользователем!")
                try:
                    await bot.send_message(partner_id, f"🎉 {name} принял(а) ваше приглашение! Теперь вы отслеживаете привычки вместе.")
                except Exception:
                    pass
        except Exception as e:
            logging.error(f"Ошибка при связывании пары: {e}")

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎯 Открыть Трекер Привычек", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    
    invite_link = f"https://t.me/{BOT_USERNAME}?start=pair_{user_id}"
    await message.answer(
        f"Привет, {name}! 👋\n\n"
        f"Здесь вы можете вести свои привычки и достигать целей вдвоём.\n\n"
        f"🔗 Ваша ссылка для приглашения партнёра:\n`{invite_link}`",
        reply_markup=kb,
        parse_mode="Markdown"
    )

# --- API ЭНДПОИНТЫ ДЛЯ WEBAPP ---
routes = web.RouteTableDef()

@routes.get("/api/state")
async def get_state(request):
    user_id_param = request.query.get("user_id")
    if not user_id_param:
        return web.json_response({"error": "user_id required"}, status=400)
    
    try:
        user_id = int(user_id_param)
    except ValueError:
        return web.json_response({"error": "invalid user_id"}, status=400)

    habits = await database.get_habits(user_id, is_couple=False)
    partner_id = await database.get_partner_id(user_id)
    partner_name = await database.get_partner_name(user_id) if partner_id else None
    
    couple_habits = []
    if partner_id:
        couple_habits = await database.get_couple_habits(user_id, partner_id)
        
    all_habit_ids = [h['id'] for h in (habits + couple_habits)]
    history = await database.get_history(all_habit_ids)
    
    return web.json_response({
        "success": True,
        "habits": habits,
        "couple_habits": couple_habits,
        "history": history,
        "partner_name": partner_name,
        "partner_id": partner_id
    })

@routes.post("/api/habit/add")
async def add_habit_endpoint(request):
    data = await request.json()
    user_id = int(data.get("user_id"))
    name = data.get("name")
    icon = data.get("icon", "⭐")
    target = int(data.get("target", 7))
    color = data.get("color", "#ff4b4b")
    is_couple = bool(data.get("is_couple", False))
    
    habit_id = await database.add_habit(user_id, name, icon, target, color, is_couple)
    return web.json_response({"success": True, "habit_id": habit_id})

@routes.post("/api/habit/delete")
async def delete_habit_endpoint(request):
    data = await request.json()
    habit_id = int(data.get("habit_id"))
    await database.delete_habit(habit_id)
    return web.json_response({"success": True})

@routes.post("/api/toggle")
async def toggle_endpoint(request):
    data = await request.json()
    habit_id = int(data.get("habit_id"))
    iso_date = str(data.get("iso_date"))
    
    status = await database.toggle_history(habit_id, iso_date)
    return web.json_response({"success": True, "active": status})

async def on_startup(app):
    await database.init_db()
    asyncio.create_task(dp.start_polling(bot))

def make_app():
    app = web.Application(middlewares=[cors_middleware])
    app.add_routes(routes)
    app.on_startup.append(on_startup)
    return app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app = make_app()
    web.run_app(app, host="0.0.0.0", port=port)
