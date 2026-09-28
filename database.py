import aiosqlite

DB_NAME = "tracker.db"

async def init_db():
    async with aiosqlite.connect(DB_NAME) as db:
        # Таблица пользователей
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT
            )
        """)
        # Таблица связок в пару (для совместного режима)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS pairs (
                user1_id INTEGER,
                user2_id INTEGER,
                PRIMARY KEY (user1_id, user2_id)
            )
        """)
        # Таблица привычек/целей
        await db.execute("""
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT,
                icon TEXT,
                target INTEGER,
                color TEXT,
                is_couple INTEGER DEFAULT 0
            )
        """)
        # Таблица отметок по датам (YYYY-MM-DD)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS history (
                habit_id INTEGER,
                iso_date TEXT,
                PRIMARY KEY (habit_id, iso_date)
            )
        """)
        await db.commit()

async def add_user(user_id: int, name: str):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("""
            INSERT INTO users (id, name) VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name
        """, (user_id, name))
        await db.commit()

async def link_pair(user1_id: int, user2_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        # Удаляем старые связки если были
        await db.execute("DELETE FROM pairs WHERE user1_id = ? OR user2_id = ?", (user1_id, user1_id))
        await db.execute("DELETE FROM pairs WHERE user1_id = ? OR user2_id = ?", (user2_id, user2_id))
        # Создаем двустороннюю связку
        await db.execute("INSERT INTO pairs (user1_id, user2_id) VALUES (?, ?)", (user1_id, user2_id))
        await db.execute("INSERT INTO pairs (user1_id, user2_id) VALUES (?, ?)", (user2_id, user1_id))
        await db.commit()

async def get_partner_id(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute("SELECT user2_id FROM pairs WHERE user1_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None

async def get_habits(user_id: int, is_couple: bool = False):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        couple_flag = 1 if is_couple else 0
        async with db.execute("""
            SELECT id, name, icon, target, color
            FROM habits
            WHERE user_id = ? AND is_couple = ?
        """, (user_id, couple_flag)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

async def get_couple_habits(user1_id: int, user2_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT id, name, icon, target, color
            FROM habits
            WHERE (user_id = ? OR user_id = ?) AND is_couple = 1
        """, (user1_id, user2_id)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

async def add_habit(user_id: int, name: str, icon: str, target: int, color: str, is_couple: bool):
    async with aiosqlite.connect(DB_NAME) as db:
        cursor = await db.execute("""
            INSERT INTO habits (user_id, name, icon, target, color, is_couple)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, name, icon, target, color, 1 if is_couple else 0))
        await db.commit()
        return cursor.lastrowid

async def delete_habit(habit_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
        await db.execute("DELETE FROM history WHERE habit_id = ?", (habit_id,))
        await db.commit()

async def toggle_history(habit_id: int, iso_date: str):
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute("""
            SELECT 1 FROM history WHERE habit_id = ? AND iso_date = ?
        """, (habit_id, iso_date)) as cursor:
            exists = await cursor.fetchone()

        if exists:
            await db.execute("DELETE FROM history WHERE habit_id = ? AND iso_date = ?", (habit_id, iso_date))
            await db.commit()
            return False
        else:
            await db.execute("INSERT INTO history (habit_id, iso_date) VALUES (?, ?)", (habit_id, iso_date))
            await db.commit()
            return True

async def get_history(habit_ids: list):
    if not habit_ids:
        return {}
    async with aiosqlite.connect(DB_NAME) as db:
        placeholders = ",".join("?" for _ in habit_ids)
        async with db.execute(f"""
            SELECT habit_id, iso_date FROM history WHERE habit_id IN ({placeholders})
        """, habit_ids) as cursor:
            rows = await cursor.fetchall()
            result = {}
            for hid, date in rows:
                result[f"{date}_{hid}"] = True
            return result