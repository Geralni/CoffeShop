// Panel de administración · Café Bella Durmiente
const A = { tab: 'resumen', maestros: null, productos: [] };
const TITULOS = {
  resumen: 'Resumen', productos: 'Productos', resenas: 'Reseñas', pedidos: 'Pedidos',
  promociones: 'Promociones', catalogos: 'Catálogos', cuenta: 'Mi cuenta',
};
const ESTADOS = ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'];
const CLASE_ESTADO = { pendiente: 'e-pend', confirmado: 'e-info', enviado: 'e-info', entregado: 'e-ok', cancelado: 'e-no' };

// API con manejo de sesión expirada
async function adm(url, op) {
  try {
    return await api(`/api/admin${url}`, op);
  } catch (e) {
    if (e.status === 401 && url !== '/login') mostrarLogin();
    throw e;
  }
}
const modal = $('#modal');
const abrirModal = (html) => { $('#modalCuerpo').innerHTML = html; modal.showModal(); };
const cerrarModal = () => modal.close();
const opciones = (lista, sel, vacio) =>
  (vacio ? `<option value="">${vacio}</option>` : '') +
  lista.map((x) => `<option value="${x.id}" ${Number(sel) === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
const fechaCorta = (f) => new Date(f.replace(' ', 'T')).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

// ---------- Sesión ----------
function mostrarLogin() {
  $('#vistaPanel').hidden = true;
  $('#vistaLogin').hidden = false;
}
async function iniciar() {
  try {
    const me = await adm('/me');
    $('#usuarioActual').textContent = `👤 ${me.usuario}`;
    $('#vistaLogin').hidden = true;
    $('#vistaPanel').hidden = false;
    irA(A.tab);
  } catch { mostrarLogin(); }
}
$('#formLogin').onsubmit = async (ev) => {
  ev.preventDefault();
  try {
    await adm('/login', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) });
    ev.target.reset();
    iniciar();
  } catch (e) { toast(e.message, true); }
};
$('#salir').onclick = async () => { await adm('/logout', { method: 'POST' }).catch(() => {}); mostrarLogin(); };

// ---------- Navegación ----------
async function irA(tab) {
  A.tab = tab;
  $$('.lateral nav button').forEach((b) => b.classList.toggle('activo', b.dataset.tab === tab));
  $('#tituloTab').textContent = TITULOS[tab];
  $('#lateral').classList.remove('abierto');
  $('#vista').innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    await VISTAS[tab]();
  } catch (e) {
    if (e.status !== 401) $('#vista').innerHTML = `<p class="vacio">${esc(e.message)}</p>`;
  }
}
$$('.lateral nav button').forEach((b) => (b.onclick = () => irA(b.dataset.tab)));
$('#menuMovil').onclick = () => $('#lateral').classList.toggle('abierto');

async function cargarMaestros(forzar = false) {
  if (!A.maestros || forzar) A.maestros = await adm('/maestros');
  return A.maestros;
}

async function actualizarBadges() {
  const r = await adm('/resumen');
  $('#badgeResenas').textContent = r.resenasPendientes || '';
  $('#badgePedidos').textContent = r.pedidosPendientes || '';
  return r;
}

// ---------- Vistas ----------
const VISTAS = {
  async resumen() {
    const r = await actualizarBadges();
    $('#vista').innerHTML = `
      <div class="stats">
        <div class="stat"><span>Productos activos</span><b>${r.productos}</b></div>
        <div class="stat"><span>Pedidos pendientes</span><b>${r.pedidosPendientes}</b></div>
        <div class="stat"><span>Reseñas por revisar</span><b>${r.resenasPendientes}</b></div>
        <div class="stat"><span>Ventas totales</span><b>${soles(r.ventas)}</b></div>
      </div>
      <div class="dos-col">
        <div class="caja">
          <h2>⚠️ Stock bajo (≤ 5)</h2>
          ${r.stockBajo.length ? `<table><tr><th>Producto</th><th>Presentación</th><th>Stock</th></tr>
            ${r.stockBajo.map((s) => `<tr><td>${esc(s.nombre)}</td><td>${esc(s.descripcion)}</td>
              <td><span class="etiqueta ${s.stock ? 'e-pend' : 'e-no'}">${s.stock}</span></td></tr>`).join('')}</table>`
            : '<p class="vacio">Todo el stock está en orden ✔</p>'}
        </div>
        <div class="caja">
          <h2>🏆 Más vendidos</h2>
          ${r.masVendidos.length ? `<table><tr><th>Producto</th><th>Unidades</th></tr>
            ${r.masVendidos.map((s) => `<tr><td>${esc(s.nombre)}</td><td>${s.unidades}</td></tr>`).join('')}</table>`
            : '<p class="vacio">Aún no hay ventas.</p>'}
        </div>
      </div>`;
  },

  async productos() {
    const [productos] = await Promise.all([adm('/productos'), cargarMaestros()]);
    A.productos = productos;
    $('#vista').innerHTML = `
      <div class="herramientas">
        <input type="search" id="buscarProd" placeholder="🔍 Buscar producto…">
        <select id="filtroCat"><option value="">Todas las categorías</option>${opciones(A.maestros.categorias)}</select>
        <button class="btn btn-oro" id="nuevoProd">＋ Nuevo producto</button>
      </div>
      <div class="caja tabla-envoltura"><table>
        <thead><tr><th></th><th>Producto</th><th>Categoría</th><th>Presentaciones</th><th>Valoración</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tablaProd"></tbody>
      </table></div>`;
    const pintar = () => {
      const q = $('#buscarProd').value.toLowerCase();
      const c = Number($('#filtroCat').value);
      const lista = A.productos.filter((p) => (!q || p.nombre.toLowerCase().includes(q)) && (!c || p.categoria_id === c));
      $('#tablaProd').innerHTML = lista.map((p) => `
        <tr>
          <td><img class="miniatura" src="${esc(imagenProducto(p))}" alt=""></td>
          <td><b>${esc(p.nombre)}</b>${p.destacado ? ' <span class="etiqueta e-pend">★</span>' : ''}
            ${p.descuento_pct ? ` <span class="etiqueta e-no">-${p.descuento_pct}%</span>` : ''}<br>
            <small>${esc(p.productor || '')}</small></td>
          <td>${esc(p.categoria)}</td>
          <td>${p.presentaciones.map((x) => `${esc(x.descripcion)}: <b>${soles(x.precio)}</b> <small>(${x.stock})</small>`).join('<br>')}</td>
          <td class="estrellas">${estrellas(p.rating)} <small>(${p.total_resenas})</small></td>
          <td><span class="etiqueta ${p.activo ? 'e-ok' : 'e-no'}">${p.activo ? 'Activo' : 'Oculto'}</span></td>
          <td class="acciones">
            <button class="btn btn-suave btn-sm" data-editar="${p.id}">Editar</button>
            <button class="btn btn-rojo btn-sm" data-borrar="${p.id}">Eliminar</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="vacio">Sin productos</td></tr>';
    };
    pintar();
    $('#buscarProd').oninput = pintar;
    $('#filtroCat').onchange = pintar;
    $('#nuevoProd').onclick = () => formProducto();
    $('#tablaProd').onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.editar) formProducto(A.productos.find((p) => p.id === Number(b.dataset.editar)));
      if (b.dataset.borrar) {
        const p = A.productos.find((x) => x.id === Number(b.dataset.borrar));
        if (!confirm(`¿Eliminar "${p.nombre}"? Se borrarán también sus reseñas.`)) return;
        try {
          const r = await adm(`/productos/${p.id}`, { method: 'DELETE' });
          toast(r.mensaje || 'Producto eliminado');
          irA('productos');
        } catch (e) { toast(e.message, true); }
      }
    };
  },

  async resenas() {
    const [resenas, productos] = await Promise.all([adm('/resenas'), adm('/productos')]);
    A.productos = productos;
    actualizarBadges();
    $('#vista').innerHTML = `
      <div class="herramientas">
        <select id="filtroRes"><option value="pend">Pendientes de aprobación</option><option value="">Todas</option><option value="ok">Publicadas</option></select>
        <button class="btn btn-oro" id="nuevaRes">＋ Agregar reseña</button>
      </div>
      <div class="caja tabla-envoltura"><table>
        <thead><tr><th>Producto</th><th>Cliente</th><th>Calificación</th><th>Comentario</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tablaRes"></tbody>
      </table></div>`;
    const pintar = () => {
      const f = $('#filtroRes').value;
      const lista = resenas.filter((r) => !f || (f === 'pend' ? !r.aprobada : r.aprobada));
      $('#tablaRes').innerHTML = lista.map((r) => `
        <tr>
          <td>${esc(r.producto)}</td>
          <td>${esc(r.cliente)}<br><small>${esc(r.email || '')}</small></td>
          <td class="estrellas">${estrellas(r.calificacion)}</td>
          <td style="max-width:320px">${esc(r.comentario)}</td>
          <td><small>${fechaCorta(r.fecha)}</small></td>
          <td><span class="etiqueta ${r.aprobada ? 'e-ok' : 'e-pend'}">${r.aprobada ? 'Publicada' : 'Pendiente'}</span></td>
          <td class="acciones">
            <button class="btn btn-sm ${r.aprobada ? 'btn-suave' : 'btn-selva'}" data-aprobar="${r.id}" data-valor="${r.aprobada ? 0 : 1}">${r.aprobada ? 'Ocultar' : 'Aprobar'}</button>
            <button class="btn btn-rojo btn-sm" data-borrar="${r.id}">Eliminar</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="vacio">No hay reseñas en esta vista</td></tr>';
    };
    if (!resenas.some((r) => !r.aprobada)) $('#filtroRes').value = '';
    pintar();
    $('#filtroRes').onchange = pintar;
    $('#nuevaRes').onclick = formResena;
    $('#tablaRes').onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      try {
        if (b.dataset.aprobar) await adm(`/resenas/${b.dataset.aprobar}`, { method: 'PATCH', body: { aprobada: b.dataset.valor } });
        if (b.dataset.borrar) {
          if (!confirm('¿Eliminar esta reseña?')) return;
          await adm(`/resenas/${b.dataset.borrar}`, { method: 'DELETE' });
        }
        toast('Reseña actualizada');
        irA('resenas');
      } catch (e) { toast(e.message, true); }
    };
  },

  async pedidos() {
    const pedidos = await adm('/pedidos');
    actualizarBadges();
    $('#vista').innerHTML = `
      <div class="herramientas">
        <select id="filtroPed"><option value="">Todos los estados</option>${ESTADOS.map((e) => `<option>${e}</option>`).join('')}</select>
      </div>
      <div class="caja tabla-envoltura"><table>
        <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Dirección</th><th>Total</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tablaPed"></tbody>
      </table></div>`;
    const pintar = () => {
      const f = $('#filtroPed').value;
      $('#tablaPed').innerHTML = pedidos.filter((p) => !f || p.estado === f).map((p) => `
        <tr>
          <td><b>${p.id}</b></td>
          <td><small>${fechaCorta(p.fecha)}</small></td>
          <td>${esc(p.cliente)}<br><small>📞 ${esc(p.telefono || '')}</small></td>
          <td style="max-width:220px"><small>${esc(p.direccion_entrega)}</small></td>
          <td><b>${soles(p.total)}</b><br><small>${p.unidades} und.</small></td>
          <td>${p.estado === 'cancelado'
            ? '<span class="etiqueta e-no">cancelado</span>'
            : `<select data-estado="${p.id}">${ESTADOS.map((e) => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>`}</td>
          <td><button class="btn btn-suave btn-sm" data-ver="${p.id}">Ver detalle</button></td>
        </tr>`).join('') || '<tr><td colspan="7" class="vacio">No hay pedidos</td></tr>';
    };
    pintar();
    $('#filtroPed').onchange = pintar;
    $('#tablaPed').onchange = async (ev) => {
      const s = ev.target.closest('[data-estado]');
      if (!s) return;
      if (s.value === 'cancelado' && !confirm('¿Cancelar el pedido? El stock se devolverá y no podrá reactivarse.')) {
        return irA('pedidos');
      }
      try {
        await adm(`/pedidos/${s.dataset.estado}`, { method: 'PATCH', body: { estado: s.value } });
        toast(`Pedido #${s.dataset.estado}: ${s.value}`);
        irA('pedidos');
      } catch (e) { toast(e.message, true); }
    };
    $('#tablaPed').onclick = async (ev) => {
      const b = ev.target.closest('[data-ver]');
      if (!b) return;
      const p = await adm(`/pedidos/${b.dataset.ver}`);
      abrirModal(`
        <h2>Pedido #${p.id}</h2>
        <p><b>${esc(p.cliente)}</b> · ${esc(p.email || '')} · 📞 ${esc(p.telefono || '')}</p>
        <p>📍 ${esc(p.direccion_entrega)}</p>
        ${p.nota ? `<p>📝 ${esc(p.nota)}</p>` : ''}
        <p><small>${fechaCorta(p.fecha)}</small> · <span class="etiqueta ${CLASE_ESTADO[p.estado]}">${p.estado}</span></p><br>
        <table>
          <tr><th>Producto</th><th>Presentación</th><th>Cant.</th><th>P. unit.</th><th>Subtotal</th></tr>
          ${p.detalles.map((d) => `<tr><td>${esc(d.producto)}</td><td>${esc(d.presentacion)}</td><td>${d.cantidad}</td>
            <td>${soles(d.precio_unitario)}</td><td>${soles(d.subtotal)}</td></tr>`).join('')}
          <tr><td colspan="4" style="text-align:right"><b>Total</b></td><td><b>${soles(p.total)}</b></td></tr>
        </table>
        ${p.telefono ? `<br><a class="btn btn-selva" target="_blank" rel="noopener"
          href="https://wa.me/51${esc(String(p.telefono).replace(/\D/g, '').slice(-9))}?text=${encodeURIComponent(`Hola ${p.cliente}, te escribimos de Café Bella Durmiente sobre tu pedido #${p.id}.`)}">💬 Escribir por WhatsApp</a>` : ''}`);
    };
  },

  async promociones() {
    const [promos, productos] = await Promise.all([adm('/promociones'), adm('/productos')]);
    A.productos = productos;
    $('#vista').innerHTML = `
      <div class="herramientas"><button class="btn btn-oro" id="nuevaPromo">＋ Nueva promoción</button></div>
      <div class="maestros">
        ${promos.map((p) => `
          <div class="caja promo">
            <header>
              <div><h2>${esc(p.titulo)}</h2>
                <span class="etiqueta ${p.vigente ? 'e-ok' : 'e-no'}">${p.vigente ? 'Vigente' : p.activa ? 'Fuera de fecha' : 'Desactivada'}</span></div>
              <span class="pct">-${p.descuento_pct}%</span>
            </header>
            <p>${esc(p.descripcion || '')}</p>
            <p><small>📅 ${p.fecha_inicio} → ${p.fecha_fin}</small></p>
            <p><small>${p.productos.length} producto(s): ${p.productos.map((id) => esc(productos.find((x) => x.id === id)?.nombre || '')).join(', ')}</small></p><br>
            <div class="acciones">
              <button class="btn btn-suave btn-sm" data-editar="${p.id}">Editar</button>
              <button class="btn btn-rojo btn-sm" data-borrar="${p.id}">Eliminar</button>
            </div>
          </div>`).join('') || '<p class="vacio">No hay promociones</p>'}
      </div>`;
    $('#nuevaPromo').onclick = () => formPromocion();
    $('#vista').onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b || A.tab !== 'promociones') return;
      if (b.dataset.editar) formPromocion(promos.find((p) => p.id === Number(b.dataset.editar)));
      if (b.dataset.borrar && confirm('¿Eliminar esta promoción?')) {
        try { await adm(`/promociones/${b.dataset.borrar}`, { method: 'DELETE' }); toast('Promoción eliminada'); irA('promociones'); }
        catch (e) { toast(e.message, true); }
      }
    };
  },

  async catalogos() {
    const m = await cargarMaestros(true);
    const def = [
      ['categorias', '🏷️ Categorías'], ['productores', '👨‍🌾 Productores / fincas'], ['distritos', '📍 Distritos (Leoncio Prado)'],
      ['variedades', '🌱 Variedades'], ['procesos', '⚙️ Procesos'], ['niveles_tueste', '🔥 Niveles de tueste'], ['notas_cata', '👃 Notas de cata'],
    ];
    $('#vista').innerHTML = `
      <p style="margin-bottom:1rem;color:var(--gris)">Tablas maestras de la base de datos normalizada. Los productos las referencian por su id.</p>
      <div class="maestros">${def.map(([t, titulo]) => `
        <div class="caja maestro">
          <h2>${titulo}</h2>
          <ul>${m[t].map((x) => `
            <li><span>${esc(x.nombre)}${t === 'productores' ? `<small>${esc(x.distrito)}${x.altitud_msnm ? ` · ${x.altitud_msnm} msnm` : ''}</small>` : ''}
              ${t === 'categorias' && x.descripcion ? `<small>${esc(x.descripcion)}</small>` : ''}</span>
              <span class="acciones">
                <button class="btn btn-suave btn-sm" data-renombrar="${t}:${x.id}" title="Renombrar">✎</button>
                <button class="btn btn-rojo btn-sm" data-quitar="${t}:${x.id}" title="Eliminar">✕</button>
              </span></li>`).join('')}</ul>
          <form data-tabla="${t}">
            <div class="fila"><input name="nombre" placeholder="Nuevo…" required maxlength="80"><button class="btn btn-selva btn-sm">Agregar</button></div>
            ${t === 'productores' ? `
              <div class="fila"><select name="distrito_id" required>${opciones(m.distritos, null, 'Distrito…')}</select>
              <input name="altitud_msnm" type="number" min="300" max="3000" placeholder="Altitud msnm"></div>` : ''}
            ${t === 'categorias' || t === 'productores' ? '<input name="descripcion" placeholder="Descripción (opcional)" maxlength="300">' : ''}
          </form>
        </div>`).join('')}
      </div>`;
    $$('.maestro form').forEach((f) => (f.onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await adm(`/maestros/${f.dataset.tabla}`, { method: 'POST', body: Object.fromEntries(new FormData(f)) });
        toast('Agregado ✔');
        irA('catalogos');
      } catch (e) { toast(e.message, true); }
    }));
    $('#vista').onclick = async (ev) => {
      const b = ev.target.closest('[data-renombrar],[data-quitar]');
      if (!b || A.tab !== 'catalogos') return;
      const [t, id] = (b.dataset.renombrar || b.dataset.quitar).split(':');
      try {
        if (b.dataset.renombrar) {
          const actual = m[t].find((x) => x.id === Number(id));
          const nombre = prompt('Nuevo nombre:', actual.nombre);
          if (!nombre || nombre === actual.nombre) return;
          await adm(`/maestros/${t}/${id}`, { method: 'PUT', body: { nombre } });
        } else {
          if (!confirm('¿Eliminar este registro?')) return;
          await adm(`/maestros/${t}/${id}`, { method: 'DELETE' });
        }
        toast('Catálogo actualizado');
        irA('catalogos');
      } catch (e) { toast(e.message, true); }
    };
  },

  async cuenta() {
    $('#vista').innerHTML = `
      <div class="caja" style="max-width:480px">
        <h2>Cambiar contraseña</h2>
        <form class="form" id="formClave">
          <label class="completo">Contraseña actual<input name="actual" type="password" required autocomplete="current-password"></label>
          <label class="completo">Nueva contraseña (mín. 8)<input name="nueva" type="password" minlength="8" required autocomplete="new-password"></label>
          <label class="completo">Repetir nueva<input name="repetir" type="password" minlength="8" required autocomplete="new-password"></label>
          <div class="form-acciones"><button class="btn btn-oro">Guardar</button></div>
        </form>
      </div>`;
    $('#formClave').onsubmit = async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      if (d.nueva !== d.repetir) return toast('Las contraseñas no coinciden', true);
      try {
        const r = await adm('/cambiar-clave', { method: 'POST', body: d });
        ev.target.reset();
        toast(r.mensaje);
      } catch (e) { toast(e.message, true); }
    };
  },
};

