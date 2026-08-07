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
/**
 * Paleta para los proyectos del gráfico apilado. Antes tenía 5 tonos de
 * verde muy parecidos entre 8 colores — con 6+ proyectos activos, las
 * franjas se volvían indistinguibles ("mucho ruido, poco claro"). Esta
 * versión usa hues distintos entre sí (verde, oliva, ocre, terracota, azul,
 * malva, teal, marrón) manteniendo una paleta sobria y profesional, no un
 * arcoíris — pensada para que 10 proyectos en la misma barra se puedan
 * diferenciar de un vistazo.
 */
const PALETA = ["#2E5339", "#C9A227", "#4A6FA5", "#B5651D", "#5A9BA8", "#A85751", "#8FBC94", "#8B4B6B", "#5B8C5A", "#8a6d3b"];
const COLOR_PROYECCION = "#8e7cc3";  // violeta: se distingue de todos los verdes del histórico
const COLOR_BANCO_IDEAS = "#d4838f"; // rosa: no se confunde con el ocre del objetivo ni con los verdes

/**
 * Color de texto (blanco o casi-negro) según el brillo del fondo, para que
 * las etiquetas dentro de las barras SIEMPRE se lean bien — antes el texto
 * blanco fijo se volvía ilegible sobre los tonos de verde más claros de la
 * paleta (ej. #8FBC94). Fórmula estándar de luminancia relativa (WCAG).
 */
function colorTextoLegible(colorFondo) {
  const hex = colorFondo.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "#24301d" : "#ffffff";
}

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
const opciones = { valores: false, nombres: false, totalMes: false, proyeccion: false, bancoIdeas: false };

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
    renderPareto(d);
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
     ["op-total-mes", "totalMes"], ["op-proyeccion", "proyeccion"],
     ["op-banco-ideas", "bancoIdeas"]].forEach(([id, clave]) => {
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
  const configEtiquetas = (nombreSerie, colorFondo) => ({
    display: (ctx2) => {
      if (!opciones.valores && !opciones.nombres) return false;
      const v = ctx2.dataset.data[ctx2.dataIndex];
      // Se ocultan los segmentos chicos: la etiqueta no entraría y ensucia.
      return v !== 0 && Math.abs(v) > 0;
    },
    color: colorTextoLegible(colorFondo),
    font: { size: 10, weight: "600" },
    // Contorno leve del color opuesto: refuerzo extra de contraste para
    // segmentos angostos donde el color de fondo varía ligeramente por el
    // degradado del borde de la barra.
    textStrokeColor: colorTextoLegible(colorFondo) === "#ffffff" ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.5)",
    textStrokeWidth: 2,
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

    const datasets = c.series.map((serie, i) => {
      const color = PALETA[i % PALETA.length];
      return {
        label: serie.nombre.length > 38 ? serie.nombre.slice(0, 38) + "…" : serie.nombre,
        data: serie.datos.concat(etiquetasProy.map(() => null)),
        backgroundColor: color,
        stack: "ahorro",
        borderRadius: 3,
        datalabels: configEtiquetas(serie.nombre, color),
      };
    });

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
          ? { display: true, color: colorTextoLegible(COLOR_PROYECCION), font: { size: 10, weight: "600" }, formatter: (v) => (v ? fmtCompacto(v) : "") }
          : { display: false },
      });
    }

    // Banco de ideas: se agrega como una columna EXTRA al final (no es un
    // mes, es "cuánto potencial hay guardado si se activara"), en un color
    // que no se confunda ni con los proyectos ni con la proyección.
    const banco = datosDashboard.banco_ideas;
    if (opciones.bancoIdeas && banco && banco.potencial_total > 0) {
      labels.push("Banco de ideas");
      datasets.forEach((ds) => ds.data.push(null)); // alinea todas las series existentes
      datasets.push({
        label: `Banco de ideas (${banco.cantidad})`,
        data: labels.map((_, i) => (i === labels.length - 1 ? banco.potencial_total : null)),
        backgroundColor: COLOR_BANCO_IDEAS,
        borderRadius: 3,
        datalabels: opciones.valores
          ? { display: true, color: colorTextoLegible(COLOR_BANCO_IDEAS), font: { size: 10, weight: "600" }, formatter: (v) => (v ? fmtCompacto(v) : "") }
          : { display: false },
      });
    }

    chartConsolidado = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, padding: 14, font: { size: 11 }, filter: (i) => i.text !== "Total del mes" },
          },
          tooltip: {
            backgroundColor: "rgba(36,48,29,0.92)", padding: 10, cornerRadius: 8, boxPadding: 4,
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
        // Grillas suaves (antes negras/duras): el eje se lee, no compite con
        // los datos. Sin borde superior/derecho, que no aporta información.
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            stacked: true, beginAtZero: true,
            grid: { color: "#e9ede4" },
            border: { display: false },
            ticks: { callback: (v) => fmtCompacto(v), font: { size: 11 }, color: "#6b7862" },
          },
        },
      },
    });

    if (nota) {
      const partes = [];
      if (opciones.proyeccion && pf) {
        partes.push(`📉 En violeta, la proyección de los próximos 12 meses al ritmo actual (${fmtMoney(pf.ritmo_mensual_actual)}/mes). `
          + `La curva baja a medida que cada proyecto llega a sus 12 meses y cierra: es el hueco que hay que cubrir con proyectos nuevos. `
          + `Pasá el mouse sobre un mes proyectado para ver cuáles cierran.`);
      }
      if (opciones.bancoIdeas && banco && banco.potencial_total > 0) {
        partes.push(`💡 En rosa, el potencial de ahorro guardado en el banco de ideas (${banco.cantidad} idea${banco.cantidad === 1 ? "" : "s"} sin convertir todavía): `
          + `${fmtMoney(banco.potencial_total)} si se activaran como proyectos.`);
      }
      nota.innerHTML = partes.join(" ");
    }
  } else {
    chartConsolidado = new Chart(ctx, {
      type: "line",
      data: {
        labels: c.etiquetas.map(nombreMes),
        datasets: [
          { label: "Ahorro acumulado", data: c.acumulado, borderColor: PALETA[0], backgroundColor: "rgba(46,83,57,0.12)", borderWidth: 2, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: PALETA[0],
            datalabels: opciones.valores ? { display: true, align: "top", color: "#3D5F26", font: { size: 10, weight: "600" }, formatter: fmtCompacto } : { display: false } },
          { label: "Objetivo acumulado", data: c.objetivo_acumulado, borderColor: "#c98a12", borderWidth: 2, borderDash: [6, 4], pointRadius: 0, fill: false, datalabels: { display: false } },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, padding: 14, font: { size: 11 } } },
          tooltip: { backgroundColor: "rgba(36,48,29,0.92)", padding: 10, cornerRadius: 8, boxPadding: 4, callbacks: { label: tooltipEnDolares } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "#e9ede4" }, border: { display: false }, ticks: { callback: (v) => fmtCompacto(v), font: { size: 11 }, color: "#6b7862" } },
        },
      },
    });
    if (nota) nota.innerHTML = "";
  }
}

