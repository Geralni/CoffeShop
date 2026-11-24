// Tienda pública · Café Bella Durmiente
const estado = {
  categorias: [],
  productos: [],
  filtro: 'todos',
  busqueda: '',
  carrito: leerCarrito(),
};

function leerCarrito() {
  try { return JSON.parse(localStorage.getItem('carrito')) || []; } catch { return []; }
}
function guardarCarrito() {
  try { localStorage.setItem('carrito', JSON.stringify(estado.carrito)); } catch { /* sin almacenamiento */ }
  pintarCarrito();
}

// ---------- Tarjetas de producto ----------
function tarjeta(p) {
  const finales = p.presentaciones.map((x) => x.precio_final);
  const originales = p.presentaciones.map((x) => x.precio);
  const desde = Math.min(...finales);
  const varios = p.presentaciones.length > 1;
  return `
  <article class="tarjeta ${p.categoria_slug === 'panetones' ? 'tarjeta-navidad' : ''}">
    <div class="tarjeta-img" data-ver="${p.id}">
      <img src="${esc(imagenProducto(p))}" alt="${esc(p.nombre)}" loading="lazy">
      ${p.descuento_pct ? `<span class="badge-descuento">-${p.descuento_pct}%</span>` : ''}
      ${p.destacado ? '<span class="badge-destacado">★ Destacado</span>' : ''}
    </div>
    <div class="tarjeta-cuerpo">
      <span class="tarjeta-cat">${esc(p.categoria)}</span>
      <h3>${esc(p.nombre)}</h3>
      ${p.productor ? `<p class="tarjeta-origen">📍 ${esc(p.productor)}${p.altitud_msnm ? ` · ${p.altitud_msnm} msnm` : ''}</p>` : ''}
      <div class="notas">${p.notas.slice(0, 3).map((n) => `<span>${esc(n.nombre)}</span>`).join('')}</div>
      <div class="tarjeta-pie">
        <div class="precio">
          ${p.descuento_pct ? `<s>${soles(Math.min(...originales))}</s>` : ''}
          <b>${varios ? '<small>desde</small> ' : ''}${soles(desde)}</b>
        </div>
        <div class="rating" title="${p.rating} de 5">${estrellas(p.rating)} <small>(${p.total_resenas})</small></div>
      </div>
      <button class="btn btn-cafe btn-bloque" data-ver="${p.id}">Ver y comprar</button>
    </div>
  </article>`;
}

function pintarTienda() {
  const q = estado.busqueda.toLowerCase();
  const lista = estado.productos.filter((p) =>
    (estado.filtro === 'todos' || p.categoria_slug === estado.filtro) &&
    (!q || `${p.nombre} ${p.categoria} ${p.productor || ''} ${p.notas.map((n) => n.nombre).join(' ')}`.toLowerCase().includes(q)));
  $('#gridProductos').innerHTML = lista.length
    ? lista.map(tarjeta).join('')
    : '<p class="vacio">No encontramos productos con ese filtro ☕</p>';
}

function pintarChips() {
  const total = estado.productos.length;
  $('#chipsCategorias').innerHTML =
    `<button class="chip ${estado.filtro === 'todos' ? 'activo' : ''}" data-cat="todos">Todos <small>${total}</small></button>` +
    estado.categorias.filter((c) => c.total > 0).map((c) =>
      `<button class="chip ${estado.filtro === c.slug ? 'activo' : ''}" data-cat="${esc(c.slug)}">${esc(c.nombre)} <small>${c.total}</small></button>`).join('');
}

function pintarNavidad() {
  const panetones = estado.productos.filter((p) => p.categoria_slug === 'panetones');
  $('#gridNavidad').innerHTML = panetones.length
    ? panetones.map(tarjeta).join('')
    : '<p class="vacio">Muy pronto: ¡panetones artesanales! 🎄</p>';
}

async function cargarCatalogo() {
  try {
    const [catalogo, promos] = await Promise.all([api('/api/catalogo'), api('/api/promociones/activas')]);
    estado.categorias = catalogo.categorias;
    estado.productos = catalogo.productos;
    sincronizarCarrito();
    pintarChips();
    pintarTienda();
    pintarNavidad();
    if (promos.length) {
      $('#cintaTexto').textContent = promos[0].titulo;
      $('#navidadDescuento').textContent = `¡Hasta ${promos[0].descuento_pct}% de descuento hasta el ${new Date(promos[0].fecha_fin + 'T12:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}!`;
    }
  } catch (e) {
    $('#gridProductos').innerHTML = `<p class="vacio">No se pudo cargar la tienda: ${esc(e.message)}</p>`;
  }
}

