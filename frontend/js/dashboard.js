/**
 * Dashboard principal. Junta 3 cosas del backend (acción "dashboard"):
 *   1. KPIs agregados de los proyectos activos.
 *   2. La lista de proyectos con su semáforo de salud.
 *   3. Dos gráficos consolidados: evolución mensual y ahorro por línea de P&L.
 */

let datosDashboard = null;
let chartConsolidado = null;
let chartPnl = null;

// Paleta del gráfico apilado: una barra de color por proyecto activo.
const PALETA = ["#548235", "#7FA76A", "#3D5F26", "#A3C48A", "#2E4A1C", "#c98a12", "#8a6d3b", "#5b8ea8"];

/** Callback de tooltip de Chart.js que formatea el valor como plata (US$). */
function tooltipEnDolares(ctx) {
  const valor = ctx.parsed.y ?? ctx.parsed.x ?? ctx.raw;
  return `${ctx.dataset.label}: ${fmtMoney(valor)}`;
}

async function cargarDashboard() {
  const kpiRow = document.getElementById("kpi-row");
  try {
    const d = await apiGet({ action: "dashboard" });
    datosDashboard = d;

    renderKpis(d);
    renderAlertas(d);
    renderLista(d);
    renderConsolidado("mensual");
    renderPnl(d);

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderConsolidado(btn.dataset.vista);
      });
    });
  } catch (e) {
    kpiRow.innerHTML = `<div class="flash flash-danger">
      Error cargando datos: ${e.message}. Revisá que APPS_SCRIPT_URL esté bien configurada en js/config.js.
    </div>`;
  }
}

function renderKpis(d) {
  const pctProyeccion = d.objetivo_total ? Math.round((d.proyeccion_total / d.objetivo_total) * 100) : 0;
  document.getElementById("kpi-row").innerHTML = `
    <div class="kpi ${d.ahorro_total_acumulado < 0 ? "kpi-negativo" : ""}">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Ahorro acumulado (activos)</div>
      <div class="kpi-value">${fmtMoney(d.ahorro_total_acumulado)}</div>
      <div class="hint">Objetivo a la fecha: ${fmtMoney(d.objetivo_a_la_fecha_total)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-icon">🎯</div>
      <div class="kpi-label">Objetivo anual comprometido</div>
      <div class="kpi-value">${fmtMoney(d.objetivo_total)}</div>
      <div class="hint">${d.proyectos_activos} proyecto${d.proyectos_activos === 1 ? "" : "s"} activo${d.proyectos_activos === 1 ? "" : "s"}</div>
    </div>
    <div class="kpi">
      <div class="kpi-icon">📈</div>
      <div class="kpi-label">Proyección a 12 meses</div>
      <div class="kpi-value">${fmtMoney(d.proyeccion_total)}</div>
      <div class="hint">${pctProyeccion}% del objetivo anual, al ritmo actual</div>
    </div>
    <div class="kpi ${d.proyectos_en_riesgo > 0 ? "kpi-negativo" : ""}">
      <div class="kpi-icon">${d.proyectos_en_riesgo > 0 ? "⚠️" : "✅"}</div>
      <div class="kpi-label">Proyectos en riesgo</div>
      <div class="kpi-value">${d.proyectos_en_riesgo}</div>
      <div class="hint">de ${d.proyectos_activos} activos</div>
    </div>`;
}

function renderAlertas(d) {
  const cont = document.getElementById("alertas");
  if (!d.proyectos_sin_carga_reciente.length) { cont.innerHTML = ""; return; }
  cont.innerHTML = `
    <div class="flash flash-danger">
      <strong>⏰ Adherencia de carga:</strong> ${d.proyectos_sin_carga_reciente.length} proyecto(s) sin mediciones recientes —
      ${d.proyectos_sin_carga_reciente.map((p) =>
        `${p.nombre} (${p.responsable || "sin responsable"}: ${p.dias_sin_cargar === null ? "nunca cargó" : p.dias_sin_cargar + " días"})`
      ).join(" · ")}
    </div>`;
}

