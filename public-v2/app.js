// ═══════════════════════════════════════════
// KIPI Dashboard v2 — Frontend
// ═══════════════════════════════════════════

const API = window.location.origin;
let currentUser = null;
let fullUserData = null;
let selectedUserData = null;

function peruMonth() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

let currentMonth = peruMonth();
let chartCategories = null;
let chartMonthly = null;
let chartWeekday = null;
let chartCatTrend = null;
let chartCumulative = null;
let chartSubcategories = null;
let txOffset = 0;
const TX_LIMIT = 20;

// ─── Category Colors ───
const CAT_COLORS = {
  comida: '#f97316', transporte: '#3b82f6', hogar: '#8b5cf6',
  entretenimiento: '#ec4899', compras: '#f59e0b', salud: '#10b981',
  'educacion / trabajo': '#06b6d4', otros: '#6b7280',
};
function getColor(cat) { return CAT_COLORS[cat.toLowerCase()] || '#6b7280'; }

// ─── Formatters ───
function fmt(amount, symbol) {
  symbol = symbol || 'S/';
  return `${symbol} ${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtShort(amount, symbol) {
  symbol = symbol || 'S/';
  return `${symbol} ${Math.round(Number(amount)).toLocaleString('es-PE')}`;
}
function fmtDate(dateStr) {
  if (!dateStr) return '-';
  // Handle both "2026-04-02" and "2026-04-02T05:00:00.000Z" formats
  const raw = String(dateStr).slice(0, 10);
  const d = new Date(raw + 'T00:00:00');
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

// ═══════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════

function switchView(view) {
  // Hide all views
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  // Show target
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    const isActive = btn.dataset.nav === view;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('text-ink-light', !isActive);
    if (isActive) {
      btn.classList.remove('text-ink-light');
      // Desktop: underline
      btn.classList.add('border-brand-600');
    } else {
      btn.classList.remove('border-brand-600');
    }
  });

  // Show/hide month selector (on dashboard and insights)
  const monthSel = document.getElementById('month-select');
  monthSel.style.display = (view === 'dashboard' || view === 'insights') ? '' : 'none';

  // Lazy-load views
  if (view === 'insights') loadInsights();
  if (view === 'profile') loadProfile();
  if (view === 'subscription') loadSubscription();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════
// LOGIN FLOW
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  setupPhoneForm();
  setupPasswordForm();
  setupFaq();
  document.getElementById('phone-input').focus();
});

function setupPhoneForm() {
  document.getElementById('phone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('phone-input').value.trim();
    if (!phone) { showPhoneError('Ingresa tu número de teléfono'); return; }

    const btnText = document.getElementById('phone-btn-text');
    const btnLoader = document.getElementById('phone-btn-loader');
    const submitBtn = document.getElementById('phone-submit');
    btnText.classList.add('hidden'); btnLoader.classList.remove('hidden'); submitBtn.disabled = true;

    try {
      const resp = await fetch(`${API}/api/auth/lookup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await resp.json();
      if (!resp.ok) { showPhoneError(data.error || 'Usuario no encontrado'); return; }

      showPasswordStep({
        id: data.id,
        nickname: data.nickname || data.name || '',
        name: data.name || '',
        phone: data.phone_number || phone,
        symbol: data.currency_symbol || 'S/',
        is_premium: data.is_premium || 0,
        has_password: data.has_password || 0,
      });
    } catch (err) {
      console.warn('API unavailable, using demo mode:', err.message);
      // Demo mode: skip lookup and password, go straight to dashboard
      enterDashboard({
        id: 0, nickname: 'Demo', name: 'Usuario Demo',
        phone: phone, symbol: 'S/', is_premium: 1, has_password: 0,
      }, { is_premium: 1 });
      return;
    } finally {
      btnText.classList.remove('hidden'); btnLoader.classList.add('hidden'); submitBtn.disabled = false;
    }
  });
}

function showPhoneError(msg) {
  document.getElementById('phone-error-text').textContent = msg;
  document.getElementById('phone-error').classList.remove('hidden');
  const input = document.getElementById('phone-input');
  input.classList.add('ring-2', 'ring-red-400', 'border-red-400');
  setTimeout(() => input.classList.remove('ring-2', 'ring-red-400', 'border-red-400'), 1500);
}

function showPasswordStep(userData) {
  selectedUserData = userData;
  document.getElementById('sel-avatar').textContent = userData.nickname[0].toUpperCase();
  document.getElementById('sel-name').textContent = userData.nickname || userData.name;
  document.getElementById('sel-phone').textContent = userData.phone;
  document.getElementById('sel-premium').classList.toggle('hidden', !userData.is_premium);

  const hasPassword = userData.has_password;
  document.getElementById('pw-setup-hint').classList.toggle('hidden', !!hasPassword);
  document.getElementById('pw-btn-text').textContent = hasPassword ? 'Ingresar' : 'Crear contraseña e ingresar';

  document.getElementById('step-phone').classList.add('hidden');
  document.getElementById('step-password').classList.remove('hidden');
  document.getElementById('pw-input').value = '';
  document.getElementById('pw-error').classList.add('hidden');
  document.getElementById('pw-input').focus();
}

