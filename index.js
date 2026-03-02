require("dotenv").config();

// ⚠️ Durante desarrollo con certificados autofirmados se puede deshabilitar la verificación TLS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const { Pool } = require("pg");
const cron = require("node-cron");
const twilio = require("twilio");
const cors = require("cors");

const app = express();
app.use(cors()); // Permitir que la App móvil se conecte desde internet
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Servir frontend (antes de la seguridad para que cargue el login y el CSS)
app.use(express.static('public'));

// ─── SEGURIDAD ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "iglesia123";

// Middleware de autenticación simple para la API
const authMiddleware = (req, res, next) => {
  // Excluir rutas públicas y la ruta de login de la autenticación
  if (
    req.path === "/webhook" ||
    req.path === "/login" ||
    req.path === "/" ||
    req.path.includes(".") // Permite archivos estáticos ( .css, .js, .png, etc)
  ) {
    return next();
  }

  const authHeader = req.headers["x-admin-password"];
  if (authHeader === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: "No autorizado. Contraseña incorrecta." });
  }
};

app.use(authMiddleware);

// Endpoint de Login
app.post("/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, mensaje: "Sesión iniciada correctamente" });
  } else {
    res.status(401).json({ error: "Contraseña incorrecta" });
  }
});


// ─── PostgreSQL ───────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("Error inesperado en el pool de PostgreSQL:", err.stack || err);
});

// ─── Twilio ───────────────────────────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function enviarMensaje(to, body) {
  const msg = await twilioClient.messages.create({
    from: process.env.TWILIO_FROM,
    to,
    body,
  });
  console.log(`Mensaje enviado a ${to} — SID: ${msg.sid}`);
  return msg;
}

// ─── Logger de requests (diagnóstico) ────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url} | body: ${JSON.stringify(req.body)}`);
  next();
});

// ─── Rutas ────────────────────────────────────────────────────────────────────

// ─── CRUD PREDICADORES ────────────────────────────────────────────────────────

