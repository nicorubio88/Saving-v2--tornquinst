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

// ------------------------------------------------ tipo de objetivo (anual / mensual / dinámico)
function actualizarTipoObjetivo() {
  const tipo = document.getElementById("tipo_objetivo").value;
  document.getElementById("campo-objetivo-anual").style.display = tipo === "mensual" ? "none" : "";
  document.getElementById("campo-objetivo-mensual").style.display = tipo === "mensual" ? "" : "none";
  document.getElementById("campo-objetivo-dinamico").style.display = tipo === "dinamico" ? "" : "none";
  document.getElementById("objetivo_valor").required = tipo === "anual";
  document.getElementById("label-objetivo-anual").textContent = tipo === "dinamico"
    ? "Objetivo total de referencia para los 12 meses ($) — opcional, informativo"
    : "Objetivo de ahorro para los 12 meses ($)";
  actualizarEquivalenteAnual();
}

function actualizarEquivalenteAnual() {
  const mensual = parseFloat(document.getElementById("objetivo_mensual").value);
  document.getElementById("equivalente-anual").textContent = isNaN(mensual) ? "-" : fmtMoney(mensual * 12);
}

// ------------------------------------------------ sub-modo del objetivo dinámico
function actualizarModoObjetivoDinamico() {
  const modo = document.getElementById("modo_objetivo_dinamico").value;
  document.getElementById("sub-campo-monto-directo").style.display = modo === "monto_directo" ? "" : "none";
  document.getElementById("sub-campo-nivel-indicador").style.display = modo === "nivel_indicador" ? "" : "none";
  actualizarTasaObjetivoDerivada();
}

// ------------------------------------------------ modo de costo (fijo / variable)
function actualizarModoCosto() {
  const modo = document.getElementById("costo_unitario_modo").value;
  document.getElementById("fila-costo-fijo").style.display = modo === "fijo" ? "" : "none";
  document.getElementById("fila-costo-variable").style.display = modo === "variable" ? "" : "none";
  actualizarTasaObjetivoDerivada();
  calcularPreview();
}

/**
 * Vista previa en vivo del $/unidad derivado en modo "nivel_indicador":
 * (base − objetivo) × costo. Usa los mismos campos de la sección 5 (línea de
 * base y costo), así que se recalcula cada vez que se toca cualquiera de
 * esos campos, no solo el propio valor_objetivo_indicador.
 *
 * Si el costo es "variable" (se carga cada período), no hay un único número
 * para mostrar acá — el objetivo real de cada mes depende del precio de ESE
 * mes. En ese caso se muestra la fórmula en palabras en vez de un número, y
 * se remite a la simulación del punto 6 (que si toma un valor de prueba de
 * la variable de precio).
 */
function actualizarTasaObjetivoDerivada() {
  const el = document.getElementById("tasa-objetivo-derivada");
  if (!el) return;
  const base = parseFloat(document.getElementById("valor_base_indicador").value);
  const objetivo = parseFloat(document.getElementById("valor_objetivo_indicador").value);
  const menorEsMejor = document.getElementById("menor_es_mejor").value === "true";
  const costoModo = document.getElementById("costo_unitario_modo").value;

  if (isNaN(base) || isNaN(objetivo)) {
    el.textContent = "completá la línea de base y este valor";
    return;
  }
  const diferencia = menorEsMejor ? (base - objetivo) : (objetivo - base);
  const advertencia = diferencia < 0 ? " ⚠️ (negativo: el objetivo es peor que la base, revisá el sentido de la mejora)" : "";

  if (costoModo === "variable") {
    const costoVariable = document.getElementById("costo_unitario_variable").value || "el precio";
    el.textContent = `Se recalcula cada período con el precio real cargado en '${costoVariable}': `
      + `(${diferencia.toLocaleString("es-AR", { maximumFractionDigits: 4 })} × precio de ese mes) por unidad de volumen.`
      + ` Probalo con un precio de ejemplo en la simulación del punto 6.${advertencia}`;
    return;
  }

  const costo = parseFloat(document.getElementById("costo_unitario").value);
  if (isNaN(costo)) {
    el.textContent = "completá también el costo unitario fijo";
    return;
  }
  const tasa = diferencia * costo;
  const tasaFormateada = "US$ " + tasa.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  el.textContent = `${tasaFormateada} por unidad de volumen${advertencia}`;
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

  actualizarSelectCostoVariable(variables);
  calcularPreview();
}