/**
 * Pareto de proyectos: barras de ahorro ordenadas de mayor a menor (backend
 * ya las manda ordenadas) + línea de % acumulado en el eje secundario. Los
 * proyectos en pérdida se listan aparte en texto, para que no desaparezcan
 * del gráfico sin explicación.
 */
let chartPareto = null;
function renderPareto(d) {
  const canvas = document.getElementById("grafico-pareto");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (chartPareto) chartPareto.destroy();

  const p = d.pareto;
  const nota = document.getElementById("nota-pareto");
  if (!p || !p.proyectos.length) {
    if (nota) nota.innerHTML = "Todavía no hay ahorro acumulado positivo para armar el Pareto.";
    return;
  }

  chartPareto = new Chart(ctx, {
    data: {
      labels: p.proyectos.map((x) => (x.nombre.length > 16 ? x.nombre.slice(0, 16) + "…" : x.nombre)),
      datasets: [
        {
          type: "bar",
          label: "Ahorro acumulado",
          data: p.proyectos.map((x) => x.ahorro),
          backgroundColor: PALETA[0],
          borderRadius: 3,
          yAxisID: "y",
          order: 2,
          datalabels: {
            display: true, anchor: "end", align: "top", offset: 2,
            color: "#3D5F26", font: { size: 10, weight: "600" },
            formatter: (v) => fmtCompacto(v),
          },
        },
        {
          type: "line",
          label: "% acumulado",
          data: p.proyectos.map((x) => x.porcentaje_acumulado),
          borderColor: COLOR_PROYECCION,
          backgroundColor: COLOR_PROYECCION,
          borderWidth: 2,
          borderDash: [4, 3],
          pointRadius: 3,
          pointBackgroundColor: COLOR_PROYECCION,
          fill: false,
          yAxisID: "y2",
          order: 1,
          datalabels: { display: false },
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, padding: 14, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "rgba(36,48,29,0.92)", padding: 10, cornerRadius: 8, boxPadding: 4,
          callbacks: {
            label: (ctx2) => ctx2.dataset.yAxisID === "y2"
              ? `% acumulado: ${ctx2.parsed.y}%`
              : `${ctx2.dataset.label}: ${fmtMoney(ctx2.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 0, font: { size: 11 } } },
        y: { beginAtZero: true, position: "left", grid: { color: "#e9ede4" }, border: { display: false }, ticks: { callback: (v) => fmtCompacto(v), font: { size: 11 }, color: "#6b7862" } },
        y2: { beginAtZero: true, position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, border: { display: false }, ticks: { callback: (v) => v + "%", font: { size: 11 }, color: "#6b7862" } },
      },
    },
  });

  if (nota) {
    let texto = `Ahorro positivo total: ${fmtMoney(p.total_positivo)}.`;
    if (p.proyectos_en_perdida && p.proyectos_en_perdida.length) {
      texto += ` ⚠️ ${p.proyectos_en_perdida.length} proyecto(s) en pérdida (no entran al ranking): `
        + p.proyectos_en_perdida.map((x) => `${x.nombre} (${fmtMoney(x.ahorro)})`).join(", ") + ".";
    }
    nota.innerHTML = texto;
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
        legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, padding: 14, font: { size: 11 } } },
        tooltip: { backgroundColor: "rgba(36,48,29,0.92)", padding: 10, cornerRadius: 8, boxPadding: 4, callbacks: { label: tooltipEnDolares } },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: "#e9ede4" }, border: { display: false }, ticks: { callback: (v) => fmtCompacto(v), font: { size: 11 }, color: "#6b7862" } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
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
