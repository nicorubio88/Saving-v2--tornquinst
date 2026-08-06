/* ============================================================
   CONFIGURACION · Analisis de Causa Raiz - Planta Tornquist
   ============================================================
   ESTE ES EL UNICO ARCHIVO QUE HAY QUE EDITAR.
   ============================================================ */

const CONFIG = {

  /* --- Endpoint de Google Apps Script (ver apps-script/Codigo.gs) ---
     Mientras este vacio, la app guarda en el navegador (localStorage)
     y funciona igual para probar. Al pegar la URL, pasa a guardar en
     la planilla compartida de planta. */
  API_URL: "https://script.google.com/macros/s/AKfycbyTLH-izy9qL-Y0QXXQEDFg17tpuvncHyQOWeEInayOP4rYUsmj-0jWtjX5kbmFejrJ/exec",

  /* --- Enlaces a los otros sistemas --- */
  URL_TPM:    "https://seal-app-27qrt.ondigitalocean.app",
  URL_EHS:    "https://ehs-tornquist-v2-kfwf9.ondigitalocean.app",
  URL_PORTAL: "https://coral-app-gpzhd.ondigitalocean.app/",   // completar cuando el portal este publicado

  /* --- Umbrales de triage (regla de negocio Tornquist) --- */
  UMBRAL_COMPLEJO_MIN: 180,   // mas de 3 h de parada => analisis maximo
  UMBRAL_SIMPLE_MIN:   30,    // hasta 30 min y causa clara => camino corto
};


/* ============================================================
   PERSONAS
   ============================================================
   La nomina real vive en assets/personas.js (maestro compartido
   con Tarjetas TPM y EHS). No duplicar la lista aca.
   Expone: PERSONAS, PERSONAS_POR_SECTOR, SECTORES_ORG,
           sectorDe(), opcionesPersonasAgrupadas()
   ============================================================ */

/* Turnos: mismo formato que Tarjetas TPM y EHS (no "Turno A", solo "A") */
const TURNOS = ["A", "B", "C", "D", "Diurno"];


/* ============================================================
   TIPOS DE FALLA  (especificos de planta de cartulina)
   peso 3 = fuerza siempre analisis maximo
   peso 2 = fuerza al menos analisis intermedio
   peso 1 = manda el tiempo de parada
   ============================================================ */
const TIPOS_FALLA = [
  {key:"corte_hoja",   label:"Corte de hoja / rotura de papel",                 peso:2},
  {key:"corte_bobina", label:"Rotura en rebobinadora",                          peso:2},
  {key:"marcado",      label:"Marcado / defecto superficial de hoja",           peso:2},
  {key:"calidad",      label:"Defecto de calidad (gramaje, humedad, formacion)",peso:2},
  {key:"servicios",    label:"Falla de servicios (vapor, aire, agua, energia)", peso:2},
  {key:"mecanica",     label:"Falla mecanica de equipo",                        peso:1},
  {key:"electrica",    label:"Falla electrica / instrumentacion",               peso:1},
  {key:"atasco",       label:"Atasco / obstruccion",                            peso:1},
  {key:"proceso",      label:"Desvio de proceso / parametros",                  peso:1},
  {key:"seguridad",    label:"Incidente o condicion insegura",                  peso:3},
  {key:"ambiental",    label:"Evento ambiental (derrame, residuo)",             peso:3},
  {key:"otro",         label:"Otro",                                            peso:1},
];


/* ============================================================
   CATEGORIAS DE CAUSA RAIZ -> PILAR TPM -> ACCIONES
   ============================================================ */
