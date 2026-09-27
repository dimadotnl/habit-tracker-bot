const API_BASE_URL = "https://subtotal-lip-carmaker.ngrok-free.dev";

// Получение Telegram WebApp данных
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
}

const CURRENT_USER_ID = tg?.initDataUnsafe?.user?.id || 12345;
const CURRENT_USER_NAME = tg?.initDataUnsafe?.user?.first_name || "Пользователь";

// Локальное состояние приложения
let personalHabits = [];
let coupleHabits = [];
let historyData = {}; // формат: { "YYYY-MM-DD_habitId": true }
let currentTab = "personal"; // "personal" или "couple"
let currentWeekOffset = 0; // 0 — текущая неделя, -1 — прошлая, +1 — следующая

// Элементы интерфейса
const habitsListEl = document.getElementById("habitsList");
const emptyStateEl = document.getElementById("emptyState");
const modalEl = document.getElementById("habitModal");
const habitNameInput = document.getElementById("habitName");
const habitIconInput = document.getElementById("habitIcon");
const habitTargetInput = document.getElementById("habitTarget");
const habitColorInput = document.getElementById("habitColor");
const currentWeekLabelEl = document.getElementById("currentWeekLabel");

// Стандартные заголовки для ngrok и JSON
const API_HEADERS = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true"
};

// ==========================================
// 1. СЕТЕВЫЕ ЗАПРОСЫ К БЭКЕНДУ
// ==========================================

async function loadServerState() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/state?user_id=${CURRENT_USER_ID}`, {
      headers: {
        "ngrok-skip-browser-warning": "true"
      }
    });

    if (!res.ok) {
      throw new Error(`Статус сервера: ${res.status}`);
    }

    const data = await res.json();
    personalHabits = data.personalHabits || [];
    coupleHabits = data.coupleHabits || [];
    historyData = data.historyData || {};

    renderApp();
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
    // Фронтенд продолжит работу локально в случае временной недоступности
    renderApp();
  }
}

async function apiAddHabit(habitData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/habit/add`, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify(habitData)
    });
    if (res.ok) {
      const data = await res.json();
      return data.id;
    }
  } catch (err) {
    console.error("Ошибка при создании привычки:", err);
  }
  return null;
}

