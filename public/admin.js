// Base URL for API
const API_URL = ''; // Same origin

// --- Seguridad e Identidad ---
let ADMIN_PASSWORD = localStorage.getItem('admin_password') || '';

// Función maestra para todas las peticiones (GET, POST, etc)
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

        // Si el servidor dice que no tenemos permiso (401)
        if (res.status === 401) {
            const pass = prompt("🔐 Acceso Protegido - Iglesia App\n\nIngrese la contraseña de administrador para continuar:");
            if (pass) {
                localStorage.setItem('admin_password', pass);
                ADMIN_PASSWORD = pass;
                // Reintentar la misma petición con la nueva clave
                return await apiRequest(endpoint, options);
            } else {
                throw new Error("Contraseña requerida para esta acción.");
            }
        }

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Error del servidor (${res.status})`);
        }

        return await res.json();
    } catch (err) {
        console.error(`[API Error] ${endpoint}:`, err);
        showToast(err.message || 'Error de conexión', true);
        throw err; // Propagar para manejo específico si es necesario
    }
}

// --- Navegación SPA ---
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Actulizar botones
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Actualizar vistas
        const tab = btn.dataset.tab;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(tab).classList.add('active');

        // Refrescar datos según tab
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

    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'modal-asignacion') {
        populatePredicadoresSelect();
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    const form = document.querySelector(`#${id} form`);
    if (form) form.reset();
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('es-CL', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatJustDate(dateString) {
    const isodate = dateString.split('T')[0];
    const date = new Date(isodate + 'T00:00:00');
    return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

// --- Estado local ---
let state = {
    predicadores: [],
    asignaciones: [],
    recordatorios: []
};


// --- Carga de Vistas ---

async function loadDashboard() {
    try {
        const p = await apiRequest('/predicadores');
        const a = await apiRequest('/asignaciones');
        const r = await apiRequest('/recordatorios');

        document.getElementById('stat-hermanos').textContent = p.length;

        const futuros = a.filter(asig => new Date(asig.fecha_sabado) >= new Date().setHours(0,0,0,0));
        if (futuros.length > 0) {
            futuros.sort((a, b) => new Date(a.fecha_sabado) - new Date(b.fecha_sabado));
            document.getElementById('stat-proximo').textContent = formatJustDate(futuros[0].fecha_sabado);
        } else {
            document.getElementById('stat-proximo').textContent = "Sin agendar";
        }

        const pendientes = r.filter(rec => !rec.enviado && rec.intentos < 3).length;
        document.getElementById('stat-pendientes').textContent = pendientes;
    } catch (e) { /* Error ya manejado en apiRequest */ }
}

async function loadPredicadores() {
    try {
        const res = await apiRequest('/predicadores');
        state.predicadores = res;

        const tbody = document.querySelector('#table-predicadores tbody');
        tbody.innerHTML = '';

        if (res.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay hermanos registrados aún.</td></tr>';
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
                        <option value="true" ${p.solo_tarde ? 'selected' : ''}>Solo Despedida (19:00)</option>
                    </select>
                </td>
                <td data-label="Estado"><span class="badge ${p.activo ? 'success' : 'error'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td data-label="Acciones"><button class="btn-text" style="color:var(--error); padding:0; font-size:0.9rem;" onclick="deletePredicador(${p.id}, '${p.nombre}')">🗑️ Eliminar</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {}
}

async function loadAsignaciones() {
    try {
        const res = await apiRequest('/asignaciones');
        const tbody = document.querySelector('#table-asignaciones tbody');
        tbody.innerHTML = '';

        if (res.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay cultos programados.</td></tr>';
            return;
        }

        res.forEach((a, index) => {
            const statusBadge = {
                'pendiente': '<span class="badge warning">⏳ Pendiente</span>',
                'confirmado': '<span class="badge success">✅ Confirmado</span>',
                'rechazado': '<span class="badge error">❌ Rechazado</span>'
            }[a.estado] || `<span class="badge">${a.estado}</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="ID">#${index + 1}</td>
                <td data-label="Predicador" style="font-weight:600">${a.predicador_nombre}</td>
                <td data-label="Sábado">${formatJustDate(a.fecha_sabado)}</td>
                <td data-label="Hora"><span class="badge info">${a.hora_culto}</span></td>
                <td data-label="Estado">${statusBadge}</td>
                <td data-label="Acciones"><button class="btn-text" style="color:var(--error); padding:0; font-size:0.9rem;" onclick="deleteAsignacion(${a.id})">🗑️ Eliminar</button></td>
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
        tbody.innerHTML = '';

        if (res.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay mensajes en el sistema.</td></tr>';
            return;
        }

        res.forEach((r, index) => {
            const tr = document.createElement('tr');
            let estadoBadge = r.enviado 
                ? '<span class="badge success">Enviado</span>' 
                : (r.intentos >= 3 ? '<span class="badge error">Fallido</span>' : '<span class="badge warning">Pendiente</span>');

            const errorDetalle = r.error_mensaje ? `<br><small style="color:var(--error); font-size:0.75rem">${r.error_mensaje.substring(0, 40)}...</small>` : '';

            tr.innerHTML = `
                <td data-label="ID">#${index + 1}</td>
                <td data-label="Teléfono">${r.telefono}</td>
                <td data-label="Título"><span class="badge info">${r.titulo}</span></td>
                <td data-label="Envío">${formatDate(r.fecha_envio)}</td>
                <td data-label="Estado">${estadoBadge}</td>
                <td data-label="Detalle">Intentos: ${r.intentos}/3 ${errorDetalle}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {}
}

// --- Formularios ---

document.getElementById('form-hermano').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('h-nombre').value;
    let telefono = document.getElementById('h-tel').value;
    const solo_tarde = document.getElementById('h-solo-tarde').checked;

    if (!telefono.startsWith('whatsapp:')) telefono = 'whatsapp:' + telefono;

    try {
        await apiRequest('/predicadores', {
            method: 'POST',
            body: JSON.stringify({ nombre, telefono, solo_tarde })
        });
        showToast('Hermano registrado exitosamente');
        closeModal('modal-hermano');
        loadPredicadores();
        loadDashboard();
    } catch (err) {}
});

async function updateDisponibilidad(id, value) {
    const solo_tarde = (value === 'true');
    try {
        await apiRequest(`/predicadores/${id}/disponibilidad`, {
            method: 'PATCH',
            body: JSON.stringify({ solo_tarde })
        });
        showToast('Disponibilidad actualizada');
        const pred = state.predicadores.find(p => p.id === id);
        if (pred) pred.solo_tarde = solo_tarde;
    } catch (err) {}
}

async function deletePredicador(id, nombre) {
    if (!confirm(`¿Estás seguro que deseas eliminar a ${nombre}? Esto también eliminará sus asignaciones futuras.`)) return;
    try {
        await apiRequest(`/predicadores/${id}`, { method: 'DELETE' });
        showToast('Hermano eliminado exitosamente');
        loadPredicadores();
        loadDashboard();
    } catch (err) {}
}

async function populatePredicadoresSelect() {
    const select = document.getElementById('a-predicador');
    select.innerHTML = '<option value="">Cargando...</option>';

    try {
        if (state.predicadores.length === 0) {
            state.predicadores = await apiRequest('/predicadores');
        }
        select.innerHTML = '<option value="" disabled selected>Selecciona un hermano</option>';
        state.predicadores.forEach(p => {
            if (p.activo) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.nombre;
                select.appendChild(opt);
            }
        });
    } catch(e) {}
}

document.getElementById('form-asignacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const predicador_id = document.getElementById('a-predicador').value;
    const fecha_sabado = document.getElementById('a-fecha').value;
    const hora_culto = document.getElementById('a-hora').value;

    try {
        await apiRequest('/asignaciones', {
            method: 'POST',
            body: JSON.stringify({ predicador_id, fecha_sabado, hora_culto })
        });
        showToast('Culto asignado y recordatorios creados');
        closeModal('modal-asignacion');
        loadAsignaciones();
        loadDashboard();
    } catch (err) {}
});

document.getElementById('form-sorteo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fecha_sabado = document.getElementById('s-fecha').value;
    const hora_culto = document.getElementById('s-hora').value;

    let activos = state.predicadores.filter(p => p.activo);
    if (hora_culto !== "19:00") activos = activos.filter(p => !p.solo_tarde);

    if (activos.length === 0) {
        showToast('No hay hermanos disponibles para este horario', true);
        return;
    }

    const ruletaContainer = document.getElementById('ruleta-container');
    const ruletaTexto = document.getElementById('ruleta-texto');
    const btnSubmit = document.getElementById('btn-submit-sorteo');
    const btnCancel = document.getElementById('btn-cancel-sorteo');

    ruletaContainer.style.display = 'block';
    btnSubmit.disabled = true;
    btnCancel.disabled = true;

    let iteraciones = 0;
    const maxIteraciones = 20;
    let ganador = null;

    const intervalo = setInterval(async () => {
        const randomIndex = Math.floor(Math.random() * activos.length);
        ruletaTexto.textContent = activos[randomIndex].nombre;
        iteraciones++;

        if (iteraciones >= maxIteraciones) {
            clearInterval(intervalo);
            ganador = activos[randomIndex];
            ruletaTexto.style.animation = 'none';
            ruletaTexto.style.color = '#fff';
            ruletaTexto.style.transform = 'scale(1.1)';
            ruletaTexto.innerHTML = `🎉 ¡${ganador.nombre}! 🎉`;

            try {
                await apiRequest('/asignaciones', {
                    method: 'POST',
                    body: JSON.stringify({ predicador_id: ganador.id, fecha_sabado, hora_culto })
                });
                showToast('Sorteo finalizado y guardado exitosamente');
                setTimeout(() => {
                    closeModal('modal-sorteo');
                    loadAsignaciones();
                    loadDashboard();
                    ruletaContainer.style.display = 'none';
                    ruletaTexto.style.animation = 'parpadeo 0.2s infinite alternate';
                    ruletaTexto.style.color = 'var(--primary)';
                    ruletaTexto.style.transform = 'none';
                    btnSubmit.disabled = false;
                    btnCancel.disabled = false;
                }, 2500);
            } catch (err) {
                btnSubmit.disabled = false;
                btnCancel.disabled = false;
            }
        }
    }, 100);
});

async function deleteAsignacion(id) {
    if (!confirm('¿Estás seguro de cancelar este culto?')) return;
    try {
        await apiRequest(`/asignaciones/${id}`, { method: 'DELETE' });
        showToast('Culto cancelado exitosamente');
        loadAsignaciones();
        loadDashboard();
    } catch (err) {}
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
});
