// API del panel de administración (requiere sesión)
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, tx, obtenerProductos } = require('../db/database');
const v = require('../lib/util');
const { hashClave, verificarClave } = require('../lib/seguridad');

const r = express.Router();
const UPLOADS = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- Subida de imágenes ----------
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(new v.HttpError(400, 'Solo se permiten imágenes JPG, PNG, WEBP o GIF'));
  },
});

function borrarImagen(ruta) {
  if (ruta && ruta.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOADS, path.basename(ruta)), () => {});
  }
}

// ---------- Autenticación ----------
const intentos = new Map(); // ip -> { n, hasta }

r.post('/login', (req, res) => {
  const ip = req.ip;
  const reg = intentos.get(ip);
  if (reg && reg.hasta > Date.now()) v.fail(429, 'Demasiados intentos. Espera 5 minutos.');

  const b = req.body || {};
  const usuario = v.texto(b.usuario, 'usuario', { max: 50, requerido: true });
  const clave = v.texto(b.clave, 'contraseña', { max: 100, requerido: true });
  const admin = db.prepare('SELECT id, usuario, clave FROM administradores WHERE usuario = ?').get(usuario);

  if (!admin || !verificarClave(clave, admin.clave)) {
    const n = (reg?.n || 0) + 1;
    intentos.set(ip, { n, hasta: n >= 5 ? Date.now() + 5 * 60 * 1000 : 0 });
    v.fail(401, 'Usuario o contraseña incorrectos');
  }
  intentos.delete(ip);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'No se pudo iniciar sesión' });
    req.session.admin = { id: admin.id, usuario: admin.usuario };
    res.json({ usuario: admin.usuario });
  });
});

r.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

r.use((req, res, next) => {
  if (!req.session.admin) return res.status(401).json({ error: 'Inicia sesión como administrador' });
  next();
});

r.get('/me', (req, res) => res.json(req.session.admin));

r.post('/cambiar-clave', (req, res) => {
  const b = req.body || {};
  const actual = v.texto(b.actual, 'contraseña actual', { max: 100, requerido: true });
  const nueva = v.texto(b.nueva, 'nueva contraseña', { max: 100, requerido: true });
  if (nueva.length < 8) v.fail(400, 'La nueva contraseña debe tener al menos 8 caracteres');
  const admin = db.prepare('SELECT clave FROM administradores WHERE id = ?').get(req.session.admin.id);
  if (!verificarClave(actual, admin.clave)) v.fail(400, 'La contraseña actual no es correcta');
  db.prepare('UPDATE administradores SET clave = ? WHERE id = ?').run(hashClave(nueva), req.session.admin.id);
  res.json({ mensaje: 'Contraseña actualizada' });
});

// ---------- Resumen ----------
r.get('/resumen', (req, res) => {
  const uno = (sql) => db.prepare(sql).get();
  res.json({
    productos: uno('SELECT COUNT(*) AS n FROM productos WHERE activo = 1').n,
    pedidosPendientes: uno("SELECT COUNT(*) AS n FROM pedidos WHERE estado = 'pendiente'").n,
    resenasPendientes: uno('SELECT COUNT(*) AS n FROM resenas WHERE aprobada = 0').n,
    ventas: v.round2(uno("SELECT COALESCE(SUM(total),0) AS n FROM v_pedidos_resumen WHERE estado <> 'cancelado'").n),
    stockBajo: db.prepare(`
      SELECT p.nombre, pr.descripcion, pr.stock FROM presentaciones pr
      JOIN productos p ON p.id = pr.producto_id
      WHERE pr.stock <= 5 AND p.activo = 1 ORDER BY pr.stock LIMIT 10`).all(),
    masVendidos: db.prepare(`
      SELECT p.nombre, SUM(d.cantidad) AS unidades FROM pedido_detalles d
      JOIN pedidos pe ON pe.id = d.pedido_id AND pe.estado <> 'cancelado'
      JOIN presentaciones pr ON pr.id = d.presentacion_id
      JOIN productos p ON p.id = pr.producto_id
      GROUP BY p.id ORDER BY unidades DESC LIMIT 5`).all(),
  });
});

