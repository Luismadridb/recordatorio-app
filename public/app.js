// Base URL for API
const API_URL = '';

// --- Seguridad e Identidad ---
let ADMIN_PASSWORD = localStorage.getItem('admin_password') || '';
let isLoginPromptActive = false;

// Función maestra para todas las peticiones
async function apiRequest(endpoint, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD
    };

    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...defaultHeaders, ...options.headers }
        });

        if (res.status === 401) {
            // Si no hay permiso, mostramos el overlay de login
            return new Promise((resolve, reject) => {
                showLoginOverlay((newPass) => {
                    ADMIN_PASSWORD = newPass;
                    localStorage.setItem('admin_password', newPass);
                    // Reintentar con la nueva clave
                    apiRequest(endpoint, options).then(resolve).catch(reject);
                });
            });
        }

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Error del servidor (${res.status})`);
        }

        return await res.json();
    } catch (err) {
        console.error(`[API Error] ${endpoint}:`, err);
        showToast(err.message || 'Error de conexión', true);
        throw err;
    }
}

// --- Manejo del Login UI ---
function showLoginOverlay(callback) {
    if (isLoginPromptActive) return;
    isLoginPromptActive = true;

    const overlay = document.getElementById('login-overlay');
    const form = document.getElementById('login-form');
    const input = document.getElementById('login-pass');
    
    overlay.classList.add('active');
    input.focus();

    const onSubmit = (e) => {
        e.preventDefault();
        const pass = input.value;
        if (pass) {
            overlay.classList.remove('active');
            form.removeEventListener('submit', onSubmit);
            isLoginPromptActive = false;
            callback(pass);
        }
    };

    form.addEventListener('submit', onSubmit);
}

// --- Navegación SPA ---
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.tab;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(tab).classList.add('active');

        if (tab === 'dashboard') loadDashboard();
        if (tab === 'predicadores') loadPredicadores();
        if (tab === 'asignaciones') loadAsignaciones();
        if (tab === 'mensajes') loadMensajes();
    });
});

// --- Utilidades ---
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    if (isError) toast.classList.add('error-toast');
    setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'modal-asignacion') populatePredicadoresSelect();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    const form = document.querySelector(`#${id} form`);
    if (form) form.reset();
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatJustDate(dateString) {
    const isodate = dateString.split('T')[0];
    const date = new Date(isodate + 'T00:00:00');
    return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

// --- Estado local ---
let state = { predicadores: [], asignaciones: [], recordatorios: [] };

// --- Carga de Vistas ---
async function loadDashboard() {
    try {
        const p = await apiRequest('/predicadores');
        const a = await apiRequest('/asignaciones');
        const r = await apiRequest('/recordatorios');

        const brothersRef = document.getElementById('stat-hermanos');
        const nextRef = document.getElementById('stat-proximo');
        const pendingRef = document.getElementById('stat-pendientes');

        if (brothersRef) brothersRef.textContent = p.length;

        const futuros = a.filter(asig => new Date(asig.fecha_sabado) >= new Date().setHours(0,0,0,0));
        if (nextRef) {
            if (futuros.length > 0) {
                futuros.sort((a, b) => new Date(a.fecha_sabado) - new Date(b.fecha_sabado));
                nextRef.textContent = formatJustDate(futuros[0].fecha_sabado);
            } else {
                nextRef.textContent = "Sin agendar";
            }
        }

        const pendientes = r.filter(rec => !rec.enviado && rec.intentos < 3).length;
        if (pendingRef) pendingRef.textContent = pendientes;
    } catch (e) {}
}

async function loadPredicadores() {
    try {
        const res = await apiRequest('/predicadores');
        state.predicadores = res;
        const tbody = document.querySelector('#table-predicadores tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (res.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay hermanos registrados.</td></tr>';
            return;
        }

        res.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="ID">#${index + 1}</td>
                <td data-label="Nombre" style="font-weight:600">${p.nombre}</td>
                <td data-label="Teléfono">${p.telefono}</td>
                <td data-label="Disponibilidad">
                    <select class="select-inline" onchange="updateDisponibilidad(${p.id}, this.value)">
                        <option value="false" ${!p.solo_tarde ? 'selected' : ''}>Día Completo</option>
                        <option value="true" ${p.solo_tarde ? 'selected' : ''}>Solo Tarde (19:00)</option>
                    </select>
                </td>
                <td data-label="Estado"><span class="badge ${p.activo ? 'success' : 'error'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td data-label="Acciones"><button class="btn-text" style="color:var(--error); padding:0;" onclick="deletePredicador(${p.id}, '${p.nombre}')">🗑️ Eliminar</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {}
}

async function loadAsignaciones() {
    try {
        const res = await apiRequest('/asignaciones');
        const tbody = document.querySelector('#table-asignaciones tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (res.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay cultos programados.</td></tr>';
            return;
        }
        res.forEach((a, index) => {
            const statusBadge = { 'pendiente': '<span class="badge warning">⏳ Pendiente</span>', 'confirmado': '<span class="badge success">✅ Confirmado</span>', 'rechazado': '<span class="badge error">❌ Rechazado</span>' }[a.estado] || `<span class="badge">${a.estado}</span>`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="ID">#${index + 1}</td>
                <td data-label="Predicador">${a.predicador_nombre}</td>
                <td data-label="Sábado">${formatJustDate(a.fecha_sabado)}</td>
                <td data-label="Hora"><span class="badge info">${a.hora_culto}</span></td>
                <td data-label="Estado">${statusBadge}</td>
                <td data-label="Acciones"><button class="btn-text" style="color:var(--error);" onclick="deleteAsignacion(${a.id})">🗑️ Eliminar</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {}
}

async function loadMensajes() {
    try {
        const res = await apiRequest('/recordatorios');
        res.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
        const tbody = document.querySelector('#table-mensajes tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (res.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Sin mensajes.</td></tr>';
            return;
        }
        res.forEach((r, index) => {
            const tr = document.createElement('tr');
            let badge = r.enviado ? '<span class="badge success">Enviado</span>' : (r.intentos >= 3 ? '<span class="badge error">Fallido</span>' : '<span class="badge warning">Pendiente</span>');
            tr.innerHTML = `<td data-label="ID">#${index + 1}</td><td data-label="Teléfono">${r.telefono}</td><td data-label="Título">${r.titulo}</td><td data-label="Envío">${formatDate(r.fecha_envio)}</td><td data-label="Estado">${badge}</td><td data-label="Detalle">Intento: ${r.intentos}/3</td>`;
            tbody.appendChild(tr);
        });
    } catch (e) {}
}

// --- Forms ---
const formHermano = document.getElementById('form-hermano');
if (formHermano) {
    formHermano.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('h-nombre').value;
        let telefono = document.getElementById('h-tel').value;
        const solo_tarde = document.getElementById('h-solo-tarde').checked;
        if (!telefono.startsWith('whatsapp:')) telefono = 'whatsapp:' + telefono;
        try {
            await apiRequest('/predicadores', { method: 'POST', body: JSON.stringify({ nombre, telefono, solo_tarde }) });
            showToast('Hermano registrado');
            closeModal('modal-hermano');
            loadPredicadores();
        } catch (err) {}
    });
}

async function updateDisponibilidad(id, value) {
    try {
        await apiRequest(`/predicadores/${id}/disponibilidad`, { method: 'PATCH', body: JSON.stringify({ solo_tarde: value === 'true' }) });
        showToast('Actualizado');
    } catch (err) {}
}

async function deletePredicador(id, nombre) {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return;
    try { await apiRequest(`/predicadores/${id}`, { method: 'DELETE' }); showToast('Eliminado'); loadPredicadores(); } catch (err) {}
}

async function populatePredicadoresSelect() {
    const select = document.getElementById('a-predicador');
    if (!select) return;
    select.innerHTML = '<option value="">Cargando...</option>';
    try {
        if (state.predicadores.length === 0) state.predicadores = await apiRequest('/predicadores');
        select.innerHTML = '<option value="" disabled selected>Selecciona hermano</option>';
        state.predicadores.forEach(p => {
            if (p.activo) {
                const opt = document.createElement('option');
                opt.value = p.id; opt.textContent = p.nombre;
                select.appendChild(opt);
            }
        });
    } catch(e) {}
}

const formAsignacion = document.getElementById('form-asignacion');
if (formAsignacion) {
    formAsignacion.addEventListener('submit', async (e) => {
        e.preventDefault();
        const predicador_id = document.getElementById('a-predicador').value;
        const fecha_sabado = document.getElementById('a-fecha').value;
        const hora_culto = document.getElementById('a-hora').value;
        try {
            await apiRequest('/asignaciones', { method: 'POST', body: JSON.stringify({ predicador_id, fecha_sabado, hora_culto }) });
            showToast('Asignado');
            closeModal('modal-asignacion');
            loadAsignaciones();
        } catch (err) {}
    });
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
});
