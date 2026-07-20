function agregarFila() {
  const cont = document.getElementById("variables-container");
  const row = document.createElement("div");
  row.className = "var-row";
  row.innerHTML = `
    <input type="text" class="var_nombre" placeholder="nombre">
    <input type="text" class="var_label" placeholder="etiqueta">
    <input type="text" class="var_unidad" placeholder="unidad">
    <button type="button" class="btn-small btn-secundario" onclick="this.parentElement.remove()">✕</button>`;
  cont.appendChild(row);
}

// Pre-cargar datos si venimos de "convertir idea en proyecto"
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("nombre")) document.getElementById("nombre").value = params.get("nombre");
  if (params.get("area")) document.getElementById("area").value = params.get("area");
  if (params.get("responsable")) document.getElementById("responsable").value = params.get("responsable");
  if (params.get("objetivo_valor")) document.getElementById("objetivo_valor").value = params.get("objetivo_valor");
});

function mostrarFlash(msg, tipo) {
  document.getElementById("flash-area").innerHTML = `<div class="flash flash-${tipo}">${msg}</div>`;
}

document.getElementById("form-proyecto").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    const variables = [...document.querySelectorAll("#variables-container .var-row")].map((row) => ({
      nombre: row.querySelector(".var_nombre").value.trim(),
      label: row.querySelector(".var_label").value.trim(),
      unidad: row.querySelector(".var_unidad").value.trim(),
    })).filter((v) => v.nombre);

    if (variables.length === 0) throw new Error("Definí al menos una variable.");

    const datos = {
      nombre: document.getElementById("nombre").value,
      descripcion: document.getElementById("descripcion").value,
      area: document.getElementById("area").value,
      responsable: document.getElementById("responsable").value,
      fecha_inicio: document.getElementById("fecha_inicio").value,
      objetivo_valor: parseFloat(document.getElementById("objetivo_valor").value),
      objetivo_descripcion: document.getElementById("objetivo_descripcion").value,
      estado: "activo",
      variables_json: JSON.stringify(variables),
      expresion_indicador: document.getElementById("expresion_indicador").value.trim(),
      unidad_indicador: document.getElementById("unidad_indicador").value,
      valor_base_indicador: parseFloat(document.getElementById("valor_base_indicador").value),
      costo_unitario: parseFloat(document.getElementById("costo_unitario").value),
      unidad_costo: document.getElementById("unidad_costo").value,
      variable_volumen: document.getElementById("variable_volumen").value.trim() || null,
      menor_es_mejor: document.getElementById("menor_es_mejor").checked,
    };

    const resultado = await apiPost({ action: "crear_proyecto", datos });
    window.location.href = `proyecto.html?id=${resultado.id}`;
  } catch (e) {
    mostrarFlash(`Error al crear el proyecto: ${e.message}`, "danger");
  }
});
