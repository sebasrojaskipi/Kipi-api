# 🟢 Kipi API

Backend para la web de Kipi. Conecta con MySQL en Railway.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/api/user/:id` | Perfil de usuario |
| GET | `/api/user/phone/:phone` | Buscar por teléfono |
| PUT | `/api/user/:id` | Actualizar perfil |
| GET | `/api/transactions/:userId` | Listar transacciones |
| POST | `/api/transactions` | Crear transacción |
| DELETE | `/api/transactions/:id` | Eliminar transacción |
| GET | `/api/dashboard/:userId` | Dashboard completo |
| PUT | `/api/budget/:userId` | Actualizar presupuesto |
| GET | `/api/budget-history/:userId` | Historial de presupuesto |
| GET | `/api/stats/:userId/monthly` | Estadísticas mensuales |

## Query params útiles

- `GET /api/transactions/:userId?month=2026-03` → filtrar por mes
- `GET /api/transactions/:userId?type=gasto` → solo gastos
- `GET /api/transactions/:userId?limit=50&offset=0` → paginación
- `GET /api/dashboard/:userId?month=2026-03` → dashboard de un mes específico

## Deploy en Railway

### Paso 1: Sube a GitHub
```bash
cd kipi-api
git init
git add .
git commit -m "Kipi API v1"
# Crea un repo en GitHub y conecta:
git remote add origin https://github.com/TU_USUARIO/kipi-api.git
git push -u origin main
```

### Paso 2: Deploy en Railway
1. Ve a tu proyecto en Railway (donde ya tienes MySQL)
2. Click **+ New** → **GitHub Repo** → selecciona `kipi-api`
3. Railway detecta Node.js automáticamente y hace deploy

### Paso 3: Conectar variables de MySQL
1. Click en tu nuevo servicio kipi-api
2. Ve a **Variables**
3. Click **+ New Variable** → **Add Reference** → selecciona tu servicio MySQL
4. Agrega las variables: `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD`
5. Railway redeploya automáticamente

### Paso 4: Obtener URL pública
1. Ve a **Settings** de tu servicio kipi-api
2. En **Networking** → **Generate Domain**
3. Obtendrás algo como: `kipi-api-production.up.railway.app`

### Paso 5: Conectar la web
Usa esa URL en tu frontend para hacer fetch a los endpoints.
Ejemplo:
```javascript
const API = 'https://kipi-api-production.up.railway.app';
const res = await fetch(`${API}/api/dashboard/1`);
const data = await res.json();
```
