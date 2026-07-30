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
const COLOR_PROYECCION = "#8e7cc3";  // violeta: se distingue de todos los verdes del histórico

// El plugin de etiquetas se registra una sola vez y arranca APAGADO: solo se
// activa por dataset cuando el usuario tilda "Mostrar montos en las barras".
if (typeof ChartDataLabels !== "undefined") {
  Chart.register(ChartDataLabels);
  Chart.defaults.set("plugins.datalabels", { display: false });
}

/** Etiqueta compacta para no saturar la barra: 12.500 → "12,5k". */
function fmtCompacto(v) {
  const abs = Math.abs(v);
  if (abs >= 1000000) return (v / 1000000).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M";
  if (abs >= 1000) return (v / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "k";
  return Math.round(v).toLocaleString("es-AR");
}

/** Callback de tooltip de Chart.js que formatea el valor como plata (US$). */
function tooltipEnDolares(ctx) {
  const valor = ctx.parsed.y ?? ctx.parsed.x ?? ctx.raw;
  return `${ctx.dataset.label}: ${fmtMoney(valor)}`;
}

let dashDesde = "";
let dashHasta = "";
let dashEstado = "activo";   // activo | todos | cerrados
// Opciones de visualización del gráfico consolidado (checkboxes)
const opciones = { valores: false, nombres: false, totalMes: false, proyeccion: false };

async function cargarDashboard() {
  const kpiRow = document.getElementById("kpi-row");
  try {
    const q = { action: "dashboard" };
    if (dashDesde) q.desde = dashDesde;
    if (dashHasta) q.hasta = dashHasta;
    if (dashEstado) q.estado = dashEstado;
    const d = await apiGet(q);
    datosDashboard = d;

    renderKpis(d);
    renderAlertas(d);
    renderAlertaReposicion(d);
    renderLista(d);
    renderConsolidado("mensual");
    renderPnl(d);

    const inpDesde = document.getElementById("dash-desde");
    const inpHasta = document.getElementById("dash-hasta");
    if (inpDesde && !inpDesde.dataset.enganchado) {
      inpDesde.dataset.enganchado = "1";
      inpDesde.addEventListener("change", (e) => { dashDesde = e.target.value; cargarDashboard(); });
      inpHasta.addEventListener("change", (e) => { dashHasta = e.target.value; cargarDashboard(); });
      document.getElementById("dash-limpiar").addEventListener("click", () => {
        dashDesde = ""; dashHasta = "";
        inpDesde.value = ""; inpHasta.value = "";
        cargarDashboard();
      });
    }
    const btnExp = document.getElementById("dash-exportar");
    if (btnExp && !btnExp.dataset.enganchado) {
      btnExp.dataset.enganchado = "1";
      btnExp.addEventListener("click", () => {
        // Se abre la URL de exportación con los MISMOS filtros que la vista,
        // así el archivo coincide exactamente con lo que está en pantalla.
        const url = new URL(APPS_SCRIPT_URL);
        url.searchParams.set("action", "exportar");
        if (dashDesde) url.searchParams.set("desde", dashDesde);
        if (dashHasta) url.searchParams.set("hasta", dashHasta);
        url.searchParams.set("estado", dashEstado);
        window.open(url.toString(), "_blank");
      });
    }

    const selEstado = document.getElementById("dash-estado");
    if (selEstado && !selEstado.dataset.enganchado) {
      selEstado.dataset.enganchado = "1";
      selEstado.value = dashEstado;
      selEstado.addEventListener("change", (e) => { dashEstado = e.target.value; cargarDashboard(); });
    }
    // Los checkboxes solo redibujan el gráfico: no hace falta pedir datos de nuevo.
    [["op-valores", "valores"], ["op-nombres", "nombres"],
     ["op-total-mes", "totalMes"], ["op-proyeccion", "proyeccion"]].forEach(([id, clave]) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.enganchado) {
        el.dataset.enganchado = "1";
        el.addEventListener("change", (e) => {
          opciones[clave] = e.target.checked;
          const activa = document.querySelector(".tab-btn.active");
          renderConsolidado(activa ? activa.dataset.vista : "mensual");
        });
      }
    });

    const estado = document.getElementById("dash-estado-filtro");
    if (estado) {
      estado.innerHTML = d.filtro_aplicado
        ? `Filtrado del <strong>${d.filtro_aplicado.desde || "…"}</strong> al <strong>${d.filtro_aplicado.hasta || "…"}</strong>`
          + ` — ${d.registros_en_rango} medición(es) en el rango. Los KPIs, el gráfico y el P&L de abajo`
          + ` corresponden SOLO a ese recorte.`
        : "Mostrando todo el histórico cargado.";
    }

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
      <div class="kpi-label">Objetivo anual ${d.objetivo_total_es_estimado ? "(estimado)" : "comprometido"}</div>
      <div class="kpi-value">${fmtMoney(d.objetivo_total)}</div>
      <div class="hint">${d.proyectos_activos} proyecto${d.proyectos_activos === 1 ? "" : "s"} activo${d.proyectos_activos === 1 ? "" : "s"}${
        d.objetivo_total_es_estimado ? " · incluye objetivos dinámicos estimados con el promedio mensual cargado" : ""}</div>
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

/**
 * Alerta de reposición de cartera: avisa con anticipación cuándo la
 * proyección va a caer por debajo del objetivo, porque los proyectos
 * actuales llegan a sus 12 meses y cierran. Convierte el gráfico en una
 * acción concreta: cuántos meses de margen quedan y cuánto ahorro nuevo
 * hay que conseguir.
 */
function renderAlertaReposicion(d) {
  const cont = document.getElementById("alerta-reposicion");
  if (!cont) return;
  const pf = d.proyeccion_forward;
  if (!pf || !pf.primer_mes_con_brecha) { cont.innerHTML = ""; return; }

  // Menos de 4 meses de margen es crítico: conseguir y arrancar proyectos
  // nuevos lleva tiempo.
  const critica = pf.meses_hasta_brecha <= 4;
  const cierres = (pf.proyectos_que_cierran || [])
    .map((lista, i) => (lista.length ? `${nombreMes(pf.etiquetas[i])}: ${lista.join(", ")}` : null))
    .filter(Boolean);

  cont.innerHTML = `
    <div class="alerta-reposicion ${critica ? "critica" : ""}">
      <h4>${critica ? "🚨" : "📌"} Reposición de cartera — quedan ${pf.meses_hasta_brecha} mes(es) de margen</h4>
      <div>A partir de <strong>${nombreMes(pf.primer_mes_con_brecha)}</strong> la cartera actual deja de alcanzar el objetivo:
        faltarían <span class="cifra">${fmtMoney(pf.brecha_en_ese_mes)}</span> ese mes.</div>
      <div class="detalle">
        Para sostener el ritmo hay que cubrir <strong>${fmtMoney(pf.brecha_anual_acumulada)}</strong> en los próximos 12 meses
        con proyectos nuevos (ritmo actual: ${fmtMoney(pf.ritmo_mensual_actual)}/mes vs. objetivo de ${fmtMoney(pf.objetivo_mensual_actual)}/mes).
        ${cierres.length ? `<br>Cierran: ${cierres.join(" · ")}.` : ""}
        <br><a href="ideas.html">Ver el banco de ideas →</a>
      </div>
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
  const pf = datosDashboard.proyeccion_forward;
  const ctx = document.getElementById("grafico-consolidado").getContext("2d");
  const nota = document.getElementById("nota-proyeccion");
  if (chartConsolidado) chartConsolidado.destroy();
  if (!c.etiquetas.length) { chartConsolidado = null; if (nota) nota.innerHTML = ""; return; }

  // Etiquetas de datos: montos y/o nombre del proyecto dentro de cada barra.
  const configEtiquetas = (nombreSerie) => ({
    display: (ctx2) => {
      if (!opciones.valores && !opciones.nombres) return false;
      const v = ctx2.dataset.data[ctx2.dataIndex];
      // Se ocultan los segmentos chicos: la etiqueta no entraría y ensucia.
      return v !== 0 && Math.abs(v) > 0;
    },
    color: "#fff",
    font: { size: 10, weight: "600" },
    formatter: (v) => {
      if (v === 0) return "";
      const partes = [];
      if (opciones.nombres) partes.push(nombreSerie.length > 18 ? nombreSerie.slice(0, 18) + "…" : nombreSerie);
      if (opciones.valores) partes.push(fmtCompacto(v));
      return partes.join("\n");
    },
    textAlign: "center",
  });

  if (vista === "mensual") {
    const etiquetasHist = c.etiquetas.map(nombreMes);
    const nHist = etiquetasHist.length;

    // Con proyección activada, el eje X se extiende hacia el futuro y los
    // datos históricos se rellenan con null en los meses proyectados (y
    // viceversa) para que ambas series convivan en el mismo gráfico.
    const etiquetasProy = opciones.proyeccion && pf ? pf.etiquetas.map(nombreMes) : [];
    const labels = etiquetasHist.concat(etiquetasProy);

    const datasets = c.series.map((serie, i) => ({
      label: serie.nombre.length > 38 ? serie.nombre.slice(0, 38) + "…" : serie.nombre,
      data: serie.datos.concat(etiquetasProy.map(() => null)),
      backgroundColor: PALETA[i % PALETA.length],
      stack: "ahorro",
      borderRadius: 3,
      datalabels: configEtiquetas(serie.nombre),
    }));

    datasets.push({
      label: "Objetivo mensual",
      data: c.objetivo_periodo.concat(etiquetasProy.map(() => null)),
      type: "line",
      borderColor: "#c98a12",
      borderDash: [6, 4],
      fill: false,
      pointRadius: 0,
      datalabels: { display: false },
    });

    if (opciones.totalMes) {
      // Serie invisible cuyo único fin es escribir el total arriba de cada
      // barra apilada (Chart.js no da el total del stack de forma nativa).
      datasets.push({
        label: "Total del mes",
        data: c.total_por_mes.concat(etiquetasProy.map(() => null)),
        type: "line",
        borderColor: "transparent",
        pointRadius: 0,
        fill: false,
        datalabels: {
          display: true,
          align: "end",
          anchor: "end",
          color: "#2E4A1C",
          font: { size: 11, weight: "700" },
          formatter: (v) => (v === null ? "" : fmtMoney(v)),
        },
      });
    }

    if (opciones.proyeccion && pf) {
      datasets.push({
        label: "Proyectado (proyectos vigentes)",
        data: etiquetasHist.map(() => null).concat(pf.total_proyectado),
        backgroundColor: COLOR_PROYECCION,
        stack: "proyeccion",
        borderRadius: 3,
        datalabels: opciones.valores
          ? { display: true, color: "#fff", font: { size: 10, weight: "600" }, formatter: (v) => (v ? fmtCompacto(v) : "") }
          : { display: false },
      });
    }

    chartConsolidado = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, padding: 12, filter: (i) => i.text !== "Total del mes" } },
          tooltip: {
            callbacks: {
              label: (ctx2) => (ctx2.parsed.y === null ? null : tooltipEnDolares(ctx2)),
              afterBody: (items) => {
                // En los meses proyectados, avisar qué proyectos cierran.
                if (!opciones.proyeccion || !pf) return "";
                const idx = items[0].dataIndex - nHist;
                if (idx < 0 || !pf.proyectos_que_cierran[idx] || !pf.proyectos_que_cierran[idx].length) return "";
                return "\nCierran este mes: " + pf.proyectos_que_cierran[idx].join(", ");
              },
            },
          },
        },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => fmtMoney(v) } } },
      },
    });

    if (nota) {
      nota.innerHTML = opciones.proyeccion && pf
        ? `📉 En violeta, la proyección de los próximos 12 meses al ritmo actual (${fmtMoney(pf.ritmo_mensual_actual)}/mes). `
          + `La curva baja a medida que cada proyecto llega a sus 12 meses y cierra: es el hueco que hay que cubrir con proyectos nuevos. `
          + `Pasá el mouse sobre un mes proyectado para ver cuáles cierran.`
        : "";
    }
  } else {
    chartConsolidado = new Chart(ctx, {
      type: "line",
      data: {
        labels: c.etiquetas.map(nombreMes),
        datasets: [
          { label: "Ahorro acumulado", data: c.acumulado, borderColor: "#548235", backgroundColor: "rgba(84,130,53,0.15)", fill: true, tension: 0.3,
            datalabels: opciones.valores ? { display: true, align: "top", color: "#2E4A1C", font: { size: 10, weight: "600" }, formatter: fmtCompacto } : { display: false } },
          { label: "Objetivo acumulado", data: c.objetivo_acumulado, borderColor: "#c98a12", borderDash: [6, 4], fill: false, datalabels: { display: false } },
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
    if (nota) nota.innerHTML = "";
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