// ---------- Modal de producto ----------
async function abrirProducto(id) {
  const modal = $('#modalProducto');
  $('#modalContenido').innerHTML = '<p class="cargando">Cargando…</p>';
  modal.showModal();
  let p;
  try {
    p = await api(`/api/productos/${id}`);
  } catch (e) {
    $('#modalContenido').innerHTML = `<p class="vacio">${esc(e.message)}</p>`;
    return;
  }
  const primero = p.presentaciones.find((x) => x.stock > 0);
  const ficha = [
    ['Origen', p.productor && `${p.productor}${p.distrito ? `, ${p.distrito}` : ''}`],
    ['Altitud', p.altitud_msnm && `${p.altitud_msnm} m s. n. m.`],
    ['Variedad', p.variedad], ['Proceso', p.proceso], ['Tueste', p.tueste],
  ].filter(([, val]) => val);

  $('#modalContenido').innerHTML = `
    <div class="modal-grid">
      <div class="modal-img"><img src="${esc(imagenProducto(p))}" alt="${esc(p.nombre)}"></div>
      <div class="modal-info">
        <span class="tarjeta-cat">${esc(p.categoria)}</span>
        <h2>${esc(p.nombre)}</h2>
        <div class="rating">${estrellas(p.rating)} <small>${p.rating} · ${p.total_resenas} reseña(s)</small></div>
        <p>${esc(p.descripcion)}</p>
        ${ficha.length ? `<div class="ficha">${ficha.map(([k, val]) => `<div><span>${k}</span>${esc(val)}</div>`).join('')}</div>` : ''}
        ${p.notas.length ? `<div class="notas">${p.notas.map((n) => `<span>${esc(n.nombre)}</span>`).join('')}</div>` : ''}
        <div class="opciones">
          ${p.presentaciones.map((x) => `
            <label class="opcion ${x.stock ? '' : 'agotado'}">
              <span><input type="radio" name="pres" value="${x.id}" ${x.stock ? '' : 'disabled'} ${primero && x.id === primero.id ? 'checked' : ''}>
                ${esc(x.descripcion)} <small>${x.stock ? `(${x.stock} disp.)` : '— agotado'}</small></span>
              <span class="precio">${p.descuento_pct ? `<s>${soles(x.precio)}</s>` : ''}<b>${soles(x.precio_final)}</b></span>
            </label>`).join('')}
        </div>
        <div class="comprar">
          <div class="cantidad">
            <button type="button" data-cant="-1" aria-label="Menos">−</button>
            <input id="cantidadModal" type="number" value="1" min="1" max="99" aria-label="Cantidad">
            <button type="button" data-cant="1" aria-label="Más">+</button>
          </div>
          <button class="btn btn-oro" id="agregarCarrito" ${primero ? '' : 'disabled'}>🛒 Agregar al carrito</button>
        </div>
      </div>
    </div>
    <section class="resenas">
      <h3>Reseñas de clientes</h3>
      ${p.resenas.length ? p.resenas.map((r) => `
        <div class="resena">
          <header><b>${esc(r.cliente)}</b><span class="rating">${estrellas(r.calificacion)}</span></header>
          <p>${esc(r.comentario)}</p>
        </div>`).join('') : '<p class="vacio">Aún no hay reseñas. ¡Sé el primero en opinar!</p>'}
      <form class="form-resena" id="formResena">
        <div class="estrellas-input">
          ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="calificacion" id="e${n}" value="${n}" ${n === 5 ? 'checked' : ''}><label for="e${n}" title="${n} estrellas">★</label>`).join('')}
        </div>
        <input name="nombre" placeholder="Tu nombre" required maxlength="80">
        <input name="email" type="email" placeholder="Tu correo (no se publica)" required maxlength="120">
        <textarea name="comentario" rows="3" placeholder="¿Qué te pareció?" required maxlength="600"></textarea>
        <button class="btn btn-cafe" type="submit">Enviar reseña</button>
      </form>
    </section>`;

  $('#agregarCarrito').onclick = () => {
    const sel = $('input[name="pres"]:checked', modal);
    if (!sel) return toast('Elige una presentación', true);
    const pres = p.presentaciones.find((x) => x.id === Number(sel.value));
    agregarAlCarrito(p, pres, Math.max(1, parseInt($('#cantidadModal').value, 10) || 1));
    modal.close();
  };
  $('#formResena').onsubmit = async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      const r = await api(`/api/productos/${p.id}/resenas`, { method: 'POST', body: datos });
      ev.target.reset();
      toast(r.mensaje);
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- Carrito ----------
function agregarAlCarrito(p, pres, cantidad) {
  const item = estado.carrito.find((i) => i.presentacion_id === pres.id);
  const nueva = (item?.cantidad || 0) + cantidad;
  if (nueva > pres.stock) return toast(`Solo quedan ${pres.stock} unidades`, true);
  if (item) item.cantidad = nueva;
  else {
    estado.carrito.push({
      presentacion_id: pres.id, producto_id: p.id, nombre: p.nombre, descripcion: pres.descripcion,
      precio: pres.precio_final, stock: pres.stock, cantidad, imagen: p.imagen, categoria_slug: p.categoria_slug,
    });
  }
  guardarCarrito();
  const c = $('#contadorCarrito');
  c.classList.remove('pulso'); void c.offsetWidth; c.classList.add('pulso');
  toast(`✔ ${p.nombre} agregado al carrito`);
}

// Actualiza precios y stock del carrito con los datos actuales del servidor
function sincronizarCarrito() {
  const presentaciones = new Map();
  for (const p of estado.productos) for (const x of p.presentaciones) presentaciones.set(x.id, x);
  estado.carrito = estado.carrito.filter((i) => presentaciones.has(i.presentacion_id) && presentaciones.get(i.presentacion_id).stock > 0);
  for (const i of estado.carrito) {
    const x = presentaciones.get(i.presentacion_id);
    i.precio = x.precio_final;
    i.stock = x.stock;
    i.cantidad = Math.min(i.cantidad, x.stock);
  }
  guardarCarrito();
}

function pintarCarrito() {
  const total = estado.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  $('#contadorCarrito').textContent = estado.carrito.reduce((s, i) => s + i.cantidad, 0);
  $('#carritoTotal').textContent = soles(total);
  $('#carritoPie').style.display = estado.carrito.length ? '' : 'none';
  $('#carritoItems').innerHTML = estado.carrito.length
    ? estado.carrito.map((i, idx) => `
      <div class="item">
        <img src="${esc(imagenProducto(i))}" alt="">
        <div>
          <h4>${esc(i.nombre)}</h4>
          <small>${esc(i.descripcion)} · ${soles(i.precio)}</small>
          <div class="cantidad" style="margin-top:.3rem;width:max-content">
            <button data-item="${idx}" data-delta="-1" aria-label="Menos">−</button><span>${i.cantidad}</span>
            <button data-item="${idx}" data-delta="1" aria-label="Más">+</button>
          </div>
        </div>
        <div style="text-align:right">
          <b>${soles(i.precio * i.cantidad)}</b><br>
          <button class="item-quitar" data-quitar="${idx}">Quitar</button>
        </div>
      </div>`).join('')
    : '<div class="carrito-vacio"><span>☕</span>Tu carrito está vacío.<br>¡Prueba nuestro café de altura!</div>';
}

function abrirCarrito(abrir = true) {
  $('#carrito').classList.toggle('abierto', abrir);
  $('#overlay').classList.toggle('visible', abrir);
}

async function enviarPedido(ev) {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  const boton = $('button[type="submit"]', ev.target);
  boton.disabled = true;
  try {
    const r = await api('/api/pedidos', {
      method: 'POST',
      body: {
        cliente: { nombre: f.nombre, email: f.email, telefono: f.telefono },
        direccion: f.direccion, nota: f.nota,
        items: estado.carrito.map((i) => ({ presentacion_id: i.presentacion_id, cantidad: i.cantidad })),
      },
    });
    estado.carrito = [];
    guardarCarrito();
    ev.target.reset();
    $('#carritoItems').innerHTML = `
      <div class="carrito-vacio"><span>🎉</span><b>¡Pedido #${r.id} registrado!</b><br>
      Total: ${soles(r.total)}<br>Te llamaremos para coordinar la entrega en Tingo María.</div>`;
    cargarCatalogo();
  } catch (e) {
    toast(e.message, true);
  } finally {
    boton.disabled = false;
  }
}

// ---------- Cuenta regresiva a Navidad ----------
function cuentaRegresiva() {
  const ahora = new Date();
  let navidad = new Date(ahora.getFullYear(), 11, 25);
  if (ahora > new Date(ahora.getFullYear(), 11, 26)) navidad = new Date(ahora.getFullYear() + 1, 11, 25);
  const ms = Math.max(0, navidad - ahora);
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  const set = (u, v) => { $(`[data-u="${u}"]`).textContent = String(v).padStart(2, '0'); };
  set('d', d); set('h', h); set('m', m); set('s', s);
  $('#cintaDias').textContent = ms ? `Faltan ${d} días para Navidad` : '¡Feliz Navidad!';
}

// ---------- Carrusel de fotos de la portada (cambia cada 3 s) ----------
function iniciarCarrusel() {
  const slides = $$('#heroFondo .slide');
  if (!slides.length) return;
  let actual = 0;
  let timer;
  $('#heroPuntos').innerHTML = slides.map((s, i) =>
    `<button type="button" role="tab" aria-label="${esc(s.dataset.lugar)}" class="${i === 0 ? 'activo' : ''}" data-slide="${i}"></button>`).join('');
  const puntos = $$('#heroPuntos button');

  const mostrar = (i) => {
    slides[actual].classList.remove('activo');
    puntos[actual].classList.remove('activo');
    actual = (i + slides.length) % slides.length;
    slides[actual].classList.add('activo');
    puntos[actual].classList.add('activo');
    $('#heroLugar').textContent = `📍 ${slides[actual].dataset.lugar}`;
  };
  const programar = () => {
    clearInterval(timer);
    timer = setInterval(() => mostrar(actual + 1), 3000);
  };
  $('#heroPuntos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-slide]');
    if (b) { mostrar(Number(b.dataset.slide)); programar(); }
  });
  programar();
}

// ---------- Eventos ----------
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-ver],[data-cat],[data-cerrar],[data-cant],[data-item],[data-quitar]');
  if (!t) return;
  if (t.dataset.ver) abrirProducto(t.dataset.ver);
  else if (t.dataset.cat) { estado.filtro = t.dataset.cat; pintarChips(); pintarTienda(); }
  else if (t.hasAttribute('data-cerrar')) t.closest('dialog').close();
  else if (t.dataset.cant) {
    const inp = $('#cantidadModal');
    inp.value = Math.min(99, Math.max(1, (parseInt(inp.value, 10) || 1) + Number(t.dataset.cant)));
  } else if (t.dataset.item) {
    const i = estado.carrito[t.dataset.item];
    const n = i.cantidad + Number(t.dataset.delta);
    if (n > i.stock) return toast(`Solo quedan ${i.stock} unidades`, true);
    if (n < 1) estado.carrito.splice(t.dataset.item, 1); else i.cantidad = n;
    guardarCarrito();
  } else if (t.dataset.quitar) {
    estado.carrito.splice(t.dataset.quitar, 1);
    guardarCarrito();
  }
});

$('#modalProducto').addEventListener('click', (ev) => { if (ev.target.id === 'modalProducto') ev.target.close(); });
$('#buscador').addEventListener('input', (ev) => { estado.busqueda = ev.target.value.trim(); pintarTienda(); });
$('#abrirCarrito').onclick = () => { pintarCarrito(); abrirCarrito(true); };
$('#cerrarCarrito').onclick = () => abrirCarrito(false);
$('#overlay').onclick = () => abrirCarrito(false);
$('#formPedido').addEventListener('submit', enviarPedido);
$('#hamburguesa').onclick = () => $('#menu').classList.toggle('abierto');
$$('#menu a').forEach((a) => a.addEventListener('click', () => $('#menu').classList.remove('abierto')));

iniciarCarrusel();
pintarCarrito();
cuentaRegresiva();
setInterval(cuentaRegresiva, 1000);
cargarCatalogo();
