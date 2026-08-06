/* ============================================================
   LOGICA COMPARTIDA · Analisis de Causa Raiz
   ============================================================ */

/* ---------- helpers ---------- */
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function hoyISO(){ return new Date().toISOString().slice(0,10); }
function sumarDias(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

function toast(msg, ms){
  let t=document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), ms||2600);
}


/* ============================================================
   MOTOR DE TRIAGE
   A = solo 5 Porque
   B = 5W1H + 5 Porque
   C = 5W1H + Ishikawa + 5 Porque  (analisis maximo)
   ============================================================ */
function calcularCamino(tiempo, riesgo, recurrencia, certeza, tipoFalla){
  const t = parseInt(tiempo) || 0;
  const motivos = [];
  const tf = TIPOS_FALLA.find(x=>x.key===tipoFalla);
  const peso = tf ? tf.peso : 1;
  const etiqueta = tf ? tf.label : 'sin tipificar';

  let forzarC = false;
  if(t > CONFIG.UMBRAL_COMPLEJO_MIN){
    forzarC = true;
    motivos.push(`la parada superó las 3 horas (${t} min), lo que la define como problema complejo`);
  }
  if(riesgo === 'si'){ forzarC = true; motivos.push('hubo riesgo para una persona'); }
  if(peso === 3){ forzarC = true; motivos.push(`el tipo de evento (${etiqueta}) exige análisis completo`); }
  if(recurrencia === 'cronico'){ forzarC = true; motivos.push('es un problema crónico, no un evento aislado'); }
  if(certeza === 'ninguno'){ forzarC = true; motivos.push('no hay ninguna hipótesis sobre la causa'); }
  if(forzarC) return {camino:'C', motivos};

  if(peso === 2){
    motivos.push(`el tipo de falla (${etiqueta}) requiere ordenar bien los hechos antes de buscar la causa`);
    return {camino:'B', motivos};
  }

  if(certeza==='claro' && recurrencia==='primera' && t <= CONFIG.UMBRAL_SIMPLE_MIN){
    motivos.push(`es la primera vez, la causa parece clara y el impacto es bajo (${t} min)`);
    return {camino:'A', motivos};
  }

  if(recurrencia==='repetido') motivos.push('ya se repitió, conviene ordenar los hechos antes de concluir');
  if(certeza==='dudoso') motivos.push('la hipótesis de causa no está confirmada');
  if(t > CONFIG.UMBRAL_SIMPLE_MIN) motivos.push(`el impacto no es despreciable (${t} min)`);
  if(!motivos.length) motivos.push('los datos cargados no justifican ni el camino corto ni el máximo');
  return {camino:'B', motivos};
}

const PATHS = {
  A:{tag:'Camino corto', title:'Solo 5 Porqués',
     desc:'Problema puntual, causa clara, impacto bajo. No hace falta más que preguntar por qué unas pocas veces.'},
  B:{tag:'Camino intermedio', title:'5W1H + 5 Porqués',
     desc:'Conviene ordenar bien los hechos antes de bajar a la causa, porque la certeza no es total o el tipo de falla lo amerita.'},
  C:{tag:'Camino completo · análisis máximo', title:'5W1H + Espina de pescado + 5 Porqués',
     desc:'Parada de más de 3 horas, riesgo a personas, problema crónico o sin hipótesis de causa. Corresponde el análisis más profundo.'}
};


/* ============================================================
   DETECTOR DE CULPA
   ============================================================ */
function detectarCulpa(texto){
  if(!texto) return false;
  const t = String(texto).toLowerCase();
  return FRASES_CULPA.some(f => t.includes(f));
}


/* ============================================================
   CAPA DE DATOS
   Si CONFIG.API_URL esta cargado -> Google Apps Script + Sheets
   Si no                          -> localStorage (modo prueba)
   ============================================================ */