function setupPasswordForm() {
  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('step-password').classList.add('hidden');
    document.getElementById('step-phone').classList.remove('hidden');
    document.getElementById('phone-input').focus();
    selectedUserData = null;
  });

  const pwInput = document.getElementById('pw-input');
  const pwToggle = document.getElementById('pw-toggle');
  pwToggle.addEventListener('click', () => {
    const isPassword = pwInput.type === 'password';
    pwInput.type = isPassword ? 'text' : 'password';
    pwToggle.textContent = isPassword ? 'visibility' : 'visibility_off';
  });

  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = pwInput.value.trim();
    if (!password || password.length < 4) { showPwError('Mínimo 4 caracteres'); return; }

    const btnText = document.getElementById('pw-btn-text');
    const btnLoader = document.getElementById('pw-btn-loader');
    const submitBtn = document.getElementById('pw-submit');
    btnText.classList.add('hidden'); btnLoader.classList.remove('hidden'); submitBtn.disabled = true;

    try {
      const resp = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUserData.id, password }),
      });
      const data = await resp.json();
      if (!resp.ok) { showPwError(data.error || 'Error de autenticación'); return; }
      enterDashboard(selectedUserData, data.user);
    } catch (err) {
      console.error(err); showPwError('Error de conexión');
    } finally {
      btnText.classList.remove('hidden'); btnLoader.classList.add('hidden'); submitBtn.disabled = false;
    }
  });
}

function showPwError(msg) {
  document.getElementById('pw-error-text').textContent = msg;
  document.getElementById('pw-error').classList.remove('hidden');
  const input = document.getElementById('pw-input');
  input.classList.add('ring-2', 'ring-red-400', 'border-red-400');
  setTimeout(() => input.classList.remove('ring-2', 'ring-red-400', 'border-red-400'), 1500);
}


// ═══════════════════════════════════════════
// DASHBOARD CORE
// ═══════════════════════════════════════════

function enterDashboard(userData, user) {
  fullUserData = user;
  currentUser = {
    id: userData.id,
    name: userData.nickname || userData.name,
    symbol: userData.symbol,
    is_premium: user?.is_premium || userData.is_premium,
  };

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
  document.getElementById('header-name').textContent = currentUser.name;
  document.getElementById('header-premium').classList.toggle('hidden', !currentUser.is_premium);

  setupMonthSelect();
  switchView('dashboard');
  loadDashboard();
}

function logout() {
  currentUser = null; fullUserData = null; selectedUserData = null;
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('step-password').classList.add('hidden');
  document.getElementById('step-phone').classList.remove('hidden');
  [chartCategories, chartMonthly, chartWeekday, chartCatTrend, chartCumulative, chartSubcategories].forEach(c => { if (c) c.destroy(); });
  chartCategories = chartMonthly = chartWeekday = chartCatTrend = chartCumulative = chartSubcategories = null;
}

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
  sel.onchange = () => { currentMonth = sel.value; loadDashboard(); };
}

let lastDash = null;

// Mock data for local development (when DB is unavailable)
const MOCK_DASH = {
  monthly_budget: 4000, total_spent: 3248.50, total_income: 5200,
  remaining: 751.50, total_transactions: 47, days_passed: 22, days_remaining: 8, days_in_month: 30,
  daily_average: 147.66, projection: 4429.80, over_budget: 429.80,
  prev_month_spent: 3150, prev_month_income: 4800,
  prev_month_categories: [
    { category: 'comida', total: 980 }, { category: 'transporte', total: 520 },
    { category: 'hogar', total: 750 }, { category: 'entretenimiento', total: 400 },
  ],
  categories: [
    { category: 'comida', total: 1120 }, { category: 'hogar', total: 890 },
    { category: 'transporte', total: 580 }, { category: 'entretenimiento', total: 358.50 },
    { category: 'compras', total: 200 }, { category: 'salud', total: 100 },
  ],
  user: { budget_config_json: '{"comida":{"amount":1000},"hogar":{"amount":800},"transporte":{"amount":600},"entretenimiento":{"amount":400},"compras":{"amount":300},"salud":{"amount":200}}' },
};
const MOCK_STATS = [
  { month: '2025-12', total_gastos: 3800, total_ingresos: 4500 },
  { month: '2026-01', total_gastos: 3400, total_ingresos: 4800 },
  { month: '2026-02', total_gastos: 3150, total_ingresos: 5000 },
  { month: '2026-03', total_gastos: 3248.50, total_ingresos: 5200 },
];
const MOCK_SUBCATEGORIES = [
  { subcategory: 'supermercado', total: 620, count: 12 },
  { subcategory: 'restaurantes', total: 380, count: 8 },
  { subcategory: 'alquiler', total: 600, count: 1 },
  { subcategory: 'servicios', total: 290, count: 4 },
  { subcategory: 'taxi', total: 280, count: 15 },
  { subcategory: 'streaming', total: 158.50, count: 3 },
  { subcategory: 'ropa', total: 200, count: 2 },
  { subcategory: 'farmacia', total: 100, count: 3 },
];
const MOCK_TXS = [
  { type:'gasto', commerce:'Wong Supermercado', category:'comida', subcategory:'supermercado', amount:85.50, transaction_date:'2026-03-28' },
  { type:'gasto', commerce:'Uber', category:'transporte', subcategory:'taxi', amount:12.00, transaction_date:'2026-03-28' },
  { type:'ingreso', commerce:'Sueldo marzo', category:'ingreso', subcategory:'sueldo', amount:5200, transaction_date:'2026-03-27' },
  { type:'gasto', commerce:'Netflix', category:'entretenimiento', subcategory:'streaming', amount:44.90, transaction_date:'2026-03-26' },
  { type:'gasto', commerce:'Sedapal', category:'hogar', subcategory:'servicios', amount:65.00, transaction_date:'2026-03-25' },
];

