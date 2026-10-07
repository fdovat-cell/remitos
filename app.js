// ===================================================================
// Remitos PelSAS — lógica de la app
// ===================================================================

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const money = (n) =>
  "$" + Number(n || 0).toLocaleString("es-UY", { maximumFractionDigits: 2 });

// Intenta varios nombres de campo posibles, por si productos.json usa
// otra convención (verificar contra el archivo real de buscador-v2).
function pick(obj, names, fallback = "") {
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null && obj[n] !== "") return obj[n];
  }
  return fallback;
}
function productoCampos(p) {
  return {
    codigo: String(pick(p, ["codigo", "código", "id", "code"])),
    nombre: String(pick(p, ["nombre", "descripcion", "descripción", "name", "producto"])),
    precio: Number(pick(p, ["precio", "price"], 0)),
  };
}

// ===================================================================
// Estado
// ===================================================================
let productos = [];        // catálogo de buscador-v2

// Escapa texto para meterlo en innerHTML
function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

let clienteActual = null;  // {id, nombre, direccion, ...}
let items = [];            // items del remito en edición
let clientesCache = [];
let clienteFichaActual = null;
let modalItemEditandoModo = "manual";
let editandoRemitoId = null; // id del remito guardado que se está editando (null = remito nuevo)

// ===================================================================
// Init
// ===================================================================
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("remitoFecha").value = new Date().toISOString().slice(0, 10);
  setupTabs();
  setupNuevoRemito();
  setupClientes();
  setupVistaPrevia();
  setupHistorial();
  cargarProductos();
  cargarClientes();
});

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "historial") cargarHistorial();
    });
  });
}

async function cargarProductos() {
  try {
    const res = await fetch(CONFIG.PRODUCTOS_JSON_URL);
    const data = await res.json();
    productos = (Array.isArray(data) ? data : data.productos || []).map(productoCampos);
  } catch (e) {
    console.error("No se pudo cargar el catálogo de productos:", e);
  }
}

