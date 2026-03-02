-- ============================================================
-- Sistema de Predicadores ⛪
-- Ejecuta este script en tu SQL Editor de Supabase
-- ============================================================

-- 1. Tabla de Predicadores
CREATE TABLE IF NOT EXISTS predicadores (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT        NOT NULL,
  telefono    TEXT        NOT NULL,            -- Formato: +569XXXXXXXX
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  solo_tarde  BOOLEAN     NOT NULL DEFAULT FALSE, -- Solo puede predicar a las 19:00
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de Asignaciones (Cultos)
CREATE TABLE IF NOT EXISTS asignaciones (
  id             SERIAL PRIMARY KEY,
  predicador_id  INTEGER     REFERENCES predicadores(id) ON DELETE CASCADE,
  fecha_sabado   DATE        NOT NULL,            -- El sábado que corresponde
  hora_culto     TEXT        NOT NULL,            -- "10:30", "15:00", "19:00"
  estado         TEXT        NOT NULL DEFAULT 'pendiente', -- pendiente, confirmado, rechazado
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabla de Recordatorios
CREATE TABLE IF NOT EXISTS recordatorios (
  id             SERIAL PRIMARY KEY,
  titulo         TEXT        NOT NULL,
  mensaje        TEXT        NOT NULL,
  telefono       TEXT        NOT NULL,
  fecha_envio    TIMESTAMPTZ NOT NULL,
  id_asignacion  INTEGER     REFERENCES asignaciones(id) ON DELETE CASCADE,
  enviado        BOOLEAN     DEFAULT FALSE,
  intentos       INTEGER     DEFAULT 0,
  error_mensaje  TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar predicadores de ejemplo si la tabla está vacía
-- INSERT INTO predicadores (nombre, telefono) VALUES ('Hno. Luis', '+56978180049');
