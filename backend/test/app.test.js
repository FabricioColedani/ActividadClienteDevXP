const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, initializeDatabase } = require('../server');

(async () => {
  await initializeDatabase();
})();

test('registro y login crean usuario y entregan token', async () => {
  const email = `usuario${Date.now()}@test.com`;

  const registro = await request(app)
    .post('/api/auth/registro')
    .send({ nombre: 'Usuario Test', email, password: 'Password123!' });

  assert.equal(registro.status, 201);
  assert.ok(registro.body.token);
  assert.equal(registro.body.user.role, 'Usuario');

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Password123!' });

  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});

test('no puede crearse un turno con fecha pasada', async () => {
  const email = `past${Date.now()}@test.com`;
  const registro = await request(app)
    .post('/api/auth/registro')
    .send({ nombre: 'Past', email, password: 'Password123!' });

  const token = registro.body.token;

  const response = await request(app)
    .post('/api/turnos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fecha: '2000-01-01',
      hora: '09:00',
      motivo: 'No válido',
      estado: 'reservado'
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /fecha/i);
});
