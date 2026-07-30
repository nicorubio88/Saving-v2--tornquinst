/**
 * Helpers de presentación compartidos por TODAS las páginas del frontend.
 *
 * Antes de la v3 esto estaba duplicado: la etiqueta del semáforo se definía
 * igual en dashboard.js, proyecto.js y arbol.js; los "chips" de categoría se
 * armaban a mano con el mismo HTML en 8 lugares distintos. Acá vive una sola
 * vez cada cosa, y las páginas solo llaman a estas funciones.
 *
 * Se carga con <script src="js/common.js"> ANTES de api.js y del script
 * propio de cada página (ver los <head>/<body> de los .html).
 */

// ------------------------------------------------------------- Formato $ / números
/** Todo el dinero de la app se expresa en USD (ver README, sección "Moneda"). */
function fmtMoney(n) {
  return "US$ " + Math.round(n || 0).toLocaleString("es-AR");
}

/** Número con separador de miles en formato argentino, sin símbolo de moneda. */
function fmtNumero(n, decimales = 0) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: decimales });
}

/** "2026-07" -> "Jul 2026". Usado en selectores de mes y en tablas. */
function nombreMes(claveAAAAMM) {
  const [anio, mes] = claveAAAAMM.split("-");
  const NOMBRES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${NOMBRES[parseInt(mes, 10) - 1]} ${anio}`;
}

// ------------------------------------------------------------- Semáforo de salud
/**
 * El backend calcula `semaforo` por proyecto (verde/amarillo/rojo/sin_datos)
 * comparando el ahorro acumulado contra el objetivo "a la fecha" (ver
 * Metrics.gs → calcularKpisProyecto). Acá solo vive la traducción a texto y
 * el pequeño punto de color; el criterio de negocio queda en el backend.
 */
const ETIQUETA_SEMAFORO = {
  verde: "En objetivo",
  amarillo: "En riesgo",
  rojo: "Desviado",
  sin_datos: "Sin datos",
};

/** Punto de color + texto, para usar dentro de un título o una fila de tabla. */
function semaforoInline(semaforo) {
  return `<span class="semaforo semaforo-${semaforo}" title="${ETIQUETA_SEMAFORO[semaforo]}"></span>`;
}

/** Versión "pill" con texto visible (no solo tooltip) para las cards de proyecto. */
function semaforoPill(semaforo) {
  return `<span class="semaforo-pill semaforo-pill-${semaforo}">
    <span class="semaforo"></span>${ETIQUETA_SEMAFORO[semaforo] || semaforo}
  </span>`;
}

// ------------------------------------------------------------- Badges / chips
/** Badge de estado de proyecto o idea (activo, pausado, idea, aprobada, etc.). */
function badgeEstado(estado) {
  return `<span class="badge badge-${estado}">${(estado || "").replace(/_/g, " ")}</span>`;
}

/** Chip informativo chico (categoría de pérdida, línea de P&L, contramedida...). */
function chip(texto) {
  return texto ? `<span class="chip">${texto}</span>` : "";
}

/** Fila de chips de un proyecto: categoría de pérdida + línea de P&L + contramedida. */
function chipsProyecto(p) {
  return [chip(p.categoria_perdida_nombre), chip(p.linea_pnl_nombre), chip(p.contramedida)].join("");
}

// ------------------------------------------------------------- Barra de progreso
/** Barra de progreso 0-100%, en rojo si el valor es negativo (pérdida acumulada). */
function barraProgreso(pct, maxAncho = null) {
  const positivo = Math.max(pct, 0);
  const estilo = maxAncho ? `style="max-width:${maxAncho}px"` : "";
  return `
    <div class="progress-bar-outer" ${estilo}>
      <div class="progress-bar-inner ${pct < 0 ? "negativo" : ""}" style="width:${Math.min(positivo, 100)}%"></div>
    </div>`;
}

// ------------------------------------------------------------- Colores de gráficos (Chart.js)
/**
 * Para un dataset de barras de Chart.js: un array de colores, uno por barra,
 * verde si el valor es >= 0 y rojo si es negativo (pérdida). Se usa como
 * backgroundColor en vez de un string único, para que cada barra tome su
 * propio color según el signo.
 */
function coloresPorSigno(valores, colorPositivo = "#7FA76A", colorNegativo = "#c0392b") {
  return valores.map((v) => (v < 0 ? colorNegativo : colorPositivo));
}