// ---------- Tablas maestras (catálogos) ----------
const MAESTROS = {
  categorias:     { cols: ['nombre', 'descripcion'] },
  distritos:      { cols: ['nombre'] },
  productores:    { cols: ['nombre', 'distrito_id', 'altitud_msnm', 'descripcion'] },
  variedades:     { cols: ['nombre'] },
  procesos:       { cols: ['nombre'] },
  niveles_tueste: { cols: ['nombre'] },
  notas_cata:     { cols: ['nombre'] },
};

function tablaMaestra(nombre) {
  if (!Object.hasOwn(MAESTROS, nombre)) v.fail(404, 'Catálogo no encontrado');
  return MAESTROS[nombre];
}

function leerMaestro(tabla, b) {
  const d = { nombre: v.texto(b.nombre, 'nombre', { max: 80, requerido: true }) };
  if (tabla === 'categorias') {
    d.descripcion = v.texto(b.descripcion, 'descripción', { max: 300 });
    // El slug se fija al crear y no cambia al renombrar (la tienda lo usa, p. ej. "panetones")
    d.slug = v.slugify(b.slug || d.nombre) || `categoria-${Date.now()}`;
  }
  if (tabla === 'productores') {
    d.distrito_id = v.entero(b.distrito_id, 'distrito', { min: 1, requerido: true });
    d.altitud_msnm = v.entero(b.altitud_msnm, 'altitud', { min: 300, max: 3000 });
    d.descripcion = v.texto(b.descripcion, 'descripción', { max: 300 });
  }
  return d;
}

r.get('/maestros', (req, res) => {
  const out = {};
  for (const t of Object.keys(MAESTROS)) {
    out[t] = t === 'productores'
      ? db.prepare(`SELECT pr.*, d.nombre AS distrito FROM productores pr
                    JOIN distritos d ON d.id = pr.distrito_id ORDER BY pr.nombre`).all()
      : db.prepare(`SELECT * FROM ${t} ORDER BY nombre`).all();
  }
  res.json(out);
});

r.post('/maestros/:tabla', (req, res) => {
  tablaMaestra(req.params.tabla);
  const d = leerMaestro(req.params.tabla, req.body || {});
  const cols = Object.keys(d);
  const id = db.prepare(`INSERT INTO ${req.params.tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map((c) => d[c])).lastInsertRowid;
  res.status(201).json({ id: Number(id) });
});

r.put('/maestros/:tabla/:id', (req, res) => {
  tablaMaestra(req.params.tabla);
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const actual = db.prepare(`SELECT * FROM ${req.params.tabla} WHERE id = ?`).get(id);
  if (!actual) v.fail(404, 'Registro no encontrado');
  const d = leerMaestro(req.params.tabla, { ...actual, ...(req.body || {}) });
  const cols = Object.keys(d);
  db.prepare(`UPDATE ${req.params.tabla} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...cols.map((c) => d[c]), id);
  res.json({ ok: true });
});

r.delete('/maestros/:tabla/:id', (req, res) => {
  tablaMaestra(req.params.tabla);
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  try {
    db.prepare(`DELETE FROM ${req.params.tabla} WHERE id = ?`).run(id);
  } catch (e) {
    if (/FOREIGN KEY/.test(e.message)) v.fail(409, 'No se puede eliminar: hay productos o productores que lo usan');
    throw e;
  }
  res.json({ ok: true });
});

