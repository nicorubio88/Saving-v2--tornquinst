/**
 * Cliente HTTP contra el backend de Apps Script. Es la ÚNICA parte del
 * frontend que sabe cómo hablar con el Web App — el resto de las páginas
 * llaman a apiGet/apiPost y no les importa el detalle de CORS.
 *
 * GET:  los parámetros van en la query string. Nunca dispara un preflight
 *       CORS, así que no hay restricciones de headers.
 * POST: Apps Script no responde bien al preflight OPTIONS que dispara un
 *       Content-Type "application/json". Por eso mandamos el body como
 *       "text/plain" (no dispara preflight) y el propio Apps Script hace
 *       JSON.parse(e.postData.contents) del lado del servidor.
 *
 * REINTENTOS: Apps Script a veces devuelve HTML en vez de JSON — una página
 * de "temporalmente no disponible" de Google, o un timeout — sobre todo bajo
 * varias personas usando la app a la vez. El navegador entonces intenta
 * JSON.parse() de un HTML y explota con "Unexpected token '<'". Eso NO es un
 * bug del código: es una falla transitoria de red/infraestructura, y se
 * resuelve sola casi siempre reintentando una vez. Por eso GET reintenta
 * automático ante cualquier respuesta que no sea JSON válido (leer datos es
 * siempre seguro de repetir). Los errores de NEGOCIO (ej: "Proyecto no
 * encontrado", que sí viene como JSON con ok:false) NO se reintentan, porque
 * repetirlos daría el mismo resultado.
 */
async function apiGet(params, intentos = 3) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  for (let intento = 1; intento <= intentos; intento++) {
    let texto;
    try {
      const res = await fetch(url.toString(), { method: "GET" });
      texto = await res.text();
    } catch (e) {
      // Falla de red (sin conexión, DNS, etc.): reintentar es seguro, GET
      // nunca escribe nada.
      if (intento < intentos) { await _esperar(intento); continue; }
      throw new Error("No se pudo conectar con el servidor. Revisá tu conexión y volvé a intentar.");
    }

    let json;
    try {
      json = JSON.parse(texto);
    } catch (e) {
      // Esto es el "Unexpected token '<'": el servidor devolvió HTML en vez
      // de JSON. Reintentar (con una pequeña espera) resuelve la mayoría de
      // estos casos.
      if (intento < intentos) { await _esperar(intento); continue; }
      throw new Error("El servidor de Google tardó en responder. Volvé a intentar en unos segundos.");
    }

    if (!json.ok) throw new Error(json.error || "Error desconocido"); // error de negocio: no se reintenta
    return json.data;
  }
}

/**
 * POST (crea/edita/borra datos): acá SÍ importa distinguir bien cuándo es
 * seguro reintentar. Si la conexión falló ANTES de llegar al servidor
 * (fetch() tira una excepción), la escritura nunca ocurrió — reintentar es
 * seguro. Pero si el servidor SÍ respondió (aunque la respuesta no fuera
 * JSON válido), la escritura pudo haber ocurrido igual — ahí NO se reintenta
 * solo, para no arriesgar una carga duplicada; se avisa con un mensaje claro
 * para que la persona revise antes de volver a apretar guardar.
 */
async function apiPost(body, intentos = 2) {
  for (let intento = 1; intento <= intentos; intento++) {
    let res;
    try {
      res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Nunca llegó al servidor: reintentar es seguro.
      if (intento < intentos) { await _esperar(intento); continue; }
      throw new Error("No se pudo conectar con el servidor. Revisá tu conexión y volvé a intentar.");
    }

    const texto = await res.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch (e) {
      // El servidor respondió algo no-JSON: puede haber procesado la
      // escritura igual. No se reintenta en automático.
      throw new Error("El servidor no respondió correctamente. Revisá en el histórico si la acción se guardó antes de reintentar.");
    }

    if (!json.ok) throw new Error(json.error || "Error desconocido");
    return json.data;
  }
}

/** Espera creciente entre reintentos (400ms, 800ms, 1200ms…). */
function _esperar(intento) {
  return new Promise((resolve) => setTimeout(resolve, 400 * intento));
}
