async function cargarDashboard() {
  const kpiRow = document.getElementById("kpi-row");
  const lista = document.getElementById("proyecto-list");
  try {
    const data = await apiGet({ action: "dashboard" });

    kpiRow.innerHTML = `
      <div class="kpi ${data.ahorro_total_acumulado < 0 ? "kpi-negativo" : ""}">
        <div class="kpi-label">Ahorro acumulado (proyectos activos)</div>
        <div class="kpi-value">${fmtMoney(data.ahorro_total_acumulado)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Objetivo total (proyectos activos)</div>
        <div class="kpi-value">${fmtMoney(data.objetivo_total)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Proyectos activos</div>
        <div class="kpi-value">${data.proyectos_activos}</div>
      </div>`;

    if (data.proyectos.length === 0) {
      lista.innerHTML = `<p>Todavía no hay proyectos cargados. <a href="nuevo.html">Crear el primero →</a></p>`;
      return;
    }

    lista.innerHTML = data.proyectos.map((p) => {
      const avance = Math.max(p.avance_objetivo_pct, 0);
      const negativo = p.avance_objetivo_pct < 0;
      return `
      <a class="proyecto-item" href="proyecto.html?id=${p.id}">
        <div>
          <div class="nombre">${p.nombre}</div>
          <div class="meta">${p.area || "Sin área"} · Responsable: ${p.responsable} · ${p.fecha_inicio} → ${p.fecha_fin}</div>
          <div class="progress-bar-outer" style="max-width:260px">
            <div class="progress-bar-inner ${negativo ? "negativo" : ""}" style="width:${Math.min(avance,100)}%"></div>
          </div>
        </div>
        <div style="text-align:right">
          <span class="badge badge-${p.estado}">${p.estado.replace("_"," ")}</span>
          <div class="meta" style="margin-top:6px">
            ${fmtMoney(p.ahorro_acumulado)} / ${fmtMoney(p.objetivo_valor)} (${p.avance_objetivo_pct}%)
          </div>
        </div>
      </a>`;
    }).join("");
  } catch (e) {
    kpiRow.innerHTML = `<div class="flash flash-danger">Error cargando datos: ${e.message}. Revisá que APPS_SCRIPT_URL esté bien configurada en js/config.js.</div>`;
  }
}

cargarDashboard();