// ===================================================================
// NUEVO REMITO
// ===================================================================
function setupNuevoRemito() {
  const clienteInput = document.getElementById("clienteBuscar");
  const clienteResultados = document.getElementById("clienteResultados");

  clienteInput.addEventListener("input", async () => {
    const q = clienteInput.value.trim();
    if (!q) { clienteResultados.innerHTML = ""; return; }
    const qSeguro = q.replace(/[,()*%]/g, " ").trim();
    const { data, error } = await sb
      .from("clientes")
      .select("id, nombre, direccion")
      .or(`nombre.ilike.%${qSeguro}%,direccion.ilike.%${qSeguro}%`)
      .order("nombre")
      .limit(8);
    if (error) { console.error(error); return; }
    clienteResultados.innerHTML = "";
    data.forEach((c) => {
      const div = document.createElement("div");
      div.className = "dropdown-item";
      div.innerHTML = `<span><strong>${esc(c.nombre)}</strong><br><small class="dir-sub">${esc(c.direccion || "sin dirección")}</small></span>`;
      div.addEventListener("click", () => seleccionarCliente(c));
      clienteResultados.appendChild(div);
    });
  });

  document.getElementById("clienteQuitar").addEventListener("click", () => {
    clienteActual = null;
    document.getElementById("clienteSeleccionado").classList.add("hidden");
    document.getElementById("btnVerTopCliente").classList.add("hidden");
    clienteInput.value = "";
    clienteInput.classList.remove("hidden");
  });

  document.getElementById("btnNuevoCliente").addEventListener("click", () => abrirModalCliente());

  document.getElementById("btnVerTopCliente").addEventListener("click", () => {
    if (clienteActual) mostrarTopProductos(clienteActual.id, clienteActual.nombre);
  });
  document.getElementById("modalTopCerrar").addEventListener("click", () => {
    document.getElementById("modalTop").classList.add("hidden");
  });

  // ---- Búsqueda de productos ----
  const prodInput = document.getElementById("productoBuscar");
  const prodResultados = document.getElementById("productoResultados");

  prodInput.addEventListener("input", () => {
    const q = prodInput.value.trim().toLowerCase();
    prodResultados.innerHTML = "";
    if (!q) return;
    const matches = productos
      .filter((p) => p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
      .slice(0, 10);
    matches.forEach((p) => {
      const div = document.createElement("div");
      div.className = "dropdown-item";
      div.innerHTML = `<span>${p.nombre} <span class="item-code">${p.codigo}</span></span><span class="item-price">${money(p.precio)}</span>`;
      div.addEventListener("click", () => {
        agregarItem({ codigo: p.codigo, descripcion: p.nombre, cantidad: 1, precio: p.precio });
        prodInput.value = "";
        prodResultados.innerHTML = "";
        prodInput.focus();
      });
      prodResultados.appendChild(div);
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".field")) {
      clienteResultados.innerHTML = "";
      prodResultados.innerHTML = "";
    }
  });

  // ---- Ítem manual ----
  document.getElementById("btnItemManual").addEventListener("click", () => {
    document.getElementById("itemManualDescripcion").value = "";
    document.getElementById("itemManualCantidad").value = 1;
    document.getElementById("itemManualPrecio").value = 0;
    document.getElementById("modalItem").classList.remove("hidden");
  });
  document.getElementById("modalItemCancelar").addEventListener("click", () => {
    document.getElementById("modalItem").classList.add("hidden");
  });
  document.getElementById("modalItemAgregar").addEventListener("click", () => {
    const descripcion = document.getElementById("itemManualDescripcion").value.trim();
    const cantidad = Number(document.getElementById("itemManualCantidad").value) || 0;
    const precio = Number(document.getElementById("itemManualPrecio").value) || 0;
    if (!descripcion || cantidad <= 0) return;
    agregarItem({ codigo: "", descripcion, cantidad, precio });
    document.getElementById("modalItem").classList.add("hidden");
    document.getElementById("productoBuscar").focus();
  });

  // ---- Guardar / imprimir ----
  document.getElementById("btnGuardarRemito").addEventListener("click", guardarRemito);
  document.getElementById("btnImprimirRemito").addEventListener("click", () => imprimirRemitoActual());
  document.getElementById("btnDescargarRemito").addEventListener("click", () => {
    if (window._ultimoRemito) descargarRemitoPDF(window._ultimoRemito);
  });
  document.getElementById("btnNuevoRemitoReset").addEventListener("click", () => {
    resetNuevoRemito();
    document.getElementById("btnNuevoRemitoReset").classList.add("hidden");
  });
}

function seleccionarCliente(c) {
  clienteActual = c;
  document.getElementById("clienteBuscar").value = "";
  document.getElementById("clienteBuscar").classList.add("hidden");
  document.getElementById("clienteResultados").innerHTML = "";
  document.getElementById("clienteSeleccionadoNombre").innerHTML = `<strong>${esc(c.nombre)}</strong>${c.direccion ? ` <small class="dir-sub">· ${esc(c.direccion)}</small>` : ""}`;
  document.getElementById("clienteSeleccionado").classList.remove("hidden");
  document.getElementById("btnVerTopCliente").classList.remove("hidden");
}

function agregarItem(item) {
  items.push(item);
  renderItems();
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderItems() {
  const body = document.getElementById("itemsBody");
  body.innerHTML = "";
  if (items.length === 0) {
    body.innerHTML = `<tr id="itemsEmptyRow"><td colspan="6" class="empty-row">Todavía no agregaste productos</td></tr>`;
  } else {
    items.forEach((it, i) => {
      const subtotal = it.cantidad * it.precio;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${it.codigo || "—"}</td>
        <td><input type="text" value="${escapeAttr(it.descripcion)}" data-idx="${i}" data-field="descripcion" class="desc-input" /></td>
        <td class="num"><input type="number" min="0" step="1" value="${it.cantidad}" data-idx="${i}" data-field="cantidad" /></td>
        <td class="num"><input type="number" min="0" step="0.01" value="${it.precio}" data-idx="${i}" data-field="precio" /></td>
        <td class="num row-subtotal">${money(subtotal)}</td>
        <td><button class="row-remove" data-idx="${i}" title="Quitar">✕</button></td>
      `;
      body.appendChild(tr);
    });
  }

  body.querySelectorAll('input[data-field="descripcion"]').forEach((inp) => {
    inp.addEventListener("input", () => {
      items[Number(inp.dataset.idx)].descripcion = inp.value;
    });
  });

  body.querySelectorAll('input[data-field="cantidad"], input[data-field="precio"]').forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.dataset.idx);
      const field = inp.dataset.field;
      items[idx][field] = Number(inp.value) || 0;
      const subtotal = items[idx].cantidad * items[idx].precio;
      inp.closest("tr").querySelector(".row-subtotal").textContent = money(subtotal);
      const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
      document.getElementById("remitoTotal").textContent = money(total);
    });
  });

  body.querySelectorAll(".row-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      items.splice(Number(btn.dataset.idx), 1);
      renderItems();
    });
  });

  const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  document.getElementById("remitoTotal").textContent = money(total);
}

function actualizarBotonGuardar() {
  document.getElementById("btnGuardarRemito").textContent = editandoRemitoId
    ? "Guardar cambios"
    : "Guardar remito";
}

// Guarda un remito nuevo, o los cambios de un remito ya guardado.
// Para editar: se guarda la versión nueva y recién después se borra la anterior,
// así nunca se pierde el remito si algo falla a mitad de camino.
async function guardarRemito() {
  const msg = document.getElementById("nuevoRemitoMsg");
  msg.textContent = "";
  msg.className = "msg";

  if (!clienteActual) { msg.textContent = "Elegí o creá un cliente."; msg.className = "msg error"; return; }
  if (items.length === 0) { msg.textContent = "Agregá al menos un producto."; msg.className = "msg error"; return; }

  const fecha = document.getElementById("remitoFecha").value;
  const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  const idAnterior = editandoRemitoId;

  const { data: remito, error: errRemito } = await sb
    .from("remitos")
    .insert({ cliente_id: clienteActual.id, fecha, total })
    .select()
    .single();

  if (errRemito) { msg.textContent = "Error al guardar: " + errRemito.message; msg.className = "msg error"; return; }

  const filas = items.map((it) => ({
    remito_id: remito.id,
    codigo: it.codigo || null,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precio_unitario: it.precio,
    subtotal: it.cantidad * it.precio,
  }));
  const { error: errItems } = await sb.from("remito_items").insert(filas);

  if (errItems) {
    // Deshace el remito recién creado para no dejar uno vacío.
    await sb.from("remitos").delete().eq("id", remito.id);
    msg.textContent = "Error guardando los ítems, no se guardó nada: " + errItems.message;
    msg.className = "msg error";
    return;
  }

  let avisoDuplicado = "";
  if (idAnterior) {
    const { error: errDel } = await sb.from("remitos").delete().eq("id", idAnterior);
    if (errDel) {
      avisoDuplicado = " Ojo: no se pudo borrar la versión anterior, borrala a mano desde Historial (" + errDel.message + ").";
    }
  }

  // Desde acá, guardar de nuevo reemplaza este remito en vez de duplicarlo.
  editandoRemitoId = remito.id;
  actualizarBotonGuardar();

  msg.textContent = (idAnterior ? "Cambios guardados." : "Remito guardado.") + avisoDuplicado;
  msg.className = avisoDuplicado ? "msg error" : "msg ok";
  document.getElementById("btnImprimirRemito").disabled = false;
  document.getElementById("btnDescargarRemito").disabled = false;
  document.getElementById("btnNuevoRemitoReset").classList.remove("hidden");
  window._ultimoRemito = { cliente: clienteActual, fecha, items: items.map((it) => ({ ...it })), total };
  cargarClientes();
}

// Construye el PDF del remito (usado tanto para imprimir como para descargar).
function construirPDFRemito(r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Remito", 14, 18);
  doc.setFontSize(10);
  doc.text("Fecha: " + r.fecha, 14, 26);
  doc.setFontSize(12);
  doc.text("Cliente: " + r.cliente.nombre, 14, 34);

  let y = 42;
  if (r.cliente.direccion) {
    doc.setFontSize(10);
    doc.text("Dirección: " + r.cliente.direccion, 14, y);
    y += 8;
  }
  y += 4;
  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.text("Código", 14, y);
  doc.text("Descripción", 38, y);
  doc.text("Cant.", 138, y, { align: "right" });
  doc.text("Precio", 165, y, { align: "right" });
  doc.text("Subtotal", 196, y, { align: "right" });
  doc.setFont(undefined, "normal");
  doc.line(14, y + 2, 196, y + 2);
  y += 8;

  r.items.forEach((it) => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(String(it.codigo || "—"), 14, y);
    doc.text(String(it.descripcion), 38, y, { maxWidth: 96 });
    doc.text(String(it.cantidad), 138, y, { align: "right" });
    doc.text(money(it.precio), 165, y, { align: "right" });
    doc.text(money(it.cantidad * it.precio), 196, y, { align: "right" });
    y += 7;
  });

  y += 4;
  doc.line(14, y, 196, y);
  y += 8;
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Total: " + money(r.total), 196, y, { align: "right" });

  return doc;
}

function nombreArchivoRemito(r) {
  return `remito-${r.cliente.nombre.replace(/\s+/g, "_")}-${r.fecha}.pdf`;
}

// "Imprimir" abre siempre la vista previa; desde ahí se elige impresora, guardar o cerrar.
function imprimirRemitoActual(remito) {
  const r = remito || window._ultimoRemito;
  if (!r || !window.jspdf) return;
  mostrarVistaPrevia(construirPDFRemito(r), nombreArchivoRemito(r), `Remito de ${r.cliente.nombre} (${r.fecha})`);
}

// ===================================================================
// VISTA PREVIA (imprimir / guardar en el equipo / cerrar sin hacer nada)
// ===================================================================
let _vistaPrevia = null; // { doc, nombreArchivo, url }

function mostrarVistaPrevia(doc, nombreArchivo, titulo) {
  cerrarVistaPrevia();
  const url = doc.output("bloburl");
  _vistaPrevia = { doc, nombreArchivo, url };
  document.getElementById("vistaPreviaTitulo").textContent = titulo || "Vista previa";
  document.getElementById("vistaPreviaFrame").src = url;
  document.getElementById("vistaPreviaAbrir").href = url;
  document.getElementById("modalVistaPrevia").classList.remove("hidden");
}

function cerrarVistaPrevia() {
  document.getElementById("modalVistaPrevia").classList.add("hidden");
  document.getElementById("vistaPreviaFrame").src = "about:blank";
  if (_vistaPrevia) { URL.revokeObjectURL(_vistaPrevia.url); _vistaPrevia = null; }
}

function setupVistaPrevia() {
  document.getElementById("vistaPreviaCerrar").addEventListener("click", cerrarVistaPrevia);
  document.getElementById("vistaPreviaGuardar").addEventListener("click", () => {
    if (_vistaPrevia) _vistaPrevia.doc.save(_vistaPrevia.nombreArchivo);
  });
  document.getElementById("vistaPreviaImprimir").addEventListener("click", () => {
    if (!_vistaPrevia) return;
    const frame = document.getElementById("vistaPreviaFrame");
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      // Si el navegador no deja imprimir desde la vista previa, se abre el PDF en otra pestaña.
      window.open(_vistaPrevia.url, "_blank");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _vistaPrevia) cerrarVistaPrevia();
  });
}

function descargarRemitoPDF(remito) {
  const r = remito;
  if (!r || !window.jspdf) return;
  const doc = construirPDFRemito(r);
  doc.save(nombreArchivoRemito(r));
}

// Trae un remito ya guardado (con cliente e ítems) para reimprimir, descargar o editar.
async function cargarRemitoCompleto(remitoId) {
  const { data, error } = await sb
    .from("remitos")
    .select("id, fecha, total, cliente_id, clientes(id, nombre, direccion), remito_items(codigo, descripcion, cantidad, precio_unitario)")
    .eq("id", remitoId)
    .single();
  if (error) { alert("Error al cargar el remito: " + error.message); return null; }
  return {
    id: data.id,
    cliente: {
      id: data.cliente_id,
      nombre: data.clientes?.nombre || "—",
      direccion: data.clientes?.direccion || "",
    },
    fecha: data.fecha,
    total: data.total,
    items: (data.remito_items || []).map((it) => ({
      codigo: it.codigo,
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad),
      precio: Number(it.precio_unitario),
    })),
  };
}

async function reimprimirRemito(remitoId) {
  const r = await cargarRemitoCompleto(remitoId);
  if (r) imprimirRemitoActual(r);
}

async function redescargarRemito(remitoId) {
  const r = await cargarRemitoCompleto(remitoId);
  if (r) descargarRemitoPDF(r);
}

// Carga un remito guardado en la pestaña "Nuevo remito" para modificarlo.
async function editarRemito(remitoId) {
  // Si hay un remito armado sin guardar, confirmar antes de pisarlo.
  const hayTrabajoSinGuardar = items.length > 0 && document.getElementById("btnImprimirRemito").disabled;
  if (hayTrabajoSinGuardar && !confirm("Tenés un remito sin guardar en la pestaña Nuevo remito. ¿Descartarlo y editar este?")) return;

  const r = await cargarRemitoCompleto(remitoId);
  if (!r) return;

  resetNuevoRemito();
  editandoRemitoId = r.id;
  actualizarBotonGuardar();

  seleccionarCliente(r.cliente);
  document.getElementById("remitoFecha").value = r.fecha;
  items = r.items;
  renderItems();

  const msg = document.getElementById("nuevoRemitoMsg");
  msg.textContent = `Editando remito de ${r.cliente.nombre} (${r.fecha}). Hacé los cambios y tocá "Guardar cambios".`;
  msg.className = "msg";
  // "Empezar remito nuevo" funciona como cancelar la edición.
  document.getElementById("btnNuevoRemitoReset").classList.remove("hidden");

  document.querySelector('.tab-btn[data-tab="nuevo"]').click();
}

function resetNuevoRemito() {
  clienteActual = null;
  items = [];
  editandoRemitoId = null;
  actualizarBotonGuardar();
  document.getElementById("clienteSeleccionado").classList.add("hidden");
  document.getElementById("btnVerTopCliente").classList.add("hidden");
  document.getElementById("clienteBuscar").classList.remove("hidden");
  document.getElementById("clienteBuscar").value = "";
  document.getElementById("remitoFecha").value = new Date().toISOString().slice(0, 10);
  document.getElementById("btnImprimirRemito").disabled = true;
  document.getElementById("btnDescargarRemito").disabled = true;
  document.getElementById("nuevoRemitoMsg").textContent = "";
  renderItems();
}

// ===================================================================
// TOP PRODUCTOS RÁPIDO (desde Nuevo remito, sin ir a la ficha)
// ===================================================================
async function mostrarTopProductos(clienteId, nombre) {
  document.getElementById("modalTopTitulo").textContent = "Productos más comprados — " + nombre;
  const tbody = document.querySelector("#modalTopTabla tbody");
  tbody.innerHTML = `<tr><td colspan="2" class="empty-row">Cargando...</td></tr>`;
  document.getElementById("modalTop").classList.remove("hidden");

  const top = await calcularTopProductos(clienteId);
  tbody.innerHTML = top.length
    ? top.map(([n, cant]) => `<tr><td>${n}</td><td class="num">${cant}</td></tr>`).join("")
    : `<tr><td colspan="2" class="empty-row">Sin compras registradas todavía</td></tr>`;
}

async function calcularTopProductos(clienteId) {
  const { data: remitos, error } = await sb
    .from("remitos")
    .select("remito_items(descripcion, cantidad)")
    .eq("cliente_id", clienteId);
  if (error) { console.error(error); return []; }
  const conteo = {};
  remitos.forEach((r) => {
    (r.remito_items || []).forEach((it) => {
      conteo[it.descripcion] = (conteo[it.descripcion] || 0) + Number(it.cantidad);
    });
  });
  return Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 15);
}

// ===================================================================
// BORRAR REMITO
// ===================================================================
async function borrarRemito(remitoId, alTerminar) {
  if (!confirm("¿Borrar este remito? No se puede deshacer.")) return;
  const { error } = await sb.from("remitos").delete().eq("id", remitoId);
  if (error) { alert("Error al borrar: " + error.message); return; }
  // Si justo se estaba editando ese remito, salir del modo edición.
  if (editandoRemitoId === remitoId) {
    resetNuevoRemito();
    document.getElementById("btnNuevoRemitoReset").classList.add("hidden");
  }
  if (alTerminar) alTerminar();
}

function diasDesde(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date();
  const fecha = new Date(fechaStr + "T00:00:00");
  return Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24));
}

// ===================================================================
// MODAL CLIENTE (nuevo / editar)
// ===================================================================
function abrirModalCliente(clienteExistente) {
  document.getElementById("modalClienteTitulo").textContent = clienteExistente ? "Editar cliente" : "Nuevo cliente";
  document.getElementById("modalNombre").value = clienteExistente?.nombre || "";
  document.getElementById("modalTelefono").value = clienteExistente?.telefono || "";
  document.getElementById("modalDireccion").value = clienteExistente?.direccion || "";
  document.getElementById("modalNotas").value = clienteExistente?.notas || "";
  document.getElementById("modalClienteMsg").textContent = "";
  document.getElementById("modalCliente").dataset.editId = clienteExistente?.id || "";
  document.getElementById("modalCliente").classList.remove("hidden");
}

function setupModalCliente() {
  document.getElementById("modalClienteCancelar").addEventListener("click", () => {
    document.getElementById("modalCliente").classList.add("hidden");
  });

  document.getElementById("modalClienteGuardar").addEventListener("click", async () => {
    const nombre = document.getElementById("modalNombre").value.trim();
    const telefono = document.getElementById("modalTelefono").value.trim();
    const direccion = document.getElementById("modalDireccion").value.trim();
    const notas = document.getElementById("modalNotas").value.trim();
    const msg = document.getElementById("modalClienteMsg");
    if (!nombre) { msg.textContent = "El nombre es obligatorio."; msg.className = "msg error"; return; }

    const editId = document.getElementById("modalCliente").dataset.editId;
    let resultado;
    if (editId) {
      resultado = await sb.from("clientes").update({ nombre, telefono, direccion, notas }).eq("id", editId).select().single();
    } else {
      resultado = await sb.from("clientes").insert({ nombre, telefono, direccion, notas }).select().single();
    }
    if (resultado.error) { msg.textContent = "Error: " + resultado.error.message; msg.className = "msg error"; return; }

    document.getElementById("modalCliente").classList.add("hidden");
    await cargarClientes();

    if (!editId) {
      seleccionarCliente(resultado.data);
    } else if (clienteFichaActual && clienteFichaActual.id === editId) {
      abrirFichaCliente(resultado.data);
    }
  });
}

// ===================================================================
// CLIENTES (tab)
// ===================================================================
function setupClientes() {
  setupModalCliente();
  document.getElementById("clientesFiltro").addEventListener("input", renderClientesLista);
  document.getElementById("listaOrden").addEventListener("change", renderClientesLista);
  document.getElementById("btnImprimirLista").addEventListener("click", () => {
    if (!window.jspdf) return;
    mostrarVistaPrevia(construirPDFListaClientes(), `lista-clientes-${new Date().toISOString().slice(0, 10)}.pdf`, "Lista de clientes");
  });
  document.getElementById("btnEditarCliente").addEventListener("click", () => {
    if (clienteFichaActual) abrirModalCliente(clienteFichaActual);
  });
}

async function cargarClientes() {
  const { data: clientes, error } = await sb.from("clientes").select("*").order("nombre");
  if (error) { console.error(error); return; }

  const { data: remitos, error: errRemitos } = await sb.from("remitos").select("cliente_id, fecha");
  if (errRemitos) { console.error(errRemitos); }

  const ultimaFechaPorCliente = {};
  (remitos || []).forEach((r) => {
    if (!ultimaFechaPorCliente[r.cliente_id] || r.fecha > ultimaFechaPorCliente[r.cliente_id]) {
      ultimaFechaPorCliente[r.cliente_id] = r.fecha;
    }
  });

  clientesCache = clientes.map((c) => ({
    ...c,
    _ultimaFecha: ultimaFechaPorCliente[c.id] || null,
  }));

  // Más recientes primero; sin compras, al final.
  clientesCache.sort((a, b) => {
    if (!a._ultimaFecha && !b._ultimaFecha) return a.nombre.localeCompare(b.nombre);
    if (!a._ultimaFecha) return 1;
    if (!b._ultimaFecha) return -1;
    return b._ultimaFecha.localeCompare(a._ultimaFecha);
  });

  renderClientesLista();
}

const _cmp = (a, b) => String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base", numeric: true });

function ordenarClientes(arr, orden) {
  const copia = [...arr];
  if (orden === "alfa") {
    copia.sort((a, b) => _cmp(a.nombre, b.nombre));
  } else if (orden === "direccion") {
    copia.sort((a, b) => {
      if (!a.direccion && !b.direccion) return _cmp(a.nombre, b.nombre);
      if (!a.direccion) return 1;
      if (!b.direccion) return -1;
      return _cmp(a.direccion, b.direccion) || _cmp(a.nombre, b.nombre);
    });
  } else { // "ultima": más reciente primero, sin compras al final
    copia.sort((a, b) => {
      if (!a._ultimaFecha && !b._ultimaFecha) return _cmp(a.nombre, b.nombre);
      if (!a._ultimaFecha) return 1;
      if (!b._ultimaFecha) return -1;
      return b._ultimaFecha.localeCompare(a._ultimaFecha);
    });
  }
  return copia;
}

// Clientes que pasan el filtro (nombre o dirección), en el orden elegido.
function clientesFiltrados() {
  const q = document.getElementById("clientesFiltro").value.trim().toLowerCase();
  const orden = document.getElementById("listaOrden").value;
  const filtrados = clientesCache.filter((c) =>
    (c.nombre || "").toLowerCase().includes(q) || (c.direccion || "").toLowerCase().includes(q));
  return ordenarClientes(filtrados, orden);
}

const ETIQUETA_ORDEN = { alfa: "alfabético (A–Z)", direccion: "por dirección", ultima: "por última venta" };

function construirPDFListaClientes() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const orden = document.getElementById("listaOrden").value;
  const lista = clientesFiltrados();

  const cabecera = (y) => {
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text("#", 14, y);
    doc.text("Cliente", 24, y);
    doc.text("Dirección", 78, y);
    doc.text("Teléfono", 142, y);
    doc.text("Última venta", 196, y, { align: "right" });
    doc.setFont(undefined, "normal");
    doc.line(14, y + 2, 196, y + 2);
    return y + 8;
  };

  doc.setFontSize(16);
  doc.text("Lista de clientes", 14, 18);
  doc.setFontSize(9);
  doc.text(`Orden: ${ETIQUETA_ORDEN[orden]}  ·  ${lista.length} cliente${lista.length === 1 ? "" : "s"}  ·  ${new Date().toISOString().slice(0, 10)}`, 14, 25);

  let y = cabecera(34);
  doc.setFontSize(9);
  lista.forEach((c) => {
    const nom = doc.splitTextToSize(String(c.nombre || ""), 50);
    const dir = doc.splitTextToSize(String(c.direccion || "—"), 60);
    const lineas = Math.max(nom.length, dir.length);
    if (y + lineas * 4.5 > 285) { doc.addPage(); y = cabecera(20); doc.setFontSize(9); }
    doc.text(String(c.numero ?? "—"), 14, y);
    doc.text(nom, 24, y);
    doc.text(dir, 78, y);
    doc.text(String(c.telefono || "—"), 142, y);
    doc.text(c._ultimaFecha || "sin compras", 196, y, { align: "right" });
    y += lineas * 4.5 + 2;
  });
  return doc;
}

function renderClientesLista() {
  const q = document.getElementById("clientesFiltro").value.trim().toLowerCase();
  const lista = document.getElementById("clientesLista");
  lista.innerHTML = "";
  clientesFiltrados()
    .forEach((c) => {
      const li = document.createElement("li");
      const dias = diasDesde(c._ultimaFecha);
      const sub = c._ultimaFecha
        ? `hace ${dias} día${dias === 1 ? "" : "s"}`
        : "sin compras";
      li.innerHTML = `<div class="cliente-li-nombre">#${c.numero ?? "—"} ${esc(c.nombre)}</div><div class="cliente-li-dir">${esc(c.direccion || "sin dirección")}</div><div class="cliente-li-sub">${sub}</div>`;
      if (clienteFichaActual && clienteFichaActual.id === c.id) li.classList.add("active");
      li.addEventListener("click", () => abrirFichaCliente(c));
      lista.appendChild(li);
    });
}

async function abrirFichaCliente(c) {
  clienteFichaActual = c;
  renderClientesLista();
  document.getElementById("clienteFichaVacio").classList.add("hidden");
  document.getElementById("clienteFicha").classList.remove("hidden");

  document.getElementById("fichaNombre").textContent = `#${c.numero ?? "—"} ${c.nombre}`;
  document.getElementById("fichaTelefono").textContent = c.telefono || "—";
  document.getElementById("fichaDireccion").textContent = c.direccion || "—";
  document.getElementById("fichaNotas").textContent = c.notas || "—";

  const { data: remitos, error } = await sb
    .from("remitos")
    .select("id, fecha, total, remito_items(codigo, descripcion, cantidad)")
    .eq("cliente_id", c.id)
    .order("fecha", { ascending: false });

  if (error) { console.error(error); return; }

  document.getElementById("fichaTotalRemitos").textContent = remitos.length;
  document.getElementById("fichaTotalComprado").textContent = money(remitos.reduce((s, r) => s + Number(r.total), 0));
  document.getElementById("fichaUltimaCompra").textContent = remitos[0] ? remitos[0].fecha : "—";

  // top productos
  const conteo = {};
  remitos.forEach((r) => {
    (r.remito_items || []).forEach((it) => {
      const key = it.descripcion;
      conteo[key] = (conteo[key] || 0) + Number(it.cantidad);
    });
  });
  const top = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const topBody = document.querySelector("#fichaTopProductos tbody");
  topBody.innerHTML = top.length
    ? top.map(([nombre, cant]) => `<tr><td>${nombre}</td><td class="num">${cant}</td></tr>`).join("")
    : `<tr><td colspan="2" class="empty-row">Sin datos todavía</td></tr>`;

  // historial de remitos
  const histBody = document.querySelector("#fichaHistorial tbody");
  histBody.innerHTML = remitos.length
    ? remitos.map((r) => `<tr>
        <td>${r.fecha}</td>
        <td class="num">${money(r.total)}</td>
        <td class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${r.id}" title="Editar">✎</button>
          <button class="icon-btn" data-action="print" data-id="${r.id}" title="Imprimir">🖨</button>
          <button class="icon-btn" data-action="pdf" data-id="${r.id}" title="Descargar PDF">⬇</button>
          <button class="row-remove" data-action="del" data-id="${r.id}" title="Borrar remito">✕</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="3" class="empty-row">Sin remitos todavía</td></tr>`;
  histBody.querySelectorAll("[data-action]").forEach((btn) => {
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") btn.addEventListener("click", () => editarRemito(id));
    if (btn.dataset.action === "print") btn.addEventListener("click", () => reimprimirRemito(id));
    if (btn.dataset.action === "pdf") btn.addEventListener("click", () => redescargarRemito(id));
    if (btn.dataset.action === "del") btn.addEventListener("click", () => borrarRemito(id, async () => {
      await abrirFichaCliente(c);
      await cargarClientes();
    }));
  });
}

// ===================================================================
// HISTORIAL (tab)
// ===================================================================
function setupHistorial() {
  document.getElementById("historialFiltro").addEventListener("input", cargarHistorial);
}

async function cargarHistorial() {
  const q = document.getElementById("historialFiltro").value.trim();
  let query = sb
    .from("remitos")
    .select("id, fecha, total, created_at, clientes(nombre, direccion), remito_items(codigo, descripcion, cantidad, precio_unitario)")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(200);

  const { data, error } = await query;
  if (error) { console.error(error); return; }

  const filtrados = q
    ? data.filter((r) => {
        const t = q.toLowerCase();
        return (r.clientes?.nombre || "").toLowerCase().includes(t) || (r.clientes?.direccion || "").toLowerCase().includes(t);
      })
    : data;

  // Agrupa por fecha (días más recientes primero; dentro de cada día, en el orden en que se hicieron).
  const dias = [];
  filtrados.forEach((r) => {
    let dia = dias[dias.length - 1];
    if (!dia || dia.fecha !== r.fecha) { dia = { fecha: r.fecha, remitos: [] }; dias.push(dia); }
    dia.remitos.push(r);
  });

  const etiquetaDia = (f) => {
    const t = new Date(f + "T00:00:00").toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const horaDe = (iso) => iso ? new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "";

  const body = document.getElementById("historialLista");
  const detalleHTML = (r) => {
    const its = r.remito_items || [];
    if (!its.length) return `<p class="empty-row">Este remito no tiene productos cargados.</p>`;
    return `<table class="items-table detalle-table">
        <thead><tr><th>Código</th><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${its.map((it) => `<tr>
          <td>${esc(it.codigo || "—")}</td>
          <td>${esc(it.descripcion)}</td>
          <td class="num">${esc(Number(it.cantidad))}</td>
          <td class="num">${money(Number(it.precio_unitario))}</td>
          <td class="num">${money(Number(it.cantidad) * Number(it.precio_unitario))}</td>
        </tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="4" class="num"><strong>Total</strong></td><td class="num"><strong>${money(r.total)}</strong></td></tr></tfoot>
      </table>`;
  };

  body.innerHTML = dias.length
    ? dias.map((d) => {
        const totalDia = d.remitos.reduce((acc, r) => acc + Number(r.total || 0), 0);
        const n = d.remitos.length;
        return `<div class="dia-bloque">
          <div class="dia-header">
            <span class="dia-fecha">${esc(etiquetaDia(d.fecha))}</span>
            <span class="dia-resumen">${n} remito${n === 1 ? "" : "s"} · Total del día ${money(totalDia)}</span>
          </div>
          ${d.remitos.map((r) => {
            const cant = (r.remito_items || []).length;
            return `<div class="remito-card">
            <div class="remito-head" data-toggle="${r.id}" role="button" tabindex="0" aria-expanded="false">
              <span class="remito-flecha">▸</span>
              <span class="hora">${esc(horaDe(r.created_at))}</span>
              <span class="remito-cliente"><strong>${esc(r.clientes?.nombre || "—")}</strong><br><small class="dir-sub">${esc(r.clientes?.direccion || "sin dirección")} · ${cant} producto${cant === 1 ? "" : "s"}</small></span>
              <span class="remito-total">${money(r.total)}</span>
              <span class="row-actions">
                <button class="icon-btn" data-action="edit" data-id="${r.id}" title="Editar">✎</button>
                <button class="icon-btn" data-action="print" data-id="${r.id}" title="Imprimir">🖨</button>
                <button class="icon-btn" data-action="pdf" data-id="${r.id}" title="Descargar PDF">⬇</button>
                <button class="row-remove" data-action="del" data-id="${r.id}" title="Borrar remito">✕</button>
              </span>
            </div>
            <div class="remito-detalle hidden">${detalleHTML(r)}</div>
          </div>`;
          }).join("")}
        </div>`;
      }).join("")
    : `<p class="empty-row">No hay remitos todavía</p>`;

  // Abrir / cerrar el detalle de cada remito
  body.querySelectorAll(".remito-head").forEach((head) => {
    const alternar = () => {
      const detalle = head.parentElement.querySelector(".remito-detalle");
      const abierto = detalle.classList.toggle("hidden") === false;
      head.setAttribute("aria-expanded", abierto ? "true" : "false");
      head.querySelector(".remito-flecha").textContent = abierto ? "▾" : "▸";
      head.parentElement.classList.toggle("abierto", abierto);
    };
    head.addEventListener("click", (e) => { if (!e.target.closest("button")) alternar(); });
    head.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button")) { e.preventDefault(); alternar(); }
    });
  });
  body.querySelectorAll("[data-action]").forEach((btn) => {
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") btn.addEventListener("click", () => editarRemito(id));
    if (btn.dataset.action === "print") btn.addEventListener("click", () => reimprimirRemito(id));
    if (btn.dataset.action === "pdf") btn.addEventListener("click", () => redescargarRemito(id));
    if (btn.dataset.action === "del") btn.addEventListener("click", () => borrarRemito(id, cargarHistorial));
  });
}
