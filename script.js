var API_BASE_URL = "https://habit-tracker-bot-kgew.onrender.com";
var tg = window.Telegram?.WebApp;

if (tg) {
  tg.expand();
}

// Получаем реальный Telegram User ID (или тестовый для отладки в браузере)
var USER_ID = tg?.initDataUnsafe?.user?.id || 556702536;
var USER_NAME = tg?.initDataUnsafe?.user?.first_name || "Пользователь";

var currentTab = "my"; // 'my' или 'couple'
var stateData = {
  habits: [],
  couple_habits: [],
  history: {},
  partner_name: null,
  partner_id: null
};

// Генерация последних 5 дат (ISO: YYYY-MM-DD)
function getLastDays(count = 5) {
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      iso: d.toISOString().split("T")[0],
      name: d.toLocaleDateString("ru-RU", { weekday: "short" }),
      num: d.getDate()
    });
  }
  return days;
}

var lastDays = getLastDays(5);

function renderDaysHeader() {
  const header = document.getElementById("days-header");
  header.innerHTML = "";
  lastDays.forEach((day) => {
    const col = document.createElement("div");
    col.className = "day-col";
    col.innerHTML = `<div>${day.name}</div><b>${day.num}</b>`;
    header.appendChild(col);
  });
}

// Отрисовка плашки статуса партнёра
function renderPairBadge() {
  const badge = document.getElementById("pair-badge");
  if (stateData.partner_name) {
    badge.className = "pair-badge linked";
    badge.innerHTML = `<span>В паре с: <b>${stateData.partner_name}</b> 💕</span>`;
  } else {
    badge.className = "pair-badge";
    badge.innerHTML = `
      <span>Пара не подключена</span>
      <button class="pair-btn" onclick="invitePartner()">Пригласить</button>
    `;
  }
}

function invitePartner() {
  const inviteLink = `https://t.me/self_control_to_succesful_bot?start=pair_${USER_ID}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(inviteLink);
    alert("Ссылка для добавления партнёра скопирована в буфер обмена! Отправьте её девушке в чат.");
  } else {
    prompt("Отправьте эту ссылку партнёру:", inviteLink);
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById("tab-my").classList.toggle("active", tab === "my");
  document.getElementById("tab-couple").classList.toggle("active", tab === "couple");
  renderHabits();
}

function renderHabits() {
  const container = document.getElementById("habits-list");
  container.innerHTML = "";

  const list = currentTab === "my" ? stateData.habits : stateData.couple_habits;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-sec); padding: 40px 0;">
        ${currentTab === "my" ? "У вас пока нет личных привычек" : "У вас пока нет общих привычек"}
      </div>
    `;
    return;
  }

  list.forEach((habit) => {
    const card = document.createElement("div");
    card.className = "habit-card";

    const info = document.createElement("div");
    info.className = "habit-info";
    info.innerHTML = `
      <div class="habit-icon">${habit.icon || "⭐"}</div>
      <div class="habit-title">${habit.name}</div>
    `;

    const checks = document.createElement("div");
    checks.className = "habit-checks";

    lastDays.forEach((day) => {
      const btn = document.createElement("button");
      btn.className = "check-btn";
      const key = `${day.iso}_${habit.id}`;
      const isChecked = !!stateData.history[key];

      if (isChecked) {
        btn.classList.add("checked");
        btn.innerText = "✓";
      }

      btn.onclick = () => toggleCheck(habit.id, day.iso);
      checks.appendChild(btn);
    });

    card.appendChild(info);
    card.appendChild(checks);
    container.appendChild(card);
  });
}

// Загрузка состояния с бэкенда
async function loadState() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/state?user_id=${USER_ID}`);
    const data = await res.json();
    if (data.success) {
      stateData = data;
      renderPairBadge();
      renderHabits();
    }
  } catch (err) {
    console.error("Ошибка загрузки:", err);
  }
}

// Переключение галочки дня
async function toggleCheck(habitId, isoDate) {
  const key = `${isoDate}_${habitId}`;
  stateData.history[key] = !stateData.history[key];
  renderHabits();

  try {
    await fetch(`${API_BASE_URL}/api/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habit_id: habitId, iso_date: isoDate })
    });
  } catch (err) {
    console.error("Ошибка переключения:", err);
    stateData.history[key] = !stateData.history[key];
    renderHabits();
  }
}

// Модальное окно создания привычки
function openAddModal() {
  document.getElementById("modal-title").innerText =
    currentTab === "my" ? "Новая личная привычка" : "Новая общая привычка 💕";
  document.getElementById("modal").classList.add("active");
  document.getElementById("habit-name").value = "";
}

function closeAddModal() {
  document.getElementById("modal").classList.remove("active");
}

async function submitHabit() {
  const name = document.getElementById("habit-name").value.trim();
  const icon = document.getElementById("habit-icon").value.trim() || "⭐";
  if (!name) return;

  closeAddModal();

  try {
    const res = await fetch(`${API_BASE_URL}/api/habit/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        name: name,
        icon: icon,
        target: 7,
        color: currentTab === "couple" ? "#ff7675" : "#6c5ce7",
        is_couple: currentTab === "couple"
      })
    });
    const result = await res.json();
    if (result.success) {
      await loadState();
    }
  } catch (err) {
    console.error("Ошибка добавления привычки:", err);
  }
}

// Инициализация при старте
renderDaysHeader();
loadState();
