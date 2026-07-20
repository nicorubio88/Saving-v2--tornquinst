const params = new URLSearchParams(window.location.search);
const proyectoId = params.get("id");
let chart;
let proyectoActual;

function badgeEstados(actual) {
  return ["idea", "activo", "pausado", "cerrado_logrado", "cerrado_no_logrado"]
    .map((e) => `<option value="${e}" ${e === actual ? "selected" : ""}>${e.replace("_", " ")}</option>`)
    .join("");
}

async function render() {
  const contenido = document.getElementById("contenido");
  try {
    const p = await apiGet({ action: "proyecto", id: proyectoId });
    proyectoActual = p;
    const avance = Math.max(p.avance_objetivo_pct, 0);

    contenido.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <h1>${p.nombre}</h1>
          <p class="meta">${p.area || "Sin área"} · Responsable: <strong>${p.responsable}</strong></p>
          <p>${p.descripcion || ""}</p>
        </div>
        <select id="select-estado">${badgeEstados(p.estado)}</select>
      </div>

      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Vigencia (12 meses)</div>
          <div class="kpi-value" style="font-size:1.1rem">${p.fecha_inicio} → ${p.fecha_fin}</div>
          <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${p.avance_tiempo_pct}%"></div></div>
          <div class="hint">${p.avance_tiempo_pct}% del tiempo transcurrido</div>
        </div>
        <div class="kpi ${p.ahorro_acumulado < 0 ? "kpi-negativo" : ""}">
          <div class="kpi-label">Ahorro acumulado vs objetivo</div>
          <div class="kpi-value" style="font-size:1.2rem">${fmtMoney(p.ahorro_acumulado)} / ${fmtMoney(p.objetivo_valor)}</div>
          <div class="progress-bar-outer"><div class="progress-bar-inner ${p.avance_objetivo_pct < 0 ? "negativo" : ""}" style="width:${Math.min(avance,100)}%"></div></div>
          <div class="hint">${p.avance_objetivo_pct}% del objetivo</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Línea de base → Fórmula</div>
          <div class="kpi-value" style="font-size:1.1rem">${p.expresion_indicador} (${p.unidad_indicador || ""})</div>
          <div class="hint">Base: ${p.valor_base_indicador} · Costo unitario: ${p.costo_unitario} ${p.unidad_costo || ""}</div>
        </div>
      </div>

      <div class="card">
        <h3>Objetivo vs Evolución</h3>
        <div class="tabs">
          <button class="tab-btn active" data-periodo="diario">Diario</button>
          <button class="tab-btn" data-periodo="semanal">Semanal</button>
          <button class="tab-btn" data-periodo="mensual">Mensual</button>
          <button class="tab-btn" data-periodo="anual">Histórico anual</button>
        </div>
        <canvas id="grafico" height="100"></canvas>
      </div>

      <div class="card">
        <h3>Cargar nueva medición</h3>
        <form id="form-registro" class="form-card">
          <div class="row-2">
            <div><label>Fecha</label><input type="date" id="reg_fecha" required value="${new Date().toISOString().slice(0,10)}"></div>
            <div><label>Cargado por</label><input type="text" id="reg_cargado_por"></div>
          </div>
          <div class="row-3">
            ${p.variables.map((v) => `
              <div>
                <label>${v.label} ${v.unidad ? `(${v.unidad})` : ""}</label>
                <input type="number" step="any" class="val-variable" data-nombre="${v.nombre}" required>
              </div>`).join("")}
          </div>
          <div><label>Observaciones</label><input type="text" id="reg_observaciones"></div>
          <div id="flash-registro"></div>
          <button type="submit">Calcular y guardar</button>
        </form>
      </div>

      <div class="card">
        <h3>Histórico de mediciones</h3>
        <table>
          <thead><tr>
            <th>Fecha</th>
            ${p.variables.map((v) => `<th>${v.label}</th>`).join("")}
            <th>Indicador</th><th>Ahorro del período</th><th>Cargado por</th><th></th>
          </tr></thead>
          <tbody>
            ${p.registros.length === 0 ? `<tr><td colspan="10">Todavía no hay mediciones cargadas.</td></tr>` :
              p.registros.slice().reverse().map((r) => `
              <tr>
                <td>${r.fecha}</td>
                ${p.variables.map((v) => `<td>${r.valores[v.nombre] ?? "-"}</td>`).join("")}
                <td>${r.indicador != null ? r.indicador.toFixed(3) : "-"}</td>
                <td class="${(r.ahorro_periodo || 0) >= 0 ? "valor-positivo" : "valor-negativo"}">${fmtMoney(r.ahorro_periodo)}</td>
                <td>${r.cargado_por || "-"}</td>
                <td><button class="btn-small btn-secundario" onclick="eliminarRegistro(${r.id})">✕</button></td>
              </tr>`).join("")
            }
          </tbody>
        </table>
      </div>
    `;

    document.getElementById("select-estado").addEventListener("change", cambiarEstado);
    document.getElementById("form-registro").addEventListener("submit", cargarRegistro);
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        cargarGrafico(btn.dataset.periodo);
      });
    });

    cargarGrafico("diario");
  } catch (e) {
    contenido.innerHTML = `<div class="flash flash-danger">Error: ${e.message}</div>`;
  }
}

async function cargarGrafico(periodo) {
  const data = await apiGet({ action: "evolucion", id: proyectoId, periodo });
  const ctx = document.getElementById("grafico").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.etiquetas,
      datasets: [
        { label: "Ahorro acumulado ($)", data: data.ahorro_acumulado, borderColor: "#548235", backgroundColor: "rgba(84,130,53,0.15)", fill: true, tension: 0.25 },
        { label: "Objetivo acumulado ($)", data: data.objetivo_acumulado, borderColor: "#c98a12", borderDash: [6, 4], fill: false, tension: 0 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } },
  });
}

async function cambiarEstado(ev) {
  await apiPost({ action: "cambiar_estado_proyecto", proyecto_id: proyectoId, estado: ev.target.value });
  render();
}

async function cargarRegistro(ev) {
  ev.preventDefault();
  const flash = document.getElementById("flash-registro");
  try {
    const valores = {};
    document.querySelectorAll(".val-variable").forEach((input) => {
      valores[input.dataset.nombre] = parseFloat(input.value);
    });
    await apiPost({
      action: "cargar_registro",
      proyecto_id: proyectoId,
      datos: {
        fecha: document.getElementById("reg_fecha").value,
        valores,
        cargado_por: document.getElementById("reg_cargado_por").value,
        observaciones: document.getElementById("reg_observaciones").value,
      },
    });
    render();
  } catch (e) {
    flash.innerHTML = `<div class="flash flash-danger">${e.message}</div>`;
  }
}

async function eliminarRegistro(id) {
  if (!confirm("¿Eliminar este registro?")) return;
  await apiPost({ action: "eliminar_registro", registro_id: id });
  render();
}

render();