// ---------- Formulario de producto ----------
function filaPresentacion(x = {}) {
  return `<div class="pres-fila" ${x.id ? `data-id="${x.id}"` : ''}>
    <input placeholder="Ej. 250 g molido" value="${esc(x.descripcion || '')}" data-f="descripcion" required maxlength="60">
    <input type="number" step="0.01" min="0.1" placeholder="Precio S/" value="${x.precio ?? ''}" data-f="precio" required>
    <input type="number" min="0" placeholder="Stock" value="${x.stock ?? ''}" data-f="stock" required>
    <button type="button" class="btn btn-rojo btn-sm" data-quitar-pres>✕</button>
  </div>`;
}

function formProducto(p = null) {
  const m = A.maestros;
  const notasSel = new Set((p?.notas || []).map((n) => n.id));
  abrirModal(`
    <h2>${p ? 'Editar producto' : 'Nuevo producto'}</h2>
    <form class="form" id="formProd">
      <label class="completo">Nombre<input name="nombre" required maxlength="120" value="${esc(p?.nombre || '')}"></label>
      <label>Categoría<select name="categoria_id" required>${opciones(m.categorias, p?.categoria_id, 'Elige…')}</select></label>
      <label>Productor / finca<select name="productor_id">${opciones(m.productores, p?.productor_id, '— Ninguno —')}</select></label>
      <label class="completo">Descripción<textarea name="descripcion" rows="3" required maxlength="1000">${esc(p?.descripcion || '')}</textarea></label>
      <label>Variedad<select name="variedad_id">${opciones(m.variedades, p?.variedad_id, '— No aplica —')}</select></label>
      <label>Proceso<select name="proceso_id">${opciones(m.procesos, p?.proceso_id, '— No aplica —')}</select></label>
      <label>Nivel de tueste<select name="tueste_id">${opciones(m.niveles_tueste, p?.tueste_id, '— No aplica —')}</select></label>
      <div class="completo">
        <label>Notas de cata</label>
        <div class="chips-sel">${m.notas_cata.map((n) => `<label><input type="checkbox" name="nota" value="${n.id}" ${notasSel.has(n.id) ? 'checked' : ''}> ${esc(n.nombre)}</label>`).join('')}</div>
      </div>
      <div class="completo">
        <label>Presentaciones, precios y stock</label>
        <div id="listaPres">${(p?.presentaciones.length ? p.presentaciones : [{}]).map(filaPresentacion).join('')}</div>
        <button type="button" class="btn btn-suave btn-sm" id="agregarPres">＋ Agregar presentación</button>
      </div>
      <div class="completo preview">
        <img id="vistaImg" src="${esc(p ? imagenProducto(p) : '')}" alt="">
        <div style="flex:1;display:grid;gap:.4rem">
          <label>Imagen (JPG, PNG, WEBP · máx. 3 MB)<input type="file" name="imagen" accept="image/jpeg,image/png,image/webp,image/gif"></label>
          ${p?.imagen ? '<label class="check"><input type="checkbox" name="quitar_imagen" value="1"> Quitar imagen actual</label>' : ''}
        </div>
      </div>
      <label class="check"><input type="checkbox" name="destacado" value="1" ${p?.destacado ? 'checked' : ''}> ★ Destacado</label>
      <label class="check"><input type="checkbox" name="activo" value="1" ${!p || p.activo ? 'checked' : ''}> Visible en la tienda</label>
      <div class="form-acciones">
        <button type="button" class="btn btn-suave" data-cerrar>Cancelar</button>
        <button class="btn btn-oro" type="submit">${p ? 'Guardar cambios' : 'Crear producto'}</button>
      </div>
    </form>`);

  $('#agregarPres').onclick = () => $('#listaPres').insertAdjacentHTML('beforeend', filaPresentacion());
  $('#listaPres').onclick = (ev) => {
    if (ev.target.closest('[data-quitar-pres]')) {
      if ($$('.pres-fila').length === 1) return toast('Debe quedar al menos una presentación', true);
      ev.target.closest('.pres-fila').remove();
    }
  };
  $('input[name="imagen"]').onchange = (ev) => {
    const f = ev.target.files[0];
    if (f) $('#vistaImg').src = URL.createObjectURL(f);
  };
  $('#formProd').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const fd = new FormData();
    for (const campo of ['nombre', 'descripcion', 'categoria_id', 'productor_id', 'variedad_id', 'proceso_id', 'tueste_id']) {
      fd.append(campo, f.elements[campo].value);
    }
    fd.append('destacado', f.elements.destacado.checked ? '1' : '0');
    fd.append('activo', f.elements.activo.checked ? '1' : '0');
    if (f.elements.quitar_imagen?.checked) fd.append('quitar_imagen', '1');
    fd.append('notas', JSON.stringify($$('input[name="nota"]:checked', f).map((c) => Number(c.value))));
    fd.append('presentaciones', JSON.stringify($$('.pres-fila', f).map((fila) => ({
      id: fila.dataset.id ? Number(fila.dataset.id) : null,
      descripcion: $('[data-f="descripcion"]', fila).value,
      precio: $('[data-f="precio"]', fila).value,
      stock: $('[data-f="stock"]', fila).value,
    }))));
    if (f.elements.imagen.files[0]) fd.append('imagen', f.elements.imagen.files[0]);

    const boton = $('button[type="submit"]', f);
    boton.disabled = true;
    try {
      await adm(p ? `/productos/${p.id}` : '/productos', { method: p ? 'PUT' : 'POST', body: fd });
      cerrarModal();
      toast(p ? 'Producto actualizado ✔' : 'Producto creado ✔');
      irA('productos');
    } catch (e) {
      toast(e.message, true);
    } finally { boton.disabled = false; }
  };
}

