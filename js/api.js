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
 */
async function apiGet(params) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Error desconocido");
  return json.data;
}

async function apiPost(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Error desconocido");
  return json.data;
}