async function loadDashboard() {
  if (!currentUser) return;
  txOffset = 0;
  try {
    const [dashResp, statsResp, subResp] = await Promise.all([
      fetch(`${API}/api/dashboard/${currentUser.id}?month=${currentMonth}`),
      fetch(`${API}/api/stats/${currentUser.id}/monthly`),
      fetch(`${API}/api/stats/${currentUser.id}/subcategories?month=${currentMonth}`),
    ]);
    if (!dashResp.ok) throw new Error('API error');
    const dash = await dashResp.json();
    const stats = await statsResp.json();
    const subcategories = await subResp.json();
    lastDash = dash;

    renderStats(dash);
    renderInsightBubble(dash);
    renderCategoryChart(dash.categories || []);
    renderCategoryTable(dash);
    renderMonthlyChart(stats);
    renderSubcategoryChart(subcategories);
    await loadTransactions(true);
  } catch (e) {
    console.warn('API unavailable, using mock data:', e.message);
    lastDash = MOCK_DASH;
    renderStats(MOCK_DASH);
    renderInsightBubble(MOCK_DASH);
    renderCategoryChart(MOCK_DASH.categories);
    renderCategoryTable(MOCK_DASH);
    renderMonthlyChart(MOCK_STATS);
    renderSubcategoryChart(MOCK_SUBCATEGORIES);
    renderMockTransactions();
  }
}

// ─── Stats ───
function renderStats(d) {
  const sym = currentUser.symbol;
  const budget = Number(d.monthly_budget) || 0;
  const spent = Number(d.total_spent) || 0;
  const income = Number(d.total_income) || 0;
  const balance = income - spent;
  const saving = budget - spent;
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const pctClamped = Math.min(pct, 100);
  const prevSpent = Number(d.prev_month_spent) || 0;
  const prevIncome = Number(d.prev_month_income) || 0;

  // Card 1: GASTADO
  const spentEl = document.getElementById('s-spent');
  spentEl.textContent = fmt(spent, sym);
  // Color based on budget proximity
  if (pct > 90) {
    spentEl.className = 'text-base sm:text-xl lg:text-2xl font-bold truncate text-red-500';
    document.getElementById('spent-icon-bg').className = 'w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center';
  } else if (pct >= 60) {
    spentEl.className = 'text-base sm:text-xl lg:text-2xl font-bold truncate text-amber-500';
    document.getElementById('spent-icon-bg').className = 'w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center';
  } else {
    spentEl.className = 'text-base sm:text-xl lg:text-2xl font-bold truncate text-brand-600';
    document.getElementById('spent-icon-bg').className = 'w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center';
  }
  const bar = document.getElementById('s-bar');
  bar.style.width = pctClamped + '%';
  bar.className = `h-1.5 rounded-full transition-all duration-500 ${pct > 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-400' : 'bg-brand-500'}`;
  document.getElementById('s-spent-detail').textContent = budget > 0 ? `${Math.round(pct)}% de ${fmt(budget, sym)}` : '-';

  // Spent comparison badge
  const spentBadge = document.getElementById('s-spent-badge');
  if (prevSpent > 0) {
    const spentDiff = Math.round(((spent - prevSpent) / prevSpent) * 100);
    spentBadge.textContent = `${spentDiff >= 0 ? '+' : ''}${spentDiff}% vs mes anterior`;
    spentBadge.className = `mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block ${spentDiff > 0 ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'}`;
    spentBadge.classList.remove('hidden');
  } else { spentBadge.classList.add('hidden'); }

  // Card 2: INGRESO
  document.getElementById('s-income').textContent = fmt(income, sym);
  const incomeBadge = document.getElementById('s-income-badge');
  if (prevIncome > 0) {
    const incDiff = Math.round(((income - prevIncome) / prevIncome) * 100);
    incomeBadge.textContent = `${incDiff >= 0 ? '+' : ''}${incDiff}% vs mes anterior`;
    incomeBadge.className = `mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block ${incDiff >= 0 ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'}`;
    incomeBadge.classList.remove('hidden');
  } else { incomeBadge.classList.add('hidden'); }

  // Card 3: BALANCE
  const balanceEl = document.getElementById('s-balance');
  balanceEl.textContent = fmt(balance, sym);
  balanceEl.className = `text-base sm:text-xl lg:text-2xl font-bold truncate ${balance >= 0 ? 'text-brand-600' : 'text-red-500'}`;

  // Card 4: AHORRO
  const savingEl = document.getElementById('s-saving');
  savingEl.textContent = fmt(saving, sym);
  savingEl.className = `text-base sm:text-xl lg:text-2xl font-bold truncate ${saving >= 0 ? 'text-brand-600' : 'text-red-500'}`;
  document.getElementById('s-saving-detail').textContent = saving >= 0 ? 'Ahorraste vs presupuesto' : 'Excediste tu presupuesto';
}