// ---------- Productos ----------
function leerProducto(b) {
  const datos = {
    nombre: v.texto(b.nombre, 'nombre', { max: 120, requerido: true }),
    descripcion: v.texto(b.descripcion, 'descripción', { max: 1000, requerido: true }),
    categoria_id: v.entero(b.categoria_id, 'categoría', { min: 1, requerido: true }),
    productor_id: v.entero(b.productor_id, 'productor', { min: 1 }),
    variedad_id: v.entero(b.variedad_id, 'variedad', { min: 1 }),
    proceso_id: v.entero(b.proceso_id, 'proceso', { min: 1 }),
    tueste_id: v.entero(b.tueste_id, 'tueste', { min: 1 }),
    destacado: v.bool(b.destacado),
    activo: b.activo === undefined ? 1 : v.bool(b.activo),
  };
  let pres, notas;
  try {
    pres = JSON.parse(b.presentaciones || '[]');
    notas = JSON.parse(b.notas || '[]');
  } catch {
    v.fail(400, 'Formato de presentaciones o notas no válido');
  }
  if (!Array.isArray(pres) || !pres.length) v.fail(400, 'Agrega al menos una presentación con su precio');
  if (!Array.isArray(notas)) v.fail(400, 'Formato de notas no válido');
  pres = pres.map((p, i) => ({
    id: v.entero(p.id, 'id', { min: 1 }),
    descripcion: v.texto(p.descripcion, `presentación ${i + 1}`, { max: 60, requerido: true }),
    precio: v.decimal(p.precio, `precio de presentación ${i + 1}`, { min: 0.1, max: 99999, requerido: true }),
    stock: v.entero(p.stock, `stock de presentación ${i + 1}`, { min: 0, max: 100000, requerido: true }),
  }));
  const nombres = pres.map((p) => p.descripcion.toLowerCase());
  if (new Set(nombres).size !== nombres.length) v.fail(400, 'Hay presentaciones repetidas');
  notas = [...new Set(notas.map((n) => v.entero(n, 'nota', { min: 1, requerido: true })))];
  return { datos, pres, notas };
}

function guardarPresentaciones(productoId, lista) {
  const actuales = db.prepare('SELECT id, descripcion FROM presentaciones WHERE producto_id = ?').all(productoId);
  const conservar = new Set(lista.filter((p) => p.id).map((p) => p.id));
  // 1) eliminar las que ya no vienen (si tienen ventas, se impide)
  for (const a of actuales) {
    if (!conservar.has(a.id)) {
      const vendida = db.prepare('SELECT 1 FROM pedido_detalles WHERE presentacion_id = ? LIMIT 1').get(a.id);
      if (vendida) v.fail(409, `La presentación "${a.descripcion}" tiene pedidos registrados. Ponle stock 0 en lugar de eliminarla.`);
      db.prepare('DELETE FROM presentaciones WHERE id = ?').run(a.id);
    }
  }
  // 2) actualizar existentes e insertar nuevas
  const ids = new Set(actuales.map((a) => a.id));
  for (const p of lista) {
    if (p.id && ids.has(p.id)) {
      db.prepare('UPDATE presentaciones SET descripcion = ?, precio = ?, stock = ? WHERE id = ?')
        .run(p.descripcion, p.precio, p.stock, p.id);
    } else {
      db.prepare('INSERT INTO presentaciones (producto_id, descripcion, precio, stock) VALUES (?, ?, ?, ?)')
        .run(productoId, p.descripcion, p.precio, p.stock);
    }
  }
}

function guardarNotas(productoId, notas) {
  db.prepare('DELETE FROM producto_notas WHERE producto_id = ?').run(productoId);
  const st = db.prepare('INSERT INTO producto_notas (producto_id, nota_id) VALUES (?, ?)');
  for (const n of notas) st.run(productoId, n);
}

r.get('/productos', (req, res) => res.json(obtenerProductos()));