const CATEGORIAS_CAUSA = [
  {
    key:"estandar", titulo:"Falta un estandar o procedimiento",
    ayuda:"No estaba definido como hacerlo bien, o el estandar existia pero no servia",
    pilar:"Mejora Enfocada / Mantenimiento de Calidad", destino:"TPM", color:"verde",
    acciones:[
      "Redactar o actualizar el procedimiento del punto que fallo",
      "Validar el estandar nuevo en el puesto (Gemba), no solo en papel",
      "Subir el nivel de estandarizacion: procedimiento → checklist → ayuda visual",
      "Evaluar si se puede llegar a poka-yoke (que sea imposible hacerlo mal)",
    ]
  },
  {
    key:"capacitacion", titulo:"Falta de habilidad o capacitacion",
    ayuda:"La persona no sabia, no fue entrenada, o no tenia la practica suficiente",
    pilar:"Educacion y Entrenamiento", destino:"TPM", color:"verde",
    acciones:[
      "Disenar una capacitacion puntual sobre este tema especifico",
      "Entrenamiento en el puesto (OJT) con quien mas sabe del tema",
      "Evaluar la competencia despues de capacitar, no solo dictar la charla",
      "Actualizar la matriz de habilidades del sector",
    ]
  },
  {
    key:"mantenimiento", titulo:"Falta de mantenimiento preventivo",
    ayuda:"El componente no estaba en el plan, o el plan existe pero no alcanza",
    pilar:"Mantenimiento Planificado", destino:"TPM", color:"roja",
    acciones:[
      "Incorporar este punto al plan de mantenimiento preventivo (PM)",
      "Ajustar frecuencia de inspeccion / lubricacion / cambio de pieza",
      "Si el componente es critico, evaluar predictivo (vibracion, termografia, aceite)",
      "Verificar disponibilidad de repuesto critico en el stock ABC",
    ]
  },
  {
    key:"autonomo", titulo:"Falta de limpieza o inspeccion del operador",
    ayuda:"No se detecto a tiempo en el recorrido diario del operador",
    pilar:"Mantenimiento Autonomo", destino:"TPM", color:"azul",
    acciones:[
      "Sumar el punto al checklist diario del operador",
      "Marcar el punto en el equipo con senal visual para que se vea a simple vista",
      "Reforzarlo en el Asakai diario hasta que quede como habito",
      "Eliminar la fuente de suciedad o el area de dificil acceso que lo origina",
    ]
  },
  {
    key:"diseno", titulo:"Diseno del equipo / requiere modificacion",
    ayuda:"El equipo o el proceso tiene una limitacion de fondo que no se arregla operando mejor",
    pilar:"Mejora Enfocada / Gestion Temprana", destino:"TPM", color:"verde",
    acciones:[
      "Abrir un Kobetsu Kaizen dedicado (P0 a P7) si el problema lo justifica",
      "Evaluar automatizacion o rediseno del punto conflictivo",
      "Si requiere inversion, cargarlo como propuesta en el portafolio de CAPEX",
      "Documentar la limitacion para el proximo diseno de equipo (Gestion Temprana)",
    ]
  },
  {
    key:"seguridad", titulo:"Condicion insegura / riesgo de dano a personas",
    ayuda:"Hay riesgo para una persona, no solo para el equipo",
    pilar:"Seguridad y Medio Ambiente", destino:"EHS", color:"roja",
    acciones:[
      "Cargar el evento en el sistema EHS de planta",
      "Corregir la condicion insegura antes de volver a operar el equipo",
      "Evaluar si amerita detener el equipo hasta resolver el riesgo",
      "Revisar si hace falta reforzar EPP o senalizacion en ese punto",
    ]
  },
  {
    key:"gestion", titulo:"Falta de gestion visual, dato o comunicacion",
    ayuda:"Falto una senal clara, o se perdio informacion entre turnos",
    pilar:"TPM en Oficinas", destino:"TPM", color:"verde",
    acciones:[
      "Mejorar la gestion visual del punto (tablero, etiqueta, alarma)",
      "Estandarizar como y donde se registra este dato para que no se pierda",
      "Revisar el flujo de comunicacion entre turnos sobre este tema",
      "Definir quien es responsable de que esa informacion llegue a tiempo",
    ]
  },
  {
    key:"material", titulo:"Material o insumo fuera de especificacion",
    ayuda:"Fibra, quimico o repuesto que no cumplia lo esperado",
    pilar:"Mantenimiento de Calidad", destino:"TPM", color:"verde",
    acciones:[
      "Definir o ajustar la especificacion de recepcion del material",
      "Establecer control de ingreso antes de que el material entre al proceso",
      "Comunicar el desvio al proveedor y pedir accion correctiva",
      "Evaluar proveedor alternativo si el desvio es recurrente",
    ]
  },
];


/* ============================================================
   ESPINA DE PESCADO (6M)
   ============================================================ */
const CAT_ISHIKAWA = [
  {key:"mano_obra", label:"Mano de obra",   ayuda:"Personas: habilidad, entrenamiento, dotacion, comunicacion"},
  {key:"metodo",    label:"Metodo",         ayuda:"Como se hace: procedimiento, secuencia, parametros"},
  {key:"maquina",   label:"Maquina",        ayuda:"Equipo: desgaste, ajuste, falta de mantenimiento, diseno"},
  {key:"material",  label:"Materiales",     ayuda:"Fibra, quimicos, repuestos, insumos"},
  {key:"medicion",  label:"Medicion",       ayuda:"Instrumentos, calibracion, control, datos que faltan"},
  {key:"medio",     label:"Medio ambiente", ayuda:"Temperatura, humedad, orden y limpieza, iluminacion"},
];


/* ============================================================
   DETECTOR DE CULPA
   Guardarrail metodologico: culpar a una persona nunca es causa raiz.
   ============================================================ */
const FRASES_CULPA = [
  "error del operario","error humano","no presto atencion","no prestó atención",
  "se olvido","se olvidó","falta de atencion","falta de atención",
  "distraccion","distracción","no le importa","descuido","negligencia",
  "no hizo caso","mala praxis","culpa de","no quiso","es un vago",
  "no cumplio","no cumplió","no siguio","no siguió","mal operado",
];
