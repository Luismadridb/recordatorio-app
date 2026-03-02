// Base URL for API
const API_URL = ''; // Same origin

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
    }, 3000);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'modal-asignacion') {
        populatePredicadoresSelect();
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.querySelector(`#${id} form`).reset();
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('es-CL', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatJustDate(dateString) {
    // Si la BD devuelve "2026-02-28T00:00:00.000Z", extraemos solo "2026-02-28" 
    const isodate = dateString.split('T')[0];
    const date = new Date(isodate + 'T00:00:00');
    return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

// --- Fetch de Datos Centralizados ---
let state = {
    predicadores: [],
    asignaciones: [],
    recordatorios: []
};

async function fetchData(endpoint) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error(`Error fetching ${endpoint}:`, err);
        showToast(`Error de conexión con el servidor`, true);
        return [];
    }
}

// --- Carga de Vistas ---

async function loadDashboard() {
    const p = await fetchData('/predicadores');
    const a = await fetchData('/asignaciones');
    const r = await fetchData('/recordatorios');

    document.getElementById('stat-hermanos').textContent = p.length;

    // Proximo culto (el primero en el futuro o más reciente)
    const futuros = a.filter(asig => new Date(asig.fecha_sabado) >= new Date());
    if (futuros.length > 0) {
        futuros.sort((a, b) => new Date(a.fecha_sabado) - new Date(b.fecha_sabado));
        document.getElementById('stat-proximo').textContent = formatJustDate(futuros[0].fecha_sabado);
    } else {
        document.getElementById('stat-proximo').textContent = "Sin agendar";
    }

    // Pendientes
    const pendientes = r.filter(rec => !rec.enviado && rec.intentos < 3).length;
    document.getElementById('stat-pendientes').textContent = pendientes;
}

async function loadPredicadores() {
    const res = await fetchData('/predicadores');
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
}

async function loadAsignaciones() {
    const res = await fetchData('/asignaciones');
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
}

async function loadMensajes() {
    const res = await fetchData('/recordatorios');
    // Ordenar por más recientes primero
    res.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));

    const tbody = document.querySelector('#table-mensajes tbody');
    tbody.innerHTML = '';

    if (res.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay mensajes en el sistema.</td></tr>';
        return;
    }

    res.forEach((r, index) => {
        const tr = document.createElement('tr');

        let estadoBadge = '';
        if (r.enviado) estadoBadge = '<span class="badge success">Enviado</span>';
        else if (r.intentos >= 3) estadoBadge = '<span class="badge error">Fallido</span>';
        else estadoBadge = '<span class="badge warning">Pendiente</span>';

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
}

// --- Formularios ---

document.getElementById('form-hermano').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('h-nombre').value;
    let telefono = document.getElementById('h-tel').value;
    const solo_tarde = document.getElementById('h-solo-tarde').checked;

    // Auto-agregar whatsapp: si el form no lo tiene
    if (!telefono.startsWith('whatsapp:')) {
        telefono = 'whatsapp:' + telefono;
    }

    try {
        const res = await fetch(`${API_URL}/predicadores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, telefono, solo_tarde })
        });

        if (res.ok) {
            showToast('Hermano registrado exitosamente');
            closeModal('modal-hermano');
            loadPredicadores();
            loadDashboard();
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al registrar', true);
        }
    } catch (err) {
        showToast('Error de conexión', true);
    }
});

async function updateDisponibilidad(id, value) {
    const solo_tarde = (value === 'true');
    try {
        const res = await fetch(`${API_URL}/predicadores/${id}/disponibilidad`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ solo_tarde })
        });

        if (res.ok) {
            showToast('Disponibilidad actualizada');
            // Actualizar estado local para que los sorteos funcionen sin recargar todo si es necesario
            const pred = state.predicadores.find(p => p.id === id);
            if (pred) pred.solo_tarde = solo_tarde;
        } else {
            showToast('Error al actualizar', true);
        }
    } catch (err) {
        showToast('Error de conexión', true);
    }
}

async function deletePredicador(id, nombre) {
    if (!confirm(`¿Estás seguro que deseas eliminar a ${nombre}? Esto también eliminará sus asignaciones futuras completas.`)) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/predicadores/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('Hermano eliminado exitosamente');
            loadPredicadores();
            loadDashboard();
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al eliminar', true);
        }
    } catch (err) {
        showToast('Error de conexión', true);
    }
}

async function populatePredicadoresSelect() {
    const select = document.getElementById('a-predicador');
    select.innerHTML = '<option value="">Cargando...</option>';

    if (state.predicadores.length === 0) {
        state.predicadores = await fetchData('/predicadores');
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
}

document.getElementById('form-asignacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const predicador_id = document.getElementById('a-predicador').value;
    const fecha_sabado = document.getElementById('a-fecha').value;
    const hora_culto = document.getElementById('a-hora').value;

    try {
        const res = await fetch(`${API_URL}/asignaciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ predicador_id, fecha_sabado, hora_culto })
        });

        if (res.ok) {
            showToast('Culto asignado y recordatorios creados');
            closeModal('modal-asignacion');
            loadAsignaciones();
            loadDashboard();
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al asignar', true);
        }
    } catch (err) {
        showToast('Error de conexión', true);
    }
});

