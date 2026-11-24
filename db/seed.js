// Datos de ejemplo (ficticios) inspirados en Tingo María - Leoncio Prado - Huánuco
const { hashClave } = require('../lib/seguridad');

module.exports = function seed(db, tx) {
  tx(() => {
    const insertarNombres = (tabla, nombres) => {
      const st = db.prepare(`INSERT INTO ${tabla} (nombre) VALUES (?)`);
      const ids = {};
      for (const n of nombres) ids[n] = Number(st.run(n).lastInsertRowid);
      return ids;
    };

    // --- Catálogos ---
    const cat = {};
    const stCat = db.prepare('INSERT INTO categorias (nombre, slug, descripcion) VALUES (?, ?, ?)');
    for (const [nombre, slug, desc] of [
      ['Café de especialidad', 'cafe-especialidad', 'Café en grano y molido de las alturas de Leoncio Prado.'],
      ['Bebidas de café', 'bebidas', 'Licores y bebidas listas para tomar.'],
      ['Dulces de café', 'dulces', 'Bombones y galletas con café y cacao de la selva.'],
      ['Panetones navideños', 'panetones', 'Panetones artesanales horneados en Tingo María.'],
    ]) cat[slug] = Number(stCat.run(nombre, slug, desc).lastInsertRowid);

    const dist = insertarNombres('distritos', [
      'Rupa-Rupa', 'José Crespo y Castillo', 'Luyando', 'Mariano Dámaso Beraún',
      'Hermilio Valdizán', 'Daniel Alomía Robles', 'Castillo Grande', 'Pucayacu',
    ]);
    const varie = insertarNombres('variedades', ['Typica', 'Caturra', 'Catimor', 'Bourbon', 'Geisha']);
    const proc = insertarNombres('procesos', ['Lavado', 'Natural', 'Honey']);
    const tues = insertarNombres('niveles_tueste', ['Claro', 'Medio', 'Oscuro']);
    const notas = insertarNombres('notas_cata', [
      'Chocolate', 'Panela', 'Cítricos', 'Floral', 'Frutos rojos', 'Caramelo',
      'Miel', 'Cacao', 'Nuez', 'Vainilla', 'Pasas', 'Canela',
    ]);

    const prod = {};
    const stProd = db.prepare('INSERT INTO productores (nombre, distrito_id, altitud_msnm, descripcion) VALUES (?, ?, ?, ?)');
    for (const [nombre, distrito, alt, desc] of [
      ['Finca La Divisoria', 'Hermilio Valdizán', 1650, 'Cafetales entre neblina, en la ruta hacia La Divisoria.'],
      ['Finca Alto Pumahuasi', 'Daniel Alomía Robles', 1450, 'Familia cafetalera con tres generaciones de tradición.'],
      ['Asociación Cafetalera Las Palmas', 'Mariano Dámaso Beraún', 1200, 'Pequeños productores que trabajan en conjunto.'],
      ['Tostaduría Bella Durmiente', 'Rupa-Rupa', 660, 'Nuestro taller de tueste y panadería en Tingo María.'],
    ]) prod[nombre] = Number(stProd.run(nombre, dist[distrito], alt, desc).lastInsertRowid);

    // --- Productos ---
    const stP = db.prepare(`INSERT INTO productos
      (nombre, descripcion, categoria_id, productor_id, variedad_id, proceso_id, tueste_id, destacado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const stPres = db.prepare('INSERT INTO presentaciones (producto_id, descripcion, precio, stock) VALUES (?, ?, ?, ?)');
    const stNota = db.prepare('INSERT INTO producto_notas (producto_id, nota_id) VALUES (?, ?)');
    const P = {};

    const productos = [
      { n: 'Café Bella Durmiente Tueste Medio', c: 'cafe-especialidad', pr: 'Finca Alto Pumahuasi', v: 'Caturra', p: 'Lavado', t: 'Medio', d: 1,
        desc: 'Nuestro café insignia: equilibrado, dulce y con cuerpo medio. Ideal para pasada, prensa francesa o espresso.',
        pres: [['250 g molido', 28, 40], ['250 g en grano', 28, 30], ['500 g en grano', 52, 20], ['1 kg en grano', 95, 10]],
        notas: ['Chocolate', 'Panela', 'Cítricos'] },
      { n: 'Café La Divisoria Geisha Natural', c: 'cafe-especialidad', pr: 'Finca La Divisoria', v: 'Geisha', p: 'Natural', t: 'Claro', d: 1,
        desc: 'Microlote de altura con aroma floral intenso. Una joya cultivada entre la neblina de Hermilio Valdizán.',
        pres: [['250 g en grano', 45, 15]], notas: ['Floral', 'Frutos rojos', 'Miel'] },
      { n: 'Café Pumahuasi Honey', c: 'cafe-especialidad', pr: 'Finca Alto Pumahuasi', v: 'Bourbon', p: 'Honey', t: 'Medio', d: 0,
        desc: 'Proceso honey que conserva el mucílago y regala una taza dulce y sedosa.',
        pres: [['250 g molido', 34, 25], ['500 g en grano', 64, 12]], notas: ['Caramelo', 'Miel', 'Panela'] },
      { n: 'Café Huallaga Intenso', c: 'cafe-especialidad', pr: 'Asociación Cafetalera Las Palmas', v: 'Catimor', p: 'Lavado', t: 'Oscuro', d: 0,
        desc: 'Tueste oscuro de cuerpo fuerte, como la corriente del río Huallaga. Perfecto con leche.',
        pres: [['250 g molido', 24, 50], ['500 g molido', 45, 30]], notas: ['Cacao', 'Nuez'] },
      { n: 'Licor de Café Tingalés', c: 'bebidas', pr: 'Tostaduría Bella Durmiente', d: 0,
        desc: 'Licor artesanal macerado con café de altura y un toque de vainilla. Para compartir en familia.',
        pres: [['Botella 375 ml', 35, 20], ['Botella 750 ml', 60, 10]], notas: ['Vainilla', 'Caramelo'] },
      { n: 'Cold Brew de la Selva', c: 'bebidas', pr: 'Tostaduría Bella Durmiente', d: 0,
        desc: 'Café infusionado en frío por 18 horas. Refrescante para el calor tingalés.',
        pres: [['Botella 300 ml', 12, 40], ['Pack x6', 65, 8]], notas: ['Chocolate', 'Cítricos'] },
      { n: 'Bombones de Café y Cacao', c: 'dulces', pr: 'Tostaduría Bella Durmiente', d: 0,
        desc: 'Bombones de cacao amazónico rellenos de ganache de café. Caja de regalo.',
        pres: [['Caja x12', 22, 30], ['Caja x24', 40, 15]], notas: ['Cacao', 'Chocolate'] },
      { n: 'Panetón de Café Tingo María', c: 'panetones', pr: 'Tostaduría Bella Durmiente', d: 1,
        desc: 'Panetón artesanal con masa madre, café de altura y pasas. El sabor de la Navidad tingalesa.',
        pres: [['Caja 900 g', 39, 60], ['Lata 900 g', 49, 25], ['Mini 500 g', 25, 40]], notas: ['Pasas', 'Chocolate', 'Canela'] },
      { n: 'Panetón de Chocolate y Cacao Amazónico', c: 'panetones', pr: 'Tostaduría Bella Durmiente', d: 1,
        desc: 'Lleno de chispas de chocolate con cacao de la selva de Huánuco y un ligero toque de café.',
        pres: [['Caja 900 g', 42, 50]], notas: ['Cacao', 'Chocolate'] },
      { n: 'Pack Navideño Bella Durmiente', c: 'panetones', pr: 'Tostaduría Bella Durmiente', d: 1,
        desc: 'El regalo perfecto: panetón de café 900 g + café Bella Durmiente 250 g + taza artesanal.',
        pres: [['Pack regalo', 79, 30]], notas: ['Chocolate', 'Panela', 'Pasas'] },
    ];

    for (const x of productos) {
      const id = Number(stP.run(x.n, x.desc, cat[x.c], prod[x.pr] ?? null, varie[x.v] ?? null,
        proc[x.p] ?? null, tues[x.t] ?? null, x.d).lastInsertRowid);
      P[x.n] = id;
      for (const [d, precio, stock] of x.pres) stPres.run(id, d, precio, stock);
      for (const nota of x.notas) stNota.run(id, notas[nota]);
    }

    // --- Clientes y reseñas ---
    const stCli = db.prepare('INSERT INTO clientes (nombre, email, telefono) VALUES (?, ?, ?)');
    const cli = {};
    for (const [n, e, t] of [
      ['María Quispe', 'maria@ejemplo.com', '962000111'],
      ['Luis Rengifo', 'luis@ejemplo.com', '962000222'],
      ['Carmen Tafur', 'carmen@ejemplo.com', '962000333'],
      ['Jorge Panduro', 'jorge@ejemplo.com', '962000444'],
    ]) cli[n] = Number(stCli.run(n, e, t).lastInsertRowid);

    const stRes = db.prepare('INSERT INTO resenas (producto_id, cliente_id, calificacion, comentario, aprobada) VALUES (?, ?, ?, ?, ?)');
    for (const [p, c, cal, com, ap] of [
      ['Café Bella Durmiente Tueste Medio', 'María Quispe', 5, 'Riquísimo, se siente el chocolate. Ya es mi café de todas las mañanas.', 1],
      ['Café Bella Durmiente Tueste Medio', 'Luis Rengifo', 4, 'Muy buen cuerpo, lo preparo en prensa francesa.', 1],
      ['Café La Divisoria Geisha Natural', 'Carmen Tafur', 5, '¡Increíble aroma floral! No sabía que en Huánuco había café así.', 1],
      ['Panetón de Café Tingo María', 'Jorge Panduro', 5, 'Suavecito y con aroma a café. Lo compré para toda la familia.', 1],
      ['Panetón de Café Tingo María', 'María Quispe', 5, 'El mejor panetón que he probado, nada que envidiar a los de Lima.', 1],
      ['Pack Navideño Bella Durmiente', 'Luis Rengifo', 5, 'Lo regalé a mi jefe y le encantó. La taza es preciosa.', 1],
      ['Café Huallaga Intenso', 'Jorge Panduro', 4, 'Fuerte como me gusta, ideal con leche.', 0],
    ]) stRes.run(P[p], cli[c], cal, com, ap);

    // --- Promoción navideña ---
    const promo = Number(db.prepare(`INSERT INTO promociones (titulo, descripcion, descuento_pct, fecha_inicio, fecha_fin)
      VALUES (?, ?, ?, ?, ?)`).run(
      'Navidad con aroma a Tingo María',
      'Panetones artesanales y packs navideños con descuento especial.',
      15, '2026-11-01', '2026-12-31').lastInsertRowid);
    const stPP = db.prepare('INSERT INTO promocion_productos (promocion_id, producto_id) VALUES (?, ?)');
    for (const n of ['Panetón de Café Tingo María', 'Panetón de Chocolate y Cacao Amazónico', 'Pack Navideño Bella Durmiente']) {
      stPP.run(promo, P[n]);
    }

    // --- Pedidos de ejemplo ---
    const presDe = (prod, desc) =>
      db.prepare('SELECT id, precio FROM presentaciones WHERE producto_id = ? AND descripcion = ?').get(P[prod], desc);
    const stPed = db.prepare('INSERT INTO pedidos (cliente_id, direccion_entrega, estado) VALUES (?, ?, ?)');
    const stDet = db.prepare('INSERT INTO pedido_detalles (pedido_id, presentacion_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)');
    const ped1 = Number(stPed.run(cli['María Quispe'], 'Av. Raymondi 345, Tingo María', 'entregado').lastInsertRowid);
    const a = presDe('Café Bella Durmiente Tueste Medio', '250 g molido');
    stDet.run(ped1, a.id, 2, a.precio);
    const ped2 = Number(stPed.run(cli['Jorge Panduro'], 'Jr. Monzón 120, Castillo Grande', 'pendiente').lastInsertRowid);
    const b = presDe('Panetón de Café Tingo María', 'Caja 900 g');
    stDet.run(ped2, b.id, 3, Math.round(b.precio * 0.85 * 100) / 100);

    // --- Administrador por defecto ---
    db.prepare('INSERT INTO administradores (usuario, clave) VALUES (?, ?)').run('admin', hashClave('tingo2026'));
  });
};
