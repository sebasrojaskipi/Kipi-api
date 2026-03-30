// ═══════════════════════════════════════════
// server.js — Kipi API
// ═══════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, testConnection } = require('./db');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(cors());
app.use(express.json());

// ─── Dashboard (static files) ───
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health check ───
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kipi-api', version: '1.0.0' });
});

// GET /api/users — Lista todos los usuarios (para dashboard login)
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, nickname, phone_number, currency_symbol, is_premium, premium_until FROM user_profile ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/users:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════
// PERFIL DE USUARIO
// ═══════════════════════════════════════════

// GET /api/user/:id — Obtener perfil
app.get('/api/user/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM user_profile WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error GET /api/user:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/user/phone/:phone — Buscar por teléfono (para WhatsApp)
app.get('/api/user/phone/:phone', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM user_profile WHERE phone_number = ?',
      [req.params.phone]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error GET /api/user/phone:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/user/:id — Actualizar perfil
app.put('/api/user/:id', async (req, res) => {
  try {
    const { name, nickname, email, monthly_budget, currency_name, currency_symbol } = req.body;
    await pool.query(
      `UPDATE user_profile 
       SET name = COALESCE(?, name), 
           nickname = COALESCE(?, nickname),
           email = COALESCE(?, email),
           monthly_budget = COALESCE(?, monthly_budget),
           currency_name = COALESCE(?, currency_name),
           currency_symbol = COALESCE(?, currency_symbol)
       WHERE id = ?`,
      [name, nickname, email, monthly_budget, currency_name, currency_symbol, req.params.id]
    );
    // Devolver el perfil actualizado
    const [rows] = await pool.query('SELECT * FROM user_profile WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/user:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════
// TRANSACCIONES (GASTOS E INGRESOS)
// ═══════════════════════════════════════════

// GET /api/transactions/:userId — Últimas transacciones
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const month = req.query.month; // formato: '2026-03'
    const type = req.query.type;   // 'gasto' o 'ingreso'

    let query = 'SELECT * FROM user_transactions WHERE user_id = ?';
    const params = [req.params.userId];

    if (month) {
      query += ' AND DATE_FORMAT(transaction_date, "%Y-%m") = ?';
      params.push(month);
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY transaction_date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/transactions:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/transactions — Crear transacción
app.post('/api/transactions', async (req, res) => {
  try {
    const { user_id, transaction_text, commerce, category, subcategory, type, amount, transaction_date } = req.body;

    if (!user_id || !amount) {
      return res.status(400).json({ error: 'user_id y amount son requeridos' });
    }

    const [result] = await pool.query(
      `INSERT INTO user_transactions 
       (user_id, transaction_text, commerce, category, subcategory, type, amount, transaction_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, transaction_text, commerce, category, subcategory, type || 'gasto', amount, transaction_date || new Date()]
    );

    const [rows] = await pool.query('SELECT * FROM user_transactions WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/transactions:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/transactions/:id — Eliminar transacción
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM user_transactions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error DELETE /api/transactions:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════
// DASHBOARD — Resumen del mes
// ═══════════════════════════════════════════

// GET /api/dashboard/:userId — Todo lo que necesita el dashboard
app.get('/api/dashboard/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const month = req.query.month || new Date().toISOString().slice(0, 7); // '2026-03'

    // 1. Perfil del usuario (para presupuesto y moneda)
    const [userRows] = await pool.query('SELECT * FROM user_profile WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const user = userRows[0];

    // 2. Total gastado este mes
    const [spentRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_spent
       FROM user_transactions 
       WHERE user_id = ? AND type = 'gasto' 
       AND DATE_FORMAT(transaction_date, "%Y-%m") = ?`,
      [userId, month]
    );

    // 3. Total ingresos este mes
    const [incomeRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_income
       FROM user_transactions 
       WHERE user_id = ? AND type = 'ingreso' 
       AND DATE_FORMAT(transaction_date, "%Y-%m") = ?`,
      [userId, month]
    );

    // 4. Conteo de transacciones este mes
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total_transactions
       FROM user_transactions 
       WHERE user_id = ? 
       AND DATE_FORMAT(transaction_date, "%Y-%m") = ?`,
      [userId, month]
    );

    // 5. Gasto por categoría
    const [categoryRows] = await pool.query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total
       FROM user_transactions 
       WHERE user_id = ? AND type = 'gasto'
       AND DATE_FORMAT(transaction_date, "%Y-%m") = ?
       GROUP BY category
       ORDER BY total DESC`,
      [userId, month]
    );

    // 6. Últimas 10 transacciones
    const [recentRows] = await pool.query(
      `SELECT * FROM user_transactions 
       WHERE user_id = ? 
       AND DATE_FORMAT(transaction_date, "%Y-%m") = ?
       ORDER BY transaction_date DESC, created_at DESC 
       LIMIT 10`,
      [userId, month]
    );

    // 7. Proyección de cierre (gasto diario promedio × días del mes)
    const now = new Date();
    const [year, mon] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const daysPassed = (year === now.getFullYear() && mon === now.getMonth() + 1)
      ? now.getDate()
      : daysInMonth;

    const totalSpent = parseFloat(spentRows[0].total_spent);
    const dailyAvg = daysPassed > 0 ? totalSpent / daysPassed : 0;
    const projection = Math.round(dailyAvg * daysInMonth * 100) / 100;
    const budget = parseFloat(user.monthly_budget);
    const remaining = budget - totalSpent;
    const daysRemaining = daysInMonth - daysPassed;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        phone_number: user.phone_number,
        currency_symbol: user.currency_symbol || 'S/',
        currency_name: user.currency_name || 'Soles',
        budget_config_json: user.budget_config_json || null,
        is_premium: user.is_premium || 0,
        premium_until: user.premium_until || null,
      },
      month,
      budget,
      monthly_budget: budget,
      total_spent: totalSpent,
      total_income: parseFloat(incomeRows[0].total_income),
      remaining,
      total_transactions: countRows[0].total_transactions,
      days_passed: daysPassed,
      days_remaining: daysRemaining,
      days_in_month: daysInMonth,
      daily_average: Math.round(dailyAvg * 100) / 100,
      projection,
      over_budget: projection > budget ? Math.round((projection - budget) * 100) / 100 : 0,
      categories: categoryRows,
      recent_transactions: recentRows,
    });
  } catch (err) {
    console.error('Error GET /api/dashboard:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════
// HISTORIAL DE PRESUPUESTO
// ═══════════════════════════════════════════

// GET /api/budget-history/:userId
app.get('/api/budget-history/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM budget_history WHERE user_id = ? ORDER BY changed_at DESC LIMIT 20',
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/budget-history:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/budget/:userId — Actualizar presupuesto mensual
app.put('/api/budget/:userId', async (req, res) => {
  try {
    const { monthly_budget, budget_config_json } = req.body;
    const userId = req.params.userId;

    // Actualizar en user_profile
    await pool.query(
      'UPDATE user_profile SET monthly_budget = ?, budget_config_json = ? WHERE id = ?',
      [monthly_budget, budget_config_json || null, userId]
    );

    // Guardar en historial
    await pool.query(
      'INSERT INTO budget_history (user_id, monthly_budget, budget_config_json) VALUES (?, ?, ?)',
      [userId, monthly_budget, budget_config_json || null]
    );

    const [rows] = await pool.query('SELECT * FROM user_profile WHERE id = ?', [userId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/budget:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════
// ESTADÍSTICAS EXTRA
// ═══════════════════════════════════════════

// GET /api/stats/:userId/monthly — Comparativa mensual
app.get('/api/stats/:userId/monthly', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         DATE_FORMAT(transaction_date, "%Y-%m") AS month,
         SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END) AS total_gastos,
         SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END) AS total_ingresos,
         COUNT(*) AS total_transacciones
       FROM user_transactions 
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/stats/monthly:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── Iniciar servidor ───
app.listen(PORT, async () => {
  console.log(`🚀 Kipi API corriendo en puerto ${PORT}`);
  await testConnection();
});
