const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DATABASE_URL = process.env.DATABASE_URL || 'sqlite:///./data/turnos.db';
const USE_SQLITE = !DATABASE_URL.startsWith('postgres');

function createSqlitePool() {
  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'turnos.db');
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');

  const query = (sql, params = []) => {
    const normalizedSql = String(sql).trim().replace(/\$(\d+)/g, '?');

    if (normalizedSql === 'BEGIN' || normalizedSql === 'BEGIN IMMEDIATE') {
      db.exec('BEGIN IMMEDIATE');
      return { rowCount: 0, rows: [] };
    }

    if (normalizedSql === 'COMMIT') {
      db.exec('COMMIT');
      return { rowCount: 0, rows: [] };
    }

    if (normalizedSql === 'ROLLBACK') {
      db.exec('ROLLBACK');
      return { rowCount: 0, rows: [] };
    }

    const statement = db.prepare(normalizedSql);
    const isWrite = /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(normalizedSql);

    if (isWrite) {
      if (/RETURNING/i.test(normalizedSql)) {
        const rows = statement.all(...(params || []));
        return { rowCount: rows.length, rows };
      }

      const info = statement.run(...(params || []));
      return {
        rowCount: info.changes || 0,
        rows: [],
        insertId: info.lastInsertRowid,
      };
    }

    const rows = statement.all(...(params || []));
    return { rowCount: rows.length, rows };
  };

  return {
    async query(sql, params = []) {
      return query(sql, params);
    },
    async connect() {
      return {
        async query(sql, params = []) {
          return query(sql, params);
        },
        async commit() {
          db.exec('COMMIT');
        },
        async rollback() {
          db.exec('ROLLBACK');
        },
        release() {},
      };
    },
  };
}

const pool = USE_SQLITE ? createSqlitePool() : new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function normalizeUser(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    role: row.role,
  };
}

function normalizeTurno(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    hora: row.hora,
    motivo: row.motivo,
    estado: row.estado,
    usuarioId: row.usuario_id,
    usuarioNombre: row.usuario_nombre || null,
  };
}

async function getUserById(userId) {
  const result = await pool.query(
    `SELECT id, nombre, email, role FROM users WHERE id = $1`,
    [userId]
  );
  return result.rowCount ? result.rows[0] : null;
}

async function initializeDatabase() {
  if (USE_SQLITE) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Usuario',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        hora TEXT NOT NULL,
        motivo TEXT,
        estado TEXT NOT NULL DEFAULT 'reservado',
        usuario_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS turnos_slot_available_idx
      ON turnos (fecha, hora)
      WHERE estado = 'reservado';
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS turnos_usuario_idx
      ON turnos (usuario_id);
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'Usuario',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS turnos (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL,
        hora TIME NOT NULL,
        motivo TEXT,
        estado VARCHAR(20) NOT NULL DEFAULT 'reservado',
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS turnos_slot_available_idx
      ON turnos (fecha, hora)
      WHERE estado = 'reservado';
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS turnos_usuario_idx
      ON turnos (usuario_id);
    `);
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@turnos.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const existingAdmin = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);

  if (!existingAdmin.rowCount) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      'INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      ['Administrador', adminEmail, passwordHash, 'Admin']
    );
  }
}

async function ensureAuthenticated(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Se requiere autenticación.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(payload.id);

    if (!user) {
      return res.status(401).json({ message: 'Token inválido o expirado.' });
    }

    req.user = normalizeUser(user);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
}

function authorizeAdmin(req, res, next) {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'No autorizado para esta operación.' });
  }
  next();
}

function validateDateTime(fecha, hora) {
  if (!fecha || !hora) {
    return 'La fecha y la hora son obligatorias.';
  }

  const parsedDate = new Date(`${fecha}T${hora}:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'La fecha y la hora tienen un formato inválido.';
  }

  if (parsedDate <= new Date()) {
    return 'No se permiten turnos con fecha u hora pasadas.';
  }

  return null;
}

function normalizeEstado(estado) {
  return estado === 'cancelado' ? 'cancelado' : 'reservado';
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, status: 'healthy' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Base de datos no disponible.' });
  }
});

