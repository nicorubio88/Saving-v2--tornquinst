let catalogos = null;
let modoEdicion = null; // id del proyecto si estamos editando

function mostrarFlash(msg, tipo) {
  document.getElementById("flash-area").innerHTML = `<div class="flash flash-${tipo}">${msg}</div>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function agregarFila() {
  const cont = document.getElementById("variables-container");
  const row = document.createElement("div");
  row.className = "var-row";
  row.innerHTML = `
    <input type="text" class="var_nombre" placeholder="nombre corto">
    <input type="text" class="var_label" placeholder="etiqueta">
    <input type="text" class="var_unidad" placeholder="unidad">
    <button type="button" class="btn-small btn-secundario" onclick="quitarFila(this)">✕</button>`;
  cont.appendChild(row);
  engancharPreview();
  actualizarPreview();
}

function quitarFila(btn) {
  btn.parentElement.remove();
  actualizarPreview();
}

function leerVariables() {
  return [...document.querySelectorAll("#variables-container .var-row")]
    .map((row) => ({
      nombre: row.querySelector(".var_nombre").value.trim(),
      label: row.querySelector(".var_label").value.trim(),
      unidad: row.querySelector(".var_unidad").value.trim(),
    }))
    .filter((v) => v.nombre);
}

// ------------------------------------------------ vista previa en vivo
function actualizarPreview() {
  const variables = leerVariables();
  const cont = document.getElementById("preview-inputs");
  const resultado = document.getElementById("preview-resultado");

  // Mantener valores ya tipeados al re-renderizar
  const previos = {};
  cont.querySelectorAll("input").forEach((i) => (previos[i.dataset.nombre] = i.value));

  cont.innerHTML = variables
    .map((v) => `
      <div>
        <label>${v.label || v.nombre} ${v.unidad ? `(${v.unidad})` : ""}</label>
        <input type="number" step="any" class="preview-var" data-nombre="${v.nombre}"
               value="${previos[v.nombre] || ""}" placeholder="valor de prueba">
      </div>`)
    .join("");
  cont.querySelectorAll(".preview-var").forEach((i) => i.addEventListener("input", calcularPreview));

  calcularPreview();
}

function calcularPreview() {
  const resultado = document.getElementById("preview-resultado");
  const expresion = document.getElementById("expresion_indicador").value.trim();
  const base = parseFloat(document.getElementById("valor_base_indicador").value);
  const costo = parseFloat(document.getElementById("costo_unitario").value);
  const variableVolumen = document.getElementById("variable_volumen").value.trim();
  const menorEsMejor = document.getElementById("menor_es_mejor").value === "true";
  const unidadInd = document.getElementById("unidad_indicador").value.trim();

  const valores = {};
  let faltan = false;
  document.querySelectorAll(".preview-var").forEach((i) => {
    const v = parseFloat(i.value);
    if (isNaN(v)) faltan = true;
    else valores[i.dataset.nombre] = v;
  });

  if (!expresion || faltan || Object.keys(valores).length === 0 || isNaN(base) || isNaN(costo)) {
    resultado.innerHTML = "Completá las variables de prueba, la fórmula, la línea de base y el costo para ver la simulación.";
    return;
  }

  try {
    const { indicador, ahorro } = calcularAhorroUI(
      { expresion, base, costo, variableVolumen, menorEsMejor },
      valores
    );
    const esAhorro = ahorro >= 0;
    const detalleVolumen = variableVolumen && valores[variableVolumen] !== undefined
      ? ` × ${valores[variableVolumen].toLocaleString("es-AR")} (${variableVolumen})`
      : "";
    resultado.innerHTML = `
      <div class="preview-linea">Indicador calculado: <strong>${indicador.toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${unidadInd}</strong></div>
      <div class="preview-linea">Línea de base: <strong>${base.toLocaleString("es-AR")} ${unidadInd}</strong></div>
      <div class="preview-linea">Diferencia: ${(menorEsMejor ? base - indicador : indicador - base).toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${unidadInd} × ${costo.toLocaleString("es-AR")} $${detalleVolumen}</div>
      <div class="preview-linea resultado-ahorro ${esAhorro ? "valor-positivo" : "valor-negativo"}">
        ${esAhorro ? "✅ AHORRO" : "⚠️ PÉRDIDA"} del período: ${fmtMoney(ahorro)}
      </div>`;
  } catch (e) {
    resultado.innerHTML = `<span class="valor-negativo">⚠️ ${e.message}</span>`;
  }
}

function engancharPreview() {
  document.querySelectorAll("#variables-container input").forEach((i) => {
    i.removeEventListener("input", actualizarPreview);
    i.addEventListener("input", actualizarPreview);
  });
}

// ------------------------------------------------ carga de catálogos
async function cargarCatalogos() {
  catalogos = await apiGet({ action: "catalogos" });

  const selCat = document.getElementById("categoria_perdida");
  selCat.innerHTML = `<option value="">— Elegir categoría —</option>` +
    catalogos.arbol_perdidas.map((rama) =>
      `<optgroup label="${rama.nombre}">` +
      rama.hijos.map((h) => `<option value="${h.id}" title="${h.descripcion}">${h.nombre}</option>`).join("") +
      `</optgroup>`).join("");

  const selPnl = document.getElementById("linea_pnl");
  selPnl.innerHTML = `<option value="">— Elegir línea —</option>` +
    catalogos.lineas_pnl.map((l) => `<option value="${l.id}">${l.nombre} (${l.tipo})</option>`).join("");

  const selImp = document.getElementById("tipo_impacto");
  selImp.innerHTML = catalogos.tipos_impacto.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join("");

  // Sugerir automáticamente la línea de P&L según la pérdida elegida
  selCat.addEventListener("change", () => {
    const hoja = catalogos.hojas.find((h) => h.id === selCat.value);
    if (hoja && hoja.pnl_sugerida && !selPnl.value) selPnl.value = hoja.pnl_sugerida;
  });
}

// ------------------------------------------------ init
window.addEventListener("DOMContentLoaded", async () => {
  ["expresion_indicador", "valor_base_indicador", "costo_unitario",
   "variable_volumen", "menor_es_mejor", "unidad_indicador"]
    .forEach((id) => document.getElementById(id).addEventListener("input", calcularPreview));
  document.getElementById("menor_es_mejor").addEventListener("change", calcularPreview);
  engancharPreview();
  actualizarPreview();

  try { await cargarCatalogos(); } catch (e) { mostrarFlash("No se pudieron cargar los catálogos: " + e.message, "danger"); }

  const params = new URLSearchParams(window.location.search);

  // Prefill desde "convertir idea"
  ["nombre", "area", "responsable", "objetivo_valor"].forEach((k) => {
    if (params.get(k)) document.getElementById(k).value = params.get(k);
  });
  if (params.get("categoria_perdida")) document.getElementById("categoria_perdida").value = params.get("categoria_perdida");
  if (params.get("linea_pnl")) document.getElementById("linea_pnl").value = params.get("linea_pnl");

  // Modo edición
  if (params.get("editar")) {
    modoEdicion = params.get("editar");
    await cargarProyectoParaEditar(modoEdicion);
  }
});

async function cargarProyectoParaEditar(id) {
  try {
    const p = await apiGet({ action: "proyecto", id });
    document.getElementById("titulo-pagina").textContent = "Editar Proyecto de Ahorro";
    document.getElementById("btn-guardar").textContent = "Guardar cambios";

    document.getElementById("nombre").value = p.nombre || "";
    document.getElementById("area").value = p.area || "";
    document.getElementById("descripcion").value = p.descripcion || "";
    document.getElementById("responsable").value = p.responsable || "";
    document.getElementById("fecha_inicio").value = p.fecha_inicio || "";
    document.getElementById("objetivo_valor").value = p.objetivo_valor || "";
    document.getElementById("objetivo_descripcion").value = p.objetivo_descripcion || "";
    document.getElementById("categoria_perdida").value = p.categoria_perdida || "";
    document.getElementById("linea_pnl").value = p.linea_pnl || "";
    document.getElementById("tipo_impacto").value = p.tipo_impacto || "";
    document.getElementById("contramedida").value = p.contramedida || "";
    document.getElementById("expresion_indicador").value = p.expresion_indicador || "";
    document.getElementById("unidad_indicador").value = p.unidad_indicador || "";
    document.getElementById("variable_volumen").value = p.variable_volumen || "";
    document.getElementById("valor_base_indicador").value = p.valor_base_indicador ?? "";
    document.getElementById("costo_unitario").value = p.costo_unitario ?? "";
    document.getElementById("unidad_costo").value = p.unidad_costo || "";
    document.getElementById("menor_es_mejor").value = String(!!p.menor_es_mejor);

    const cont = document.getElementById("variables-container");
    cont.innerHTML = p.variables.map((v) => `
      <div class="var-row">
        <input type="text" class="var_nombre" value="${v.nombre}">
        <input type="text" class="var_label" value="${v.label || ""}">
        <input type="text" class="var_unidad" value="${v.unidad || ""}">
        <button type="button" class="btn-small btn-secundario" onclick="quitarFila(this)">✕</button>
      </div>`).join("");

    engancharPreview();
    actualizarPreview();
    mostrarFlash("Estás editando un proyecto existente. Si cambiás la fórmula, la línea de base o el costo, se recalculan automáticamente todas las mediciones ya cargadas.", "success");
  } catch (e) {
    mostrarFlash("No se pudo cargar el proyecto: " + e.message, "danger");
  }
}

document.getElementById("form-proyecto").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    const variables = leerVariables();
    if (variables.length === 0) throw new Error("Definí al menos una variable.");

    const datos = {
      nombre: document.getElementById("nombre").value,
      descripcion: document.getElementById("descripcion").value,
      area: document.getElementById("area").value,
      responsable: document.getElementById("responsable").value,
      fecha_inicio: document.getElementById("fecha_inicio").value,
      objetivo_valor: parseFloat(document.getElementById("objetivo_valor").value),
      objetivo_descripcion: document.getElementById("objetivo_descripcion").value,
      categoria_perdida: document.getElementById("categoria_perdida").value,
      linea_pnl: document.getElementById("linea_pnl").value,
      tipo_impacto: document.getElementById("tipo_impacto").value,
      contramedida: document.getElementById("contramedida").value,
      estado: "activo",
      variables_json: JSON.stringify(variables),
      expresion_indicador: document.getElementById("expresion_indicador").value.trim(),
      unidad_indicador: document.getElementById("unidad_indicador").value,
      valor_base_indicador: parseFloat(document.getElementById("valor_base_indicador").value),
      costo_unitario: parseFloat(document.getElementById("costo_unitario").value),
      unidad_costo: document.getElementById("unidad_costo").value,
      variable_volumen: document.getElementById("variable_volumen").value.trim() || null,
      menor_es_mejor: document.getElementById("menor_es_mejor").value === "true",
    };

    if (modoEdicion) {
      await apiPost({ action: "actualizar_proyecto", proyecto_id: modoEdicion, datos });
      window.location.href = `proyecto.html?id=${modoEdicion}`;
    } else {
      const r = await apiPost({ action: "crear_proyecto", datos });
      window.location.href = `proyecto.html?id=${r.id}`;
    }
  } catch (e) {
    mostrarFlash("Error al guardar: " + e.message, "danger");
  }
});
