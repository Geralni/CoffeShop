// Funciones compartidas por la tienda y el panel de administración
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const soles = (n) => `S/ ${Number(n || 0).toFixed(2)}`;

async function api(url, opciones = {}) {
  const op = { credentials: 'same-origin', ...opciones };
  if (op.body && !(op.body instanceof FormData)) {
    op.headers = { 'Content-Type': 'application/json', ...(op.headers || {}) };
    op.body = JSON.stringify(op.body);
  }
  const res = await fetch(url, op);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(datos.error || 'Ocurrió un error');
    err.status = res.status;
    throw err;
  }
  return datos;
}

let toastTimer;
function toast(mensaje, error = false) {
  const t = $('#toast');
  t.textContent = mensaje;
  t.classList.toggle('error', error);
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
}

function estrellas(n) {
  const r = Math.round(Number(n) || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// Imagen ilustrada (SVG) cuando el producto no tiene foto
function imagenProducto(p) {
  if (p.imagen) return p.imagen;
  const paletas = [['#6b3e26', '#e0a526'], ['#0f3d2e', '#f4c95d'], ['#7c2d12', '#fcd34d'], ['#1d6b4f', '#f4a261'], ['#3e2416', '#d4a373']];
  let h = 0;
  for (const c of String(p.nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = paletas[h % paletas.length];
  const crema = '#fbf5ea';
  let figura;
  switch (p.categoria_slug) {
    case 'panetones':
      figura = `
        <path d="M78 150 Q150 40 222 150Z" fill="#c8812b"/>
        <circle cx="120" cy="120" r="5" fill="#5b2a12"/><circle cx="160" cy="105" r="5" fill="#5b2a12"/>
        <circle cx="185" cy="130" r="5" fill="#5b2a12"/><circle cx="140" cy="135" r="4" fill="#5b2a12"/>
        <rect x="74" y="148" width="152" height="96" rx="6" fill="${b}"/>
        <rect x="74" y="148" width="152" height="96" rx="6" fill="url(#rayas)"/>
        <rect x="140" y="148" width="20" height="96" fill="#b91c1c"/>
        <path d="M150 150 c-30 -26 -42 4 0 0 c42 4 30 -26 0 0" fill="#b91c1c"/>
        <text x="150" y="275" text-anchor="middle" font-family="Georgia" font-size="15" fill="${crema}" letter-spacing="3">NAVIDAD</text>`;
      break;
    case 'bebidas':
      figura = `
        <rect x="134" y="40" width="32" height="50" rx="4" fill="${b}"/>
        <path d="M134 90 q-34 20 -34 60 v100 q0 14 14 14 h72 q14 0 14 -14 v-100 q0 -40 -34 -60z" fill="#2a1a10"/>
        <rect x="108" y="150" width="84" height="70" rx="8" fill="${crema}"/>
        <ellipse cx="150" cy="185" rx="10" ry="15" fill="${a}" transform="rotate(25 150 185)"/>
        <rect x="128" y="34" width="44" height="12" rx="3" fill="${b}"/>`;
      break;
    case 'dulces':
      figura = `
        <rect x="55" y="90" width="190" height="130" rx="14" fill="${b}"/>
        <rect x="70" y="105" width="160" height="100" rx="10" fill="#2a1a10"/>
        ${[0, 1, 2].map((i) => [0, 1].map((j) => `<circle cx="${100 + i * 50}" cy="${130 + j * 50}" r="18" fill="#5b2a12"/><path d="M${90 + i * 50} ${128 + j * 50} q10 -8 20 0" stroke="${b}" stroke-width="3" fill="none"/>`).join('')).join('')}
        <text x="150" y="260" text-anchor="middle" font-family="Georgia" font-size="15" fill="${crema}" letter-spacing="3">TINGO MARÍA</text>`;
      break;
    default:
      figura = `
        <rect x="92" y="58" width="116" height="24" rx="4" fill="${b}"/>
        <path d="M95 80 h110 l16 172 q0 8 -8 8 h-126 q-8 0 -8 -8z" fill="${b}"/>
        <path d="M95 80 h110 l16 172 q0 8 -8 8 h-126 q-8 0 -8 -8z" fill="#00000022"/>
        <circle cx="150" cy="160" r="38" fill="${crema}"/>
        <g transform="rotate(25 150 160)">
          <ellipse cx="150" cy="160" rx="15" ry="22" fill="${a}"/>
          <path d="M146 141 q12 19 0 38" stroke="${crema}" stroke-width="3" fill="none"/>
        </g>
        <text x="150" y="228" text-anchor="middle" font-family="Georgia" font-size="13" fill="${crema}" letter-spacing="2">TINGO MARÍA</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#1a0f08"/></linearGradient>
      <pattern id="rayas" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="16" fill="#ffffff22"/></pattern>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <circle cx="250" cy="50" r="70" fill="#ffffff10"/><circle cx="40" cy="270" r="60" fill="#ffffff0c"/>
    ${figura}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
