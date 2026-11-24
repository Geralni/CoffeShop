// API pública de la tienda
const express = require('express');
const { db, tx, obtenerProductos, clientePorEmail } = require('../db/database');
const v = require('../lib/util');

const r = express.Router();

// Catálogo completo para la tienda
r.get('/catalogo', (req, res) => {
  const categorias = db.prepare(`
    SELECT c.id, c.nombre, c.slug, c.descripcion, COUNT(p.id) AS total
    FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id AND p.activo = 1
    GROUP BY c.id ORDER BY c.id`).all();
  const productos = obtenerProductos('WHERE p.activo = 1').filter((p) => p.presentaciones.length);
  res.json({ categorias, productos });
});

// Detalle de un producto con sus reseñas aprobadas
r.get('/productos/:id', (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const [producto] = obtenerProductos('WHERE p.id = ? AND p.activo = 1', [id]);
  if (!producto) v.fail(404, 'Producto no encontrado');
  producto.resenas = db.prepare(`
    SELECT r.id, r.calificacion, r.comentario, r.fecha, c.nombre AS cliente
    FROM resenas r JOIN clientes c ON c.id = r.cliente_id
    WHERE r.producto_id = ? AND r.aprobada = 1 ORDER BY r.fecha DESC`).all(id);
  res.json(producto);
});

// Nueva reseña (queda pendiente de aprobación del administrador)
r.post('/productos/:id/resenas', (req, res) => {
  const b = req.body || {};
  const productoId = v.entero(req.params.id, 'id', { min: 1, requerido: true });
  const nombre = v.texto(b.nombre, 'nombre', { max: 80, requerido: true });
  const correo = v.email(b.email, true);
  const calificacion = v.entero(b.calificacion, 'calificación', { min: 1, max: 5, requerido: true });
  const comentario = v.texto(b.comentario, 'comentario', { max: 600, requerido: true });

  const existe = db.prepare('SELECT id FROM productos WHERE id = ? AND activo = 1').get(productoId);
  if (!existe) v.fail(404, 'Producto no encontrado');

  tx(() => {
    const clienteId = clientePorEmail(nombre, correo);
    const ya = db.prepare('SELECT id FROM resenas WHERE producto_id = ? AND cliente_id = ?').get(productoId, clienteId);
    if (ya) v.fail(409, 'Ya registraste una reseña para este producto. ¡Gracias!');
    db.prepare('INSERT INTO resenas (producto_id, cliente_id, calificacion, comentario) VALUES (?, ?, ?, ?)')
      .run(productoId, clienteId, calificacion, comentario);
  });
  res.status(201).json({ mensaje: '¡Gracias! Tu reseña se publicará cuando sea revisada.' });
});

// Promociones vigentes (para el banner navideño)
r.get('/promociones/activas', (req, res) => {
  res.json(db.prepare(`
    SELECT id, titulo, descripcion, descuento_pct, fecha_inicio, fecha_fin FROM promociones
    WHERE activa = 1 AND date('now','localtime') BETWEEN fecha_inicio AND fecha_fin
    ORDER BY descuento_pct DESC`).all());
});

// Registrar pedido. Los precios se calculan en el servidor (no se confía en el navegador).
r.post('/pedidos', (req, res) => {
  const b = req.body || {};
  const c = b.cliente || {};
  const nombre = v.texto(c.nombre, 'nombre', { max: 100, requerido: true });
  const correo = v.email(c.email, true);
  const telefono = v.texto(c.telefono, 'teléfono', { max: 20, requerido: true });
  if (!/^[0-9+\s-]{6,20}$/.test(telefono)) v.fail(400, 'El teléfono no es válido');
  const direccion = v.texto(b.direccion, 'dirección', { max: 200, requerido: true });
  const nota = v.texto(b.nota, 'nota', { max: 300 });

  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) v.fail(400, 'El carrito está vacío');
  const items = new Map();
  for (const it of b.items) {
    const pid = v.entero(it.presentacion_id, 'presentación', { min: 1, requerido: true });
    const cant = v.entero(it.cantidad, 'cantidad', { min: 1, max: 100, requerido: true });
    items.set(pid, (items.get(pid) || 0) + cant);
  }

  const stPres = db.prepare(`
    SELECT pr.id, pr.precio, pr.stock, pr.descripcion, p.nombre, p.activo,
           COALESCE(dv.descuento_pct, 0) AS descuento
    FROM presentaciones pr JOIN productos p ON p.id = pr.producto_id
    LEFT JOIN v_descuento_vigente dv ON dv.producto_id = p.id
    WHERE pr.id = ?`);

  const pedidoId = tx(() => {
    const clienteId = clientePorEmail(nombre, correo, telefono);
    const id = Number(db.prepare('INSERT INTO pedidos (cliente_id, direccion_entrega, nota) VALUES (?, ?, ?)')
      .run(clienteId, direccion, nota).lastInsertRowid);
    for (const [presId, cantidad] of items) {
      const pr = stPres.get(presId);
      if (!pr || !pr.activo) v.fail(400, 'Uno de los productos ya no está disponible');
      if (pr.stock < cantidad) v.fail(409, `Stock insuficiente de ${pr.nombre} (${pr.descripcion}). Disponible: ${pr.stock}`);
      const precio = v.round2(pr.precio * (1 - pr.descuento / 100));
      db.prepare('INSERT INTO pedido_detalles (pedido_id, presentacion_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)')
        .run(id, presId, cantidad, precio);
      db.prepare('UPDATE presentaciones SET stock = stock - ? WHERE id = ?').run(cantidad, presId);
    }
    return id;
  });

  const { total } = db.prepare('SELECT total FROM v_pedidos_resumen WHERE id = ?').get(pedidoId);
  res.status(201).json({ id: pedidoId, total: v.round2(total) });
});

module.exports = r;
