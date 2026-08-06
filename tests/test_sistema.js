const fs=require('fs'), vm=require('vm'), path=require('path');
const TPM='/home/claude/src/tpm/TPM-TARJETAS-main';
const EHS='/home/claude/src/ehs/ehs---tornquist-2';
const RCA='/home/claude/rca-static';
let P=0,F=0,W=[];
// quita comentarios para no marcar la documentacion como residuo
const sinComentarios=t=>t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'').replace(/<!--[\s\S]*?-->/g,'');
const chk=(n,c,e='')=>{ c?P++:(F++,console.log('  ✗',n,e)); };
const warn=(n)=>W.push(n);

function load(files, expose){
  const ctx={console, URLSearchParams,
    localStorage:{_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v}},
    document:{write(){},getElementById:()=>null,querySelectorAll:()=>[],
      createElement:()=>({classList:{add(){},remove(){}}}),body:{appendChild(){}}},
    setTimeout, fetch:()=>{throw new Error('offline')}};
  vm.createContext(ctx);
  const src=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
  vm.runInContext(src+`\nglobalThis.__x={${expose}};`,ctx);
  return ctx.__x;
}

console.log('\n═══ 1. MAESTRO DE PERSONAS ═══');
const pT=load([TPM+'/personas.js'],'PERSONAS,PERSONAS_POR_SECTOR,SECTORES_ORG,sectorDe');
const pR=load([RCA+'/assets/personas.js'],'PERSONAS,PERSONAS_POR_SECTOR,SECTORES_ORG,sectorDe');
chk('TPM 157 personas', pT.PERSONAS.length===157, pT.PERSONAS.length);
chk('RCA 157 personas', pR.PERSONAS.length===157, pR.PERSONAS.length);
chk('listas IDÉNTICAS', JSON.stringify(pT.PERSONAS)===JSON.stringify(pR.PERSONAS));
chk('sectores IDÉNTICOS', JSON.stringify(pT.SECTORES_ORG)===JSON.stringify(pR.SECTORES_ORG));
chk('archivos byte-idénticos',
  fs.readFileSync(TPM+'/personas.js','utf8')===fs.readFileSync(RCA+'/assets/personas.js','utf8'));
chk('sin nombres ficticios', !pT.PERSONAS.some(p=>/^(Jefe|Supervisor|Operador|Tecnico|Responsable) /.test(p)));
chk('todos con formato "Apellido, Nombre"', pT.PERSONAS.every(p=>p.includes(',')));
chk('sin duplicados', new Set(pT.PERSONAS).size===pT.PERSONAS.length);
chk('sectores con acento', pT.SECTORES_ORG.includes('Producción')&&pT.SECTORES_ORG.includes('Ingeniería'));
chk('RRHH unificado', pT.SECTORES_ORG.includes('Recursos Humanos')&&!pT.SECTORES_ORG.includes('Relaciones Humanas'));
chk('cada persona tiene sector', pT.PERSONAS.every(p=>pT.sectorDe(p)!==''));

console.log('\n═══ 2. ÁRBOL DE EQUIPOS (3 apps) ═══');
const aT=load([TPM+'/arbol.js'],'ARBOL_EQUIPO').ARBOL_EQUIPO;
const aE=load([EHS+'/arbol.js'],'ARBOL_EQUIPO').ARBOL_EQUIPO;
const aR=load([RCA+'/assets/arbol.js'],'ARBOL').ARBOL;
const flatTPM = a=>{const s=new Set();for(const x in a)for(const y in a[x]){s.add(x+'|'+y);a[x][y].forEach(z=>s.add(x+'|'+y+'|'+z));}return s;};
const flatRCA = a=>{const s=new Set();for(const x in a)for(const y in a[x].s){s.add(x+'|'+y);a[x].s[y].e.forEach(z=>s.add(x+'|'+y+'|'+z[1]));}return s;};
const fT=flatTPM(aT), fE=flatTPM(aE), fR=flatRCA(aR);
chk('TPM 23 áreas', Object.keys(aT).length===23);
chk('EHS 23 áreas', Object.keys(aE).length===23);
chk('RCA 23 áreas', Object.keys(aR).length===23);
chk('TPM ≡ EHS', fT.size===fE.size && [...fT].every(x=>fE.has(x)));
chk('TPM ≡ RCA', fT.size===fR.size && [...fT].every(x=>fR.has(x)));
chk('TPM/EHS byte-idénticos', fs.readFileSync(TPM+'/arbol.js','utf8')===fs.readFileSync(EHS+'/arbol.js','utf8'));
chk('590 equipos', [...fT].filter(x=>x.split('|').length===3).length===590);

