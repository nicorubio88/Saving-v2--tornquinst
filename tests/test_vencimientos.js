const fs=require('fs'),vm=require('vm');
let P=0,F=0; const chk=(n,c,e='')=>{c?P++:(F++,console.log('  ✗',n,e));};
const blobs=[];
const ctx={console,URLSearchParams,Blob:function(p,o){blobs.push(p.join(''));this.p=p;},
  URL:{createObjectURL:()=>'blob:x'},
  localStorage:{_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v}},
  document:{write(){},getElementById:()=>null,querySelectorAll:()=>[],
    createElement:()=>({click(){},style:{},classList:{add(){},remove(){}}}),body:{appendChild(){},removeChild(){}}},
  setTimeout,fetch:()=>{throw new Error('offline')}};
vm.createContext(ctx);
vm.runInContext(['assets/personas.js','assets/config.js','assets/arbol.js','assets/app.js']
  .map(f=>fs.readFileSync(f,'utf8')).join('\n')
  +'\nglobalThis.__x={estadoVencimiento,diasHasta,resumenAcciones,VENC_LABEL,casosACSV,descargarCSV};',ctx);
const X=ctx.__x;

const d=n=>{const f=new Date();f.setDate(f.getDate()+n);return f.toISOString().slice(0,10);};
console.log('═══ VENCIMIENTOS ═══');
chk('vencida (ayer)', X.estadoVencimiento({fecha_compromiso:d(-1),estado:'Pendiente'})==='vencida');
chk('vencida (-30d)', X.estadoVencimiento({fecha_compromiso:d(-30),estado:'En curso'})==='vencida');
chk('hoy = por vencer', X.estadoVencimiento({fecha_compromiso:d(0),estado:'Pendiente'})==='por_vencer');
chk('en 3d = por vencer', X.estadoVencimiento({fecha_compromiso:d(3),estado:'Pendiente'})==='por_vencer');
chk('en 4d = en término', X.estadoVencimiento({fecha_compromiso:d(4),estado:'Pendiente'})==='en_termino');
chk('hecha aunque vencida', X.estadoVencimiento({fecha_compromiso:d(-10),estado:'Hecha'})==='hecha');
chk('sin fecha', X.estadoVencimiento({estado:'Pendiente'})==='sin_fecha');
chk('fecha inválida', X.estadoVencimiento({fecha_compromiso:'no-es-fecha',estado:'Pendiente'})==='sin_fecha');
chk('accion null', X.estadoVencimiento(null)==='sin_fecha');
chk('todos tienen label', Object.keys(X.VENC_LABEL).length===5);

console.log('═══ RESUMEN POR CASO ═══');
const caso={acciones:[
  {fecha_compromiso:d(-5),estado:'Pendiente'},
  {fecha_compromiso:d(-1),estado:'En curso'},
  {fecha_compromiso:d(2),estado:'Pendiente'},
  {fecha_compromiso:d(30),estado:'Pendiente'},
  {fecha_compromiso:d(-9),estado:'Hecha'}]};
const r=X.resumenAcciones(caso);
chk('total 5', r.total===5, r.total);
chk('vencidas 2', r.vencidas===2, r.vencidas);
chk('por vencer 1', r.por_vencer===1, r.por_vencer);
chk('hechas 1', r.hechas===1, r.hechas);
chk('caso sin acciones', X.resumenAcciones({}).total===0);
chk('caso null', X.resumenAcciones(null).total===0);

console.log('═══ CSV ═══');
const casos=[{codigo:'RCA-2026-001',area:'SECADORES',analista:'Bilbao, Sofia',
  tiempo_parada:240,causa_raiz_resumen:'no está en PM',estado:'Abierto',
  acciones:[{texto:'Sumar al PM',pilar:'MP',destino:'TPM',responsable:'Heim, Rene',
             fecha_compromiso:d(-3),estado:'Pendiente',tarjeta_id:'TPM-9'}]},
 {codigo:'RCA-2026-002',area:'PULPERS',analista:'Bender, Lucas',tiempo_parada:10,
  estado:'Cerrado',acciones:[]}];
const filas=X.casosACSV(casos);
chk('2 filas (1 por acción + 1 sin)', filas.length===2, filas.length);
chk('columnas consistentes', Object.keys(filas[0]).length===Object.keys(filas[1]).length);
chk('incluye vencimiento', filas[0].vencimiento==='Vencida', filas[0].vencimiento);
chk('caso sin acciones va igual', filas[1].codigo==='RCA-2026-002' && filas[1].accion==='');
chk('incluye tarjeta vinculada', filas[0].tarjeta==='TPM-9');
X.descargarCSV('t.csv',filas);
const csv=blobs[0];
chk('BOM para Excel', csv.charCodeAt(0)===0xFEFF);
chk('separador ;', csv.split('\r\n')[0].includes(';'));
chk('comillas escapadas', X.casosACSV([{codigo:'a"b',acciones:[]}]).length===1);
chk('sin datos avisa', (()=>{try{X.descargarCSV('x.csv',[]);return true}catch(e){return false}})());
console.log(`\nPASARON ${P} | FALLARON ${F}`);
