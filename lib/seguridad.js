// Hash de contraseñas con scrypt (incluido en Node, sin dependencias)
const crypto = require('crypto');

function hashClave(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clave, sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

function verificarClave(clave, guardado) {
  const [sal, hash] = String(guardado).split(':');
  if (!sal || !hash) return false;
  const esperado = Buffer.from(hash, 'hex');
  const calculado = crypto.scryptSync(String(clave), sal, 64);
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

module.exports = { hashClave, verificarClave };