/** Repuebla el <select> de "variable de costo" con las variables declaradas en el punto 3. */
function actualizarSelectCostoVariable(variables) {
  const sel = document.getElementById("costo_unitario_variable");
  const actual = sel.value;
  sel.innerHTML = variables.length
    ? variables.map((v) => `<option value="${v.nombre}">${v.label || v.nombre} (${v.nombre})</option>`).join("")
    : `<option value="">— Declará variables en el punto 3 —</option>`;
  if (variables.some((v) => v.nombre === actual)) sel.value = actual;
}

function calcularPreview() {
  const resultado = document.getElementById("preview-resultado");
  const expresion = document.getElementById("expresion_indicador").value.trim();
  const base = parseFloat(document.getElementById("valor_base_indicador").value);
  const costoModo = document.getElementById("costo_unitario_modo").value;
  const costo = parseFloat(document.getElementById("costo_unitario").value);
  const costoVariable = document.getElementById("costo_unitario_variable").value;
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

  const costoListo = costoModo === "variable" ? !!costoVariable : !isNaN(costo);
  if (!expresion || faltan || Object.keys(valores).length === 0 || isNaN(base) || !costoListo) {
    resultado.innerHTML = "Completá las variables de prueba, la fórmula, la línea de base y el costo para ver la simulación.";
    return;
  }

  try {
    const { indicador, ahorro } = calcularAhorroUI(
      { expresion, base, costo, costoModo, costoVariable, variableVolumen, menorEsMejor },
      valores
    );
    const costoUsado = costoModo === "variable" ? valores[costoVariable] : costo;
    const esAhorro = ahorro >= 0;
    const detalleVolumen = variableVolumen && valores[variableVolumen] !== undefined
      ? ` × ${valores[variableVolumen].toLocaleString("es-AR")} (${variableVolumen})`
      : "";
    const detalleCosto = costoModo === "variable"
      ? `${costoUsado.toLocaleString("es-AR")} $ (variable: ${costoVariable}, valor de prueba de arriba)`
      : `${costo.toLocaleString("es-AR")} $`;
    resultado.innerHTML = `
      <div class="preview-linea">Indicador calculado: <strong>${indicador.toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${unidadInd}</strong></div>
      <div class="preview-linea">Línea de base: <strong>${base.toLocaleString("es-AR")} ${unidadInd}</strong></div>
      <div class="preview-linea">Diferencia: ${(menorEsMejor ? base - indicador : indicador - base).toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${unidadInd} × ${detalleCosto}${detalleVolumen}</div>
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
  document.getElementById("tipo_objetivo").addEventListener("change", actualizarTipoObjetivo);
  document.getElementById("objetivo_mensual").addEventListener("input", actualizarEquivalenteAnual);

  document.getElementById("modo_objetivo_dinamico").addEventListener("change", actualizarModoObjetivoDinamico);
  document.getElementById("valor_objetivo_indicador").addEventListener("input", actualizarTasaObjetivoDerivada);
  document.getElementById("costo_unitario_modo").addEventListener("change", actualizarModoCosto);
  document.getElementById("costo_unitario_variable").addEventListener("change", actualizarTasaObjetivoDerivada);
  document.getElementById("costo_unitario_variable").addEventListener("change", calcularPreview);
  // La tasa derivada también depende de estos campos, que viven en la sección 5:
  ["valor_base_indicador", "costo_unitario", "unidad_costo"]
    .forEach((id) => document.getElementById(id).addEventListener("input", actualizarTasaObjetivoDerivada));
  document.getElementById("menor_es_mejor").addEventListener("change", actualizarTasaObjetivoDerivada);

  engancharPreview();
  actualizarPreview();
  actualizarTipoObjetivo();
  actualizarModoObjetivoDinamico();
  actualizarModoCosto();

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
    document.getElementById("tipo_objetivo").value = p.tipo_objetivo || "anual";
    document.getElementById("objetivo_mensual").value = p.objetivo_mensual || "";
    document.getElementById("objetivo_unitario").value = p.objetivo_unitario || "";
    document.getElementById("modo_objetivo_dinamico").value = p.modo_objetivo_dinamico || "monto_directo";
    document.getElementById("valor_objetivo_indicador").value = p.valor_objetivo_indicador ?? "";
    actualizarTipoObjetivo();
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
    actualizarPreview(); // esto puebla el <select> de variable de costo con p.variables

    // Recién ahora existe la opción en el <select>, así que se puede setear el valor:
    document.getElementById("costo_unitario_modo").value = p.costo_unitario_modo || "fijo";
    document.getElementById("costo_unitario_variable").value = p.costo_unitario_variable || "";
    actualizarModoCosto();
    actualizarModoObjetivoDinamico(); // recién ahora están cargados base/costo, así se ve bien la tasa derivada

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

    const tipoObjetivo = document.getElementById("tipo_objetivo").value;
    const modoObjetivoDinamico = document.getElementById("modo_objetivo_dinamico").value;
    if (tipoObjetivo === "anual" && !document.getElementById("objetivo_valor").value) {
      throw new Error("Completá el objetivo de ahorro para los 12 meses.");
    }
    if (tipoObjetivo === "mensual" && !document.getElementById("objetivo_mensual").value) {
      throw new Error("Completá el objetivo de ahorro mensual.");
    }
    if (tipoObjetivo === "dinamico" && modoObjetivoDinamico === "monto_directo" && !document.getElementById("objetivo_unitario").value) {
      throw new Error("Completá el objetivo de ahorro por unidad de volumen.");
    }
    if (tipoObjetivo === "dinamico" && modoObjetivoDinamico === "nivel_indicador" && !document.getElementById("valor_objetivo_indicador").value) {
      throw new Error("Completá el valor objetivo del indicador a lograr.");
    }
    const costoModo = document.getElementById("costo_unitario_modo").value;
    if (costoModo === "fijo" && !document.getElementById("costo_unitario").value) {
      throw new Error("Completá el costo unitario fijo.");
    }
    if (costoModo === "variable" && !document.getElementById("costo_unitario_variable").value) {
      throw new Error("Elegí cuál de las variables declaradas representa el precio.");
    }

    const datos = {
      nombre: document.getElementById("nombre").value,
      descripcion: document.getElementById("descripcion").value,
      area: document.getElementById("area").value,
      responsable: document.getElementById("responsable").value,
      fecha_inicio: document.getElementById("fecha_inicio").value,
      objetivo_valor: tipoObjetivo === "mensual"
        ? (parseFloat(document.getElementById("objetivo_mensual").value) || 0) * 12
        : (parseFloat(document.getElementById("objetivo_valor").value) || 0),
      objetivo_descripcion: document.getElementById("objetivo_descripcion").value,
      tipo_objetivo: tipoObjetivo,
      objetivo_mensual: tipoObjetivo === "mensual" ? parseFloat(document.getElementById("objetivo_mensual").value) : null,
      modo_objetivo_dinamico: tipoObjetivo === "dinamico" ? modoObjetivoDinamico : null,
      objetivo_unitario: (tipoObjetivo === "dinamico" && modoObjetivoDinamico === "monto_directo")
        ? parseFloat(document.getElementById("objetivo_unitario").value) : null,
      valor_objetivo_indicador: (tipoObjetivo === "dinamico" && modoObjetivoDinamico === "nivel_indicador")
        ? parseFloat(document.getElementById("valor_objetivo_indicador").value) : null,
      categoria_perdida: document.getElementById("categoria_perdida").value,
      linea_pnl: document.getElementById("linea_pnl").value,
      tipo_impacto: document.getElementById("tipo_impacto").value,
      contramedida: document.getElementById("contramedida").value,
      estado: "activo",
      variables_json: JSON.stringify(variables),
      expresion_indicador: document.getElementById("expresion_indicador").value.trim(),
      unidad_indicador: document.getElementById("unidad_indicador").value,
      valor_base_indicador: parseFloat(document.getElementById("valor_base_indicador").value),
      costo_unitario_modo: costoModo,
      costo_unitario: costoModo === "fijo" ? parseFloat(document.getElementById("costo_unitario").value) : null,
      costo_unitario_variable: costoModo === "variable" ? document.getElementById("costo_unitario_variable").value : null,
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