// ─── Insight Bubble ───
function renderInsightBubble(d) {
  const bubble = document.getElementById('insight-bubble');
  const textEl = document.getElementById('insight-text');
  const titleEl = document.getElementById('insight-title');
  const iconEl = document.getElementById('insight-icon');
  const iconBg = document.getElementById('insight-icon-bg');
  const sym = currentUser.symbol;
  const budget = Number(d.monthly_budget) || 0;
  const spent = Number(d.total_spent) || 0;
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const categories = d.categories || [];
  const topCat = categories.length > 0 ? categories[0] : null;
  const topCatName = topCat ? topCat.category.charAt(0).toUpperCase() + topCat.category.slice(1) : '';
  const topCatAmount = topCat ? fmt(Number(topCat.total), sym) : '';

  let msg = '';
  let color = '';

  if (pct > 100) {
    // Over budget
    msg = `Ya te pasaste del presupuesto. Llevas ${fmt(spent, sym)} gastados de ${fmt(budget, sym)}. Tu mayor gasto es en ${topCatName} (${topCatAmount}). Intenta no gastar mas en esa categoria el resto del mes.`;
    color = 'red';
    iconEl.textContent = 'warning';
    titleEl.textContent = 'Presupuesto excedido';
  } else if (pct >= 80) {
    // Close to budget
    const remaining = budget - spent;
    msg = `Cuidado, ya usaste el ${Math.round(pct)}% de tu presupuesto. Te queda ${fmt(remaining, sym)} y ${d.days_remaining} dias. Tu categoria mas alta es ${topCatName} (${topCatAmount}).`;
    color = 'amber';
    iconEl.textContent = 'info';
    titleEl.textContent = 'Cerca del limite';
  } else if (spent === 0) {
    msg = `Aun no tienes gastos registrados este mes. Registra tu primer gasto desde WhatsApp.`;
    color = 'blue';
    iconEl.textContent = 'lightbulb';
    titleEl.textContent = 'Empieza a registrar';
  } else {
    // Well under budget
    const saving = budget - spent;
    msg = `Vas bien. Llevas ${fmt(spent, sym)} de ${fmt(budget, sym)} (${Math.round(pct)}%). Si sigues asi, ahorras ${fmt(saving, sym)} este mes.${topCat ? ` Tu mayor gasto es ${topCatName} (${topCatAmount}).` : ''}`;
    color = 'brand';
    iconEl.textContent = 'thumb_up';
    titleEl.textContent = 'Buen ritmo';
  }

  const colorMap = {
    red: { bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-100', iconColor: 'text-red-600', titleColor: 'text-red-700', textColor: 'text-red-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', titleColor: 'text-amber-700', textColor: 'text-amber-800' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', titleColor: 'text-blue-700', textColor: 'text-blue-800' },
    brand: { bg: 'bg-brand-50', border: 'border-brand-200', iconBg: 'bg-brand-100', iconColor: 'text-brand-600', titleColor: 'text-brand-700', textColor: 'text-brand-800' },
  };
  const c = colorMap[color];
  bubble.className = `${c.bg} border ${c.border} rounded-2xl p-4 flex items-start gap-3 fade-up`;
  iconBg.className = `w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${c.iconBg}`;
  iconEl.className = `material-symbols-outlined text-lg ${c.iconColor}`;
  titleEl.className = `text-xs font-bold uppercase tracking-wider mb-1 ${c.titleColor}`;
  textEl.className = `text-sm leading-relaxed ${c.textColor}`;
  textEl.textContent = msg;
  bubble.classList.remove('hidden');
}

// ─── Category Donut ───
function renderCategoryChart(categories) {
  const ctx = document.getElementById('chart-categories');
  if (chartCategories) chartCategories.destroy();
  if (!categories.length) {
    chartCategories = new Chart(ctx, { type:'doughnut', data:{ labels:['Sin datos'], datasets:[{ data:[1], backgroundColor:['#e2e4e3'] }] }, options:{ plugins:{ legend:{ display:false } } } });
    return;
  }
  chartCategories = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => c.category.charAt(0).toUpperCase() + c.category.slice(1)),
      datasets: [{ data: categories.map(c => Number(c.total)), backgroundColor: categories.map(c => getColor(c.category)), borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      cutout: '68%', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position:'right', labels:{ boxWidth:10, padding:14, font:{ size:11, family:'Inter' }, usePointStyle:true } },
        tooltip: { backgroundColor:'#1a1d1b', cornerRadius:8, padding:10, bodyFont:{ family:'Inter', size:12 }, callbacks:{ label: ctx => ` ${ctx.label}: ${fmt(ctx.raw, currentUser.symbol)}` } }
      }
    }
  });
}

// ─── Category Table ───
function renderCategoryTable(dash) {
  const container = document.getElementById('category-detail');
  const categories = dash.categories || [];
  const sym = currentUser.symbol;
  let budgetConfig = {};
  try { if (dash.user?.budget_config_json) budgetConfig = JSON.parse(dash.user.budget_config_json); } catch(e){}

  if (!categories.length) {
    container.innerHTML = '<p class="text-center text-ink-light py-8">Sin gastos este mes</p>';
    return;
  }

  container.innerHTML = categories.map(c => {
    const spent = Number(c.total);
    const catBudget = budgetConfig[c.category] ? Number(budgetConfig[c.category].amount) : 0;
    const pct = catBudget > 0 ? Math.round((spent / catBudget) * 100) : 0;
    const barColor = pct >= 120 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-brand-500';
    const pctColor = pct >= 120 ? 'text-red-500' : pct >= 80 ? 'text-amber-600' : 'text-brand-600';
    const overBadge = pct >= 100 ? `<span class="text-[10px] font-semibold bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">Excedido</span>` : '';

    return `<div class="py-3 border-b border-surface-low last:border-0">
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${getColor(c.category)}"></span>
          <span class="text-sm font-semibold truncate">${c.category.charAt(0).toUpperCase() + c.category.slice(1)}</span>
          ${overBadge}
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <span class="text-sm font-bold">${fmtShort(spent, sym)}</span>
          ${catBudget > 0 ? `<span class="text-xs text-ink-light">/ ${fmtShort(catBudget, sym)}</span>` : ''}
        </div>
      </div>
      ${catBudget > 0 ? `<div class="flex items-center gap-2">
        <div class="flex-1 bg-surface-mid rounded-full h-2">
          <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <span class="text-xs font-semibold ${pctColor} w-10 text-right">${pct}%</span>
      </div>` : ''}
    </div>`;
  }).join('');
}

