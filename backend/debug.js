const request = require('supertest');
const { app, initializeDatabase } = require('./server');

(async () => {
  await initializeDatabase();
  const res = await request(app)
    .post('/api/auth/registro')
    .send({ nombre: 'Usuario Test', email: 'temp@example.com', password: 'Password123!' });

  console.log('status', res.status);
  console.log(JSON.stringify(res.body, null, 2));
})();
