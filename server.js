// Café Bella Durmiente · Tingo María — servidor web
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

require('./db/database'); // crea la BD y el esquema al iniciar

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'cafe.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', require('./routes/publico'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  if (req.file) fs.unlink(req.file.path, () => {});
  let status = err.status || 500;
  let mensaje = err.message || 'Error';
  if (err instanceof multer.MulterError) {
    status = 400;
    mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera los 3 MB' : 'Error al subir la imagen';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; mensaje = 'JSON no válido';
  } else if (/UNIQUE constraint failed/.test(mensaje)) {
    status = 409; mensaje = 'Ya existe un registro con ese nombre';
  } else if (/FOREIGN KEY constraint failed/.test(mensaje)) {
    status = 409; mensaje = 'El registro está relacionado con otros datos o hace referencia a uno que no existe';
  } else if (/CHECK constraint failed/.test(mensaje)) {
    status = 400; mensaje = 'Algún valor no cumple las reglas de la base de datos';
  }
  if (status >= 500) {
    console.error(err);
    mensaje = 'Error interno del servidor';
  }
  res.status(status).json({ error: mensaje });
});

app.listen(PORT, () => {
  console.log(`☕ Café Bella Durmiente corriendo en http://localhost:${PORT}`);
  console.log(`🔐 Panel de administración:   http://localhost:${PORT}/admin`);
});
