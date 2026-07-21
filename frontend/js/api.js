/**
 * Cliente para hablar con el backend de Apps Script.
 * GET: parámetros en query string (nunca dispara preflight).
 * POST: Content-Type text/plain con JSON como texto (evita el preflight
 * OPTIONS que Apps Script no responde correctamente).
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

function fmtMoney(n) {
  return "US$ " + Math.round(n || 0).toLocaleString("es-AR");
}
