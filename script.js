const API_BASE_URL = "https://9cfdc29ea1b2dc.lhr.life";

const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

// Получаем user_id из Telegram (или тестовый ID для браузера)
const USER_ID = tg?.initDataUnsafe?.user?.id || 12345;

let currentMode = 'personal'; // 'personal' или 'couple'

let personalHabits = [];
let coupleHabits = [];
let historyData = {};
let hasPair = false;

// Буфер для надежного считывания текста из поля ввода
let currentInputHabitName = "";

// ==========================================
// 1. КАЛЕНДАРЬ И ДАТЫ
// ==========================================
let currentWeekOffset = 0;
let currentMonthDate = new Date();

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];
const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function getActiveHabits() {
  return currentMode === 'personal' ? personalHabits : coupleHabits;
}

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + (offset * 7));

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    week.push(d);
  }
  return week;
}

function toISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==========================================
// 2. ЗАГРУЗКА ДАННЫХ С СЕРВЕРА
// ==========================================
async function loadServerState() {
  try {
    const currentUserId = tg?.initDataUnsafe?.user?.id || USER_ID;
    const res = await fetch(`${API_BASE_URL}/api/state?user_id=${currentUserId}`);
    if (res.ok) {
      const data = await res.json();
      personalHabits = data.personalHabits || [];
      coupleHabits = data.coupleHabits || [];
      historyData = data.historyData || {};
      hasPair = data.hasPair;

      const coupleBtnTitle = document.getElementById('couple-tab-title');
      if (coupleBtnTitle) {
        coupleBtnTitle.innerText = hasPair ? "Мы вместе ❤️" : "Совместные";
      }
    }
  } catch (err) {
    console.warn("Сервер временно недоступен:", err);
  }

  renderWeekView();
}

document.addEventListener('DOMContentLoaded', () => {
  loadServerState();

  // Страховочный слушатель ввода и сохранение по Enter
  const inputField = document.getElementById('habit-name-input');
  if (inputField) {
    inputField.addEventListener('input', (e) => {
      currentInputHabitName = e.target.value;
    });
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveNewHabit();
      }
    });
  }
});

function switchMode(mode) {
  currentMode = mode;
  document.getElementById('mode-personal-btn').classList.toggle('active', mode === 'personal');
  document.getElementById('mode-couple-btn').classList.toggle('active', mode === 'couple');

  const addBtn = document.getElementById('btn-add-label');
  if (addBtn) {
    addBtn.innerText = mode === 'personal' ? '+ Добавить цель' : '+ Добавить совместную цель';
  }

  const modalHeading = document.getElementById('modal-heading');
  if (modalHeading) {
    modalHeading.innerText = mode === 'personal' ? 'Новая цель' : 'Новая совместная цель';
  }

  if (document.getElementById('view-week').classList.contains('active')) {
    renderWeekView();
  } else {
    renderMonthView();
  }
}

function switchView(viewName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));

  if (viewName === 'week') {
    document.getElementById('tab-week-btn').classList.add('active');
    document.getElementById('view-week').classList.add('active');
    renderWeekView();
  } else {
    document.getElementById('tab-month-btn').classList.add('active');
    document.getElementById('view-month').classList.add('active');
    renderMonthView();
  }
}