const DB = (function(){
  const LS_KEY = 'rca_casos_v2';
  const online = () => !!(CONFIG.API_URL && CONFIG.API_URL.trim());

  function local(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch(e){ return []; }
  }
  function guardarLocal(arr){ localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

  async function api(accion, datos){
    // text/plain evita el preflight CORS que Apps Script no responde
    const r = await fetch(CONFIG.API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({accion, datos: datos||{}})
    });
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || 'Error del servidor');
    return j.data;
  }

  function proximoCodigo(casos){
    const anio = new Date().getFullYear();
    const n = casos.filter(c => (c.codigo||'').startsWith('RCA-'+anio)).length + 1;
    return 'RCA-' + anio + '-' + String(n).padStart(3,'0');
  }

  return {
    modo: () => online() ? 'planilla' : 'navegador',

    async listar(){
      if(online()) return await api('listar');
      return local();
    },

    async obtener(id){
      if(online()) return await api('obtener', {id});
      return local().find(c => String(c.id) === String(id)) || null;
    },

    async crear(caso){
      caso.creado = new Date().toISOString();
      caso.estado = caso.estado || 'Abierto';
      if(online()) return await api('crear', caso);
      const arr = local();
      caso.id = 'c' + Date.now();
      caso.codigo = proximoCodigo(arr);
      (caso.acciones||[]).forEach((a,i)=>{ a.id = caso.id+'-a'+i; a.estado = a.estado||'Pendiente'; });
      arr.unshift(caso);
      guardarLocal(arr);
      return caso;
    },

    async actualizarCaso(id, cambios){
      if(online()) return await api('actualizarCaso', {id, cambios});
      const arr = local();
      const c = arr.find(x => String(x.id)===String(id));
      if(c){ Object.assign(c, cambios); guardarLocal(arr); }
      return c;
    },

    async actualizarAccion(casoId, accionId, cambios){
      if(online()) return await api('actualizarAccion', {casoId, accionId, cambios});
      const arr = local();
      const c = arr.find(x => String(x.id)===String(casoId));
      if(c){
        const a = (c.acciones||[]).find(x => String(x.id)===String(accionId));
        if(a){ Object.assign(a, cambios); guardarLocal(arr); }
      }
      return true;
    }
  };
})();


/* ============================================================
   VENCIMIENTOS
   Misma lógica que Tarjetas TPM y EHS: una acción con fecha
   compromiso pasada y sin cerrar está vencida.
   ============================================================ */
function diasHasta(fechaISO){
  if(!fechaISO) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const f = new Date(fechaISO + 'T00:00:00');
  if(isNaN(f)) return null;
  return Math.round((f - hoy) / 86400000);
}
function estadoVencimiento(accion){
  if(!accion) return 'sin_fecha';
  if(accion.estado === 'Hecha') return 'hecha';
  const d = diasHasta(accion.fecha_compromiso);
  if(d === null) return 'sin_fecha';
  if(d < 0) return 'vencida';
  if(d <= 3) return 'por_vencer';
  return 'en_termino';
}
const VENC_LABEL = {
  vencida:   {t:'Vencida',    cls:'v-venc'},
  por_vencer:{t:'Por vencer', cls:'v-prox'},
  en_termino:{t:'En término', cls:'v-ok'},
  hecha:     {t:'Hecha',      cls:'v-hecha'},
  sin_fecha: {t:'Sin fecha',  cls:'v-nofecha'}
};
/* Resumen de un caso: cuántas acciones vencidas / por vencer tiene */
function resumenAcciones(caso){
  const acc = (caso && caso.acciones) || [];
  const r = {total:acc.length, hechas:0, vencidas:0, por_vencer:0};
  acc.forEach(a=>{
    const e = estadoVencimiento(a);
    if(e==='hecha') r.hechas++;
    else if(e==='vencida') r.vencidas++;
    else if(e==='por_vencer') r.por_vencer++;
  });
  return r;
}


