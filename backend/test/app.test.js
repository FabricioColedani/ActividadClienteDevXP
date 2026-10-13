const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, initializeDatabase } = require('../server');

(async () => {
  await initializeDatabase();
})();

function makeFutureDate(offsetDays = 5, hour = '10:00') {
  const uniqueOffset = offsetDays + (Math.random() * 90 | 0);
  const d = new Date(Date.now() + uniqueOffset * 24 * 60 * 60 * 1000);
  d.setHours(Number(hour.split(':')[0]), Number(hour.split(':')[1]), 0, 0);
  return {
    fecha: d.toISOString().slice(0, 10),
    hora: hour,
  };
}

async function registerUser(prefix = 'user') {
  const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const payload = {
    nombre: `${prefix}-${suffix}`,
    email: `${prefix}${suffix}@test.com`,
    password: 'Password123!',
  };

  const response = await request(app)
    .post('/api/auth/registro')
    .send(payload);

  assert.equal(response.status, 201, response.body.message || 'No pudo registrarse el usuario.');
  return { ...payload, token: response.body.token, user: response.body.user, response };
}

async function login(email, password) {
  return request(app)
    .post('/api/auth/login')
    .send({ email, password });
}

async function createTurno(token, turno) {
  return request(app)
    .post('/api/turnos')
    .set('Authorization', `Bearer ${token}`)
    .send(turno);
}

test('PA-1: registro y login crean usuario y entregan token', async () => {
  const created = await registerUser('pa1');
  const loginResponse = await login(created.email, created.password);

  assert.equal(loginResponse.status, 200);
  assert.ok(loginResponse.body.token);
  assert.equal(loginResponse.body.user.role, 'Usuario');
  assert.equal(loginResponse.body.user.email, created.email);
});

test('PA-2: el registro público no acepta un rol de admin', async () => {
  const response = await request(app)
    .post('/api/auth/registro')
    .send({
      nombre: 'Admin Intentado',
      email: `admintry${Date.now()}@test.com`,
      password: 'Password123!',
      role: 'Admin',
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /Admin|rol/i);
});

test('PA-3: credenciales inválidas y acceso protegido sin token son rechazados', async () => {
  const badLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'noexiste@test.com', password: 'wrongpass' });

  assert.equal(badLogin.status, 401);
  assert.match(badLogin.body.message, /credencial|inv/i);

  const protectedRequest = await request(app).get('/api/turnos');
  assert.equal(protectedRequest.status, 401);
  assert.match(protectedRequest.body.message, /autentic/i);
});

test('PA-4: usuario crea, consulta, modifica y cancela un turno propio', async () => {
  const user = await registerUser('pa4');
  const slot = makeFutureDate(7, '11:30');

  const created = await createTurno(user.token, {
    ...slot,
    motivo: 'Consulta de seguimiento',
    estado: 'reservado',
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.turno.estado, 'reservado');

  const list = await request(app)
    .get('/api/turnos')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(list.status, 200);
  assert.ok(list.body.turnos.some((turno) => turno.id === created.body.turno.id));

  const modified = await request(app)
    .put(`/api/turnos/${created.body.turno.id}`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      fecha: slot.fecha,
      hora: '12:00',
      motivo: 'Motivo actualizado',
      estado: 'reservado',
    });

  assert.equal(modified.status, 200);
  assert.equal(modified.body.turno.hora, '12:00');

  const cancelled = await request(app)
    .delete(`/api/turnos/${created.body.turno.id}`)
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.turno.estado, 'cancelado');
});

test('PA-5: usuario no puede consultar ni modificar turno ajeno', async () => {
  const userA = await registerUser('pa5a');
  const userB = await registerUser('pa5b');
  const slot = makeFutureDate(9, '15:15');

  const created = await createTurno(userA.token, {
    ...slot,
    motivo: 'Turno ajeno',
    estado: 'reservado',
  });

  const forbiddenGet = await request(app)
    .get(`/api/turnos/${created.body.turno.id}`)
    .set('Authorization', `Bearer ${userB.token}`);
  assert.equal(forbiddenGet.status, 403);

  const forbiddenPut = await request(app)
    .put(`/api/turnos/${created.body.turno.id}`)
    .set('Authorization', `Bearer ${userB.token}`)
    .send({
      fecha: slot.fecha,
      hora: '16:00',
      motivo: 'Intento de modificación',
      estado: 'reservado',
    });
  assert.equal(forbiddenPut.status, 403);

  const forbiddenDelete = await request(app)
    .delete(`/api/turnos/${created.body.turno.id}`)
    .set('Authorization', `Bearer ${userB.token}`);
  assert.equal(forbiddenDelete.status, 403);

  const ownList = await request(app)
    .get('/api/turnos')
    .set('Authorization', `Bearer ${userB.token}`);

  assert.equal(ownList.status, 200);
  assert.ok(!ownList.body.turnos.some((turno) => turno.id === created.body.turno.id));
});