// ==========================================
// 3. НЕДЕЛЬНЫЙ ЭКРАН (ТАБЛИЦА + ГРАФИК)
// ==========================================
function renderWeekView() {
  const activeHabits = getActiveHabits();
  const weekDates = getWeekDates(currentWeekOffset);
  const todayISO = toISODate(new Date());

  const startStr = `${weekDates[0].getDate()}.${String(weekDates[0].getMonth() + 1).padStart(2, '0')}`;
  const endStr = `${weekDates[6].getDate()}.${String(weekDates[6].getMonth() + 1).padStart(2, '0')}.${weekDates[6].getFullYear()}`;
  document.getElementById('week-dates-label').innerText = `${startStr} — ${endStr}`;

  // Шапка таблицы
  const headRow = document.getElementById('table-head-row');
  let headHTML = `
    <th class="col-habit">Привычка</th>
    <th class="col-target">Цель</th>
  `;

  weekDates.forEach((d, idx) => {
    const iso = toISODate(d);
    const isToday = iso === todayISO;
    const dateFormatted = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    headHTML += `
      <th class="col-day ${isToday ? 'is-today' : ''}">
        ${DAY_NAMES[idx]}<br><small>${dateFormatted}</small>
      </th>
    `;
  });

  headHTML += `
    <th class="col-num">Факт</th>
    <th class="col-num">Осталось</th>
    <th class="col-progress">Прогресс</th>
    <th class="col-del"></th>
  `;
  headRow.innerHTML = headHTML;

  // Строки таблицы
  const tbody = document.getElementById('habits-body');
  tbody.innerHTML = '';

  if (activeHabits.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="12" style="padding: 35px 15px; color: #64748b; font-size: 0.88rem; font-weight: 500;">
        ${currentMode === 'couple' && !hasPair 
          ? "Партнёр ещё не подключён! Отправь инвайт-ссылку из бота 🔗" 
          : "Целей пока нет. Нажми «+ Добавить», чтобы создать первую ✨"}
      </td>
    `;
    tbody.appendChild(emptyRow);
  }

  let weekTotalTarget = 0;
  let weekTotalDone = 0;
  const dayDoneTotals = [0, 0, 0, 0, 0, 0, 0];

  activeHabits.forEach(habit => {
    weekTotalTarget += habit.target;
    let habitWeekDone = 0;

    let trHTML = `<td class="col-habit">${habit.icon} ${habit.name}</td>`;
    trHTML += `<td class="col-target">${habit.target}</td>`;

    weekDates.forEach((d, dayIdx) => {
      const iso = toISODate(d);
      const isChecked = !!historyData[`${iso}_${habit.id}`];

      if (isChecked) {
        habitWeekDone++;
        dayDoneTotals[dayIdx]++;
        weekTotalDone++;
      }

      trHTML += `
        <td>
          <div class="custom-chk ${isChecked ? 'active' : ''}" onclick="toggleHistoryDay('${iso}', ${habit.id})">
            ${isChecked ? '✓' : ''}
          </div>
        </td>
      `;
    });

    const remaining = Math.max(0, habit.target - habitWeekDone);
    const percent = Math.min(100, Math.round((habitWeekDone / habit.target) * 100));

    trHTML += `<td class="col-num">${habitWeekDone}</td>`;
    trHTML += `<td class="col-num">${remaining}</td>`;
    trHTML += `
      <td>
        <div class="row-progress-box">
          <div class="row-bar-bg">
            <div class="row-bar-fill" style="width: ${percent}%; background: ${habit.color};"></div>
          </div>
          <span class="row-bar-percent">${percent}%</span>
        </div>
      </td>
    `;
    trHTML += `
      <td>
        <button class="btn-del-habit" onclick="deleteHabit(${habit.id})" title="Удалить">✕</button>
      </td>
    `;

    const tr = document.createElement('tr');
    tr.innerHTML = trHTML;
    tbody.appendChild(tr);
  });

  // Итоги недели
  const overallPercent = weekTotalTarget > 0 ? Math.round((weekTotalDone / weekTotalTarget) * 100) : 0;
  document.getElementById('total-done-ratio').innerText = `${weekTotalDone} / ${weekTotalTarget}`;
  document.getElementById('total-percent-label').innerText = `${overallPercent}%`;

  // График дней
  const chartBox = document.getElementById('days-chart');
  chartBox.innerHTML = '';
  const maxInDay = Math.max(activeHabits.length, 1);

  dayDoneTotals.forEach((count, i) => {
    const col = document.createElement('div');
    col.className = 'chart-col';
    const barHeightPercent = activeHabits.length > 0 ? (count / maxInDay) * 100 : 0;

    let colorClass = 'lvl-low';
    if (barHeightPercent >= 70) {
      colorClass = 'lvl-high';
    } else if (barHeightPercent >= 36) {
      colorClass = 'lvl-mid';
    }

    col.innerHTML = `
      <span class="chart-count">${count}</span>
      <div class="chart-bar-wrap">
        <div class="chart-bar-fill ${count > 0 ? colorClass : ''}" style="height: ${barHeightPercent}%;"></div>
      </div>
      <span class="chart-label">${DAY_NAMES[i]}</span>
    `;
    chartBox.appendChild(col);
  });
}

// ПЕРЕКЛЮЧЕНИЕ ГАЛОЧКИ
async function toggleHistoryDay(isoDate, habitId) {
  const key = `${isoDate}_${habitId}`;
  
  if (historyData[key]) {
    delete historyData[key];
  } else {
    historyData[key] = true;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
  }
  renderWeekView();

  try {
    await fetch(`${API_BASE_URL}/api/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habit_id: habitId, iso_date: isoDate })
    });
  } catch (e) {
    console.error("Ошибка сохранения отметки:", e);
  }
}

function changeWeek(direction) {
  currentWeekOffset += direction;
  renderWeekView();
}

function goToCurrentWeek() {
  currentWeekOffset = 0;
  renderWeekView();
}

// ==========================================
// 4. МЕСЯЧНЫЙ ЭКРАН (КРУГОВАЯ ДИАГРАММА)
// ==========================================
function changeMonth(direction) {
  currentMonthDate.setMonth(currentMonthDate.getMonth() + direction);
  renderMonthView();
}

