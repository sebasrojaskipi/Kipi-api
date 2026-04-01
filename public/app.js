// ═══════════════════════════════════════════
// KIPI Dashboard — Frontend
// ═══════════════════════════════════════════

const API = window.location.origin;
let currentUser = null;
// Usar hora de Perú (UTC-5) para determinar el mes actual
function peruMonth() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
let currentMonth = peruMonth();
let chartCategories = null;
let chartMonthly = null;
let txOffset = 0;
const TX_LIMIT = 20;

// ─── Colors ───
const CAT_COLORS = {
  comida: '#f97316',
  transporte: '#3b82f6',
  hogar: '#8b5cf6',
  entretenimiento: '#ec4899',
  compras: '#f59e0b',
  salud: '#10b981',
  'educacion / trabajo': '#06b6d4',
  otros: '#6b7280',
};

function getColor(cat) {
  return CAT_COLORS[cat.toLowerCase()] || '#6b7280';
}

// ─── Formatters ───
function fmt(amount, symbol) {
  symbol = symbol || 'S/';
  return `${symbol} ${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', loadUsers);

async function loadUsers() {
  try {
    // Get all users via backup endpoint or direct query
    const resp = await fetch(`${API}/api/users`);
    if (!resp.ok) throw new Error('No users endpoint');
    const users = await resp.json();

    const container = document.getElementById('user-list');
    if (!users.length) {
      container.innerHTML = '<p class="text-gray-400 text-sm">No hay usuarios registrados</p>';
      return;
    }

    container.innerHTML = users.map(u => `
      <button onclick="selectUser(${u.id}, '${(u.nickname || u.name || '').replace(/'/g, "\\'")}', '${u.currency_symbol || 'S/'}')"
        class="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-kipi-500 hover:bg-kipi-50 transition-colors text-left">
        <div class="w-10 h-10 rounded-full bg-kipi-100 flex items-center justify-center text-kipi-700 font-bold text-sm">
          ${(u.nickname || u.name || '?')[0].toUpperCase()}
        </div>
        <div>
          <p class="font-medium text-gray-800 text-sm">${u.nickname || u.name}</p>
          <p class="text-xs text-gray-400">${u.phone_number || ''}</p>
        </div>
        ${u.is_premium ? '<span class="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Premium</span>' : ''}
      </button>
    `).join('');
  } catch (e) {
    console.error(e);
    document.getElementById('user-list').innerHTML = '<p class="text-red-400 text-sm">Error cargando usuarios</p>';
  }
}

function selectUser(id, name, symbol) {
  currentUser = { id, name, symbol };
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
  document.getElementById('header-name').textContent = name;
  setupMonthSelect();
  loadDashboard();
}

function logout() {
  currentUser = null;
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  if (chartCategories) { chartCategories.destroy(); chartCategories = null; }
  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }
}

// ─── Month Selector ───
function setupMonthSelect() {
  const sel = document.getElementById('month-select');
  sel.innerHTML = '';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    sel.innerHTML += `<option value="${val}" ${val === currentMonth ? 'selected' : ''}>${label.charAt(0).toUpperCase() + label.slice(1)}</option>`;
  }
  sel.onchange = () => {
    currentMonth = sel.value;
    loadDashboard();
  };
}

// ─── Load Dashboard ───
async function loadDashboard() {
  if (!currentUser) return;
  txOffset = 0;

  try {
    const [dashResp, statsResp] = await Promise.all([
      fetch(`${API}/api/dashboard/${currentUser.id}?month=${currentMonth}`),
      fetch(`${API}/api/stats/${currentUser.id}/monthly`),
    ]);

    const dash = await dashResp.json();
    const stats = await statsResp.json();

    renderStats(dash);
    renderProjection(dash);
    renderCategoryChart(dash.categories || []);
    renderCategoryTable(dash);
    renderMonthlyChart(stats);
    await loadTransactions(true);
  } catch (e) {
    console.error('Dashboard error:', e);
  }
}

// ─── Render Stats ───
function renderStats(d) {
  const sym = currentUser.symbol;
  const budget = Number(d.monthly_budget) || 0;
  const spent = Number(d.total_spent) || 0;
  const remaining = Number(d.remaining) || 0;
  const income = Number(d.total_income) || 0;
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;

  document.getElementById('s-budget').textContent = fmt(budget, sym);
  document.getElementById('s-spent').textContent = fmt(spent, sym);
  document.getElementById('s-remaining').textContent = fmt(remaining, sym);
  document.getElementById('s-income').textContent = fmt(income, sym);

  const bar = document.getElementById('s-bar');
  bar.style.width = pct + '%';
  bar.className = `h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-kipi-500'}`;

  // Color remaining
  const remEl = document.getElementById('s-remaining');
  remEl.className = `text-2xl font-bold mt-1 ${remaining < 0 ? 'text-red-500' : 'text-kipi-600'}`;
}

