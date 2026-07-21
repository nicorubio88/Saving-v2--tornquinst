/**
 * Detalle de un proyecto: KPIs, gráfico de evolución (con filtros de mes y
 * semana), formulario de carga por período, e histórico editable.
 */

const params = new URLSearchParams(window.location.search);
const proyectoId = params.get("id");
let chart = null;
let P = null;                       // proyecto actual (última respuesta del backend)
let periodoActual = "periodo";      // periodo | semanal | mensual | anual
let filtroMes = "";
let filtroSemana = "";
let editandoRegistro = null;        // id del registro que se está editando inline, o null

function hoyISO() { return new Date().toISOString().slice(0, 10); }

function haceDiasISO(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Nota contextual según el tipo de objetivo del proyecto (ver README). */
function notaObjetivo(p) {
  if (p.tipo_objetivo === "mensual") {
    return `<div class="hint">📌 Objetivo mensual fijo: <strong>${fmtMoney(p.objetivo_mensual)}</strong>/mes
      (constante, no se reparte el anual en 12 partes iguales)</div>`;
  }
  if (p.tipo_objetivo === "dinamico") {
    return `<div class="hint">📌 Objetivo dinámico: <strong>${fmtMoney(p.objetivo_unitario)}</strong> por unidad de
      ${p.variable_volumen || "volumen"} (se recalcula solo según la producción real de cada período)</div>`;
  }
  return "";
}

async function render() {
  const cont = document.getElementById("contenido");
  try {
    P = await apiGet({ action: "proyecto", id: proyectoId });
    const avance = Math.max(P.avance_objetivo_pct, 0);
    const op = P.opciones_periodo;

    cont.innerHTML = `
      <div class="encabezado-proyecto">
        <div style="flex:1;min-width:280px">
          <h1>${P.nombre}</h1>
          <p class="meta">${P.area || "Sin área"} · Responsable: <strong>${P.responsable}</strong></p>
          <p>${P.descripcion || ""}</p>
          <div class="meta-chips">${chipsProyecto(P)}</div>
          ${notaObjetivo(P)}
        </div>
        <div class="acciones-encabezado">
          ${semaforoPill(P.semaforo)}
          <select id="select-estado">
            ${["idea", "activo", "pausado", "cerrado_logrado", "cerrado_no_logrado"]
              .map((e) => `<option value="${e}" ${e === P.estado ? "selected" : ""}>${e.replace(/_/g, " ")}</option>`).join("")}
          </select>
          <a class="btn btn-small btn-secundario" href="nuevo.html?editar=${P.id}">✎ Editar proyecto</a>
          <button class="btn btn-small btn-secundario btn-peligro" onclick="eliminarProyectoActual()">🗑 Eliminar proyecto</button>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-icon">📅</div>
          <div class="kpi-label">Vigencia (12 meses)</div>
          <div class="kpi-value" style="font-size:1.05rem">${P.fecha_inicio} → ${P.fecha_fin}</div>
          ${barraProgreso(P.avance_tiempo_pct)}
          <div class="hint">${P.avance_tiempo_pct}% del tiempo transcurrido</div>
        </div>
        <div class="kpi ${P.ahorro_acumulado < 0 ? "kpi-negativo" : ""}">
          <div class="kpi-icon">💰</div>
          <div class="kpi-label">Ahorro acumulado vs objetivo</div>
          <div class="kpi-value" style="font-size:1.1rem">${fmtMoney(P.ahorro_acumulado)} / ${fmtMoney(P.objetivo_valor)}</div>
          ${barraProgreso(P.avance_objetivo_pct)}
          <div class="hint">${P.avance_objetivo_pct}% del objetivo</div>
        </div>
        <div class="kpi ${P.semaforo === "rojo" ? "kpi-negativo" : ""}">
          <div class="kpi-icon">${P.semaforo === "verde" ? "✅" : P.semaforo === "rojo" ? "⚠️" : "🟡"}</div>
          <div class="kpi-label">Cumplimiento a la fecha</div>
          <div class="kpi-value">${P.cumplimiento_pct}%</div>
          <div class="hint">Debería llevar ${fmtMoney(P.objetivo_a_la_fecha)} a hoy — ${ETIQUETA_SEMAFORO[P.semaforo]}</div>
        </div>
        <div class="kpi">
          <div class="kpi-icon">📈</div>
          <div class="kpi-label">Proyección a 12 meses</div>
          <div class="kpi-value" style="font-size:1.1rem">${fmtMoney(P.proyeccion_final)}</div>
          <div class="hint">${P.proyeccion_vs_objetivo_pct}% del objetivo · última carga: ${P.ultima_carga || "nunca"}${P.dias_sin_cargar !== null ? ` (hace ${P.dias_sin_cargar} d)` : ""}</div>
        </div>
      </div>

      <div class="card">
        <h3>Objetivo vs Evolución</h3>
        <div class="tabs">
          <button class="tab-btn ${periodoActual === "periodo" ? "active" : ""}" data-periodo="periodo">Por período cargado</button>
          <button class="tab-btn ${periodoActual === "semanal" ? "active" : ""}" data-periodo="semanal">Semanal</button>
          <button class="tab-btn ${periodoActual === "mensual" ? "active" : ""}" data-periodo="mensual">Mensual</button>
          <button class="tab-btn ${periodoActual === "anual" ? "active" : ""}" data-periodo="anual">Histórico anual</button>
        </div>
        <div class="filtros-bar">
          <div>
            <label>Ver solo el mes</label>
            <select id="filtro-mes">
              <option value="">Todos los meses</option>
              ${op.meses.map((m) => `<option value="${m}" ${m === filtroMes ? "selected" : ""}>${nombreMes(m)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Ver solo la semana</label>
            <select id="filtro-semana">
              <option value="">Todas las semanas</option>
              ${op.semanas.map((s) => `<option value="${s}" ${s === filtroSemana ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div style="flex:0">
            <button type="button" class="btn-secundario btn-small" id="btn-limpiar-filtros">Limpiar filtros</button>
          </div>
        </div>
        <div id="resumen-filtro" class="hint" style="margin-bottom:10px"></div>
        <canvas id="grafico" height="105"></canvas>
      </div>

      <div class="card">
        <h3>Cargar medición del período</h3>
        <div class="ayuda">
          Indicá <strong>de qué fecha a qué fecha</strong> corresponden los valores que estás cargando.
          Lo habitual es una semana (lunes a domingo). El ahorro se imputa al mes en el que
          <strong>termina</strong> el período; si una semana cruza el cierre de mes, conviene partirla
          en dos cargas para que cada parte caiga en su mes.
        </div>
        <form id="form-registro" class="form-card">
          <div class="row-3">
            <div><label>Período desde</label><input type="date" id="reg_desde" required value="${haceDiasISO(6)}"></div>
            <div><label>Período hasta</label><input type="date" id="reg_hasta" required value="${hoyISO()}"></div>
            <div><label>Cargado por</label><input type="text" id="reg_cargado_por"></div>
          </div>
          <div class="row-3">
            ${P.variables.map((v) => `
              <div>
                <label>${v.label || v.nombre} ${v.unidad ? `(${v.unidad})` : ""}</label>
                <input type="number" step="any" class="val-variable" data-nombre="${v.nombre}" required>
                <div class="hint">Total acumulado del período, no el promedio diario.</div>
              </div>`).join("")}
          </div>
          <div><label>Observaciones</label><input type="text" id="reg_observaciones" placeholder="Ej: parada programada de 8 h el jueves"></div>
          <div id="flash-registro"></div>
          <button type="submit">Calcular y guardar</button>
        </form>
      </div>

      <div class="card">
        <h3>Histórico de mediciones</h3>
        <p class="hint">Podés corregir cualquier fila con ✎ — al guardar se recalcula el indicador y el ahorro.</p>
        <div style="overflow-x:auto">
          <table class="tabla-editable">
            <thead><tr>
              <th>Período</th>
              ${P.variables.map((v) => `<th>${v.label || v.nombre}</th>`).join("")}
              <th>Indicador</th><th>Ahorro</th><th>Cargado por</th><th></th>
            </tr></thead>
            <tbody id="tbody-registros"></tbody>
          </table>
        </div>
      </div>`;

    document.getElementById("select-estado").addEventListener("change", cambiarEstado);
    document.getElementById("form-registro").addEventListener("submit", cargarRegistro);
    document.getElementById("filtro-mes").addEventListener("change", (e) => { filtroMes = e.target.value; filtroSemana = ""; refrescarGrafico(); });
    document.getElementById("filtro-semana").addEventListener("change", (e) => { filtroSemana = e.target.value; filtroMes = ""; refrescarGrafico(); });
    document.getElementById("btn-limpiar-filtros").addEventListener("click", () => { filtroMes = ""; filtroSemana = ""; render(); });
    document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => {
      periodoActual = b.dataset.periodo;
      document.querySelectorAll(".tab-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      refrescarGrafico();
    }));

    renderTabla();
    refrescarGrafico();
  } catch (e) {
    cont.innerHTML = `<div class="flash flash-danger">Error: ${e.message}</div>`;
  }
}

function registrosVisibles() {
  return P.registros.filter((r) => {
    const anchor = r.fecha_hasta || r.fecha_desde;
    return !filtroMes || anchor.slice(0, 7) === filtroMes;
  });
}

function renderTabla() {
  const tbody = document.getElementById("tbody-registros");
  const regs = registrosVisibles().slice().reverse();
  if (!regs.length) {
    tbody.innerHTML = `<tr><td colspan="10">No hay mediciones para el filtro seleccionado.</td></tr>`;
    return;
  }
  tbody.innerHTML = regs.map((r) => {
    if (editandoRegistro === r.id) {
      return `<tr class="editando">
        <td>
          <input type="date" id="ed_desde" value="${r.fecha_desde}" style="width:130px">
          <input type="date" id="ed_hasta" value="${r.fecha_hasta}" style="width:130px">
        </td>
        ${P.variables.map((v) => `<td><input type="number" step="any" class="ed-var" data-nombre="${v.nombre}" value="${r.valores[v.nombre] ?? ""}" style="width:100px"></td>`).join("")}
        <td colspan="2"><em>se recalcula</em></td>
        <td><input type="text" id="ed_cargado_por" value="${r.cargado_por || ""}" style="width:100px"></td>
        <td style="white-space:nowrap">
          <button class="btn-small" onclick="guardarEdicion(${r.id})">Guardar</button>
          <button class="btn-small btn-secundario" onclick="cancelarEdicion()">✕</button>
        </td>
      </tr>`;
    }
    return `<tr>
      <td style="white-space:nowrap">${r.fecha_desde} → ${r.fecha_hasta}</td>
      ${P.variables.map((v) => `<td>${r.valores[v.nombre] !== undefined ? fmtNumero(r.valores[v.nombre]) : "-"}</td>`).join("")}
      <td>${r.indicador != null ? fmtNumero(r.indicador, 3) : "-"}</td>
      <td class="${(r.ahorro_periodo || 0) >= 0 ? "valor-positivo" : "valor-negativo"}">${fmtMoney(r.ahorro_periodo)}</td>
      <td>${r.cargado_por || "-"}</td>
      <td style="white-space:nowrap">
        <button class="btn-small btn-secundario" onclick="editarRegistro(${r.id})" title="Editar">✎</button>
        <button class="btn-small btn-secundario" onclick="borrarRegistro(${r.id})" title="Eliminar">✕</button>
      </td>
    </tr>`;
  }).join("");
}

function editarRegistro(id) { editandoRegistro = id; renderTabla(); }
function cancelarEdicion() { editandoRegistro = null; renderTabla(); }

async function guardarEdicion(id) {
  try {
    const valores = {};
    document.querySelectorAll(".ed-var").forEach((i) => { valores[i.dataset.nombre] = parseFloat(i.value); });
    await apiPost({
      action: "actualizar_registro", registro_id: id,
      datos: {
        fecha_desde: document.getElementById("ed_desde").value,
        fecha_hasta: document.getElementById("ed_hasta").value,
        valores,
        cargado_por: document.getElementById("ed_cargado_por").value,
      },
    });
    editandoRegistro = null;
    await render();
  } catch (e) { alert("Error al guardar: " + e.message); }
}

async function borrarRegistro(id) {
  if (!confirm("¿Eliminar esta medición?")) return;
  await apiPost({ action: "eliminar_registro", registro_id: id });
  await render();
}

/** Callback de tooltip de Chart.js: formatea el valor de cada dataset en US$. */
function tooltipEnDolaresLocal(ctx) {
  return `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y ?? ctx.raw)}`;
}

async function refrescarGrafico() {
  const q = { action: "evolucion", id: proyectoId, periodo: periodoActual };
  if (filtroMes) q.mes = filtroMes;
  if (filtroSemana) q.semana = filtroSemana;
  const data = await apiGet(q);

  const totalFiltrado = data.ahorro_periodo.reduce((s, v) => s + v, 0);
  let texto = `${data.etiquetas.length} período(s) — ahorro total mostrado: <strong>${fmtMoney(totalFiltrado)}</strong>`;
  if (filtroMes) texto += ` · filtrado por ${nombreMes(filtroMes)}`;
  if (filtroSemana) texto += ` · filtrado por semana ${filtroSemana}`;
  document.getElementById("resumen-filtro").innerHTML = texto;

  const etiquetas = periodoActual === "mensual" ? data.etiquetas.map(nombreMes) : data.etiquetas;

  const ctx = document.getElementById("grafico").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: etiquetas,
      datasets: [
        { label: "Ahorro del período", data: data.ahorro_periodo, backgroundColor: "#7FA76A", order: 2, borderRadius: 3 },
        { label: "Objetivo del período", data: data.objetivo_periodo, type: "line", borderColor: "#c98a12", borderDash: [5, 4], pointRadius: 0, fill: false, order: 1 },
        { label: "Ahorro acumulado", data: data.ahorro_acumulado, type: "line", borderColor: "#2E4A1C", backgroundColor: "rgba(46,74,28,0.1)", fill: true, tension: 0.25, order: 0 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: tooltipEnDolaresLocal } },
      },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtMoney(v) } } },
    },
  });

  renderTabla();
}

