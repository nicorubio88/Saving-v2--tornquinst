const ETIQUETA_SEMAFORO_ARBOL = {
  verde: "En objetivo", amarillo: "En riesgo", rojo: "Desviado", sin_datos: "Sin datos",
};

async function cargarArbol() {
  const cont = document.getElementById("contenido-arbol");
  try {
    const d = await apiGet({ action: "arbol" });
    const a = d.arbol;

    document.getElementById("kpi-arbol").innerHTML = `
      <div class="kpi">
        <div class="kpi-label">Ahorro acumulado total</div>
        <div class="kpi-value">${fmtMoney(a.total_ahorro)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Objetivo anual comprometido</div>
        <div class="kpi-value">${fmtMoney(a.total_objetivo)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Cobertura del árbol</div>
        <div class="kpi-value">${contarHojasConProyectos(a)}/16</div>
        <div class="hint">categorías de pérdida con al menos un proyecto</div>
      </div>`;

    // Gráfico por rama
    const ctx = document.getElementById("grafico-ramas").getContext("2d");
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: a.ramas.map((r) => r.nombre),
        datasets: [
          { label: "Ahorro acumulado", data: a.ramas.map((r) => r.ahorro), backgroundColor: "#548235" },
          { label: "Objetivo anual", data: a.ramas.map((r) => r.objetivo), backgroundColor: "#d9dfd3" },
        ],
      },
      options: { indexAxis: "y", responsive: true, plugins: { legend: { position: "bottom" } }, scales: { x: { beginAtZero: true } } },
    });

    // Árbol
    cont.innerHTML = a.ramas.map((rama) => `
      <div class="rama">
        <div class="rama-header">
          <div style="flex:1;min-width:260px">
            <h3 style="margin:0">${rama.nombre}</h3>
            <div class="hoja-desc">${rama.descripcion}</div>
          </div>
          <div class="rama-total">
            <div class="monto">${fmtMoney(rama.ahorro)}</div>
            <div class="hint">de ${fmtMoney(rama.objetivo)} objetivo</div>
          </div>
        </div>
        ${rama.hojas.map((h) => `
          <div class="hoja ${h.proyectos.length ? "con-proyectos" : ""}">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <div style="flex:1;min-width:220px">
                <div class="hoja-nombre">${h.nombre}</div>
                <div class="hoja-desc">${h.descripcion}</div>
              </div>
              <div style="text-align:right">
                ${h.proyectos.length
                  ? `<strong class="${h.ahorro >= 0 ? "valor-positivo" : "valor-negativo"}">${fmtMoney(h.ahorro)}</strong>
                     <div class="hint">obj. ${fmtMoney(h.objetivo)}</div>`
                  : `<span class="hint">Sin proyectos asignados</span>`}
              </div>
            </div>
            ${h.proyectos.map((p) => `
              <div class="hoja-proyecto">
                <div style="flex:1">
                  <span class="semaforo semaforo-${p.semaforo}" title="${ETIQUETA_SEMAFORO_ARBOL[p.semaforo]}"></span>
                  <a href="proyecto.html?id=${p.id}" style="color:inherit;font-weight:600">${p.nombre}</a>
                  <div class="hint">${p.responsable || "sin responsable"}${p.contramedida ? ` · ${p.contramedida}` : ""}</div>
                </div>
                <div style="text-align:right;white-space:nowrap">
                  <div class="${p.ahorro_acumulado >= 0 ? "valor-positivo" : "valor-negativo"}">${fmtMoney(p.ahorro_acumulado)}</div>
                  <div class="hint">obj. ${fmtMoney(p.objetivo_valor)}</div>
                </div>
              </div>`).join("")}
          </div>`).join("")}
      </div>`).join("") +
      (a.sin_asignar.proyectos.length ? `
        <div class="rama" style="border-top-color:#c0392b">
          <div class="rama-header">
            <div><h3 style="margin:0">Proyectos sin categoría asignada</h3>
            <div class="hoja-desc">Asignales una categoría de pérdida para que entren en el análisis.</div></div>
            <div class="rama-total"><div class="monto">${fmtMoney(a.sin_asignar.ahorro)}</div></div>
          </div>
          ${a.sin_asignar.proyectos.map((p) => `
            <div class="hoja-proyecto">
              <div><a href="nuevo.html?editar=${p.id}">${p.nombre}</a></div>
              <div>${fmtMoney(p.ahorro_acumulado)}</div>
            </div>`).join("")}
        </div>` : "");

    // Tabla P&L
    document.getElementById("tbody-pnl").innerHTML = d.pnl.lineas.map((l) => {
      const avance = l.objetivo ? Math.round((l.ahorro / l.objetivo) * 100) : 0;
      return `<tr>
        <td><strong>${l.nombre}</strong></td>
        <td>${l.tipo}</td>
        <td>${l.cantidad}</td>
        <td>${fmtMoney(l.objetivo)}</td>
        <td class="${l.ahorro >= 0 ? "valor-positivo" : "valor-negativo"}">${fmtMoney(l.ahorro)}</td>
        <td>${avance}%</td>
      </tr>`;
    }).join("") || `<tr><td colspan="6">Sin proyectos asignados a líneas del P&L.</td></tr>`;

  } catch (e) {
    cont.innerHTML = `<div class="flash flash-danger">Error: ${e.message}</div>`;
  }
}

function contarHojasConProyectos(a) {
  let n = 0;
  a.ramas.forEach((r) => r.hojas.forEach((h) => { if (h.proyectos.length) n++; }));
  return n;
}

cargarArbol();
