import os
import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL")

_pool = None

async def init_db():
    global _pool
    if not _pool:
        _pool = await asyncpg.create_pool(DATABASE_URL)
        
    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT PRIMARY KEY,
                name TEXT
            );
            CREATE TABLE IF NOT EXISTS pairs (
                user1_id BIGINT,
                user2_id BIGINT,
                PRIMARY KEY (user1_id, user2_id)
            );
            CREATE TABLE IF NOT EXISTS habits (
                id SERIAL PRIMARY KEY,
                user_id BIGINT,
                name TEXT,
                icon TEXT,
                target INT,
                color TEXT,
                is_couple INT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS history (
                habit_id INT,
                iso_date TEXT,
                PRIMARY KEY (habit_id, iso_date)
            );
        """)

async def add_user(user_id: int, name: str):
    async with _pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO users (id, name) VALUES ($1, $2)
            ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name
        """, user_id, name)

async def link_pair(user1_id: int, user2_id: int):
    async with _pool.acquire() as conn:
        await conn.execute("DELETE FROM pairs WHERE user1_id = $1 OR user2_id = $1", user1_id)
        await conn.execute("DELETE FROM pairs WHERE user1_id = $1 OR user2_id = $1", user2_id)
        await conn.execute("INSERT INTO pairs (user1_id, user2_id) VALUES ($1, $2), ($2, $1)", user1_id, user2_id)

async def get_partner_id(user_id: int):
    async with _pool.acquire() as conn:
        row = await conn.fetchrow("SELECT user2_id FROM pairs WHERE user1_id = $1", user_id)
        return row['user2_id'] if row else None

async def get_habits(user_id: int, is_couple: bool = False):
    couple_flag = 1 if is_couple else 0
    async with _pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, icon, target, color
            FROM habits
            WHERE user_id = $1 AND is_couple = $2
        """, user_id, couple_flag)
        return [dict(r) for r in rows]

async def get_couple_habits(user1_id: int, user2_id: int):
    async with _pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, icon, target, color
            FROM habits
            WHERE (user_id = $1 OR user_id = $2) AND is_couple = 1
        """, user1_id, user2_id)
        return [dict(r) for r in rows]

async def add_habit(user_id: int, name: str, icon: str, target: int, color: str, is_couple: bool):
    couple_flag = 1 if is_couple else 0
    async with _pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO habits (user_id, name, icon, target, color, is_couple)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        """, user_id, name, icon, target, color, couple_flag)
        return row['id']

async def delete_habit(habit_id: int):
    async with _pool.acquire() as conn:
        await conn.execute("DELETE FROM habits WHERE id = $1", habit_id)
        await conn.execute("DELETE FROM history WHERE habit_id = $1", habit_id)

async def toggle_history(habit_id: int, iso_date: str):
    async with _pool.acquire() as conn:
        exists = await conn.fetchrow("SELECT 1 FROM history WHERE habit_id = $1 AND iso_date = $2", habit_id, iso_date)
        if exists:
            await conn.execute("DELETE FROM history WHERE habit_id = $1 AND iso_date = $2", habit_id, iso_date)
            return False
        else:
            await conn.execute("INSERT INTO history (habit_id, iso_date) VALUES ($1, $2)", habit_id, iso_date)
            return True

async def get_history(habit_ids: list):
    if not habit_ids:
        return {}
    async with _pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT habit_id, iso_date FROM history WHERE habit_id = ANY($1::int[])
        """, habit_ids)
        result = {}
        for r in rows:
            result[f"{r['iso_date']}_{r['habit_id']}"] = True
        return result