// Listar predicadores
app.get("/predicadores", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM predicadores ORDER BY nombre ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear predicador
app.post("/predicadores", async (req, res) => {
  const { nombre, telefono, solo_tarde } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: "Nombre y teléfono obligatorios" });
  try {
    const result = await pool.query(
      "INSERT INTO predicadores (nombre, telefono, solo_tarde) VALUES ($1, $2, $3) RETURNING *",
      [nombre, telefono, !!solo_tarde]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar predicador
app.delete("/predicadores/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM predicadores WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Predicador no encontrado" });
    res.json({ mensaje: "Predicador eliminado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar disponibilidad
app.patch("/predicadores/:id/disponibilidad", async (req, res) => {
  const { id } = req.params;
  const { solo_tarde } = req.body;
  try {
    const result = await pool.query(
      "UPDATE predicadores SET solo_tarde = $1 WHERE id = $2 RETURNING *",
      [solo_tarde, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Predicador no encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ASIGNACIONES Y AUTOMATIZACIÓN ───────────────────────────────

/**
 * POST /asignaciones
 * Crea una asignación y programa automáticamente los 2 recordatorios.
 * Body: { predicador_id, fecha_sabado, hora_culto }
 * fecha_sabado: "YYYY-MM-DD"
 */
app.post("/asignaciones", async (req, res) => {
  const { predicador_id, fecha_sabado, hora_culto } = req.body;

  // Si no se envían datos, se gatilla el Sorteo Inteligente (Raffle)
  if (!predicador_id && !fecha_sabado && !hora_culto) {
    try {
      const creados = await ejecutarSorteo();
      if (creados === 0) {
        return res.status(200).json({ error: "No hay cultos pendientes por sortear o no hay hermanos disponibles para las horas faltantes." });
      }
      return res.status(201).json({ mensaje: `¡Sorteo Exitoso! Se crearon ${creados} asignaciones y se programaron sus recordatorios.` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!predicador_id || !fecha_sabado || !hora_culto) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  try {
    // 1. Obtener datos del predicador
    const predResult = await pool.query("SELECT * FROM predicadores WHERE id = $1", [predicador_id]);
    if (predResult.rows.length === 0) return res.status(404).json({ error: "Predicador no encontrado" });
    const predicador = predResult.rows[0];

    // 2. Crear la asignación
    const asigResult = await pool.query(
      "INSERT INTO asignaciones (predicador_id, fecha_sabado, hora_culto) VALUES ($1, $2, $3) RETURNING *",
      [predicador_id, fecha_sabado, hora_culto]
    );
    const asignacion = asigResult.rows[0];

    // 3. Programar los 2 recordatorios
    const sabado = new Date(fecha_sabado);

    // Recordatorio 1: Lunes de esa semana (o ahora mismo si ya pasó)
    const lunes = new Date(sabado);
    lunes.setDate(sabado.getDate() - 5);
    lunes.setHours(9, 0, 0); // 9:00 AM del lunes

    // AJUSTE: Si el lunes ya pasó (ej: estamos a domingo noche), para que lo reciba YA
    let fechaEnvioAviso = lunes;
    if (fechaEnvioAviso <= new Date()) {
      fechaEnvioAviso = new Date(Date.now() + 10000); // 10 segundos después
    }

    // Recordatorio 2: Miércoles (3 días antes del sábado)
    const miercoles = new Date(sabado);
    miercoles.setDate(sabado.getDate() - 3);
    miercoles.setHours(10, 0, 0); // 10:00 AM del miércoles

    const msgAviso = `Bendiciones ${predicador.nombre}, la iglesia le informa que le ha sido asignado para predicar este sábado ${fecha_sabado} en el culto de las ${hora_culto}.\n\n¿Confirma su asistencia?\nResponda *1* para Confirmar ✅\nResponda *2* si No estará en la ciudad este sábado ❌`;
    const msgFinal = `Hermano ${predicador.nombre}, le recordamos que faltan 3 días para su predicación este sábado a las ${hora_culto}. Estaremos orando por usted.`;

    // Insertar en la tabla de recordatorios (que el cron procesará)
    await pool.query(
      `INSERT INTO recordatorios (titulo, mensaje, telefono, fecha_envio, id_asignacion) VALUES 
       ($1, $2, $3, $4, $5),
       ($6, $7, $8, $9, $10)`,
      [
        'Aviso Inicial', msgAviso, predicador.telefono, fechaEnvioAviso.toISOString(), asignacion.id,
        'Recordatorio Final', msgFinal, predicador.telefono, miercoles.toISOString(), asignacion.id
      ]
    );

    res.status(201).json({ asignacion, mensaje: "Asignación creada y 2 recordatorios programados" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Listar asignaciones
app.get("/asignaciones", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, p.nombre as predicador_nombre 
      FROM asignaciones a 
      JOIN predicadores p ON a.predicador_id = p.id 
      ORDER BY a.fecha_sabado ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar asignación
app.delete("/asignaciones/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM asignaciones WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Asignación no encontrada" });
    res.json({ mensaje: "Asignación eliminada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WEBHOOK TWILIO (RESPUESTAS WHATSAPP) ──────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const { From, Body } = req.body;
  const telefono = From; // Formato whatsapp:+569...
  const respuesta = Body.trim();

  console.log(`[Webhook] Respuesta recibida de ${telefono}: "${respuesta}"`);

  try {
    // 1. Buscar la asignación pendiente más cercana para este teléfono
    const asigRes = await pool.query(`
      SELECT a.*, p.nombre as predicador_nombre
      FROM asignaciones a
      JOIN predicadores p ON a.predicador_id = p.id
      WHERE p.telefono = $1 AND a.estado = 'pendiente' AND a.fecha_sabado >= CURRENT_DATE
      ORDER BY a.fecha_sabado ASC
      LIMIT 1
    `, [telefono]);

    if (asigRes.rows.length === 0) {
      console.log(`[Webhook] No se encontró asignación pendiente para ${telefono}`);
      return res.status(200).send("No pending assignment found");
    }

    const asignacion = asigRes.rows[0];

    if (respuesta === "1") {
      // CONFIRMAR
      await pool.query("UPDATE asignaciones SET estado = 'confirmado' WHERE id = $1", [asignacion.id]);
      await enviarMensaje(telefono, `¡Muchas gracias hermano ${asignacion.predicador_nombre}! Su asistencia para las ${asignacion.hora_culto} ha quedado confirmada. Que Dios le bendiga.`);
    }
    else if (respuesta === "2") {
      // RECHAZAR
      await pool.query("UPDATE asignaciones SET estado = 'rechazado' WHERE id = $1", [asignacion.id]);
      await enviarMensaje(telefono, `Entendido hermano. Hemos cancelado su asignación. Esperamos que tenga un buen viaje.`);

      console.log(`[Webhook] Buscando sustituto para el sábado ${asignacion.fecha_sabado} a las ${asignacion.hora_culto}...`);
      await sortearSustituto(asignacion);
    }

    res.set('Content-Type', 'text/xml');
    res.status(200).send("<Response></Response>");
  } catch (err) {
    console.error("[Webhook] Error:", err);
    res.status(500).send("Error");
  }
});

async function sortearSustituto(original) {
  try {
    const fecha = original.fecha_sabado;
    const hora = original.hora_culto;

    // 1. Obtener predicadores activos excluyendo al que rechazó
    const predRes = await pool.query("SELECT * FROM predicadores WHERE activo = TRUE AND id != $1", [original.predicador_id]);
    let candidatos = predRes.rows;

    // 2. Excluir a los que ya tienen turno ese mismo día
    const ocupadosRes = await pool.query("SELECT predicador_id FROM asignaciones WHERE fecha_sabado = $1 AND estado != 'rechazado'", [fecha]);
    const idsOcupados = ocupadosRes.rows.map(r => r.predicador_id);
    candidatos = candidatos.filter(p => !idsOcupados.includes(p.id));

    // 3. Respetar 'solo_tarde'
    if (hora !== "19:00") {
      candidatos = candidatos.filter(p => !p.solo_tarde);
    }

    if (candidatos.length === 0) {
      console.log("[Sustituto] No hay candidatos disponibles para el re-sorteo.");
      return;
    }

    // 4. Preferencia por descanso (no predicaron el sábado anterior)
    const sabAnt = new Date(fecha);
    sabAnt.setDate(sabAnt.getDate() - 7);
    const anteriorRes = await pool.query("SELECT predicador_id FROM asignaciones WHERE fecha_sabado = $1", [sabAnt.toISOString().split('T')[0]]);
    const idsAnterior = anteriorRes.rows.map(r => r.predicador_id);

    const descansados = candidatos.filter(p => !idsAnterior.includes(p.id));
    if (descansados.length > 0) candidatos = descansados;

    // 5. Elegir ganador
    const ganador = candidatos[Math.floor(Math.random() * candidatos.length)];

    // 6. Crear nueva asignación
    const nuevaRes = await pool.query(
      "INSERT INTO asignaciones (predicador_id, fecha_sabado, hora_culto, estado) VALUES ($1, $2, $3, 'pendiente') RETURNING *",
      [ganador.id, fecha, hora]
    );
    const nueva = nuevaRes.rows[0];

    // 7. Programar recordatorios para el nuevo hno
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setHours(9, 0, 0);

    const sabadoObj = new Date(fecha);
    const miercoles = new Date(sabadoObj);
    miercoles.setDate(sabadoObj.getDate() - 3);
    miercoles.setHours(10, 0, 0);

    const msgAviso = `Bendiciones ${ganador.nombre}, la iglesia le informa que ha sido asignado como sustituto para predicar este sábado ${fecha} a las ${hora}.\n\n¿Confirma su asistencia?\nResponda *1* para Confirmar ✅\nResponda *2* si No estará en la ciudad ❌`;
    const msgFinal = `Hermano ${ganador.nombre}, recordatorio: su predicación es este sábado a las ${hora}.`;

    await pool.query(
      `INSERT INTO recordatorios (titulo, mensaje, telefono, fecha_envio, id_asignacion) VALUES 
      ($1, $2, $3, $4, $5),
      ($6, $7, $8, $9, $10)`,
      [
        'Aviso Sustituto', msgAviso, ganador.telefono, lunes.toISOString(), nueva.id,
        'Recordatorio Final', msgFinal, ganador.telefono, miercoles.toISOString(), nueva.id
      ]
    );
    console.log(`[Sustituto] Asignado ${ganador.nombre} exitosamente.`);

  } catch (err) {
    console.error("[Sustituto] Error:", err);
  }
}

// Listar recordatorios
app.get("/recordatorios", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM recordatorios ORDER BY fecha_envio ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── CRON JOB (EL MOTOR) ──────────────────────────────────────────────────────

const cronSchedule = process.env.CRON_SCHEDULE || "* * * * *";

cron.schedule(cronSchedule, async () => {
  console.log(`[Cron] Revisando recordatorios... (${new Date().toLocaleString()})`);

  try {
    const timeRes = await pool.query("SELECT NOW() as now");
    const dbNow = timeRes.rows[0].now;

    const result = await pool.query(
      `SELECT * FROM recordatorios
       WHERE enviado = FALSE AND intentos < 3 AND fecha_envio <= $1
       ORDER BY fecha_envio ASC`,
      [dbNow]
    );

    if (result.rows.length > 0) {
      console.log(`[Cron] Encontrados ${result.rows.length} recordatorios pendientes (DB Now: ${dbNow})`);
    }

    for (const rec of result.rows) {
      console.log(`[Cron] Procesando ID: ${rec.id} (${rec.titulo}) para ${rec.telefono}`);
      try {
        await enviarMensaje(rec.telefono, rec.mensaje);
        await pool.query(
          "UPDATE recordatorios SET enviado = TRUE, intentos = intentos + 1, error_mensaje = NULL WHERE id = $1",
          [rec.id]
        );
      } catch (err) {
        const msgError = err.message || JSON.stringify(err);
        await pool.query(
          "UPDATE recordatorios SET intentos = intentos + 1, error_mensaje = $1 WHERE id = $2",
          [msgError, rec.id]
        );
      }
    }
  } catch (error) {
    console.error("[Cron Mensajes] Error:", error.stack || error);
  }
});

// ─── TAREA SEMANAL: SORTEO AUTOMÁTICO (FALLBACK) ───────────────
// Todos los lunes a las 08:00 AM (0 8 * * 1)
const autoRaffleSchedule = process.env.AUTO_RAFFLE_SCHEDULE || "0 8 * * 1";

async function ejecutarSorteo() {
  console.log(`[Sorteo] Iniciando verificación de asignaciones...`);
  let creados = 0;
  try {
    // 1. Obtener fecha del próximo sábado
    const hoy = new Date();
    const diasHastaSabado = (6 - hoy.getDay() + 7) % 7;
    const proximoSabado = new Date(hoy);
    proximoSabado.setDate(hoy.getDate() + diasHastaSabado);

    // Formatear como YYYY-MM-DD local
    const year = proximoSabado.getFullYear();
    const month = String(proximoSabado.getMonth() + 1).padStart(2, '0');
    const day = String(proximoSabado.getDate()).padStart(2, '0');
    const fecha_sabado_str = `${year}-${month}-${day}`;

    // 2. Revisar qué cultos ya están programados
    const asignacionesActuales = await pool.query(
      "SELECT * FROM asignaciones WHERE fecha_sabado = $1",
      [fecha_sabado_str]
    );

    const horasPosibles = ["10:30", "15:00", "19:00"];
    const horasCubiertas = asignacionesActuales.rows.map(a => a.hora_culto);
    const horasFaltantes = horasPosibles.filter(h => !horasCubiertas.includes(h));

    if (horasFaltantes.length === 0) {
      console.log(`[Sorteo] Los 3 cultos del sábado ${fecha_sabado_str} ya están cubiertos. No requiere acción.`);
      return 0;
    }

    // 3. Obtener hermanos activos
    const predicadoresRes = await pool.query("SELECT * FROM predicadores WHERE activo = TRUE");
    let predicadoresActivos = predicadoresRes.rows;

    if (predicadoresActivos.length === 0) {
      console.log(`[Sorteo] ALERTA: No hay ningún predicador activo.`);
      return 0;
    }

    const asignadosEsteSabado = asignacionesActuales.rows.map(a => a.predicador_id);
    const sabadoAnterior = new Date(proximoSabado);
    sabadoAnterior.setDate(proximoSabado.getDate() - 7);
    const yearAnt = sabadoAnterior.getFullYear();
    const monthAnt = String(sabadoAnterior.getMonth() + 1).padStart(2, '0');
    const dayAnt = String(sabadoAnterior.getDate()).padStart(2, '0');

    const asignacionesAnteriores = await pool.query(
      "SELECT predicador_id FROM asignaciones WHERE fecha_sabado = $1",
      [`${yearAnt}-${monthAnt}-${dayAnt}`]
    );
    const asignadosSabadoAnterior = asignacionesAnteriores.rows.map(a => a.predicador_id);

    const asignadosEsteCiclo = [];

    for (const hora of horasFaltantes) {
      let candidatos = predicadoresActivos.filter(p => !asignadosEsteSabado.includes(p.id) && !asignadosEsteCiclo.includes(p.id));

      if (hora !== "19:00") {
        candidatos = candidatos.filter(p => !p.solo_tarde);
      }

      if (candidatos.length === 0) {
        candidatos = predicadoresActivos.filter(p => !asignadosEsteCiclo.includes(p.id));
        if (candidatos.length === 0) candidatos = predicadoresActivos;
      }

      const candidatosDescansados = candidatos.filter(p => !asignadosSabadoAnterior.includes(p.id));
      if (candidatosDescansados.length > 0) {
        candidatos = candidatosDescansados;
      }

      const ganador = candidatos[Math.floor(Math.random() * candidatos.length)];
      asignadosEsteCiclo.push(ganador.id);

      const asigResult = await pool.query(
        "INSERT INTO asignaciones (predicador_id, fecha_sabado, hora_culto) VALUES ($1, $2, $3) RETURNING *",
        [ganador.id, fecha_sabado_str, hora]
      );
      const asignacion = asigResult.rows[0];
      creados++;

      const sabadoFinal = new Date(fecha_sabado_str + 'T12:00:00');
      const lunesLimit = new Date(hoy);
      lunesLimit.setHours(9, 0, 0);

      // AJUSTE: Si ya pasaron las 9 AM (ej: hoy es domingo a las 10 PM), lo enviamos en 10 segs
      let fechaEnvioSorteo = lunesLimit;
      if (fechaEnvioSorteo <= new Date()) {
        fechaEnvioSorteo = new Date(Date.now() + 10000); // 10 segundos
      }

      const miercoles = new Date(sabadoFinal);
      miercoles.setDate(sabadoFinal.getDate() - 3);
      miercoles.setHours(10, 0, 0);

      const msgAviso = `Bendiciones ${ganador.nombre}, el sistema inteligente le ha asignado para predicar este sábado ${fecha_sabado_str} en el culto de las ${hora}.\n\n¿Confirma su asistencia?\nResponda *1* para Confirmar ✅\nResponda *2* si No estará en la ciudad este sábado ❌`;
      const msgFinal = `Hermano ${ganador.nombre}, le recordamos que faltan 3 días para su predicación este sábado a las ${hora}. Estaremos orando por usted.`;

      await pool.query(
        `INSERT INTO recordatorios (titulo, mensaje, telefono, fecha_envio, id_asignacion) VALUES 
               ($1, $2, $3, $4, $5),
               ($6, $7, $8, $9, $10)`,
        [
          'Aviso Automático', msgAviso, ganador.telefono, fechaEnvioSorteo.toISOString(), asignacion.id,
          'Recordatorio Final', msgFinal, ganador.telefono, miercoles.toISOString(), asignacion.id
        ]
      );
    }
    return creados;
  } catch (error) {
    console.error("[Sorteo] Error fatal:", error.stack || error);
    throw error;
  }
}

cron.schedule(autoRaffleSchedule, async () => {
  console.log(`[Cron Sorteo] Gatillando sorteo semanal...`);
  await ejecutarSorteo();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Corriendo: http://localhost:${PORT}`);
});