app.post('/api/auth/registro', async (req, res) => {
  const { nombre, email, password } = req.body || {};

  if (!nombre || !email || !password) {
    return res.status(400).json({ message: 'Nombre, email y contraseña son obligatorios.' });
  }

  const emailNormalized = String(email).trim().toLowerCase();
  if (password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  if (req.body && req.body.role && req.body.role !== 'Usuario') {
    return res.status(400).json({ message: 'El rol Admin no se puede asignar desde el registro público.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [emailNormalized]);
    if (existing.rowCount) {
      return res.status(409).json({ message: 'El correo ya está registrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, role',
      [String(nombre).trim(), emailNormalized, passwordHash, 'Usuario']
    );

    const user = result.rows[0];
    const token = generateToken(user);
    return res.status(201).json({ token, user: normalizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo completar el registro.', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contraseña son obligatorios.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, nombre, email, password_hash, role FROM users WHERE email = $1',
      [String(email).trim().toLowerCase()]
    );

    if (!result.rowCount) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const token = generateToken(user);
    return res.json({ token, user: normalizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo iniciar sesión.', error: error.message });
  }
});

app.get('/api/auth/me', ensureAuthenticated, async (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/turnos', ensureAuthenticated, async (req, res) => {
  try {
    let query = `
      SELECT t.*, u.nombre AS usuario_nombre
      FROM turnos t
      INNER JOIN users u ON u.id = t.usuario_id
    `;
    const params = [];

    if (req.user.role !== 'Admin') {
      query += ' WHERE t.usuario_id = $1';
      params.push(req.user.id);
    }

    query += ' ORDER BY t.fecha ASC, t.hora ASC';

    const result = await pool.query(query, params);
    return res.json({ turnos: result.rows.map(normalizeTurno) });
  } catch (error) {
    return res.status(500).json({ message: 'No se pudieron consultar los turnos.', error: error.message });
  }
});

app.get('/api/turnos/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT t.*, u.nombre AS usuario_nombre
       FROM turnos t
       INNER JOIN users u ON u.id = t.usuario_id
       WHERE t.id = $1`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const turno = result.rows[0];
    if (req.user.role !== 'Admin' && turno.usuario_id !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para consultar este turno.' });
    }

    return res.json({ turno: normalizeTurno(turno) });
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo consultar el turno.', error: error.message });
  }
});

app.post('/api/turnos', ensureAuthenticated, async (req, res) => {
  const { fecha, hora, motivo, estado } = req.body || {};
  const errorFechaHora = validateDateTime(fecha, hora);

  if (errorFechaHora) {
    return res.status(400).json({ message: errorFechaHora });
  }

  const normalizedEstado = normalizeEstado(estado);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const conflict = await client.query(
      "SELECT id FROM turnos WHERE fecha = $1 AND hora = $2 AND estado = 'reservado' LIMIT 1",
      [fecha, hora]
    );

    if (conflict.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Ya existe un turno reservado para esa fecha y hora.' });
    }

    const result = await client.query(
      `INSERT INTO turnos (fecha, hora, motivo, estado, usuario_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [fecha, hora, motivo || null, normalizedEstado, req.user.id]
    );

    await client.query('COMMIT');
    return res.status(201).json({ turno: normalizeTurno(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ message: 'No se pudo crear el turno.', error: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/turnos/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { fecha, hora, motivo, estado } = req.body || {};

  try {
    const existing = await pool.query('SELECT * FROM turnos WHERE id = $1', [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const turno = existing.rows[0];
    if (req.user.role !== 'Admin' && turno.usuario_id !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para modificar este turno.' });
    }

    if (turno.estado === 'cancelado') {
      return res.status(409).json({ message: 'No se puede modificar un turno cancelado.' });
    }

    const nextFecha = fecha || turno.fecha;
    const nextHora = hora || turno.hora;
    const nextMotivo = motivo !== undefined ? motivo : turno.motivo;
    const nextEstado = estado !== undefined ? normalizeEstado(estado) : turno.estado;

    if (nextEstado !== 'reservado') {
      return res.status(400).json({ message: 'El estado solo puede mantenerse en reservado al editar.' });
    }

    const errorFechaHora = validateDateTime(nextFecha, nextHora);
    if (errorFechaHora) {
      return res.status(400).json({ message: errorFechaHora });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const conflict = await client.query(
        `SELECT id FROM turnos
         WHERE id != $1
           AND fecha = $2
           AND hora = $3
           AND estado = 'reservado'
         LIMIT 1`,
        [id, nextFecha, nextHora]
      );

      if (conflict.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Esa fecha y hora ya está ocupada por otro turno.' });
      }

      const result = await client.query(
        `UPDATE turnos
         SET fecha = $1,
             hora = $2,
             motivo = $3,
             estado = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [nextFecha, nextHora, nextMotivo, nextEstado, id]
      );

      await client.query('COMMIT');
      return res.json({ turno: normalizeTurno(result.rows[0]) });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo actualizar el turno.', error: error.message });
  }
});

app.delete('/api/turnos/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT * FROM turnos WHERE id = $1', [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ message: 'Turno no encontrado.' });
    }

    const turno = existing.rows[0];
    if (req.user.role !== 'Admin' && turno.usuario_id !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para cancelar este turno.' });
    }

    if (turno.estado === 'cancelado') {
      return res.status(409).json({ message: 'El turno ya está cancelado.' });
    }

    const result = await pool.query(
      `UPDATE turnos
       SET estado = 'cancelado', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return res.json({ message: 'Turno cancelado correctamente.', turno: normalizeTurno(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo cancelar el turno.', error: error.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Error interno del servidor.' });
});

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`API ejecutándose en http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Fallo al inicializar la base de datos:', error);
      process.exit(1);
    });
}

module.exports = { app, initializeDatabase, pool };