async function cambiarEstado(ev) {
  await apiPost({ action: "cambiar_estado_proyecto", proyecto_id: proyectoId, estado: ev.target.value });
  await render();
}

async function cargarRegistro(ev) {
  ev.preventDefault();
  const flash = document.getElementById("flash-registro");
  try {
    const valores = {};
    document.querySelectorAll(".val-variable").forEach((i) => { valores[i.dataset.nombre] = parseFloat(i.value); });
    const r = await apiPost({
      action: "cargar_registro", proyecto_id: proyectoId,
      datos: {
        fecha_desde: document.getElementById("reg_desde").value,
        fecha_hasta: document.getElementById("reg_hasta").value,
        valores,
        cargado_por: document.getElementById("reg_cargado_por").value,
        observaciones: document.getElementById("reg_observaciones").value,
      },
    });
    const tipoResultado = r.ahorro_periodo >= 0 ? "Ahorro" : "Pérdida";
    flash.innerHTML = `<div class="flash flash-success">
      Guardado. Indicador: ${fmtNumero(r.indicador, 3)} · ${tipoResultado}: ${fmtMoney(r.ahorro_periodo)}
    </div>`;
    setTimeout(render, 900);
  } catch (e) {
    flash.innerHTML = `<div class="flash flash-danger">${e.message}</div>`;
  }
}

async function eliminarProyectoActual() {
  if (!confirm(`¿Eliminar "${P.nombre}"? Esto borra también todas sus mediciones cargadas (${P.registros.length}). No se puede deshacer.`)) return;
  try {
    await apiPost({ action: "eliminar_proyecto", proyecto_id: proyectoId });
    window.location.href = "index.html";
  } catch (e) {
    alert("Error al eliminar: " + e.message);
  }
}

render();
