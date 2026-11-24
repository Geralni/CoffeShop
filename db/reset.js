// Borra la base de datos para que se vuelva a crear con los datos de ejemplo
const fs = require('fs');
const path = require('path');

const archivo = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cafe.db');
for (const f of [archivo, `${archivo}-wal`, `${archivo}-shm`]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
console.log('Base de datos eliminada. Ejecuta "npm start" para crearla de nuevo.');