async function apiToggleDay(habitId, isoDate) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/toggle`, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({ habit_id: habitId, iso_date: isoDate })
    });
    if (res.ok) {
      const data = await res.json();
      return data.status;
    }
  } catch (err) {
    console.error("Ошибка переключения дня:", err);
  }
  return null;
}

async function apiDeleteHabit(habitId) {
  try {
    await fetch(`${API_BASE_URL}/api/habit/delete`, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({ habit_id: habitId })
    });
  } catch (err) {
    console.error("Ошибка удаления:", err);
  }
}

// ==========================================
// 2. РАБОТА С ДАТАМИ И НЕДЕЛЯМИ
// ==========================================

function getWeekDates(offset = 0) {
  const now = new Date();
  const currentDay = now.getDay();
  // Понедельник как первый день (0 - Пн, 6 - Вс)
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);

  const week = [];
  const daysShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    week.push({
      name: daysShort[i],
      dateNumber: d.getDate(),
      iso: iso,
      isToday: iso === now.toISOString().split("T")[0]
    });
  }
  return week;
}

function updateWeekLabel(week) {
  if (currentWeekLabelEl) {
    const start = `${week[0].dateNumber}.${String(new Date(week[0].iso).getMonth() + 1).padStart(2, "0")}`;
    const end = `${week[6].dateNumber}.${String(new Date(week[6].iso).getMonth() + 1).padStart(2, "0")}`;
    currentWeekLabelEl.textContent = `${start} — ${end}`;
  }
}

// ==========================================
// 3. ОТРИСОВКА ИНТЕРФЕЙСА
// ==========================================

function renderApp() {
  const list = currentTab === "personal" ? personalHabits : coupleHabits;
  const week = getWeekDates(currentWeekOffset);
  updateWeekLabel(week);

  habitsListEl.innerHTML = "";

  if (list.length === 0) {
    emptyStateEl.style.display = "block";
    return;
  }
  emptyStateEl.style.display = "none";

  list.forEach(habit => {
    // Подсчет выполненных дней за выбранную неделю
    let completedInWeek = 0;
    week.forEach(day => {
      if (historyData[`${day.iso}_${habit.id}`]) {
        completedInWeek++;
      }
    });

    const card = document.createElement("div");
    card.className = "habit-card";

    // Шапка карточки привычки
    const header = document.createElement("div");
    header.className = "habit-header";
    header.innerHTML = `
      <div class="habit-title">
        <span class="habit-icon">${habit.icon || "✨"}</span>
        <div>
          <h3>${habit.name}</h3>
          <span class="target-badge">Цель: ${completedInWeek}/${habit.target} дн.</span>
        </div>
      </div>
      <button class="btn-delete" title="Удалить" onclick="handleDeleteHabit(${habit.id})">✕</button>
    `;

    // Сетка дней недели
    const grid = document.createElement("div");
    grid.className = "days-grid";

    week.forEach(day => {
      const isChecked = !!historyData[`${day.iso}_${habit.id}`];
      const dayBtn = document.createElement("div");
      dayBtn.className = `day-cell ${day.isToday ? "today" : ""} ${isChecked ? "checked" : ""}`;
      if (isChecked) {
        dayBtn.style.backgroundColor = habit.color || "#3b82f6";
      }

      dayBtn.innerHTML = `
        <span class="day-name">${day.name}</span>
        <span class="day-num">${day.dateNumber}</span>
      `;

      dayBtn.onclick = () => handleDayToggle(habit.id, day.iso);
      grid.appendChild(dayBtn);
    });

    // Прогресс-бар
    const progressPercent = Math.min(100, Math.round((completedInWeek / habit.target) * 100));
    const progressBar = document.createElement("div");
    progressBar.className = "progress-container";
    progressBar.innerHTML = `
      <div class="progress-bar" style="width: ${progressPercent}%; background-color: ${habit.color || "#3b82f6"};"></div>
    `;

    card.appendChild(header);
    card.appendChild(grid);
    card.appendChild(progressBar);
    habitsListEl.appendChild(card);
  });
}

// ==========================================
// 4. ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ
// ==========================================

async function handleDayToggle(habitId, isoDate) {
  const key = `${isoDate}_${habitId}`;
  const willBeActive = !historyData[key];

  // Оптимистичное обновление интерфейса без задержек
  if (willBeActive) {
    historyData[key] = true;
  } else {
    delete historyData[key];
  }
  renderApp();

  // Отправка на бэкенд
  const status = await apiToggleDay(habitId, isoDate);
  if (status === null) {
    // В случае сбоя возвращаем старое состояние
    if (willBeActive) delete historyData[key];
    else historyData[key] = true;
    renderApp();
  }
}

async function handleDeleteHabit(habitId) {
  if (!confirm("Удалить эту цель?")) return;

  if (currentTab === "personal") {
    personalHabits = personalHabits.filter(h => h.id !== habitId);
  } else {
    coupleHabits = coupleHabits.filter(h => h.id !== habitId);
  }
  renderApp();
  await apiDeleteHabit(habitId);
}

function openModal() {
  modalEl.style.display = "flex";
  habitNameInput.value = "";
  habitIconInput.value = "🎯";
  habitTargetInput.value = "3";
}

function closeModal() {
  modalEl.style.display = "none";
}

async function saveNewHabit() {
  const name = habitNameInput.value.trim();
  if (!name) {
    alert("Пожалуйста, введите название цели");
    return;
  }

  const newHabit = {
    user_id: CURRENT_USER_ID,
    name: name,
    icon: habitIconInput.value.trim() || "✨",
    target: parseInt(habitTargetInput.value) || 3,
    color: habitColorInput.value || "#3b82f6",
    is_couple: currentTab === "couple" ? 1 : 0
  };

  closeModal();

  const createdId = await apiAddHabit(newHabit);
  newHabit.id = createdId || Date.now();

  if (currentTab === "personal") {
    personalHabits.push(newHabit);
  } else {
    coupleHabits.push(newHabit);
  }

  renderApp();
}

// Переключение табов "Личные" / "Совместные"
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  renderApp();
}

function changeWeek(direction) {
  currentWeekOffset += direction;
  renderApp();
}

// Запуск приложения
document.addEventListener("DOMContentLoaded", () => {
  loadServerState();
});