// ─── Monthly Trend (Line Chart) ───
function renderMonthlyChart(stats) {
  const ctx = document.getElementById('chart-monthly');
  if (chartMonthly) chartMonthly.destroy();
  const data = (stats || []).reverse().slice(-6);
  if (!data.length) { chartMonthly = new Chart(ctx, { type:'line', data:{ labels:['Sin datos'], datasets:[{ data:[0] }] }, options:{ plugins:{ legend:{ display:false } } } }); return; }
  const labels = data.map(s => { const [y,m]=s.month.split('-'); return new Date(y, m-1).toLocaleDateString('es-PE',{month:'short'}).toUpperCase(); });
  chartMonthly = new Chart(ctx, {
    type:'line', data:{ labels, datasets:[
      { label:'Gastos', data:data.map(s=>Number(s.total_gastos)), borderColor:'#f87171', backgroundColor:'#f8717120', fill:false, tension:.3, borderWidth:2.5, pointRadius:5, pointHoverRadius:7, pointBackgroundColor:'#f87171', pointBorderColor:'#fff', pointBorderWidth:2 },
      { label:'Ingresos', data:data.map(s=>Number(s.total_ingresos)), borderColor:'#10b981', backgroundColor:'#10b98120', fill:false, tension:.3, borderWidth:2.5, pointRadius:5, pointHoverRadius:7, pointBackgroundColor:'#10b981', pointBorderColor:'#fff', pointBorderWidth:2 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>currentUser.symbol+' '+v.toLocaleString(), font:{size:10,family:'Inter'} }, grid:{color:'#f2f4f3'} }, x:{ grid:{display:false}, ticks:{font:{size:10,family:'Inter'}} } },
      plugins:{ legend:{labels:{boxWidth:10,padding:16,font:{size:11,family:'Inter'},usePointStyle:true}}, tooltip:{backgroundColor:'#1a1d1b',cornerRadius:8,padding:10,bodyFont:{family:'Inter',size:12},callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw,currentUser.symbol)}`}} }
    }
  });
}

// ─── Subcategory Chart ───
function renderSubcategoryChart(subcategories) {
  const ctx = document.getElementById('chart-subcategories');
  if (chartSubcategories) chartSubcategories.destroy();
  if (!subcategories || !subcategories.length) {
    chartSubcategories = new Chart(ctx, { type:'bar', data:{ labels:['Sin datos'], datasets:[{ data:[0], backgroundColor:'#e2e4e3' }] }, options:{ indexAxis:'y', plugins:{ legend:{ display:false } } } });
    return;
  }
  const labels = subcategories.map(s => {
    const name = s.subcategory || 'Sin subcategoria';
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
  const amounts = subcategories.map(s => Number(s.total));
  const colors = ['#f97316','#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#6b7280','#ef4444','#84cc16'];
  chartSubcategories = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Gastado', data: amounts, backgroundColor: amounts.map((_, i) => colors[i % colors.length]), borderRadius: 6, barPercentage: .7 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { beginAtZero:true, ticks:{ callback:v=>currentUser.symbol+' '+v.toLocaleString(), font:{size:10,family:'Inter'} }, grid:{color:'#f2f4f3'} }, y:{ grid:{display:false}, ticks:{font:{size:11,family:'Inter'}} } },
      plugins: { legend:{display:false}, tooltip:{ backgroundColor:'#1a1d1b', cornerRadius:8, padding:10, bodyFont:{family:'Inter',size:12}, callbacks:{ label:ctx=>` ${fmt(ctx.raw,currentUser.symbol)} (${subcategories[ctx.dataIndex].count} txs)` } } }
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
  if (!txs.length && txOffset === 0) { empty.classList.remove('hidden'); btnMore.classList.add('hidden'); return; }
  empty.classList.add('hidden');
  btnMore.classList.toggle('hidden', txs.length < TX_LIMIT);
  const sym = currentUser.symbol;
  container.innerHTML += txs.map(tx => {
    const isGasto = tx.type === 'gasto';
    return `<div class="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-surface-low transition-colors">
      <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isGasto?'bg-red-50':'bg-blue-50'}">
        <span class="material-symbols-outlined text-lg ${isGasto?'text-red-500':'text-blue-500'}">${isGasto?'south_west':'north_east'}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-ink truncate">${tx.commerce||tx.subcategory||tx.category||'-'}</p>
        <p class="text-xs text-ink-light">${fmtDate(tx.transaction_date)} &middot; ${tx.category||''}</p>
      </div>
      <p class="text-sm font-bold ${isGasto?'text-red-500':'text-blue-500'} tabular-nums">${isGasto?'-':'+'}${fmt(tx.amount,sym)}</p>
    </div>`;
  }).join('');
  txOffset += txs.length;
}
function loadMoreTransactions() { loadTransactions(false); }

function renderMockTransactions() {
  const container = document.getElementById('tx-list');
  const empty = document.getElementById('tx-empty');
  const sym = currentUser.symbol;
  empty.classList.add('hidden');
  container.innerHTML = MOCK_TXS.map(tx => {
    const isGasto = tx.type === 'gasto';
    return `<div class="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-surface-low transition-colors">
      <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isGasto?'bg-red-50':'bg-blue-50'}">
        <span class="material-symbols-outlined text-lg ${isGasto?'text-red-500':'text-blue-500'}">${isGasto?'south_west':'north_east'}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-ink truncate">${tx.commerce||tx.subcategory||tx.category||'-'}</p>
        <p class="text-xs text-ink-light">${fmtDate(tx.transaction_date)} &middot; ${tx.category||''}</p>
      </div>
      <p class="text-sm font-bold ${isGasto?'text-red-500':'text-blue-500'} tabular-nums">${isGasto?'-':'+'}${fmt(tx.amount,sym)}</p>
    </div>`;
  }).join('');
}


// ═══════════════════════════════════════════
// INSIGHTS VIEW
// ═══════════════════════════════════════════

async function loadInsights() {
  if (!currentUser) return;
  try {
    const [txResp, catTrendResp] = await Promise.all([
      fetch(`${API}/api/transactions/${currentUser.id}?month=${currentMonth}&limit=100&offset=0`),
      fetch(`${API}/api/stats/${currentUser.id}/categories`),
    ]);
    const txs = await txResp.json();
    const catTrends = await catTrendResp.json();
    const gastos = txs.filter(t => t.type === 'gasto');

    // Populate the 3 insight stat cards from lastDash
    renderInsightStats();
    renderInsightWarnings();
    renderTopSpending(gastos);
    renderWeekdayChart(gastos);
    renderCatTrendChart(catTrends);
    renderCumulativeChart(gastos);
  } catch(e) {
    console.warn('Insights API unavailable, using mock data:', e.message);
    const mockGastos = MOCK_TXS.filter(t => t.type === 'gasto');
    renderInsightStats();
    renderInsightWarnings();
    renderTopSpending(mockGastos);
    renderWeekdayChart(mockGastos);
    renderCatTrendChart([]);
    renderCumulativeChart(mockGastos);
  }
}

function renderInsightStats() {
  if (!lastDash) return;
  const sym = currentUser.symbol;
  document.getElementById('ins-daily-avg').textContent = fmt(lastDash.daily_average || 0, sym);
  document.getElementById('ins-projection').textContent = fmt(lastDash.projection || 0, sym);
  document.getElementById('ins-tx-count').textContent = lastDash.total_transactions || 0;

  // Color projection red if over budget
  const projEl = document.getElementById('ins-projection');
  const budget = Number(lastDash.monthly_budget) || 0;
  const projection = Number(lastDash.projection) || 0;
  projEl.className = `text-sm sm:text-xl lg:text-2xl font-bold truncate ${projection > budget ? 'text-red-500' : 'text-ink'}`;
}

function renderInsightWarnings() {
  const container = document.getElementById('insights-warnings');
  if (!lastDash) { container.innerHTML = ''; return; }
  const sym = currentUser.symbol;
  const budget = Number(lastDash.monthly_budget) || 0;
  const spent = Number(lastDash.total_spent) || 0;
  const prevSpent = Number(lastDash.prev_month_spent) || 0;
  const categories = lastDash.categories || [];
  const prevCategories = lastDash.prev_month_categories || [];
  let budgetConfig = {};
  try { if (lastDash.user?.budget_config_json) budgetConfig = JSON.parse(lastDash.user.budget_config_json); } catch(e){}

  const cards = [];

  // Total comparison card
  if (prevSpent > 0) {
    const diff = spent - prevSpent;
    const diffPct = Math.round((diff / prevSpent) * 100);
    const isMore = diff > 0;
    cards.push(`
      <div class="bg-white rounded-2xl border border-surface-high p-4 flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isMore ? 'bg-red-50' : 'bg-brand-50'}">
          <span class="material-symbols-outlined text-lg ${isMore ? 'text-red-500' : 'text-brand-600'}">${isMore ? 'trending_up' : 'trending_down'}</span>
        </div>
        <div>
          <p class="text-sm font-semibold text-ink">Comparativa mensual</p>
          <p class="text-sm text-ink-muted mt-0.5">Gastaste ${fmt(spent, sym)} vs ${fmt(prevSpent, sym)} el mes anterior (${diffPct >= 0 ? '+' : ''}${diffPct}%)</p>
        </div>
      </div>
    `);
  }

  // Categories over budget
  categories.forEach(c => {
    const catBudget = budgetConfig[c.category] ? Number(budgetConfig[c.category].amount) : 0;
    if (catBudget > 0 && Number(c.total) > catBudget) {
      const catName = c.category.charAt(0).toUpperCase() + c.category.slice(1);
      const prevCat = prevCategories.find(pc => pc.category === c.category);
      const prevTotal = prevCat ? Number(prevCat.total) : 0;
      const extraMsg = prevTotal > 0 && prevTotal < Number(c.total) ? ' El mes pasado gastaste menos.' : '';
      cards.push(`
        <div class="bg-red-50 rounded-2xl border border-red-200 p-4 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-100">
            <span class="material-symbols-outlined text-lg text-red-600">warning</span>
          </div>
          <div>
            <p class="text-sm font-semibold text-red-800">Limite excedido: ${catName}</p>
            <p class="text-sm text-red-700 mt-0.5">Llevas ${fmt(Number(c.total), sym)} de ${fmt(catBudget, sym)}.${extraMsg}</p>
          </div>
        </div>
      `);
    }
  });

  // Good habits: categories where spending decreased vs previous month
  categories.forEach(c => {
    const prevCat = prevCategories.find(pc => pc.category === c.category);
    if (prevCat && Number(c.total) < Number(prevCat.total)) {
      const catName = c.category.charAt(0).toUpperCase() + c.category.slice(1);
      const saved = Number(prevCat.total) - Number(c.total);
      cards.push(`
        <div class="bg-brand-50 rounded-2xl border border-brand-200 p-4 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-brand-100">
            <span class="material-symbols-outlined text-lg text-brand-600">thumb_up</span>
          </div>
          <div>
            <p class="text-sm font-semibold text-brand-800">Buen habito: ${catName}</p>
            <p class="text-sm text-brand-700 mt-0.5">Bajaste ${fmt(saved, sym)} en ${catName} vs el mes pasado.</p>
          </div>
        </div>
      `);
    }
  });

  container.innerHTML = cards.join('');
}

function renderTopSpending(gastos) {
  const container = document.getElementById('top-spending');
  const sorted = [...gastos].sort((a,b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  if (!sorted.length) { container.innerHTML = '<p class="text-ink-light text-sm text-center py-4">No hay gastos este mes</p>'; return; }
  const maxAmount = Number(sorted[0].amount);
  const sym = currentUser.symbol;
  container.innerHTML = sorted.map((tx, i) => {
    const pct = (Number(tx.amount) / maxAmount * 100);
    return `<div class="flex items-center gap-3">
      <span class="text-xs font-bold text-ink-light w-5 text-right">${i+1}</span>
      <div class="flex-1">
        <div class="flex justify-between mb-1">
          <span class="text-sm font-medium truncate">${tx.commerce || tx.category || '-'}</span>
          <span class="text-sm font-bold tabular-nums">${fmt(tx.amount, sym)}</span>
        </div>
        <div class="w-full bg-surface-mid rounded-full h-2">
          <div class="h-2 rounded-full transition-all" style="width:${pct}%; background:${getColor(tx.category||'otros')}"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderWeekdayChart(gastos) {
  const ctx = document.getElementById('chart-weekday');
  if (chartWeekday) chartWeekday.destroy();
  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const totals = [0,0,0,0,0,0,0];
  gastos.forEach(tx => {
    if (tx.transaction_date) {
      const d = new Date(tx.transaction_date + 'T00:00:00');
      totals[d.getDay()] += Number(tx.amount);
    }
  });
  const maxVal = Math.max(...totals, 1);
  chartWeekday = new Chart(ctx, {
    type: 'bar',
    data: { labels: days, datasets: [{ data: totals, backgroundColor: totals.map((v,i) => v === maxVal ? '#f97316' : '#10b981'), borderRadius: 8, barPercentage: .6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero:true, ticks:{ callback:v=>currentUser.symbol+' '+v.toLocaleString(), font:{size:10,family:'Inter'} }, grid:{color:'#f2f4f3'} }, x:{ grid:{display:false}, ticks:{font:{size:11,family:'Inter',weight:'600'}} } },
      plugins: { legend:{display:false}, tooltip:{ backgroundColor:'#1a1d1b', cornerRadius:8, padding:10, bodyFont:{family:'Inter',size:12}, callbacks:{ label:ctx=>` ${fmt(ctx.raw,currentUser.symbol)}` } } }
    }
  });
}

function renderCatTrendChart(catTrends) {
  const ctx = document.getElementById('chart-cat-trend');
  if (chartCatTrend) chartCatTrend.destroy();
  if (!catTrends.length) { chartCatTrend = new Chart(ctx, { type:'line', data:{ labels:['Sin datos'], datasets:[{data:[0]}] }, options:{plugins:{legend:{display:false}}} }); return; }

  // Group by month and category
  const monthsSet = new Set(); const catTotals = {};
  catTrends.forEach(r => { monthsSet.add(r.month); if (!catTotals[r.category]) catTotals[r.category] = {}; catTotals[r.category][r.month] = Number(r.total); });
  const months = [...monthsSet].sort().slice(-6);
  const labels = months.map(m => { const [y,mo]=m.split('-'); return new Date(y,mo-1).toLocaleDateString('es-PE',{month:'short'}).toUpperCase(); });

  // Top 4 categories by total
  const catSums = Object.entries(catTotals).map(([cat, data]) => ({ cat, total: Object.values(data).reduce((a,b)=>a+b,0) })).sort((a,b)=>b.total-a.total).slice(0,4);

  const datasets = catSums.map(({ cat }) => ({
    label: cat.charAt(0).toUpperCase() + cat.slice(1),
    data: months.map(m => catTotals[cat][m] || 0),
    borderColor: getColor(cat), backgroundColor: getColor(cat) + '20',
    fill: false, tension: .3, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6,
  }));

  chartCatTrend = new Chart(ctx, {
    type: 'line', data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero:true, ticks:{ callback:v=>currentUser.symbol+' '+v.toLocaleString(), font:{size:10,family:'Inter'} }, grid:{color:'#f2f4f3'} }, x:{ grid:{display:false}, ticks:{font:{size:10,family:'Inter'}} } },
      plugins: { legend:{ labels:{boxWidth:10,padding:16,font:{size:11,family:'Inter'},usePointStyle:true} }, tooltip:{ backgroundColor:'#1a1d1b', cornerRadius:8, padding:10, bodyFont:{family:'Inter',size:12}, callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw,currentUser.symbol)}` } } }
    }
  });
}

function renderCumulativeChart(gastos) {
  const ctx = document.getElementById('chart-cumulative');
  if (chartCumulative) chartCumulative.destroy();
  if (!gastos.length) { chartCumulative = new Chart(ctx, { type:'line', data:{ labels:['Sin datos'], datasets:[{data:[0]}] }, options:{plugins:{legend:{display:false}}} }); return; }

  // Group by day
  const [year, mon] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const dailyTotals = {};
  gastos.forEach(tx => {
    if (tx.transaction_date) {
      const day = new Date(tx.transaction_date + 'T00:00:00').getDate();
      dailyTotals[day] = (dailyTotals[day] || 0) + Number(tx.amount);
    }
  });

  const labels = []; const cumData = []; const budgetLine = [];
  const budget = lastDash ? Number(lastDash.monthly_budget) || 0 : 0;
  let cumulative = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(d);
    cumulative += (dailyTotals[d] || 0);
    cumData.push(Math.round(cumulative * 100) / 100);
    budgetLine.push(Math.round(budget / daysInMonth * d * 100) / 100);
  }

  chartCumulative = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Gasto acumulado', data: cumData, borderColor: '#f87171', backgroundColor: '#f8717120', fill: true, tension: .2, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5 },
      { label: 'Ritmo ideal', data: budgetLine, borderColor: '#10b981', borderDash: [6,4], fill: false, tension: 0, borderWidth: 2, pointRadius: 0 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero:true, ticks:{ callback:v=>currentUser.symbol+' '+v.toLocaleString(), font:{size:10,family:'Inter'} }, grid:{color:'#f2f4f3'} }, x:{ title:{display:true,text:'Día del mes',font:{size:10,family:'Inter'}}, grid:{display:false}, ticks:{font:{size:9,family:'Inter'},maxTicksLimit:15} } },
      plugins: { legend:{ labels:{boxWidth:10,padding:16,font:{size:11,family:'Inter'},usePointStyle:true} }, tooltip:{ backgroundColor:'#1a1d1b', cornerRadius:8, padding:10, bodyFont:{family:'Inter',size:12}, callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw,currentUser.symbol)}` } } }
    }
  });
}


