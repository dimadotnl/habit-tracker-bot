// URL туннеля ngrok
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

// Состояние приложения
var currentMode = "personal"; // "personal" или "couple"
var currentView = "week";     // "week" или "month"
var currentWeekOffset = 0;
var currentMonthOffset = 0;

var personalHabits = [];
var coupleHabits = [];
var historyData = {}; // { "YYYY-MM-DD_habitId": true }
var selectedIcon = "🏋️";

var API_HEADERS = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true"
};

// ==========================================
// 1. СЕТЕВЫЕ ЗАПРОСЫ
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
  render();
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
    console.error("Ошибка добавления:", err);
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
    console.error("Ошибка отметки дня:", err);
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
    console.error("Ошибка удаления:", err);
  }
}

// ==========================================
// 2. ДАТЫ И НЕДЕЛИ
// ==========================================

function getWeekDates(offset) {
  var now = new Date();
  var day = now.getDay();
  var diff = (day === 0 ? -6 : 1) - day;
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
// 3. ОТРИСОВКА ИНТЕРФЕЙСА ПОД STYLE.CSS
// ==========================================

function render() {
  if (currentView === "week") {
    renderWeekView();
  } else {
    renderMonthView();
  }
}

function renderWeekView() {
  var list = (currentMode === "personal") ? personalHabits : coupleHabits;
  var week = getWeekDates(currentWeekOffset);

  // Период недели в шапке
  var weekDatesLabel = document.getElementById("week-dates-label");
  if (weekDatesLabel && week.length === 7) {
    var startMonth = String(new Date(week[0].iso).getMonth() + 1).padStart(2, "0");
    var endMonth = String(new Date(week[6].iso).getMonth() + 1).padStart(2, "0");
    weekDatesLabel.textContent = week[0].dateNumber + "." + startMonth + " — " + week[6].dateNumber + "." + endMonth;
  }

  // Заголовки таблицы
  var theadRow = document.getElementById("table-head-row");
  if (theadRow) {
    theadRow.innerHTML =
      '<th class="col-habit">Привычка</th>' +
      '<th class="col-target">Цель</th>' +
      week.map(function(d) {
        return '<th class="' + (d.isToday ? 'is-today' : '') + '">' + d.name + '<small>' + d.dateNumber + '</small></th>';
      }).join("") +
      '<th class="col-num">Факт</th>' +
      '<th class="col-num">Осталось</th>' +
      '<th class="col-progress">Прогресс</th>' +
      '<th class="col-del"></th>';
  }

  var tbody = document.getElementById("habits-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  var totalFact = 0;
  var totalTarget = 0;
  var dayStats = [0, 0, 0, 0, 0, 0, 0];

  list.forEach(function(habit) {
    var habitFact = 0;
    var daysCellsHtml = "";

    week.forEach(function(d, idx) {
      var isChecked = !!historyData[d.iso + "_" + habit.id];
      if (isChecked) {
        habitFact++;
        dayStats[idx]++;
      }
      daysCellsHtml +=
        '<td>' +
          '<div class="custom-chk ' + (isChecked ? 'active' : '') + '" onclick="toggleHabitDay(' + habit.id + ', \'' + d.iso + '\')">' +
            (isChecked ? '✓' : '') +
          '</div>' +
        '</td>';
    });

    totalFact += habitFact;
    totalTarget += (habit.target || 0);

    var left = Math.max(0, (habit.target || 0) - habitFact);
    var percent = (habit.target > 0) ? Math.min(100, Math.round((habitFact / habit.target) * 100)) : 0;

    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="col-habit">' + (habit.icon || "✨") + ' ' + habit.name + '</td>' +
      '<td class="col-target">' + habit.target + '</td>' +
      daysCellsHtml +
      '<td class="col-num">' + habitFact + '</td>' +
      '<td class="col-num">' + left + '</td>' +
      '<td>' +
        '<div class="row-progress-box">' +
          '<div class="row-bar-bg"><div class="row-bar-fill" style="width:' + percent + '%"></div></div>' +
          '<span class="row-bar-percent">' + percent + '%</span>' +
        '</div>' +
      '</td>' +
      '<td class="col-del">' +
        '<button class="btn-del-habit" title="Удалить" onclick="deleteHabit(' + habit.id + ')">✕</button>' +
      '</td>';
    tbody.appendChild(tr);
  });

  // Верхняя статистика
  var scoreEl = document.getElementById("total-done-ratio");
  var percentEl = document.getElementById("total-percent-label");
  if (scoreEl) scoreEl.textContent = totalFact + " / " + totalTarget;
  var totalPercent = (totalTarget > 0) ? Math.min(100, Math.round((totalFact / totalTarget) * 100)) : 0;
  if (percentEl) percentEl.textContent = totalPercent + "%";

  // Столбчатый график со светофором
  var chartEl = document.getElementById("days-chart");
  if (chartEl) {
    chartEl.innerHTML = "";
    var maxVal = Math.max.apply(null, dayStats.concat([1]));

    week.forEach(function(d, idx) {
      var count = dayStats[idx];
      var heightPercent = Math.max(8, Math.round((count / maxVal) * 100));

      var lvlClass = "lvl-low";
      if (count >= 3) lvlClass = "lvl-high";
      else if (count >= 1) lvlClass = "lvl-mid";

      var col = document.createElement("div");
      col.className = "chart-col";
      col.innerHTML =
        '<span class="chart-count">' + (count > 0 ? count : '') + '</span>' +
        '<div class="chart-bar-wrap">' +
          '<div class="chart-bar-fill ' + lvlClass + '" style="height: ' + heightPercent + '%"></div>' +
        '</div>' +
        '<span class="chart-label">' + d.name + '</span>';
      chartEl.appendChild(col);
    });
  }
}

function renderMonthView() {
  var list = (currentMode === "personal") ? personalHabits : coupleHabits;
  var now = new Date();
  var targetMonth = new Date(now.getFullYear(), now.getMonth() + currentMonthOffset, 1);
  var monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

  var monthTitle = document.getElementById("month-title-label");
  if (monthTitle) {
    monthTitle.textContent = monthNames[targetMonth.getMonth()] + " " + targetMonth.getFullYear();
  }

  var itemsList = document.getElementById("month-items-list");
  if (itemsList) {
    itemsList.innerHTML = "";
    var prefix = targetMonth.getFullYear() + "-" + String(targetMonth.getMonth() + 1).padStart(2, "0");

    list.forEach(function(h) {
      var count = 0;
      Object.keys(historyData).forEach(function(k) {
        if (k.startsWith(prefix) && k.endsWith("_" + h.id) && historyData[k]) {
          count++;
        }
      });

      var maxExpect = (h.target || 3) * 4;
      var fillPercent = Math.min(100, Math.round((count / maxExpect) * 100));

      var item = document.createElement("div");
      item.className = "month-stat-row";
      item.innerHTML =
        '<div class="month-stat-top">' +
          '<span>' + (h.icon || "✨") + ' ' + h.name + '</span>' +
          '<strong>' + count + ' выполнено</strong>' +
        '</div>' +
        '<div class="month-stat-bar-bg">' +
          '<div class="month-stat-bar-fill" style="width: ' + fillPercent + '%; background: #10b981;"></div>' +
        '</div>';
      itemsList.appendChild(item);
    });
  }
}

// ==========================================
// 4. ДЕЙСТВИЯ (ОБРАБОТЧИКИ СОБЫТИЙ)
// ==========================================

window.switchMode = function(mode) {
  currentMode = mode;
  var pBtn = document.getElementById("mode-personal-btn");
  var cBtn = document.getElementById("mode-couple-btn");
  if (pBtn) pBtn.classList.toggle("active", mode === "personal");
  if (cBtn) cBtn.classList.toggle("active", mode === "couple");
  render();
};

window.switchView = function(view) {
  currentView = view;
  var wBtn = document.getElementById("tab-week-btn");
  var mBtn = document.getElementById("tab-month-btn");
  var wView = document.getElementById("view-week");
  var mView = document.getElementById("view-month");

  if (wBtn) wBtn.classList.toggle("active", view === "week");
  if (mBtn) mBtn.classList.toggle("active", view === "month");
  if (wView) wView.classList.toggle("active", view === "week");
  if (mView) mView.classList.toggle("active", view === "month");
  render();
};

window.changeWeek = function(direction) {
  currentWeekOffset += direction;
  render();
};

window.goToCurrentWeek = function() {
  currentWeekOffset = 0;
  render();
};

window.changeMonth = function(direction) {
  currentMonthOffset += direction;
  render();
};

window.openAddModal = function() {
  var modal = document.getElementById("add-modal");
  if (modal) modal.classList.add("active");
  var input = document.getElementById("habit-name-input");
  if (input) input.value = "";
};

window.closeAddModal = function() {
  var modal = document.getElementById("add-modal");
  if (modal) modal.classList.remove("active");
};

window.handleModalOverlayClick = function(e) {
  if (e.target.id === "add-modal") {
    window.closeAddModal();
  }
};

window.pickIcon = function(element) {
  document.querySelectorAll(".icon-opt").forEach(function(el) {
    el.classList.remove("selected");
  });
  element.classList.add("selected");
  selectedIcon = element.innerText.trim();
};

window.saveNewHabit = async function() {
  var input = document.getElementById("habit-name-input");
  var name = input ? input.value.trim() : "";
  if (!name) {
    alert("Введите название привычки!");
    return;
  }

  var targetSlider = document.getElementById("habit-target-input");
  var targetVal = targetSlider ? parseInt(targetSlider.value) : 3;

  var newHabit = {
    user_id: CURRENT_USER_ID,
    name: name,
    icon: selectedIcon,
    target: targetVal,
    color: "#6366f1",
    is_couple: (currentMode === "couple" ? 1 : 0)
  };

  window.closeAddModal();

  var createdId = await apiAddHabit(newHabit);
  newHabit.id = createdId || Date.now();

  if (currentMode === "personal") {
    personalHabits.push(newHabit);
  } else {
    coupleHabits.push(newHabit);
  }

  render();
};

window.toggleHabitDay = async function(habitId, isoDate) {
  var key = isoDate + "_" + habitId;
  var willBeActive = !historyData[key];

  if (willBeActive) {
    historyData[key] = true;
    if (window.confetti) {
      window.confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
    }
  } else {
    delete historyData[key];
  }
  render();

  var status = await apiToggleDay(habitId, isoDate);
  if (status === null) {
    if (willBeActive) delete historyData[key];
    else historyData[key] = true;
    render();
  }
};

window.deleteHabit = async function(habitId) {
  if (!confirm("Удалить эту привычку?")) return;

  if (currentMode === "personal") {
    personalHabits = personalHabits.filter(function(h) { return h.id !== habitId; });
  } else {
    coupleHabits = coupleHabits.filter(function(h) { return h.id !== habitId; });
  }
  render();
  await apiDeleteHabit(habitId);
};

// Запуск приложения
document.addEventListener("DOMContentLoaded", function() {
  loadServerState();
});
