require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        await client.connect();
        console.log("Conectado a la base de datos...");

        const sqlPath = path.join(__dirname, "schema.sql");
        const sql = fs.readFileSync(sqlPath, "utf8");

        console.log("Ejecutando script de migración...");
        await client.query(sql);

        // Migración específica para las nuevas columnas si la tabla ya existía
        await client.query(`
      ALTER TABLE recordatorios ADD COLUMN IF NOT EXISTS intentos INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE recordatorios ADD COLUMN IF NOT EXISTS error_mensaje TEXT;
      ALTER TABLE recordatorios ADD COLUMN IF NOT EXISTS id_asignacion INTEGER REFERENCES asignaciones(id) ON DELETE CASCADE;
    `);

        console.log("¡Migración completada con éxito! ✅");
    } catch (err) {
        console.error("Error durante la migración:", err.message);
    } finally {
        await client.end();
    }
}

migrate();
