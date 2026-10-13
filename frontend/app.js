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

function setStatus(el, message, kind = '') {
  el.textContent = message || '';
  el.className = `status ${kind}`.trim();
}

function setAuthView(visible) {
  authView.classList.toggle('hidden', !visible);
  appView.classList.toggle('hidden', visible);
  logoutBtn.classList.toggle('hidden', !visible && !state.token);
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
    state.turnos = result.turnos || [];
    renderTurnos();
  } catch (error) {
    setStatus(turnoStatus, error.message, 'error');
  }
}

function renderTurnos() {
  turnosList.innerHTML = '';

  if (!state.turnos.length) {
    turnosList.innerHTML = '<li class="turno-item">No hay turnos para mostrar.</li>';
    return;
  }

  state.turnos.forEach((turno) => {
    const li = document.createElement('li');
    li.className = 'turno-item';
    li.innerHTML = `
      <div class="turno-meta">
        <strong>${turno.fecha} ${turno.hora}</strong>
        <span class="badge ${turno.estado === 'cancelado' ? 'cancelado' : ''}">${turno.estado}</span>
      </div>
      <div>Motivo: ${turno.motivo || 'Sin motivo'}</div>
      <div>Usuario: ${turno.usuarioNombre || 'Yo'}</div>
      <div class="actions">
        <button class="secondary" data-action="edit" data-id="${turno.id}">Modificar</button>
        <button class="danger" data-action="cancel" data-id="${turno.id}">Cancelar</button>
      </div>
    `;
    turnosList.appendChild(li);
  });
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

    turnoForm.reset();
    state.editingId = null;
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
      setStatus(turnoStatus, 'Editando turno seleccionado.', 'success');
    }

    if (action === 'cancel' || action === 'edit') {
      await loadTurnos();
    }
  } catch (error) {
    setStatus(turnoStatus, error.message, 'error');
  }
}

function logout() {
  state.token = '';
  state.user = null;
  state.turnos = [];
  localStorage.removeItem(tokenKey);
  userName.textContent = '-';
  userRole.textContent = '-';
  tokenPreview.textContent = 'No activo';
  turnoForm.reset();
  setAuthView(true);
  setStatus(loginStatus, '', '');
  setStatus(registerStatus, '', '');
  setStatus(turnoStatus, '', '');
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

if (state.token) {
  setAuthView(false);
  loadUserData();
} else {
  setAuthView(true);
}