// ═══════════════════════════════════════════
// PROFILE VIEW
// ═══════════════════════════════════════════

async function loadProfile() {
  if (!currentUser) return;
  try {
    const resp = await fetch(`${API}/api/user/${currentUser.id}`);
    const user = await resp.json();
    fullUserData = user;

    document.getElementById('prof-avatar').textContent = (user.nickname || user.name || '?')[0].toUpperCase();
    document.getElementById('prof-name').textContent = user.nickname || user.name;
    document.getElementById('prof-phone').textContent = user.phone_number || '';
    document.getElementById('prof-premium-badge').classList.toggle('hidden', !user.is_premium);

    document.getElementById('prof-fullname').value = user.name || '';
    document.getElementById('prof-nickname').value = user.nickname || '';
    document.getElementById('prof-email').value = user.email || '';
    document.getElementById('prof-currency').value = `${user.currency_symbol || 'S/'} (${user.currency_name || 'Soles'})`;
    document.getElementById('prof-budget').value = user.monthly_budget || '';

    document.getElementById('prof-success').classList.add('hidden');
  } catch(e) { console.error('Profile error:', e); }
}

async function saveProfile() {
  if (!currentUser) return;
  const btn = document.getElementById('prof-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const body = {
      name: document.getElementById('prof-fullname').value.trim(),
      nickname: document.getElementById('prof-nickname').value.trim(),
      email: document.getElementById('prof-email').value.trim(),
      monthly_budget: parseFloat(document.getElementById('prof-budget').value) || undefined,
    };
    const resp = await fetch(`${API}/api/user/${currentUser.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (resp.ok) {
      const updated = await resp.json();
      currentUser.name = updated.nickname || updated.name;
      document.getElementById('header-name').textContent = currentUser.name;
      document.getElementById('prof-name').textContent = currentUser.name;
      document.getElementById('prof-avatar').textContent = currentUser.name[0].toUpperCase();
      document.getElementById('prof-success').classList.remove('hidden');
      setTimeout(() => document.getElementById('prof-success').classList.add('hidden'), 3000);
    }
  } catch(e) { console.error('Save error:', e); }
  finally { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-lg">save</span> Guardar cambios'; }
}

async function changePassword() {
  const newPw = document.getElementById('prof-newpw').value.trim();
  const msgEl = document.getElementById('pw-change-msg');
  if (!newPw || newPw.length < 4) {
    msgEl.textContent = 'Mínimo 4 caracteres'; msgEl.className = 'text-red-500 text-sm text-center'; msgEl.classList.remove('hidden');
    return;
  }
  try {
    const resp = await fetch(`${API}/api/auth/change-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, new_password: newPw }),
    });
    if (resp.ok) {
      msgEl.textContent = 'Contraseña actualizada'; msgEl.className = 'text-brand-600 text-sm text-center'; msgEl.classList.remove('hidden');
      document.getElementById('prof-newpw').value = '';
    } else {
      const data = await resp.json();
      msgEl.textContent = data.error || 'Error'; msgEl.className = 'text-red-500 text-sm text-center'; msgEl.classList.remove('hidden');
    }
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
  } catch(e) { console.error(e); }
}


