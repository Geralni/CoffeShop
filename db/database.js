// Conexión a SQLite, creación del esquema y consultas compartidas
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { round2 } = require('../lib/util');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'cafe.db'));
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Ejecuta fn dentro de una transacción (todo o nada)
function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const SQL_PRODUCTO = `
SELECT p.id, p.nombre, p.descripcion, p.imagen, p.destacado, p.activo, p.creado_en,
       p.categoria_id, c.nombre AS categoria, c.slug AS categoria_slug,
       p.productor_id, pr.nombre AS productor, pr.altitud_msnm, d.nombre AS distrito,
       p.variedad_id, v.nombre AS variedad,
       p.proceso_id,  pc.nombre AS proceso,
       p.tueste_id,   t.nombre AS tueste,
       COALESCE(dv.descuento_pct, 0) AS descuento_pct,
       ROUND(COALESCE(r.promedio, 0), 1) AS rating,
       COALESCE(r.total, 0) AS total_resenas
FROM productos p
JOIN categorias c            ON c.id  = p.categoria_id
LEFT JOIN productores pr     ON pr.id = p.productor_id
LEFT JOIN distritos d        ON d.id  = pr.distrito_id
LEFT JOIN variedades v       ON v.id  = p.variedad_id
LEFT JOIN procesos pc        ON pc.id = p.proceso_id
LEFT JOIN niveles_tueste t   ON t.id  = p.tueste_id
LEFT JOIN v_descuento_vigente dv ON dv.producto_id = p.id
LEFT JOIN v_rating_producto r    ON r.producto_id  = p.id`;

// Devuelve productos con sus presentaciones (precio final con descuento) y notas de cata
function obtenerProductos(where = '', params = []) {
  const productos = db.prepare(`${SQL_PRODUCTO} ${where} ORDER BY p.destacado DESC, p.nombre`).all(...params);
  if (!productos.length) return [];

  const ids = productos.map((p) => p.id);
  const ph = ids.map(() => '?').join(',');
  const presentaciones = db.prepare(
    `SELECT id, producto_id, descripcion, precio, stock FROM presentaciones
     WHERE producto_id IN (${ph}) ORDER BY precio`).all(...ids);
  const notas = db.prepare(
    `SELECT pn.producto_id, n.id, n.nombre FROM producto_notas pn
     JOIN notas_cata n ON n.id = pn.nota_id
     WHERE pn.producto_id IN (${ph}) ORDER BY n.nombre`).all(...ids);

  const mapa = new Map();
  for (const p of productos) {
    p.presentaciones = [];
    p.notas = [];
    mapa.set(p.id, p);
  }
  for (const x of presentaciones) {
    const p = mapa.get(x.producto_id);
    p.presentaciones.push({
      id: x.id,
      descripcion: x.descripcion,
      precio: x.precio,
      precio_final: round2(x.precio * (1 - p.descuento_pct / 100)),
      stock: x.stock,
    });
  }
  for (const n of notas) mapa.get(n.producto_id).notas.push({ id: n.id, nombre: n.nombre });
  return productos;
}

// Busca un cliente por correo; si no existe lo crea
function clientePorEmail(nombre, email, telefono = null) {
  const existente = db.prepare('SELECT id FROM clientes WHERE email = ?').get(email);
  if (existente) {
    if (telefono) db.prepare('UPDATE clientes SET telefono = ? WHERE id = ?').run(telefono, existente.id);
    return existente.id;
  }
  return Number(db.prepare('INSERT INTO clientes (nombre, email, telefono) VALUES (?, ?, ?)')
    .run(nombre, email, telefono).lastInsertRowid);
}

// Carga datos de ejemplo la primera vez
if (db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n === 0) {
  require('./seed')(db, tx);
  console.log('✔ Base de datos creada con datos de ejemplo de Tingo María');
}

module.exports = { db, tx, obtenerProductos, clientePorEmail };