document.getElementById('form-sorteo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fecha_sabado = document.getElementById('s-fecha').value;
    const hora_culto = document.getElementById('s-hora').value;

    let activos = state.predicadores.filter(p => p.activo);

    // Filtro disponibilidad de horario
    if (hora_culto !== "19:00") {
        activos = activos.filter(p => !p.solo_tarde);
    }

    if (activos.length === 0) {
        showToast('No hay hermanos disponibles para este horario', true);
        return;
    }

    // UI states
    const ruletaContainer = document.getElementById('ruleta-container');
    const ruletaTexto = document.getElementById('ruleta-texto');
    const btnSubmit = document.getElementById('btn-submit-sorteo');
    const btnCancel = document.getElementById('btn-cancel-sorteo');

    ruletaContainer.style.display = 'block';
    btnSubmit.disabled = true;
    btnCancel.disabled = true;

    // Animación de "ruleta"
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

            // Efecto final
            ruletaTexto.style.animation = 'none';
            ruletaTexto.style.color = '#fff';
            ruletaTexto.style.transform = 'scale(1.1)';
            ruletaTexto.style.transition = 'all 0.3s ease';
            ruletaTexto.innerHTML = `🎉 ¡${ganador.nombre}! 🎉`;

            // Enviar al Backend
            try {
                const res = await fetch(`${API_URL}/asignaciones`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ predicador_id: ganador.id, fecha_sabado, hora_culto })
                });

                if (res.ok) {
                    showToast('Sorteo finalizado y guardado exitosamente');
                    setTimeout(() => {
                        closeModal('modal-sorteo');
                        loadAsignaciones();
                        loadDashboard();

                        // reset ui
                        ruletaContainer.style.display = 'none';
                        ruletaTexto.style.animation = 'parpadeo 0.2s infinite alternate';
                        ruletaTexto.style.color = 'var(--primary)';
                        ruletaTexto.style.transform = 'none';
                        btnSubmit.disabled = false;
                        btnCancel.disabled = false;
                    }, 2500);

                } else {
                    throw new Error('Error al asignar');
                }
            } catch (err) {
                showToast('Error de conexión al guardar el ganador', true);
                btnSubmit.disabled = false;
                btnCancel.disabled = false;
            }
        }
    }, 100);
});

async function deleteAsignacion(id) {
    if (!confirm('¿Estás seguro de cancelar este culto? Se eliminarán los recordatorios de WhatsApp pendientes para este hermano.')) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/asignaciones/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('Culto cancelado exitosamente');
            loadAsignaciones();
            loadDashboard();
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al cancelar', true);
        }
    } catch (err) {
        showToast('Error de conexión', true);
    }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
});
