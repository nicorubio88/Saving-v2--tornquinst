# Seguimiento de Proyectos de Ahorro — Frontend

Sitio estático (HTML/CSS/JS puro, sin build) que consume el backend de
Google Apps Script. Se publica como **Static Site** en DigitalOcean App
Platform (o GitHub Pages).

## ⚠️ Antes de publicar

Abrir `js/config.js` y pegar la URL del Web App de Apps Script:

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

Sin eso, la app carga pero no muestra datos.

## Estructura

```
index.html      Dashboard (KPIs, gráficos, alerta de reposición, exportar a Excel)
proyecto.html   Detalle de un proyecto (carga de mediciones, filtros, histórico)
nuevo.html      Alta y edición de proyectos
arbol.html      Árbol de pérdidas (16 categorías JIPM) e impacto en P&L
ideas.html      Banco de ideas
css/style.css   Estilos (identidad visual Papelera del Sur)
js/config.js    ← LA URL DEL WEB APP VA ACÁ
js/api.js       Cliente HTTP contra Apps Script
js/common.js    Helpers compartidos (formato, semáforos, chips, colores)
js/formula.js   Motor de fórmulas para la simulación en vivo
js/<pagina>.js  Lógica de cada pantalla
```

## Configuración en DigitalOcean

- Tipo de componente: **Static Site** (no Web Service)
- Source Directory: **`/`** (la raíz — los .html están acá)
- Build command: *(vacío, no hay build)*
- Output directory: **`/`**

## Backend

El backend (archivos `.gs`) NO va en este repo: vive dentro del proyecto de
Google Apps Script asociado a la planilla de cálculo. Para verificar qué
versión del backend está desplegada, abrir en el navegador:

```
<URL_DEL_WEB_APP>?action=version
```