function renderLista(d) {
  const lista = document.getElementById("proyecto-list");
  if (!d.proyectos.length) {
    lista.innerHTML = `<p>Todavía no hay proyectos. <a href="nuevo.html">Crear el primero →</a></p>`;
    return;
  }
  lista.innerHTML = d.proyectos.map((p) => `
    <div class="proyecto-item">
      <div style="flex:1;min-width:240px">
        <div class="nombre">
          <a href="proyecto.html?id=${p.id}">${p.nombre}</a>
        </div>
        <div class="meta">${p.area || "Sin área"} · ${p.responsable} · ${p.fecha_inicio} → ${p.fecha_fin}</div>
        <div class="meta-chips">${chipsProyecto(p)}</div>
        ${barraProgreso(p.avance_objetivo_pct, 280)}
      </div>
      <div style="text-align:right">
        ${semaforoPill(p.semaforo)}
        <div style="margin-top:6px">${badgeEstado(p.estado)}</div>
        <div class="meta" style="margin-top:6px">
          ${fmtMoney(p.ahorro_acumulado)} / ${fmtMoney(p.objetivo_valor)} <strong>(${p.avance_objetivo_pct}%)</strong>
        </div>
        <div class="meta">Cumplimiento a la fecha: <strong>${p.cumplimiento_pct}%</strong></div>
        <div class="acciones-card">
          <a class="btn btn-small btn-secundario" href="nuevo.html?editar=${p.id}">Editar</a>
          <a class="btn btn-small" href="proyecto.html?id=${p.id}">Abrir</a>
          <button class="btn btn-small btn-secundario btn-peligro" onclick="eliminarProyectoDashboard(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')">Eliminar</button>
        </div>
      </div>
    </div>`).join("");
}

function renderConsolidado(vista) {
  const c = datosDashboard.consolidado;
  const ctx = document.getElementById("grafico-consolidado").getContext("2d");
  if (chartConsolidado) chartConsolidado.destroy();
  if (!c.etiquetas.length) { chartConsolidado = null; return; }

  if (vista === "mensual") {
    chartConsolidado = new Chart(ctx, {
      type: "bar",
      data: {
        labels: c.etiquetas.map(nombreMes),
        datasets: [
          ...c.series.map((s, i) => ({
            label: s.nombre.length > 38 ? s.nombre.slice(0, 38) + "…" : s.nombre,
            data: s.datos,
            backgroundColor: PALETA[i % PALETA.length],
            stack: "ahorro",
            borderRadius: 3,
          })),
          {
            label: "Objetivo mensual",
            data: c.objetivo_periodo,
            type: "line",
            borderColor: "#c98a12",
            borderDash: [6, 4],
            fill: false,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
          tooltip: { callbacks: { label: tooltipEnDolares } },
        },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => fmtMoney(v) } } },
      },
    });
  } else {
    chartConsolidado = new Chart(ctx, {
      type: "line",
      data: {
        labels: c.etiquetas.map(nombreMes),
        datasets: [
          { label: "Ahorro acumulado", data: c.acumulado, borderColor: "#548235", backgroundColor: "rgba(84,130,53,0.15)", fill: true, tension: 0.3 },
          { label: "Objetivo acumulado", data: c.objetivo_acumulado, borderColor: "#c98a12", borderDash: [6, 4], fill: false },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
          tooltip: { callbacks: { label: tooltipEnDolares } },
        },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtMoney(v) } } },
      },
    });
  }
}

function renderPnl(d) {
  const ctx = document.getElementById("grafico-pnl").getContext("2d");
  if (chartPnl) chartPnl.destroy();
  if (!d.pnl.lineas.length) return;
  chartPnl = new Chart(ctx, {
    type: "bar",
    data: {
      labels: d.pnl.lineas.map((l) => l.nombre),
      datasets: [
        { label: "Ahorro acumulado", data: d.pnl.lineas.map((l) => l.ahorro), backgroundColor: coloresPorSigno(d.pnl.lineas.map((l) => l.ahorro)), borderRadius: 3 },
        { label: "Objetivo anual", data: d.pnl.lineas.map((l) => l.objetivo), backgroundColor: "#d9dfd3", borderRadius: 3 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: tooltipEnDolares } },
      },
      scales: { x: { beginAtZero: true, ticks: { callback: (v) => fmtMoney(v) } } },
    },
  });
}

async function eliminarProyectoDashboard(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"? Esto borra también todas sus mediciones cargadas. No se puede deshacer.`)) return;
  try {
    await apiPost({ action: "eliminar_proyecto", proyecto_id: id });
    cargarDashboard();
  } catch (e) {
    alert("Error al eliminar: " + e.message);
  }
}

cargarDashboard();