// ---------- Formulario de reseña (admin) ----------
function formResena() {
  abrirModal(`
    <h2>Agregar reseña</h2>
    <form class="form" id="formRes">
      <label class="completo">Producto<select name="producto_id" required>${opciones(A.productos, null, 'Elige…')}</select></label>
      <label>Nombre del cliente<input name="nombre" required maxlength="80"></label>
      <label>Correo (opcional)<input name="email" type="email" maxlength="120"></label>
      <label>Calificación<select name="calificacion">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)} (${n})</option>`).join('')}</select></label>
      <label class="completo">Comentario<textarea name="comentario" rows="3" required maxlength="600"></textarea></label>
      <div class="form-acciones"><button type="button" class="btn btn-suave" data-cerrar>Cancelar</button><button class="btn btn-oro">Publicar</button></div>
    </form>`);
  $('#formRes').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await adm('/resenas', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) });
      cerrarModal();
      toast('Reseña publicada ✔');
      irA('resenas');
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- Formulario de promoción ----------
function formPromocion(pr = null) {
  const hoy = new Date().toISOString().slice(0, 10);
  const sel = new Set(pr?.productos || []);
  abrirModal(`
    <h2>${pr ? 'Editar promoción' : 'Nueva promoción'}</h2>
    <form class="form" id="formPromo">
      <label class="completo">Título<input name="titulo" required maxlength="120" value="${esc(pr?.titulo || '')}"></label>
      <label class="completo">Descripción<textarea name="descripcion" rows="2" maxlength="400">${esc(pr?.descripcion || '')}</textarea></label>
      <label>Descuento (%)<input name="descuento_pct" type="number" min="1" max="90" required value="${pr?.descuento_pct ?? 10}"></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="activa" ${!pr || pr.activa ? 'checked' : ''}> Activa</label>
      <label>Desde<input name="fecha_inicio" type="date" required value="${pr?.fecha_inicio || hoy}"></label>
      <label>Hasta<input name="fecha_fin" type="date" required value="${pr?.fecha_fin || '2026-12-31'}"></label>
      <div class="completo"><label>Productos incluidos</label>
        <div class="chips-sel">${A.productos.map((p) => `<label><input type="checkbox" name="prod" value="${p.id}" ${sel.has(p.id) ? 'checked' : ''}> ${esc(p.nombre)}</label>`).join('')}</div>
      </div>
      <div class="form-acciones"><button type="button" class="btn btn-suave" data-cerrar>Cancelar</button><button class="btn btn-oro">Guardar</button></div>
    </form>`);
  $('#formPromo').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const body = {
      titulo: f.titulo.value, descripcion: f.descripcion.value, descuento_pct: f.descuento_pct.value,
      fecha_inicio: f.fecha_inicio.value, fecha_fin: f.fecha_fin.value, activa: f.activa.checked,
      productos: $$('input[name="prod"]:checked', f).map((c) => Number(c.value)),
    };
    try {
      await adm(pr ? `/promociones/${pr.id}` : '/promociones', { method: pr ? 'PUT' : 'POST', body });
      cerrarModal();
      toast('Promoción guardada ✔');
      irA('promociones');
    } catch (e) { toast(e.message, true); }
  };
}

modal.addEventListener('click', (ev) => {
  if (ev.target === modal || ev.target.closest('[data-cerrar]')) cerrarModal();
});

iniciar();
