// Перехватчик любых неожиданных ошибок с выводом на экран
window.onerror = function(msg, url, line) {
  alert("Ошибка JS: " + msg + " (строка: " + line + ")");
  return false;
};

var API_BASE_URL = "https://subtotal-lip-carmaker.ngrok-free.dev";

// Инициализация Telegram WebApp
var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) {
  try {
    tg.expand();
    tg.ready();
  } catch (e) {}
}

var CURRENT_USER_ID = 12345;
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
  CURRENT_USER_ID = tg.initDataUnsafe.user.id;
}

// Переменные состояния
var personalHabits = [];
var coupleHabits = [];
var historyData = {};
var currentTab = "personal";
var currentWeekOffset = 0;

// Заголовки для запросов к ngrok
var API_HEADERS = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true"
};

// ==========================================
// 1. СЕТЬ
// ==========================================

async function loadServerState() {
  try {
    var res = await fetch(API_BASE_URL + "/api/state?user_id=" + CURRENT_USER_ID, {
      headers: { "ngrok-skip-browser-warning": "true" }
    });
    if (res.ok) {
      var data = await res.json();
      personalHabits = data.personalHabits || [];
      coupleHabits = data.coupleHabits || [];
      historyData = data.historyData || {};
    }
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
  }
  renderApp();
}

async function apiAddHabit(habitData) {
  try {
    var res = await fetch(API_BASE_URL + "/api/habit/add", {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify(habitData)
    });
    if (res.ok) {
      var data = await res.json();
      return data.id;
    }
  } catch (err) {
    console.error("Ошибка API add:", err);
  }
  return null;
}

async function apiToggleDay(habitId, isoDate) {
  try {
    var res = await fetch(API_BASE_URL + "/api/toggle", {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({ habit_id: habitId, iso_date: isoDate })
    });
    if (res.ok) {
      var data = await res.json();
      return data.status;
    }
  } catch (err) {
    console.error("Ошибка API toggle:", err);
  }
  return null;
}

async function apiDeleteHabit(habitId) {
  try {
    await fetch(API_BASE_URL + "/api/habit/delete", {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({ habit_id: habitId })
    });
  } catch (err) {
    console.error("Ошибка API delete:", err);
  }
}

// ==========================================
// 2. РАБОТА С НЕДЕЛЕЙ
// ==========================================

function getWeekDates(offset) {
  var now = new Date();
  var dayOfWeek = now.getDay();
  var diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  var monday = new Date(now);
  monday.setDate(now.getDate() + diff + (offset * 7));

  var week = [];
  var names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    var iso = d.toISOString().split("T")[0];
    var todayIso = now.toISOString().split("T")[0];
    week.push({
      name: names[i],
      dateNumber: d.getDate(),
      iso: iso,
      isToday: (iso === todayIso)
    });
  }
  return week;
}

// ==========================================
// 3. ОТРИСОВКА
// ==========================================

function renderApp() {
  var list = (currentTab === "personal") ? personalHabits : coupleHabits;
  var week = getWeekDates(currentWeekOffset);

  var weekLabel = document.getElementById("currentWeekLabel");
  if (weekLabel && week.length === 7) {
    var startMonth = String(new Date(week[0].iso).getMonth() + 1).padStart(2, "0");
    var endMonth = String(new Date(week[6].iso).getMonth() + 1).padStart(2, "0");
    weekLabel.textContent = week[0].dateNumber + "." + startMonth + " — " + week[6].dateNumber + "." + endMonth;
  }

  var listEl = document.getElementById("habitsList");
  var emptyEl = document.getElementById("emptyState");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (list.length === 0) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  list.forEach(function(habit) {
    var completedCount = 0;
    week.forEach(function(d) {
      if (historyData[d.iso + "_" + habit.id]) {
        completedCount++;
      }
    });

    var card = document.createElement("div");
    card.className = "habit-card";

    var header = document.createElement("div");
    header.className = "habit-header";
    header.innerHTML =
      '<div class="habit-title">' +
        '<span class="habit-icon">' + (habit.icon || "✨") + '</span>' +
        '<div>' +
          '<h3>' + habit.name + '</h3>' +
          '<span class="target-badge">Цель: ' + completedCount + '/' + habit.target + ' дн.</span>' +
        '</div>' +
      '</div>' +
      '<button class="btn-delete" onclick="handleDeleteHabit(' + habit.id + ')">✕</button>';

    var grid = document.createElement("div");
    grid.className = "days-grid";

    week.forEach(function(d) {
      var isChecked = !!historyData[d.iso + "_" + habit.id];
      var cell = document.createElement("div");
      cell.className = "day-cell" + (d.isToday ? " today" : "") + (isChecked ? " checked" : "");
      if (isChecked) {
        cell.style.backgroundColor = habit.color || "#3b82f6";
      }

      cell.innerHTML =
        '<span class="day-name">' + d.name + '</span>' +
        '<span class="day-num">' + d.dateNumber + '</span>';

      cell.onclick = function() {
        handleDayToggle(habit.id, d.iso);
      };
      grid.appendChild(cell);
    });

    var percent = Math.min(100, Math.round((completedCount / habit.target) * 100));
    var progress = document.createElement("div");
    progress.className = "progress-container";
    progress.innerHTML =
      '<div class="progress-bar" style="width: ' + percent + '%; background-color: ' + (habit.color || "#3b82f6") + ';"></div>';

    card.appendChild(header);
    card.appendChild(grid);
    card.appendChild(progress);
    listEl.appendChild(card);
  });
}

