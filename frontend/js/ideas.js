let catalogosIdeas = null;

function estadosSelect(actual) {
  return ["idea", "en_evaluacion", "aprobada", "descartada"]
    .map((e) => `<option value="${e}" ${e === actual ? "selected" : ""}>${e.replace(/_/g, " ")}</option>`)
    .join("");
}

async function cargarCatalogosIdeas() {
  try {
    catalogosIdeas = await apiGet({ action: "catalogos" });
    document.getElementById("i_categoria").innerHTML =
      `<option value="">— Sin definir —</option>` +
      catalogosIdeas.arbol_perdidas.map((r) =>
        `<optgroup label="${r.nombre}">` +
        r.hijos.map((h) => `<option value="${h.id}">${h.nombre}</option>`).join("") +
        `</optgroup>`).join("");
    document.getElementById("i_pnl").innerHTML =
      `<option value="">— Sin definir —</option>` +
      catalogosIdeas.lineas_pnl.map((l) => `<option value="${l.id}">${l.nombre}</option>`).join("");
  } catch (e) { /* los selects quedan vacíos, no bloquea la carga de ideas */ }
}

async function cargarIdeas() {
  const lista = document.getElementById("lista-ideas");
  try {
    const d = await apiGet({ action: "ideas" });
    if (!d.ideas.length) { lista.innerHTML = "<p>Todavía no hay ideas cargadas.</p>"; return; }

    lista.innerHTML = d.ideas.map((i) => `
      <div class="proyecto-item">
        <div style="flex:1">
          <div class="nombre">${i.nombre}</div>
          <div class="meta">${i.area || "Sin área"} · Sugerido: ${i.responsable_sugerido || "-"} · Potencial: ${fmtMoney(i.potencial_estimado)}</div>
          <div class="meta">${i.descripcion || ""}</div>
          ${i.fuente ? `<div class="meta"><span class="chip">${i.fuente}</span></div>` : ""}
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <span class="badge badge-${i.estado}">${i.estado.replace(/_/g, " ")}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            <select onchange="cambiarEstadoIdea(${i.id}, this.value)">${estadosSelect(i.estado)}</select>
            ${i.estado !== "convertida"
              ? `<button class="btn btn-small" onclick="convertirIdea(${i.id})">Convertir en proyecto →</button>`
              : ""}
            <button class="btn-small btn-secundario" onclick="borrarIdea(${i.id})">✕</button>
          </div>
        </div>
      </div>`).join("");
  } catch (e) {
    lista.innerHTML = `<div class="flash flash-danger">Error: ${e.message}</div>`;
  }
}

async function cambiarEstadoIdea(id, estado) {
  await apiPost({ action: "cambiar_estado_idea", idea_id: id, estado });
  cargarIdeas();
}

async function borrarIdea(id) {
  if (!confirm("¿Eliminar esta idea?")) return;
  await apiPost({ action: "eliminar_idea", idea_id: id });
  cargarIdeas();
}

async function convertirIdea(id) {
  const d = await apiPost({ action: "convertir_idea", idea_id: id });
  const i = d.idea;
  const q = new URLSearchParams({
    nombre: i.nombre || "",
    area: i.area || "",
    responsable: i.responsable_sugerido || "",
    objetivo_valor: i.potencial_estimado || "",
    categoria_perdida: i.categoria_perdida || "",
    linea_pnl: i.linea_pnl || "",
  });
  window.location.href = `nuevo.html?${q.toString()}`;
}

document.getElementById("form-idea").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    await apiPost({
      action: "crear_idea",
      datos: {
        nombre: document.getElementById("i_nombre").value,
        descripcion: document.getElementById("i_descripcion").value,
        area: document.getElementById("i_area").value,
        responsable_sugerido: document.getElementById("i_responsable").value,
        potencial_estimado: parseFloat(document.getElementById("i_potencial").value) || 0,
        fuente: document.getElementById("i_fuente").value,
        categoria_perdida: document.getElementById("i_categoria").value,
        linea_pnl: document.getElementById("i_pnl").value,
      },
    });
    document.getElementById("form-idea").reset();
    cargarIdeas();
  } catch (e) {
    document.getElementById("flash-area").innerHTML = `<div class="flash flash-danger">${e.message}</div>`;
  }
});

cargarCatalogosIdeas();
cargarIdeas();
