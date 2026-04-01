// ═══════════════════════════════════════════
// db.js — Conexión a MySQL (Railway)
// ═══════════════════════════════════════════
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: parseInt(process.env.MYSQLPORT || '3306'),
  database: process.env.MYSQLDATABASE,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-05:00', // Peru (UTC-5)
  // Railway usa SSL en conexiones públicas
  ssl: process.env.MYSQLHOST?.includes('railway')
    ? { rejectUnauthorized: false }
    : undefined,
});

// Setear timezone de sesión MySQL a Peru en cada conexión
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '-05:00'");
});

// Test de conexión al iniciar
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conectado a MySQL en Railway');
    conn.release();
  } catch (err) {
    console.error('❌ Error conectando a MySQL:', err.message);
  }
}

module.exports = { pool, testConnection };