// ═══════════════════════════════════════════
// SUBSCRIPTION VIEW
// ═══════════════════════════════════════════

async function loadSubscription() {
  if (!currentUser) return;
  try {
    const resp = await fetch(`${API}/api/user/${currentUser.id}`);
    const user = await resp.json();
    const container = document.getElementById('sub-header');

    const isPremium = !!user.is_premium;
    const premiumUntil = user.premium_until ? new Date(user.premium_until).toLocaleDateString('es-PE', { day:'numeric', month:'long', year:'numeric' }) : null;

    if (isPremium) {
      container.innerHTML = `
        <div class="h-1.5 bg-gradient-to-r from-brand-400 to-brand-600 -mt-6 -mx-6 mb-6"></div>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center">
            <span class="material-symbols-outlined icon-filled text-brand-600 text-2xl">workspace_premium</span>
          </div>
          <div>
            <h3 class="font-headline font-bold text-lg">KIPI Premium</h3>
            <p class="text-sm text-ink-light">Tu plan actual</p>
          </div>
          <span class="ml-auto bg-brand-100 text-brand-700 text-xs font-bold px-3 py-1 rounded-full">ACTIVO</span>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bg-surface-low rounded-xl p-3">
            <div class="text-xs text-ink-light mb-1">Precio</div>
            <div class="font-bold">S/ 14.90/mes</div>
          </div>
          <div class="bg-surface-low rounded-xl p-3">
            <div class="text-xs text-ink-light mb-1">Premium hasta</div>
            <div class="font-bold">${premiumUntil || 'Activo'}</div>
          </div>
        </div>
        <p class="text-xs text-ink-light">Para cancelar, escríbele "cancelar suscripción" a KIPI por WhatsApp o cancela desde tu cuenta de Mercado Pago.</p>
      `;
    } else {
      container.innerHTML = `
        <div class="h-1.5 bg-surface-mid -mt-6 -mx-6 mb-6"></div>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-2xl bg-surface-mid flex items-center justify-center">
            <span class="material-symbols-outlined text-ink-light text-2xl">person</span>
          </div>
          <div>
            <h3 class="font-headline font-bold text-lg">KIPI Free</h3>
            <p class="text-sm text-ink-light">Tu plan actual</p>
          </div>
        </div>
        <div class="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined text-brand-600 icon-filled">auto_awesome</span>
            <span class="font-bold text-sm text-brand-800">Pásate a Premium</span>
          </div>
          <p class="text-sm text-brand-700 mb-3">Desbloquea coach financiero con IA, resúmenes diarios, planificador de compras y más por solo S/ 14.90/mes.</p>
          <p class="text-xs text-brand-600 font-bold">Escríbele "quiero premium" a KIPI por WhatsApp para activar tu prueba gratis de 7 días.</p>
        </div>
      `;
    }
  } catch(e) { console.error('Subscription error:', e); }
}


// ═══════════════════════════════════════════
// FAQ (Help view)
// ═══════════════════════════════════════════

function setupFaq() {
  document.querySelectorAll('.faq-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}