function renderMonthView() {
  const activeHabits = getActiveHabits();
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  document.getElementById('month-title-label').innerText = `${MONTH_NAMES[month]} ${year}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  const listContainer = document.getElementById('month-items-list');
  listContainer.innerHTML = '';

  if (activeHabits.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #64748b; font-size: 0.85rem;">
        В этом пространстве ещё нет целей
      </div>
    `;
    drawMonthPieChart([]);
    return;
  }

  const chartSegments = [];
  const approxWeeks = daysInMonth / 7;

  activeHabits.forEach(habit => {
    let doneInMonth = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      if (historyData[`${iso}_${habit.id}`]) {
        doneInMonth++;
      }
    }

    const monthTarget = Math.round(habit.target * approxWeeks);
    const percent = monthTarget > 0 ? Math.min(100, Math.round((doneInMonth / monthTarget) * 100)) : 0;

    chartSegments.push({
      name: habit.name,
      value: doneInMonth,
      color: habit.color
    });

    const itemRow = document.createElement('div');
    itemRow.className = 'month-stat-row';
    itemRow.innerHTML = `
      <div class="month-stat-top">
        <span>${habit.icon} ${habit.name}</span>
        <span style="color: ${habit.color};">${doneInMonth} раз (${percent}%)</span>
      </div>
      <div class="month-stat-bar-bg">
        <div class="month-stat-bar-fill" style="width: ${percent}%; background: ${habit.color};"></div>
      </div>
    `;
    listContainer.appendChild(itemRow);
  });

  drawMonthPieChart(chartSegments);
}

function drawMonthPieChart(segments) {
  const canvas = document.getElementById('month-pie-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const totalValue = segments.reduce((sum, s) => sum + s.value, 0);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2 - 15;
  const innerRadius = radius * 0.62;

  if (totalValue === 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.arc(centerX, centerY, innerRadius, 2 * Math.PI, 0, true);
    ctx.fillStyle = '#202633';
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.font = '600 13px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет отметок', centerX, centerY + 5);
    return;
  }

  let startAngle = -Math.PI / 2;

  segments.forEach(segment => {
    if (segment.value === 0) return;
    const sliceAngle = (segment.value / totalValue) * 2 * Math.PI;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = segment.color;
    ctx.fill();

    startAngle += sliceAngle;
  });

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 22px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(totalValue, centerX, centerY + 2);

  ctx.fillStyle = '#8da0b8';
  ctx.font = '600 11px Montserrat, sans-serif';
  ctx.fillText('всего целей', centerX, centerY + 18);
}

// ==========================================
// 5. ДОБАВЛЕНИЕ И УДАЛЕНИЕ ЦЕЛЕЙ
// ==========================================
let chosenIcon = "🏋️";
const COLOR_PALETTE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

function openAddModal() {
  currentInputHabitName = "";
  const nameInput = document.getElementById('habit-name-input');
  if (nameInput) {
    nameInput.value = "";
    document.getElementById('add-modal').classList.add('active');
    setTimeout(() => nameInput.focus(), 100);
  }
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('active');
}

function handleModalOverlayClick(e) {
  if (e.target.id === 'add-modal') closeAddModal();
}

function pickIcon(el) {
  document.querySelectorAll('.icon-opt').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  chosenIcon = el.innerText;
}

async function saveNewHabit() {
  const nameInput = document.getElementById('habit-name-input');
  const targetInput = document.getElementById('habit-target-input');

  // Читаем из поля ввода или из буфера события
  const title = (nameInput ? nameInput.value.trim() : "") || currentInputHabitName.trim();

  if (!title) {
    alert("Введите название цели!");
    return;
  }

  const activeHabits = getActiveHabits();
  const randomColor = COLOR_PALETTE[activeHabits.length % COLOR_PALETTE.length];
  const targetVal = parseInt(targetInput ? targetInput.value : 3) || 3;
  const currentUserId = tg?.initDataUnsafe?.user?.id || USER_ID;

  const tempId = Date.now();
  const newHabit = {
    id: tempId,
    name: title,
    icon: chosenIcon,
    target: targetVal,
    color: randomColor
  };

  // 1. Моментально отображаем в интерфейсе
  activeHabits.push(newHabit);
  closeAddModal();
  renderWeekView();

  if (typeof confetti === 'function') {
    confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
  }

  // 2. В фоне передаём на Python-сервер в базу SQLite
  const payload = {
    user_id: Number(currentUserId),
    name: title,
    icon: chosenIcon,
    target: targetVal,
    color: randomColor,
    is_couple: currentMode === 'couple' ? 1 : 0
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/habit/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const result = await res.json();
      if (result.id) {
        newHabit.id = result.id;
      }
    }
  } catch (e) {
    console.error("Ошибка сохранения на бэкенд:", e);
  }
}

async function deleteHabit(id) {
  if (!confirm("Удалить эту цель?")) return;

  if (currentMode === 'personal') {
    personalHabits = personalHabits.filter(h => h.id !== id);
  } else {
    coupleHabits = coupleHabits.filter(h => h.id !== id);
  }

  renderWeekView();

  try {
    await fetch(`${API_BASE_URL}/api/habit/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habit_id: id })
    });
  } catch (e) {
    console.error("Ошибка удаления:", e);
  }
}
