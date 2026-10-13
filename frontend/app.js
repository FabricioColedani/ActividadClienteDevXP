const API_BASE = 'http://localhost:3001/api';
const tokenKey = 'turnos-token';

const state = {
  token: localStorage.getItem(tokenKey) || '',
  user: null,
  turnos: [],
  editingId: null,
};

const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const turnoForm = document.getElementById('turnoForm');
const logoutBtn = document.getElementById('logoutBtn');
const loginStatus = document.getElementById('loginStatus');
const registerStatus = document.getElementById('registerStatus');
const turnoStatus = document.getElementById('turnoStatus');
const turnosList = document.getElementById('turnosList');
const userName = document.getElementById('userName');
const userRole = document.getElementById('userRole');
const tokenPreview = document.getElementById('tokenPreview');
const summaryTotal = document.getElementById('summaryTotal');
const summaryActive = document.getElementById('summaryActive');
const summaryStatus = document.getElementById('summaryStatus');
const turnoModeChip = document.getElementById('turnoModeChip');
const clearFormBtn = document.getElementById('clearFormBtn');
const tabButtons = [...document.querySelectorAll('.tab-btn')];

function setStatus(el, message, kind = '') {
  el.textContent = message || '';
  el.className = `status ${kind}`.trim();
}

function setAuthView(visible) {
  authView.classList.toggle('hidden', !visible);
  appView.classList.toggle('hidden', visible);
  logoutBtn.classList.toggle('hidden', !(!visible && state.token));
}

function toggleAuthTab(tabName) {
  const isLogin = tabName === 'login';
  loginForm.classList.toggle('hidden', !isLogin);
  registerForm.classList.toggle('hidden', isLogin);
  tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('active', active);
  });
}

function updateSummary() {
  if (!state.user) {
    summaryTotal.textContent = '0';
    summaryActive.textContent = '0';
    summaryStatus.textContent = 'Inactiva';
    summaryStatus.classList.remove('cancelado');
    return;
  }

  const total = state.turnos.length;
  const activos = state.turnos.filter((t) => t.estado === 'reservado').length;
  summaryTotal.textContent = String(total);
  summaryActive.textContent = String(activos);
  summaryStatus.textContent = state.user.role === 'Admin' ? 'Admin' : 'Usuario';
  summaryStatus.classList.toggle('cancelado', state.user.role === 'Admin');
}

function updateModeChip() {
  turnoModeChip.textContent = state.editingId ? 'Edición' : 'Alta';
}

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Error en la operación.');
  }

  return data;
}

async function login(email, password) {
  const result = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  state.token = result.token;
  state.user = result.user;
  localStorage.setItem(tokenKey, state.token);
  setAuthView(false);
  await loadUserData();
}

async function register(nombre, email, password) {
  const result = await apiRequest('/auth/registro', {
    method: 'POST',
    body: JSON.stringify({ nombre, email, password }),
  });

  state.token = result.token;
  state.user = result.user;
  localStorage.setItem(tokenKey, state.token);
  setAuthView(false);
  await loadUserData();
}

async function loadUserData() {
  if (!state.token) {
    setAuthView(true);
    return;
  }

  try {
    const me = await apiRequest('/auth/me');
    state.user = me.user;
    userName.textContent = me.user.nombre;
    userRole.textContent = me.user.role;
    userRole.className = `chip ${me.user.role === 'Admin' ? 'cancelado' : ''}`.trim();
    tokenPreview.textContent = state.token.slice(0, 18) + '...';
    await loadTurnos();
  } catch (error) {
    logout();
    setStatus(loginStatus, error.message, 'error');
  }
}

async function loadTurnos() {
  try {
    const result = await apiRequest('/turnos');
    state.turnos = (result.turnos || []).sort((a, b) => {
      const aDate = new Date(`${a.fecha}T${a.hora}:00`);
      const bDate = new Date(`${b.fecha}T${b.hora}:00`);
      return aDate - bDate;
    });
    renderTurnos();
    updateSummary();
  } catch (error) {
    setStatus(turnoStatus, error.message, 'error');
  }
}