console.log('\n═══ 3. TURNOS ═══');
const cT=load([TPM+'/personas.js',TPM+'/comun.js'],'TURNOS').TURNOS;
const cR=load([RCA+'/assets/personas.js',RCA+'/assets/config.js'],'TURNOS').TURNOS;
const ehsTurnos=JSON.parse(fs.readFileSync(EHS+'/formulario_v2.html','utf8')
  .match(/var TURNOS = (\[.*?\]);/)[1].replace(/'/g,'"'));
chk('TPM turnos', JSON.stringify(cT)==='["A","B","C","D"]', JSON.stringify(cT));
chk('EHS turnos', JSON.stringify(ehsTurnos)==='["A","B","C","D","Diurno"]', JSON.stringify(ehsTurnos));
chk('RCA turnos', JSON.stringify(cR)==='["A","B","C","D","Diurno"]', JSON.stringify(cR));
chk('RCA ≡ EHS', JSON.stringify(cR)===JSON.stringify(ehsTurnos));
chk('TPM es subconjunto', cT.every(t=>cR.includes(t)));

console.log('\n═══ 4. LÓGICA RCA (triage + culpa) ═══');
const R=load([RCA+'/assets/personas.js',RCA+'/assets/config.js',RCA+'/assets/arbol.js',RCA+'/assets/app.js'],
  'calcularCamino,detectarCulpa,rutaCodigo,linkTarjeta,DB,esc,CONFIG');
[[181,'no','primera','claro','mecanica','C','>3h'],
 [180,'no','primera','claro','mecanica','B','=3h no fuerza'],
 [5,'si','primera','claro','mecanica','C','riesgo'],
 [5,'no','primera','claro','seguridad','C','peso3'],
 [5,'no','cronico','claro','mecanica','C','crónico'],
 [5,'no','primera','ninguno','mecanica','C','sin idea'],
 [5,'no','primera','claro','corte_hoja','B','corte corto→B'],
 [30,'no','primera','claro','mecanica','A','límite simple'],
 [31,'no','primera','claro','mecanica','B','sobre límite'],
 [0,'no','primera','claro','otro','A','sin parada']
].forEach(([t,r,rc,ce,tf,esp,d])=>chk('triage '+d, R.calcularCamino(t,r,rc,ce,tf).camino===esp,
  '→'+R.calcularCamino(t,r,rc,ce,tf).camino));
chk('triage siempre da motivo', R.calcularCamino(50,'no','repetido','dudoso','mecanica').motivos.length>0);
['El operario no prestó atención','error humano','se olvidó','por descuido']
  .forEach(t=>chk('culpa: '+t.slice(0,22), R.detectarCulpa(t)===true));
['El buje estaba desgastado','No existe estándar','La bomba cavitó','',null]
  .forEach(t=>chk('no culpa: '+String(t).slice(0,22), R.detectarCulpa(t)===false));
chk('XSS escapado', R.esc('<script>').indexOf('<')===-1);
chk('config sin API_URL (a completar)', !R.CONFIG.API_URL);

console.log('\n═══ 5. TRAZABILIDAD ENTRE APPS ═══');
chk('ruta jerárquica', R.rutaCodigo('PULPERS','PULPER D30','110')==='1-100-110');
const caso={codigo:'RCA-2026-001',codigo_ubicacion:'12-100-105',area:'SECADORES',
  subarea:'PRIMER BATERIA (1 AL 12)',equipo:'ROLLOS TELA 1º BAT'};
const lT=R.linkTarjeta(caso,{destino:'TPM',color:'roja',texto:'Sumar al PM'});
const lE=R.linkTarjeta(caso,{destino:'EHS',color:'roja',texto:'Cargar evento'});
chk('link→TPM formulario', lT.includes('seal-app-27qrt')&&lT.includes('formulario.html'));
chk('link→EHS', lE.includes('ehs-tornquist-v2'));
chk('link lleva código ubicación', lT.includes('codigo=12-100-105'));
chk('link lleva nº de caso', lT.includes('RCA-2026-001'));
chk('link sin espacios sin encodear', !lT.includes(' '));
chk('EHS guarda ruta de equipo', fs.readFileSync(EHS+'/Code_v2.gs','utf8').includes('inc_equipo_ruta'));

console.log('\n═══ 6. GUARDADO END-TO-END (RCA) ═══');
(async()=>{
  const c=await R.DB.crear({area:'SECADORES',analista:pT.PERSONAS[0],turno:'B',
    participantes:[pT.PERSONAS[1],pT.PERSONAS[2]],descripcion:'test',
    acciones:[{texto:'a1',destino:'TPM',responsable:pT.PERSONAS[3]}]});
  chk('código correlativo', /^RCA-\d{4}-001$/.test(c.codigo), c.codigo);
  chk('analista de la nómina', pT.PERSONAS.includes(c.analista));
  chk('participantes de la nómina', c.participantes.every(x=>pT.PERSONAS.includes(x)));
  chk('responsable de la nómina', pT.PERSONAS.includes(c.acciones[0].responsable));
  chk('turno formato corto', c.turno==='B');
  chk('acción con id', !!c.acciones[0].id);
  await R.DB.actualizarAccion(c.id,c.acciones[0].id,{estado:'Hecha',tarjeta_id:'TPM-77'});
  const c2=await R.DB.obtener(c.id);
  chk('vinculación tarjeta persiste', c2.acciones[0].tarjeta_id==='TPM-77');

  console.log('\n═══ 7. NAVEGACIÓN Y ARCHIVOS ═══');
  const nav=[[TPM,['index.html','formulario.html','dashboard.html','seguimiento.html','guias.html','como-funciona.html']],
             [EHS,['index.html','formulario_v2.html','dashboard_v2.html','seguimiento_v2.html','como-funciona.html']],
             [RCA,['index.html','analisis.html','seguimiento.html','como-funciona.html']]];
  nav.forEach(([base,files])=>{
    const app=path.basename(base).slice(0,12);
    files.forEach(f=>{
      const p=path.join(base,f);
      chk(app+' existe '+f, fs.existsSync(p));
      if(!fs.existsSync(p)) return;
      const s=fs.readFileSync(p,'utf8');
      (s.match(/(?:src|href)="([^":#?]+\.(?:css|js|svg|html))"/g)||[]).forEach(m=>{
        const r=m.match(/"([^"]+)"/)[1];
        if(r.startsWith('http')) return;
        chk(app+' '+f+' → '+r, fs.existsSync(path.join(base,r)));
      });
    });
  });
  [[TPM,'flujo.svg'],[EHS,'flujo.svg'],[RCA,'assets/flujo.svg']].forEach(([b,f])=>
    chk('diagrama '+path.basename(b).slice(0,8), fs.existsSync(path.join(b,f))));
  ['como-funciona.html'].forEach(()=>{
    chk('TPM index enlaza guía', fs.readFileSync(TPM+'/index.html','utf8').includes('como-funciona.html'));
    chk('EHS index enlaza guía', fs.readFileSync(EHS+'/index.html','utf8').includes('como-funciona.html'));
    chk('RCA index enlaza guía', fs.readFileSync(RCA+'/index.html','utf8').includes('como-funciona.html'));
  });

  console.log('\n═══ 8. RESIDUOS DE VERSIONES VIEJAS ═══');
  const residuos=[['#059669','esmeralda EHS'],['Inter Tight','fuente vieja'],
    ['JetBrains Mono','fuente vieja'],['Relaciones Humanas','sector viejo'],['Turno A','turno viejo']];
  [[TPM,'*.html,*.js,*.css'],[EHS,'*.html'],[RCA,'*.html']].forEach(([base])=>{
    fs.readdirSync(base).filter(f=>/\.(html|js|css)$/.test(f)).forEach(f=>{
      const s=sinComentarios(fs.readFileSync(path.join(base,f),'utf8'));
      residuos.forEach(([r,d])=>{ if(s.includes(r)) chk('residuo '+d+' en '+path.basename(base).slice(0,8)+'/'+f, false, r); });
    });
  });
  if(fs.existsSync(RCA+'/assets')) fs.readdirSync(RCA+'/assets').filter(f=>/\.(js|css)$/.test(f)).forEach(f=>{
    const s=sinComentarios(fs.readFileSync(RCA+'/assets/'+f,'utf8'));
    residuos.forEach(([r,d])=>{ if(s.includes(r)) chk('residuo '+d+' en rca/assets/'+f, false, r); });
  });
  chk('SECTORES muerto eliminado', !/const SECTORES = \[/.test(fs.readFileSync(TPM+'/comun.js','utf8')));

  console.log('\n'+'═'.repeat(46));
  console.log(`PASARON ${P}  |  FALLARON ${F}`);
  console.log('═'.repeat(46));
})();