// ==========================================
// 4. ДЕЙСТВИЯ (С ЭКСПОРТОМ В WINDOW)
// ==========================================

window.handleDayToggle = async function(habitId, isoDate) {
  var key = isoDate + "_" + habitId;
  var willBeActive = !historyData[key];

  if (willBeActive) {
    historyData[key] = true;
  } else {
    delete historyData[key];
  }
  renderApp();

  var status = await apiToggleDay(habitId, isoDate);
  if (status === null) {
    if (willBeActive) delete historyData[key];
    else historyData[key] = true;
    renderApp();
  }
};

window.handleDeleteHabit = async function(habitId) {
  if (!confirm("Удалить эту цель?")) return;

  if (currentTab === "personal") {
    personalHabits = personalHabits.filter(function(h) { return h.id !== habitId; });
  } else {
    coupleHabits = coupleHabits.filter(function(h) { return h.id !== habitId; });
  }
  renderApp();
  await apiDeleteHabit(habitId);
};

window.openModal = function() {
  var modal = document.getElementById("habitModal");
  if (modal) modal.style.display = "flex";
  var nameInput = document.getElementById("habitName");
  if (nameInput) nameInput.value = "";
};

window.closeModal = function() {
  var modal = document.getElementById("habitModal");
  if (modal) modal.style.display = "none";
};

window.saveNewHabit = async function() {
  var nameInput = document.getElementById("habitName");
  var iconInput = document.getElementById("habitIcon");
  var targetInput = document.getElementById("habitTarget");
  var colorInput = document.getElementById("habitColor");

  var name = nameInput ? nameInput.value.trim() : "";
  if (!name) {
    alert("Введите название цели!");
    return;
  }

  var newHabit = {
    user_id: CURRENT_USER_ID,
    name: name,
    icon: (iconInput && iconInput.value.trim()) ? iconInput.value.trim() : "🎯",
    target: (targetInput && parseInt(targetInput.value)) ? parseInt(targetInput.value) : 3,
    color: (colorInput && colorInput.value) ? colorInput.value : "#3b82f6",
    is_couple: (currentTab === "couple" ? 1 : 0)
  };

  window.closeModal();

  var createdId = await apiAddHabit(newHabit);
  newHabit.id = createdId || Date.now();

  if (currentTab === "personal") {
    personalHabits.push(newHabit);
  } else {
    coupleHabits.push(newHabit);
  }

  renderApp();
};

window.setTab = function(tab) {
  currentTab = tab;
  var buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach(function(btn) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  renderApp();
};

window.changeWeek = function(direction) {
  currentWeekOffset += direction;
  renderApp();
};

// Алиасы для функций модального окна и действий под твой HTML
window.openAddModal = function() {
  var modal = document.getElementById("addModal") || document.getElementById("habitModal");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("active");
  }
};

window.closeAddModal = function() {
  var modal = document.getElementById("addModal") || document.getElementById("habitModal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
};

// Если в HTML кнопка называется openModal / closeModal
window.openModal = window.openAddModal;
window.closeModal = window.closeAddModal;

// Запуск при загрузке документа
document.addEventListener("DOMContentLoaded", function() {
  loadServerState();
});