test('PA-6: admin puede listar y gestionar turnos de todos los usuarios', async () => {
  const adminLogin = await login('admin@turnos.local', 'Admin123!');
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.token;

  const user1 = await registerUser('pa6a');
  const user2 = await registerUser('pa6b');

  const t1 = await createTurno(user1.token, { ...makeFutureDate(40, '09:00'), motivo: 'Admin check 1', estado: 'reservado' });
  const t2 = await createTurno(user2.token, { ...makeFutureDate(41, '09:30'), motivo: 'Admin check 2', estado: 'reservado' });

  assert.equal(t1.status, 201);
  assert.equal(t2.status, 201);

  const adminList = await request(app)
    .get('/api/turnos')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(adminList.status, 200);
  assert.ok(adminList.body.turnos.some((turno) => turno.id === t1.body.turno.id));
  assert.ok(adminList.body.turnos.some((turno) => turno.id === t2.body.turno.id));

  const adminUpdate = await request(app)
    .put(`/api/turnos/${t1.body.turno.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fecha: t1.body.turno.fecha,
      hora: '10:00',
      motivo: 'Editado por admin',
      estado: 'reservado',
    });

  assert.equal(adminUpdate.status, 200);
  assert.equal(adminUpdate.body.turno.hora, '10:00');

  const adminDelete = await request(app)
    .delete(`/api/turnos/${t2.body.turno.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(adminDelete.status, 200);
  assert.equal(adminDelete.body.turno.estado, 'cancelado');
});

test('PA-7: rechaza turnos con fecha pasada y espacios ya ocupados', async () => {
  const user = await registerUser('pa7');
  const past = await createTurno(user.token, {
    fecha: '2000-01-01',
    hora: '09:00',
    motivo: 'Fecha inválida',
    estado: 'reservado',
  });
  assert.equal(past.status, 400);
  assert.match(past.body.message, /fecha/i);

  const slot = makeFutureDate(15, '17:00');
  const first = await createTurno(user.token, { ...slot, motivo: 'Primer turno', estado: 'reservado' });
  const second = await createTurno(user.token, { ...slot, motivo: 'Segundo turno', estado: 'reservado' });

  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  assert.match(second.body.message, /ocupado|conflict|ya existe/i);
});

test('PA-8: concurrente mismo espacio reserva solo una vez', async () => {
  const user = await registerUser('pa8');
  const slot = makeFutureDate(20, '18:45');

  const requests = Array.from({ length: 6 }, () => request(app)
    .post('/api/turnos')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ ...slot, motivo: 'Reserva concurrente', estado: 'reservado' }));

  const results = await Promise.all(requests);
  const successes = results.filter((response) => response.status === 201).length;
  const conflicts = results.filter((response) => response.status === 409).length;

  assert.equal(successes, 1);
  assert.equal(conflicts, 5);
});

test('PA-9: concurrencia con espacios distintos se procesa correctamente', async () => {
  const user = await registerUser('pa9');

  const payloads = [
    { ...makeFutureDate(22, '08:00'), motivo: 'A', estado: 'reservado' },
    { ...makeFutureDate(22, '09:00'), motivo: 'B', estado: 'reservado' },
    { ...makeFutureDate(22, '10:00'), motivo: 'C', estado: 'reservado' },
  ];

  const responses = await Promise.all(payloads.map((payload) => createTurno(user.token, payload)));

  responses.forEach((response) => {
    assert.equal(response.status, 201);
    assert.equal(response.body.turno.estado, 'reservado');
  });
});

test('PA-10: la sesión autenticada se mantiene y reconsulta correctamente', async () => {
  const user = await registerUser('pa10');

  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, user.email);

  const slot = makeFutureDate(30, '13:15');
  const created = await createTurno(user.token, { ...slot, motivo: 'Persistencia', estado: 'reservado' });
  assert.equal(created.status, 201);

  const list = await request(app)
    .get('/api/turnos')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(list.status, 200);
  assert.ok(list.body.turnos.some((turno) => turno.id === created.body.turno.id));
});
