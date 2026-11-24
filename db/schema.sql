-- =====================================================================
--  Café Bella Durmiente · Tingo María (Huánuco - Perú)
--  Esquema relacional normalizado (1FN, 2FN y 3FN)
--  Motor: SQLite (node:sqlite)
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
--  TABLAS MAESTRAS (catálogos). Cada dato descriptivo se guarda UNA vez
--  y los productos lo referencian por su id (evita redundancia).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT    NOT NULL UNIQUE,
  slug        TEXT    NOT NULL UNIQUE,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS distritos (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT    NOT NULL UNIQUE           -- distritos de la provincia de Leoncio Prado
);

CREATE TABLE IF NOT EXISTS productores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT    NOT NULL UNIQUE,
  distrito_id  INTEGER NOT NULL REFERENCES distritos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  altitud_msnm INTEGER CHECK (altitud_msnm BETWEEN 300 AND 3000),
  descripcion  TEXT
);

CREATE TABLE IF NOT EXISTS variedades     (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS procesos       (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS niveles_tueste (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS notas_cata     (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);

-- ---------------------------------------------------------------------
--  PRODUCTOS
--  Los atributos de café (productor, variedad, proceso, tueste) son
--  opcionales: un panetón o un licor no los necesita.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT    NOT NULL UNIQUE,
  descripcion  TEXT    NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id)     ON DELETE RESTRICT,
  productor_id INTEGER          REFERENCES productores(id)    ON DELETE RESTRICT,
  variedad_id  INTEGER          REFERENCES variedades(id)     ON DELETE RESTRICT,
  proceso_id   INTEGER          REFERENCES procesos(id)       ON DELETE RESTRICT,
  tueste_id    INTEGER          REFERENCES niveles_tueste(id) ON DELETE RESTRICT,
  imagen       TEXT,
  destacado    INTEGER NOT NULL DEFAULT 0 CHECK (destacado IN (0,1)),
  activo       INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);

-- Relación N:M producto ↔ notas de cata (1FN: nada de listas en una celda)
CREATE TABLE IF NOT EXISTS producto_notas (
  producto_id INTEGER NOT NULL REFERENCES productos(id)  ON DELETE CASCADE,
  nota_id     INTEGER NOT NULL REFERENCES notas_cata(id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, nota_id)
);

-- Un producto tiene varias presentaciones (250 g, 500 g, 1 kg...),
-- cada una con su propio precio y stock.
CREATE TABLE IF NOT EXISTS presentaciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  descripcion TEXT    NOT NULL,
  precio      REAL    NOT NULL CHECK (precio > 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (producto_id, descripcion)
);
CREATE INDEX IF NOT EXISTS idx_presentaciones_producto ON presentaciones(producto_id);

-- ---------------------------------------------------------------------
--  CLIENTES, RESEÑAS Y PEDIDOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre    TEXT NOT NULL,
  email     TEXT UNIQUE,                    -- NULL permitido (reseñas cargadas por el admin)
  telefono  TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS resenas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cliente_id   INTEGER NOT NULL REFERENCES clientes(id)  ON DELETE CASCADE,
  calificacion INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentario   TEXT    NOT NULL,
  aprobada     INTEGER NOT NULL DEFAULT 0 CHECK (aprobada IN (0,1)),
  fecha        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (producto_id, cliente_id)          -- una reseña por cliente y producto
);
CREATE INDEX IF NOT EXISTS idx_resenas_producto ON resenas(producto_id);

CREATE TABLE IF NOT EXISTS pedidos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  direccion_entrega TEXT    NOT NULL,
  nota              TEXT,
  estado            TEXT    NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','confirmado','enviado','entregado','cancelado')),
  fecha             TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- precio_unitario NO es redundante: es el precio pactado en la venta
-- (dato histórico); el precio de la presentación puede cambiar después.
CREATE TABLE IF NOT EXISTS pedido_detalles (
  pedido_id       INTEGER NOT NULL REFERENCES pedidos(id)        ON DELETE CASCADE,
  presentacion_id INTEGER NOT NULL REFERENCES presentaciones(id) ON DELETE RESTRICT,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL    NOT NULL CHECK (precio_unitario >= 0),
  PRIMARY KEY (pedido_id, presentacion_id)
);

-- ---------------------------------------------------------------------
--  PROMOCIONES (ej. campaña navideña de panetones)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promociones (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo        TEXT    NOT NULL,
  descripcion   TEXT,
  descuento_pct INTEGER NOT NULL CHECK (descuento_pct BETWEEN 1 AND 90),
  fecha_inicio  TEXT    NOT NULL,
  fecha_fin     TEXT    NOT NULL,
  activa        INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS promocion_productos (
  promocion_id INTEGER NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
  producto_id  INTEGER NOT NULL REFERENCES productos(id)   ON DELETE CASCADE,
  PRIMARY KEY (promocion_id, producto_id)
);

-- ---------------------------------------------------------------------
--  ADMINISTRADORES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS administradores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario   TEXT NOT NULL UNIQUE,
  clave     TEXT NOT NULL,                  -- hash scrypt "sal:hash", nunca texto plano
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------
--  VISTAS: los datos DERIVADOS (totales, promedios, descuento vigente)
--  se calculan, no se almacenan (evita dependencias transitivas).
-- ---------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_descuento_vigente AS
SELECT pp.producto_id, MAX(pr.descuento_pct) AS descuento_pct
FROM promocion_productos pp
JOIN promociones pr ON pr.id = pp.promocion_id
WHERE pr.activa = 1
  AND date('now','localtime') BETWEEN pr.fecha_inicio AND pr.fecha_fin
GROUP BY pp.producto_id;

CREATE VIEW IF NOT EXISTS v_rating_producto AS
SELECT producto_id, AVG(calificacion) AS promedio, COUNT(*) AS total
FROM resenas
WHERE aprobada = 1
GROUP BY producto_id;

CREATE VIEW IF NOT EXISTS v_pedidos_resumen AS
SELECT pe.id, pe.fecha, pe.estado, pe.direccion_entrega, pe.nota,
       c.id AS cliente_id, c.nombre AS cliente, c.email, c.telefono,
       COALESCE(SUM(d.cantidad * d.precio_unitario), 0) AS total,
       COALESCE(SUM(d.cantidad), 0) AS unidades
FROM pedidos pe
JOIN clientes c ON c.id = pe.cliente_id
LEFT JOIN pedido_detalles d ON d.pedido_id = pe.id
GROUP BY pe.id;