r.post('/productos', upload.single('imagen'), (req, res) => {
  const { datos, pres, notas } = leerProducto(req.body || {});
  datos.imagen = req.file ? `/uploads/${req.file.filename}` : null;
  const id = tx(() => {
    const cols = Object.keys(datos);
    const nuevo = Number(db.prepare(`INSERT INTO productos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...cols.map((c) => datos[c])).lastInsertRowid);
    guardarPresentaciones(nuevo, pres);
    guardarNotas(nuevo, notas);
    return nuevo;
  });
  res.status(201).json(obtenerProductos('WHERE p.id = ?', [id])[0]);
});

r.put('/productos/:id', upload.single('imagen'), (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const actual = db.prepare('SELECT imagen FROM productos WHERE id = ?').get(id);
  if (!actual) v.fail(404, 'Producto no encontrado');
  const { datos, pres, notas } = leerProducto(req.body || {});
  if (req.file) datos.imagen = `/uploads/${req.file.filename}`;
  else if (v.bool(req.body.quitar_imagen)) datos.imagen = null;
  else datos.imagen = actual.imagen;

  tx(() => {
    const cols = Object.keys(datos);
    db.prepare(`UPDATE productos SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((c) => datos[c]), id);
    guardarPresentaciones(id, pres);
    guardarNotas(id, notas);
  });
  if (actual.imagen !== datos.imagen) borrarImagen(actual.imagen);
  res.json(obtenerProductos('WHERE p.id = ?', [id])[0]);
});

r.delete('/productos/:id', (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const actual = db.prepare('SELECT imagen FROM productos WHERE id = ?').get(id);
  if (!actual) v.fail(404, 'Producto no encontrado');
  try {
    db.prepare('DELETE FROM productos WHERE id = ?').run(id);
  } catch (e) {
    if (!/FOREIGN KEY/.test(e.message)) throw e;
    // Tiene ventas: se conserva el historial y solo se oculta de la tienda
    db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(id);
    return res.json({ desactivado: true, mensaje: 'El producto tiene pedidos, así que se desactivó en lugar de eliminarse.' });
  }
  borrarImagen(actual.imagen);
  res.json({ eliminado: true });
});

// ---------- Reseñas ----------
r.get('/resenas', (req, res) => {
  res.json(db.prepare(`
    SELECT r.id, r.calificacion, r.comentario, r.aprobada, r.fecha,
           p.id AS producto_id, p.nombre AS producto, c.nombre AS cliente, c.email
    FROM resenas r JOIN productos p ON p.id = r.producto_id JOIN clientes c ON c.id = r.cliente_id
    ORDER BY r.aprobada, r.fecha DESC`).all());
});

r.post('/resenas', (req, res) => {
  const b = req.body || {};
  const productoId = v.entero(b.producto_id, 'producto', { min: 1, requerido: true });
  const nombre = v.texto(b.nombre, 'nombre del cliente', { max: 80, requerido: true });
  const correo = v.email(b.email);
  const calificacion = v.entero(b.calificacion, 'calificación', { min: 1, max: 5, requerido: true });
  const comentario = v.texto(b.comentario, 'comentario', { max: 600, requerido: true });
  tx(() => {
    let clienteId = correo && db.prepare('SELECT id FROM clientes WHERE email = ?').get(correo)?.id;
    if (!clienteId) {
      clienteId = Number(db.prepare('INSERT INTO clientes (nombre, email) VALUES (?, ?)').run(nombre, correo).lastInsertRowid);
    }
    db.prepare('INSERT INTO resenas (producto_id, cliente_id, calificacion, comentario, aprobada) VALUES (?, ?, ?, ?, 1)')
      .run(productoId, clienteId, calificacion, comentario);
  });
  res.status(201).json({ ok: true });
});

r.patch('/resenas/:id', (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  db.prepare('UPDATE resenas SET aprobada = ? WHERE id = ?').run(v.bool((req.body || {}).aprobada), id);
  res.json({ ok: true });
});

r.delete('/resenas/:id', (req, res) => {
  db.prepare('DELETE FROM resenas WHERE id = ?').run(v.entero(req.params.id, 'id', { min: 1, requerido: true }));
  res.json({ ok: true });
});

// ---------- Pedidos ----------
const ESTADOS = ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'];

r.get('/pedidos', (req, res) => {
  res.json(db.prepare('SELECT * FROM v_pedidos_resumen ORDER BY id DESC').all());
});

r.get('/pedidos/:id', (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const pedido = db.prepare('SELECT * FROM v_pedidos_resumen WHERE id = ?').get(id);
  if (!pedido) v.fail(404, 'Pedido no encontrado');
  pedido.detalles = db.prepare(`
    SELECT p.nombre AS producto, pr.descripcion AS presentacion, d.cantidad, d.precio_unitario,
           d.cantidad * d.precio_unitario AS subtotal
    FROM pedido_detalles d JOIN presentaciones pr ON pr.id = d.presentacion_id
    JOIN productos p ON p.id = pr.producto_id WHERE d.pedido_id = ?`).all(id);
  res.json(pedido);
});

r.patch('/pedidos/:id', (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const estado = (req.body || {}).estado;
  if (!ESTADOS.includes(estado)) v.fail(400, 'Estado no válido');
  const pedido = db.prepare('SELECT estado FROM pedidos WHERE id = ?').get(id);
  if (!pedido) v.fail(404, 'Pedido no encontrado');
  if (pedido.estado === 'cancelado') v.fail(409, 'Un pedido cancelado ya no puede cambiar de estado');
  tx(() => {
    db.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').run(estado, id);
    if (estado === 'cancelado') {
      // Devolver el stock
      db.prepare(`UPDATE presentaciones SET stock = stock + (
        SELECT cantidad FROM pedido_detalles WHERE pedido_id = ? AND presentacion_id = presentaciones.id)
        WHERE id IN (SELECT presentacion_id FROM pedido_detalles WHERE pedido_id = ?)`).run(id, id);
    }
  });
  res.json({ ok: true });
});

// ---------- Promociones ----------
function leerPromocion(b) {
  const d = {
    titulo: v.texto(b.titulo, 'título', { max: 120, requerido: true }),
    descripcion: v.texto(b.descripcion, 'descripción', { max: 400 }),
    descuento_pct: v.entero(b.descuento_pct, 'descuento', { min: 1, max: 90, requerido: true }),
    fecha_inicio: v.fecha(b.fecha_inicio, 'inicio'),
    fecha_fin: v.fecha(b.fecha_fin, 'fin'),
    activa: v.bool(b.activa),
  };
  if (d.fecha_fin < d.fecha_inicio) v.fail(400, 'La fecha de fin debe ser posterior al inicio');
  const productos = Array.isArray(b.productos) ? [...new Set(b.productos.map((x) => v.entero(x, 'producto', { min: 1, requerido: true })))] : [];
  return { d, productos };
}

function guardarProductosPromo(promoId, productos) {
  db.prepare('DELETE FROM promocion_productos WHERE promocion_id = ?').run(promoId);
  const st = db.prepare('INSERT INTO promocion_productos (promocion_id, producto_id) VALUES (?, ?)');
  for (const p of productos) st.run(promoId, p);
}

r.get('/promociones', (req, res) => {
  const promos = db.prepare(`SELECT *, (activa = 1 AND date('now','localtime') BETWEEN fecha_inicio AND fecha_fin) AS vigente
    FROM promociones ORDER BY fecha_inicio DESC`).all();
  const rel = db.prepare('SELECT producto_id FROM promocion_productos WHERE promocion_id = ?');
  for (const p of promos) p.productos = rel.all(p.id).map((x) => x.producto_id);
  res.json(promos);
});

r.post('/promociones', (req, res) => {
  const { d, productos } = leerPromocion(req.body || {});
  const id = tx(() => {
    const nuevo = Number(db.prepare(`INSERT INTO promociones (titulo, descripcion, descuento_pct, fecha_inicio, fecha_fin, activa)
      VALUES (?, ?, ?, ?, ?, ?)`).run(d.titulo, d.descripcion, d.descuento_pct, d.fecha_inicio, d.fecha_fin, d.activa).lastInsertRowid);
    guardarProductosPromo(nuevo, productos);
    return nuevo;
  });
  res.status(201).json({ id });
});

r.put('/promociones/:id', (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const { d, productos } = leerPromocion(req.body || {});
  tx(() => {
    const r2 = db.prepare(`UPDATE promociones SET titulo = ?, descripcion = ?, descuento_pct = ?, fecha_inicio = ?, fecha_fin = ?, activa = ?
      WHERE id = ?`).run(d.titulo, d.descripcion, d.descuento_pct, d.fecha_inicio, d.fecha_fin, d.activa, id);
    if (!r2.changes) v.fail(404, 'Promoción no encontrada');
    guardarProductosPromo(id, productos);
  });
  res.json({ ok: true });
});

r.delete('/promociones/:id', (req, res) => {
  db.prepare('DELETE FROM promociones WHERE id = ?').run(v.entero(req.params.id, 'id', { min: 1, requerido: true }));
  res.json({ ok: true });
});

module.exports = r;