/* ============================================================
   EXPORTAR CSV  (mismo criterio que Tarjetas TPM)
   ============================================================ */
function descargarCSV(nombre, filas){
  if(!filas.length){ toast('No hay datos para exportar'); return; }
  const cols = Object.keys(filas[0]);
  const esc2 = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const csv = [cols.map(esc2).join(';')]
    .concat(filas.map(f => cols.map(c => esc2(f[c])).join(';')))
    .join('\r\n');
  // BOM para que Excel en español respete los acentos
  const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function casosACSV(casos){
  const filas = [];
  casos.forEach(c=>{
    const base = {
      codigo:c.codigo, fecha:c.fecha_evento, turno:c.turno,
      area:c.area, subarea:c.subarea, equipo:c.equipo,
      codigo_ubicacion:c.codigo_ubicacion,
      analista:c.analista, tipo_falla:c.tipo_falla,
      tiempo_parada_min:c.tiempo_parada, recurrencia:c.recurrencia,
      camino:c.camino, causa_raiz:c.causa_raiz_resumen,
      contramedida_inmediata:c.contramedida_inmediata,
      expansion_horizontal:c.expansion_horizontal,
      estado_caso:c.estado, verificacion:c.resultado_verificacion || ''
    };
    const acc = c.acciones || [];
    if(!acc.length){ filas.push(Object.assign({}, base, {
      accion:'', pilar:'', destino:'', responsable:'',
      fecha_compromiso:'', estado_accion:'', vencimiento:'', tarjeta:''
    })); return; }
    acc.forEach(a=>{
      filas.push(Object.assign({}, base, {
        accion:a.texto, pilar:a.pilar, destino:a.destino,
        responsable:a.responsable || '', fecha_compromiso:a.fecha_compromiso || '',
        estado_accion:a.estado || '', vencimiento:VENC_LABEL[estadoVencimiento(a)].t,
        tarjeta:a.tarjeta_id || ''
      }));
    });
  });
  return filas;
}


/* ============================================================
   DEEP LINKS a Tarjetas TPM / EHS
   ============================================================ */
function linkTarjeta(caso, accion){
  const base = accion.destino === 'EHS' ? CONFIG.URL_EHS + '/' : CONFIG.URL_TPM + '/formulario.html';
  const p = new URLSearchParams({
    origen:'RCA',
    caso: caso.codigo || '',
    codigo: caso.codigo_ubicacion || '',
    area: caso.area || '',
    subarea: caso.subarea || '',
    equipo: caso.equipo || '',
    color: accion.color || 'verde',
    descripcion: '[' + (caso.codigo||'') + '] ' + (accion.texto||'')
  });
  return base + '?' + p.toString();
}


/* ============================================================
   NAV compartida
   ============================================================ */
function pintarNav(activa){
  const portal = CONFIG.URL_PORTAL
    ? `<a href="${CONFIG.URL_PORTAL}" class="ext">← Portal</a>` : '';
  document.write(`
  <div class="nav"><div class="nav-in">
    <a class="brand" href="index.html"><span class="sq"></span>Causa Raíz · Planta Tornquist</a>
    <div class="navlinks">
      <a href="index.html"       class="${activa==='inicio'?'active':''}">Inicio</a>
      <a href="analisis.html"    class="${activa==='nuevo'?'active':''}">Nuevo análisis</a>
      <a href="seguimiento.html" class="${activa==='hist'?'active':''}">Seguimiento</a>
      <a href="como-funciona.html" class="${activa==='como'?'active':''}">Cómo funciona</a>
      ${portal}
    </div>
  </div></div>`);
}

function pintarFooter(){
  const modo = DB.modo()==='navegador'
    ? ' · <span style="color:var(--amber-ink);font-weight:700">modo prueba: se guarda en este navegador</span>' : '';
  document.write(`<footer>Planta Tornquist · Papelera del Sur — Grupo H. Koch${modo}</footer>`);
}