// ─── Projection ───
function renderProjection(d) {
  const banner = document.getElementById('projection-banner');
  const projection = Number(d.projection) || 0;
  const budget = Number(d.monthly_budget) || 0;

  if (projection > budget && d.days_remaining > 0) {
    const sym = currentUser.symbol;
    document.getElementById('projection-text').textContent =
      `A este ritmo, terminaras el mes gastando ${fmt(projection, sym)} (${fmt(projection - budget, sym)} sobre tu presupuesto). Te quedan ${d.days_remaining} dias.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ─── Category Donut Chart ───
function renderCategoryChart(categories) {
  const ctx = document.getElementById('chart-categories');
  if (chartCategories) chartCategories.destroy();

  if (!categories.length) {
    chartCategories = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'] }] },
      options: { plugins: { legend: { display: false } } }
    });
    return;
  }

  chartCategories = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => c.category.charAt(0).toUpperCase() + c.category.slice(1)),
      datasets: [{
        data: categories.map(c => Number(c.total)),
        backgroundColor: categories.map(c => getColor(c.category)),
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      cutout: '65%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${fmt(ctx.raw, currentUser.symbol)}`
          }
        }
      }
    }
  });
}

// ─── Category Table ───
function renderCategoryTable(dash) {
  const tbody = document.getElementById('category-table');
  const categories = dash.categories || [];
  const budget = Number(dash.monthly_budget) || 0;
  const sym = currentUser.symbol;

  // Try to parse budget config for category budgets
  let budgetConfig = {};
  try {
    if (dash.user && dash.user.budget_config_json) {
      budgetConfig = JSON.parse(dash.user.budget_config_json);
    }
  } catch (e) {}

  if (!categories.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-6">Sin gastos este mes</td></tr>';
    return;
  }

  tbody.innerHTML = categories.map(c => {
    const spent = Number(c.total);
    const catBudget = budgetConfig[c.category] ? Number(budgetConfig[c.category].amount) : 0;
    const pct = catBudget > 0 ? Math.round((spent / catBudget) * 100) : 0;
    const barColor = pct >= 120 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-kipi-500';

    return `
      <tr class="border-b border-gray-50 hover:bg-gray-50">
        <td class="py-2.5">
          <span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:${getColor(c.category)}"></span>
          ${c.category.charAt(0).toUpperCase() + c.category.slice(1)}
        </td>
        <td class="py-2.5 text-right font-medium">${fmt(spent, sym)}</td>
        <td class="py-2.5 text-right text-gray-400">${catBudget > 0 ? fmt(catBudget, sym) : '-'}</td>
        <td class="py-2.5 text-right ${pct >= 120 ? 'text-red-500 font-medium' : pct >= 80 ? 'text-amber-600' : 'text-gray-500'}">${catBudget > 0 ? pct + '%' : '-'}</td>
        <td class="py-2.5">
          ${catBudget > 0 ? `<div class="w-full bg-gray-100 rounded-full h-1.5"><div class="${barColor} h-1.5 rounded-full" style="width:${Math.min(pct, 100)}%"></div></div>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Monthly Trend Chart ───
function renderMonthlyChart(stats) {
  const ctx = document.getElementById('chart-monthly');
  if (chartMonthly) chartMonthly.destroy();

  const data = (stats || []).reverse().slice(-6);

  if (!data.length) {
    chartMonthly = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['Sin datos'], datasets: [{ data: [0], backgroundColor: '#e5e7eb' }] },
      options: { plugins: { legend: { display: false } } }
    });
    return;
  }

  const labels = data.map(s => {
    const [y, m] = s.month.split('-');
    return new Date(y, m - 1).toLocaleDateString('es-PE', { month: 'short' }).toUpperCase();
  });

  chartMonthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Gastos',
          data: data.map(s => Number(s.total_gastos)),
          backgroundColor: '#f87171',
          borderRadius: 6,
          barPercentage: 0.6,
        },
        {
          label: 'Ingresos',
          data: data.map(s => Number(s.total_ingresos)),
          backgroundColor: '#60a5fa',
          borderRadius: 6,
          barPercentage: 0.6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => currentUser.symbol + ' ' + v.toLocaleString(),
            font: { size: 10 }
          },
          grid: { color: '#f3f4f6' }
        },
        x: { grid: { display: false }, ticks: { font: { size: 10 } } }
      },
      plugins: {
        legend: { labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.raw, currentUser.symbol)}`
          }
        }
      }
    }
  });
}

// ─── Transactions ───
async function loadTransactions(reset) {
  if (reset) txOffset = 0;

  const resp = await fetch(`${API}/api/transactions/${currentUser.id}?month=${currentMonth}&limit=${TX_LIMIT}&offset=${txOffset}`);
  const txs = await resp.json();

  const container = document.getElementById('tx-list');
  const empty = document.getElementById('tx-empty');
  const btnMore = document.getElementById('btn-more');

  if (reset) container.innerHTML = '';

  if (!txs.length && txOffset === 0) {
    empty.classList.remove('hidden');
    btnMore.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  btnMore.classList.toggle('hidden', txs.length < TX_LIMIT);

  const sym = currentUser.symbol;
  container.innerHTML += txs.map(tx => {
    const isGasto = tx.type === 'gasto';
    return `
      <div class="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 fade-in">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs ${isGasto ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}">
          ${isGasto ? '&#8595;' : '&#8593;'}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800 truncate">${tx.commerce || tx.subcategory || tx.category || '-'}</p>
          <p class="text-xs text-gray-400">${fmtDate(tx.transaction_date)} &middot; ${tx.category || ''}</p>
        </div>
        <p class="text-sm font-semibold ${isGasto ? 'text-red-500' : 'text-blue-500'}">
          ${isGasto ? '-' : '+'}${fmt(tx.amount, sym)}
        </p>
      </div>
    `;
  }).join('');

  txOffset += txs.length;
}

function loadMoreTransactions() {
  loadTransactions(false);
}
