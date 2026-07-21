let datosDashboard = null;
let chartConsolidado = null;
let chartPnl = null;

const PALETA = ["#548235", "#7FA76A", "#3D5F26", "#A3C48A", "#2E4A1C", "#c98a12", "#8a6d3b", "#5b8ea8"];

const ETIQUETA_SEMAFORO = {
  verde: "En objetivo",
  amarillo: "En riesgo",
  rojo: "Desviado",
  sin_datos: "Sin datos",
};

async function cargarDashboard() {
  const kpiRow = document.getElementById("kpi-row");
  try {
    const d = await apiGet({ action: "dashboard" });
    datosDashboard = d;

    kpiRow.innerHTML = `
      <div class="kpi ${d.ahorro_total_acumulado < 0 ? "kpi-negativo" : ""}">
        <div class="kpi-label">Ahorro acumulado (activos)</div>
        <div class="kpi-value">${fmtMoney(d.ahorro_total_acumulado)}</div>
        <div class="hint">Objetivo a la fecha: ${fmtMoney(d.objetivo_a_la_fecha_total)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Objetivo anual comprometido</div>
        <div class="kpi-value">${fmtMoney(d.objetivo_total)}</div>
        <div class="hint">${d.proyectos_activos} proyectos activos</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Proyección a 12 meses (ritmo actual)</div>
        <div class="kpi-value">${fmtMoney(d.proyeccion_total)}</div>
        <div class="hint">${d.objetivo_total ? Math.round((d.proyeccion_total / d.objetivo_total) * 100) : 0}% del objetivo anual</div>
      </div>
      <div class="kpi ${d.proyectos_en_riesgo > 0 ? "kpi-negativo" : ""}">
        <div class="kpi-label">Proyectos en riesgo</div>
        <div class="kpi-value">${d.proyectos_en_riesgo}</div>
        <div class="hint">de ${d.proyectos_activos} activos</div>
      </div>`;

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
    kpiRow.innerHTML = `<div class="flash flash-danger">Error cargando datos: ${e.message}. Revisá que APPS_SCRIPT_URL esté bien configurada en js/config.js.</div>`;
  }
}

function renderAlertas(d) {
  const cont = document.getElementById("alertas");
  if (!d.proyectos_sin_carga_reciente.length) { cont.innerHTML = ""; return; }
  cont.innerHTML = `
    <div class="flash flash-danger">
      <strong>Adherencia de carga:</strong> ${d.proyectos_sin_carga_reciente.length} proyecto(s) sin mediciones recientes —
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
  lista.innerHTML = d.proyectos.map((p) => {
    const avance = Math.max(p.avance_objetivo_pct, 0);
    return `
      <div class="proyecto-item">
        <div style="flex:1">
          <div class="nombre">
            <span class="semaforo semaforo-${p.semaforo}" title="${ETIQUETA_SEMAFORO[p.semaforo]}"></span>
            <a href="proyecto.html?id=${p.id}" style="color:inherit;text-decoration:none">${p.nombre}</a>
          </div>
          <div class="meta">${p.area || "Sin área"} · ${p.responsable} · ${p.fecha_inicio} → ${p.fecha_fin}</div>
          <div class="meta">
            <span class="chip">${p.categoria_perdida_nombre}</span>
            <span class="chip">${p.linea_pnl_nombre}</span>
          </div>
          <div class="progress-bar-outer" style="max-width:280px">
            <div class="progress-bar-inner ${p.avance_objetivo_pct < 0 ? "negativo" : ""}" style="width:${Math.min(avance, 100)}%"></div>
          </div>
        </div>
        <div style="text-align:right">
          <span class="badge badge-${p.estado}">${p.estado.replace(/_/g, " ")}</span>
          <div class="meta" style="margin-top:6px">
            ${fmtMoney(p.ahorro_acumulado)} / ${fmtMoney(p.objetivo_valor)} (${p.avance_objetivo_pct}%)
          </div>
          <div class="meta">Cumplimiento a la fecha: <strong>${p.cumplimiento_pct}%</strong></div>
          <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
            <a class="btn btn-small btn-secundario" href="nuevo.html?editar=${p.id}">Editar</a>
            <a class="btn btn-small" href="proyecto.html?id=${p.id}">Abrir</a>
          </div>
        </div>
      </div>`;
  }).join("");
}

function renderConsolidado(vista) {
  const c = datosDashboard.consolidado;
  const ctx = document.getElementById("grafico-consolidado").getContext("2d");
  if (chartConsolidado) chartConsolidado.destroy();

  if (vista === "mensual") {
    chartConsolidado = new Chart(ctx, {
      type: "bar",
      data: {
        labels: c.etiquetas,
        datasets: [
          ...c.series.map((s, i) => ({
            label: s.nombre.length > 38 ? s.nombre.slice(0, 38) + "…" : s.nombre,
            data: s.datos,
            backgroundColor: PALETA[i % PALETA.length],
            stack: "ahorro",
          })),
          {
            label: "Objetivo mensual",
            data: c.etiquetas.map(() => c.objetivo_mensual),
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
        plugins: { legend: { position: "bottom" } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    });
  } else {
    chartConsolidado = new Chart(ctx, {
      type: "line",
      data: {
        labels: c.etiquetas,
        datasets: [
          { label: "Ahorro acumulado", data: c.acumulado, borderColor: "#548235", backgroundColor: "rgba(84,130,53,0.15)", fill: true, tension: 0.25 },
          { label: "Objetivo acumulado", data: c.objetivo_acumulado, borderColor: "#c98a12", borderDash: [6, 4], fill: false },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } },
    });
  }
}

function renderPnl(d) {
  const ctx = document.getElementById("grafico-pnl").getContext("2d");
  if (chartPnl) chartPnl.destroy();
  chartPnl = new Chart(ctx, {
    type: "bar",
    data: {
      labels: d.pnl.lineas.map((l) => l.nombre),
      datasets: [
        { label: "Ahorro acumulado", data: d.pnl.lineas.map((l) => l.ahorro), backgroundColor: "#548235" },
        { label: "Objetivo anual", data: d.pnl.lineas.map((l) => l.objetivo), backgroundColor: "#d9dfd3" },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { beginAtZero: true } },
    },
  });
}

cargarDashboard();