function renderTurnos() {
  turnosList.innerHTML = '';

  if (!state.turnos.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Todavía no hay turnos registrados. Creá el primero desde el formulario.';
    turnosList.appendChild(li);
    return;
  }

  state.turnos.forEach((turno) => {
    const li = document.createElement('li');
    li.className = 'turno-card';

    const meta = document.createElement('div');
    meta.className = 'turno-header';

    const date = document.createElement('div');
    date.className = 'turno-date';
    date.textContent = `${turno.fecha} · ${turno.hora}`;

    const badge = document.createElement('span');
    badge.className = `chip ${turno.estado === 'cancelado' ? 'cancelado' : ''}`.trim();
    badge.textContent = turno.estado;

    meta.append(date, badge);

    const body = document.createElement('div');
    body.className = 'turno-body';
    body.innerHTML = `
      <div><strong>Motivo:</strong> ${turno.motivo || 'Sin motivo'}</div>
      <div><strong>Usuario:</strong> ${turno.usuarioNombre || 'Yo'}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'turno-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'small-btn secondary';
    editBtn.dataset.action = 'edit';
    editBtn.dataset.id = turno.id;
    editBtn.textContent = 'Modificar';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'small-btn danger';
    cancelBtn.dataset.action = 'cancel';
    cancelBtn.dataset.id = turno.id;
    cancelBtn.textContent = 'Cancelar';

    actions.append(editBtn, cancelBtn);
    li.append(meta, body, actions);
    turnosList.appendChild(li);
  });
}

function clearTurnoForm() {
  turnoForm.reset();
  state.editingId = null;
  updateModeChip();
}

async function handleTurnoSubmit(event) {
  event.preventDefault();
  const fecha = document.getElementById('turnoFecha').value;
  const hora = document.getElementById('turnoHora').value;
  const motivo = document.getElementById('turnoMotivo').value;

  try {
    if (state.editingId) {
      await apiRequest(`/turnos/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ fecha, hora, motivo }),
      });
      setStatus(turnoStatus, 'Turno actualizado correctamente.', 'success');
    } else {
      await apiRequest('/turnos', {
        method: 'POST',
        body: JSON.stringify({ fecha, hora, motivo }),
      });
      setStatus(turnoStatus, 'Turno creado correctamente.', 'success');
    }

    clearTurnoForm();
    await loadTurnos();
  } catch (error) {
    setStatus(turnoStatus, error.message, 'error');
  }
}

async function handleTurnoActions(event) {
  const button = event.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  const id = Number(button.dataset.id);

  if (!id) return;

  try {
    if (action === 'cancel') {
      await apiRequest(`/turnos/${id}`, { method: 'DELETE' });
      setStatus(turnoStatus, 'Turno cancelado correctamente.', 'success');
    }

    if (action === 'edit') {
      const turno = state.turnos.find((item) => item.id === id);
      if (!turno) return;
      document.getElementById('turnoFecha').value = turno.fecha;
      document.getElementById('turnoHora').value = turno.hora;
      document.getElementById('turnoMotivo').value = turno.motivo || '';
      state.editingId = id;
      updateModeChip();
      setStatus(turnoStatus, 'Editando turno seleccionado.', 'success');
    }

    await loadTurnos();
  } catch (error) {
    setStatus(turnoStatus, error.message, 'error');
  }
}

function logout() {
  state.token = '';
  state.user = null;
  state.turnos = [];
  state.editingId = null;
  localStorage.removeItem(tokenKey);
  userName.textContent = '-';
  userRole.textContent = 'Usuario';
  userRole.className = 'chip';
  tokenPreview.textContent = 'No activo';
  clearTurnoForm();
  setAuthView(true);
  setStatus(loginStatus, '', '');
  setStatus(registerStatus, '', '');
  setStatus(turnoStatus, '', '');
  updateSummary();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    setStatus(loginStatus, 'Iniciando sesión...', '');
    await login(email, password);
    setStatus(loginStatus, 'Sesión iniciada correctamente.', 'success');
    loginForm.reset();
  } catch (error) {
    setStatus(loginStatus, error.message, 'error');
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nombre = document.getElementById('registerNombre').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    setStatus(registerStatus, 'Creando cuenta...', '');
    await register(nombre, email, password);
    setStatus(registerStatus, 'Cuenta creada correctamente.', 'success');
    registerForm.reset();
  } catch (error) {
    setStatus(registerStatus, error.message, 'error');
  }
});

turnoForm.addEventListener('submit', handleTurnoSubmit);
turnosList.addEventListener('click', handleTurnoActions);
logoutBtn.addEventListener('click', logout);
clearFormBtn.addEventListener('click', clearTurnoForm);

tabButtons.forEach((button) => {
  button.addEventListener('click', () => toggleAuthTab(button.dataset.tab));
});

updateSummary();
updateModeChip();

if (state.token) {
  setAuthView(false);
  loadUserData();
} else {
  setAuthView(true);
}
