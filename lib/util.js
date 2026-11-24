// Utilidades de validación y errores HTTP
class HttpError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const fail = (status, mensaje) => { throw new HttpError(status, mensaje); };
const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

function texto(v, campo, { max = 200, requerido = false } = {}) {
  if (vacio(v)) {
    if (requerido) fail(400, `El campo "${campo}" es obligatorio`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) fail(400, `El campo "${campo}" admite como máximo ${max} caracteres`);
  return s;
}

function entero(v, campo, { min = -Infinity, max = Infinity, requerido = false } = {}) {
  if (vacio(v)) {
    if (requerido) fail(400, `El campo "${campo}" es obligatorio`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `El campo "${campo}" no es un número entero válido`);
  return n;
}

function decimal(v, campo, { min = -Infinity, max = Infinity, requerido = false } = {}) {
  if (vacio(v)) {
    if (requerido) fail(400, `El campo "${campo}" es obligatorio`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `El campo "${campo}" no es un número válido`);
  return Math.round(n * 100) / 100;
}

function email(v, requerido = false) {
  const e = texto(v, 'correo', { max: 120, requerido });
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail(400, 'El correo electrónico no es válido');
  return e ? e.toLowerCase() : null;
}

function fecha(v, campo) {
  const f = texto(v, campo, { max: 10, requerido: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f))) fail(400, `La fecha "${campo}" no es válida`);
  return f;
}

const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0);
const round2 = (n) => Math.round(n * 100) / 100;
const slugify = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

module.exports = { HttpError, fail, texto, entero, decimal, email, fecha, bool, round2, slugify };
