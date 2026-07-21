/**
 * Copia del motor de fórmulas para usar en el navegador (vista previa en vivo
 * al crear/editar un proyecto). Misma lógica y mismas restricciones que la
 * versión del backend en FormulaEngine.gs.
 */
const FUNCIONES_PERMITIDAS_UI = ["abs", "round", "min", "max", "sqrt", "log", "pow"];

function validarFormulaUI(expresion, nombresVariables) {
  if (!/^[A-Za-z0-9_+\-*/%().,\s]+$/.test(expresion)) {
    throw new Error("La fórmula contiene caracteres no permitidos.");
  }
  const usados = expresion.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for (const id of usados) {
    if (!nombresVariables.includes(id) && !FUNCIONES_PERMITIDAS_UI.includes(id)) {
      throw new Error(`La fórmula usa un nombre no declarado: '${id}'`);
    }
  }
}

function evaluarFormulaUI(expresion, valores) {
  const nombres = Object.keys(valores);
  validarFormulaUI(expresion, nombres);
  const cuerpo =
    "var abs=Math.abs, round=Math.round, min=Math.min, max=Math.max, " +
    "sqrt=Math.sqrt, log=Math.log, pow=Math.pow;" +
    "return (" + expresion + ");";
  const fn = new Function(nombres.join(","), cuerpo);
  const r = fn(...nombres.map((n) => valores[n]));
  if (typeof r !== "number" || isNaN(r) || !isFinite(r)) {
    throw new Error("La fórmula no devolvió un número válido (¿división por cero?).");
  }
  return r;
}

/** Calcula el ahorro de un período igual que lo hace el backend. */
function calcularAhorroUI(cfg, valores) {
  const indicador = evaluarFormulaUI(cfg.expresion, valores);
  const diferencia = cfg.menorEsMejor
    ? cfg.base - indicador
    : indicador - cfg.base;
  const ahorroUnitario = diferencia * cfg.costo;
  const ahorro = cfg.variableVolumen && valores[cfg.variableVolumen] !== undefined
    ? ahorroUnitario * valores[cfg.variableVolumen]
    : ahorroUnitario;
  return { indicador, ahorro };
}
