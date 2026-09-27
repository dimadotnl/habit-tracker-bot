const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

// ==========================================
// 1. ХРАНИЛИЩЕ ДАННЫХ (ЧИСТЫЙ СТАРТ С НУЛЯ)
// ==========================================
// Сброс старых предустановленных данных при первом переходе на новую версию
if (!localStorage.getItem('habits_v2_clean')) {
  localStorage.removeItem('my_personal_habits');
  localStorage.removeItem('my_couple_habits');
  localStorage.setItem('habits_v2_clean', 'true');
}

// Пустые массивы — пользователь создаёт всё сам
const DEFAULT_PERSONAL_HABITS = [];
const DEFAULT_COUPLE_HABITS = [];

let currentMode = 'personal'; // 'personal' или 'couple'

let personalHabits = JSON.parse(localStorage.getItem('my_personal_habits')) || DEFAULT_PERSONAL_HABITS;
let coupleHabits = JSON.parse(localStorage.getItem('my_couple_habits')) || DEFAULT_COUPLE_HABITS;
let historyData = JSON.parse(localStorage.getItem('my_habit_history')) || {};
let coupleSpaceName = localStorage.getItem('my_space_name') || "Совместные";

// ==========================================
// 2. КАЛЕНДАРЬ И ДАТЫ
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
// 3. ИНИЦИАЛИЗАЦИЯ И ПЕРЕКЛЮЧЕНИЯ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  updateSpaceUI();
  renderWeekView();
});

function updateSpaceUI() {
  const titleElem = document.getElementById('couple-tab-title');
  if (titleElem) {
    titleElem.innerText = coupleSpaceName;
  }
}

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
// 4. НЕДЕЛЬНЫЙ ЭКРАН (ТАБЛИЦА + ГРАФИК)
// ==========================================
function renderWeekView() {
  const activeHabits = getActiveHabits();
  const weekDates = getWeekDates(currentWeekOffset);
  const todayISO = toISODate(new Date());

  const startStr = `${weekDates[0].getDate()}.${String(weekDates[0].getMonth() + 1).padStart(2, '0')}`;
  const endStr = `${weekDates[6].getDate()}.${String(weekDates[6].getMonth() + 1).padStart(2, '0')}.${weekDates[6].getFullYear()}`;
  document.getElementById('week-dates-label').innerText = `${startStr} — ${endStr}`;

  // 1. Шапка таблицы
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

  // 2. Строки таблицы
  const tbody = document.getElementById('habits-body');
  tbody.innerHTML = '';

  // Если привычек нет — информационная плашка
  if (activeHabits.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="12" style="padding: 35px 15px; color: #64748b; font-size: 0.88rem; font-weight: 500;">
        Целей пока нет. Нажми «${currentMode === 'personal' ? '+ Добавить цель' : '+ Добавить совместную цель'}», чтобы начать ✨
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

  // 3. Общие показатели недели
  const overallPercent = weekTotalTarget > 0 ? Math.round((weekTotalDone / weekTotalTarget) * 100) : 0;
  document.getElementById('total-done-ratio').innerText = `${weekTotalDone} / ${weekTotalTarget}`;
  document.getElementById('total-percent-label').innerText = `${overallPercent}%`;

  // 4. Столбчатый график с динамическим светофором
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

function toggleHistoryDay(isoDate, habitId) {
  const key = `${isoDate}_${habitId}`;
  if (historyData[key]) {
    delete historyData[key];
  } else {
    historyData[key] = true;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
  }

  saveStorage();
  renderWeekView();
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
// 5. МЕСЯЧНЫЙ ЭКРАН (КРУГОВАЯ ДИАГРАММА)
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
// 6. ДОБАВЛЕНИЕ И УДАЛЕНИЕ ПРИВЫЧЕК
// ==========================================
let chosenIcon = "🏋️";
const COLOR_PALETTE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

function openAddModal() {
  document.getElementById('add-modal').classList.add('active');
  document.getElementById('habit-name-input').focus();
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

function saveNewHabit() {
  const nameInput = document.getElementById('habit-name-input');
  const targetInput = document.getElementById('habit-target-input');

  const title = nameInput.value.trim();
  if (!title) {
    alert("Введите название!");
    return;
  }

  const activeHabits = getActiveHabits();
  const randomColor = COLOR_PALETTE[activeHabits.length % COLOR_PALETTE.length];

  const newHabit = {
    id: Date.now(),
    name: title,
    icon: chosenIcon,
    target: parseInt(targetInput.value) || 3,
    color: randomColor
  };

  activeHabits.push(newHabit);
  saveStorage();

  nameInput.value = '';
  closeAddModal();
  renderWeekView();

  confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
}

function deleteHabit(id) {
  if (confirm("Удалить эту цель?")) {
    if (currentMode === 'personal') {
      personalHabits = personalHabits.filter(h => h.id !== id);
    } else {
      coupleHabits = coupleHabits.filter(h => h.id !== id);
    }
    saveStorage();
    renderWeekView();
  }
}

// ==========================================
// 7. СОХРАНЕНИЕ
// ==========================================
function saveStorage() {
  localStorage.setItem('my_personal_habits', JSON.stringify(personalHabits));
  localStorage.setItem('my_couple_habits', JSON.stringify(coupleHabits));
  localStorage.setItem('my_habit_history', JSON.stringify(historyData));
}
