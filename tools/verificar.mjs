/*
 * tools/verificar.mjs — Revisión automática antes de subir.
 *
 * Herramienta de desarrollo. No se sube al teléfono. Sin dependencias.
 *
 * Uso:  node tools/verificar.mjs
 *
 * Revisa lo que se puede revisar sin un navegador de verdad:
 *   1. El manifest es JSON válido y tiene lo que hace falta para instalar.
 *   2. Los íconos existen, son PNG de verdad y miden lo que dice el manifest.
 *   3. Los .js no tienen errores de sintaxis.
 *   4. Todo lo que index.html referencia existe.
 *   5. **Levanta un servidor y pide cada archivo de la lista de precarga del service
 *      worker.** Esta es la más importante: si UNO SOLO da 404, `cache.addAll` falla
 *      entero, el service worker no instala, y la app no abre sin señal. Es la causa
 *      número uno de que una PWA falle justo en el subsuelo del gimnasio.
 *
 * Lo que NO puede revisar: que el navegador registre el service worker de verdad, que
 * las notificaciones lleguen, ni que el temporizador sobreviva con la pantalla
 * bloqueada. Eso solo se sabe en un teléfono real. Para eso es el banco de pruebas.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let fallas = 0, avisos = 0;
const bien = (m) => console.log('  \x1b[32mOK\x1b[0m   ' + m);
const mal = (m) => { fallas++; console.log('  \x1b[31mFALLA\x1b[0m ' + m); };
const ojo = (m) => { avisos++; console.log('  \x1b[33mAVISO\x1b[0m ' + m); };
const titulo = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const hay = (p) => existsSync(join(RAIZ, p));

// ========================================================== 1. manifest

titulo('1 · Manifest');

let manifest = null;
try {
  manifest = JSON.parse(leer('manifest.webmanifest'));
  bien('manifest.webmanifest es JSON válido');
} catch (e) {
  mal('manifest.webmanifest no se pudo leer como JSON: ' + e.message);
}

if (manifest) {
  // Estos son los que los navegadores exigen para ofrecer "Instalar".
  for (const campo of ['name', 'start_url', 'display', 'icons']) {
    if (manifest[campo] === undefined) mal(`falta el campo obligatorio "${campo}"`);
    else bien(`${campo}: ${JSON.stringify(manifest[campo]).slice(0, 60)}`);
  }

  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
    mal(`display "${manifest.display}" no sirve para instalar (tiene que ser standalone, fullscreen o minimal-ui)`);
  }
  if (!manifest.short_name) ojo('sin short_name: el ícono en la pantalla de inicio puede quedar con el nombre cortado');
  if (!manifest.theme_color) ojo('sin theme_color');

  const tam = (manifest.icons || []).map((i) => i.sizes);
  if (!tam.some((s) => /(^|\s)192x192(\s|$)/.test(s))) mal('falta un ícono de 192x192 (lo pide Android)');
  if (!tam.some((s) => /(^|\s)512x512(\s|$)/.test(s))) mal('falta un ícono de 512x512 (lo pide Android)');
  if (!(manifest.icons || []).some((i) => (i.purpose || '').includes('maskable'))) {
    ojo('sin ícono maskable: en Android el ícono puede quedar con un recuadro blanco alrededor');
  }
}

// ========================================================== 2. íconos

titulo('2 · Íconos');

function medirPng(ruta) {
  const b = readFileSync(join(RAIZ, ruta));
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), bytes: b.length };
}

for (const icono of (manifest && manifest.icons) || []) {
  if (!hay(icono.src)) { mal(`${icono.src} no existe pero está en el manifest`); continue; }
  const d = medirPng(icono.src);
  if (!d) { mal(`${icono.src} no es un PNG válido`); continue; }
  const [w, h] = icono.sizes.split('x').map(Number);
  if (d.ancho !== w || d.alto !== h) {
    mal(`${icono.src} mide ${d.ancho}x${d.alto} pero el manifest dice ${icono.sizes}`);
  } else {
    bien(`${icono.src} — ${d.ancho}x${d.alto}, ${(d.bytes / 1024).toFixed(1)} KB`);
  }
}

// iOS ignora el manifest para el ícono: usa apple-touch-icon.
const html = leer('index.html');
const apple = html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/);
if (!apple) mal('falta <link rel="apple-touch-icon">: en iPhone el ícono sale en blanco');
else if (!hay(apple[1])) mal(`apple-touch-icon apunta a ${apple[1]} y ese archivo no existe`);
else bien(`apple-touch-icon → ${apple[1]}`);

// ========================================================== 3. sintaxis

titulo('3 · Sintaxis de los .js');

const JS_A_REVISAR = [
  'app.js', 'sw.js', 'tipos.js',
  'logica/progresion.js', 'logica/historial.js', 'logica/almacen.js',
  'logica/catalogo.js', 'logica/respaldo.js', 'logica/temporizador.js',
  'pantallas/sesion.js', 'iconos.js',
  'banco/db.js', 'banco/app.js', 'banco/sw.js'
];

for (const js of JS_A_REVISAR) {
  try {
    execFileSync(process.execPath, ['--check', join(RAIZ, js)], { stdio: 'pipe' });
    bien(`${js} sin errores de sintaxis`);
  } catch (e) {
    mal(`${js}: ${String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')}`);
  }
}

// db.js se carga en la página Y en el service worker. Si toca `document` o `window`,
// el service worker revienta apenas arranca y la estrategia B nunca va a funcionar.
const db = leer('banco/db.js');
const prohibido = db.split('\n')
  .map((l, i) => ({ n: i + 1, l }))
  .filter((x) => !/^\s*(\*|\/\/|\/\*)/.test(x.l))
  .filter((x) => /\b(document|window)\b/.test(x.l));
if (prohibido.length) {
  prohibido.forEach((x) => mal(`banco/db.js:${x.n} usa document/window: rompe adentro del service worker`));
} else {
  bien('banco/db.js no toca document ni window (puede correr en el service worker)');
}

// ========================================================== 4. referencias

titulo('4 · Referencias de index.html');

for (const m of html.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)) {
  if (hay(m[1])) bien(`${m[1]}`);
  else mal(`index.html apunta a ${m[1]} y no existe`);
}

// Todo id que app.js busca con $('...') tiene que existir en el HTML, o la app
// explota en silencio al arrancar.
const app = leer('app.js');
const ids = new Set([...app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
const faltantes = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html));
if (faltantes.length) faltantes.forEach((id) => mal(`app.js busca el id "${id}" y no está en index.html`));
else bien(`los ${ids.size} ids que usa app.js existen en index.html`);

// ========================================================== 5. offline

// ============================================== apariencia de app nativa

titulo('5 · Se ve como una app y no como una página web');

/*
 * Esta sección existe por un error real: la app se veía metida abajo del Dynamic Island
 * y nada fallaba. No hay error de consola ni test que se ponga rojo: simplemente se ve
 * mal, y solo se nota mirando un iPhone con muesca.
 *
 * La trampa es que env(safe-area-inset-*) devuelve 0 en silencio si al viewport le falta
 * viewport-fit=cover. O sea que el CSS puede estar perfecto y no hacer absolutamente nada.
 */

const css = leer('estilos.css');

/*
 * Nada de emoji como íconos.
 *
 * Cada sistema dibuja los suyos, con distinto estilo, distinto peso y colores propios
 * que pelean con el amarillo. Un emoji es el dibujo de otra persona metido en el medio
 * de nuestra interfaz. Los íconos son SVG de trazo, todos en iconos.js.
 */
const ARCHIVOS_DE_PANTALLA = ['index.html', 'estilos.css', 'app.js', 'iconos.js', 'pantallas/sesion.js'];
let conEmoji = 0;
for (const archivo of ARCHIVOS_DE_PANTALLA) {
  if (!hay(archivo)) continue;
  const texto = leer(archivo);
  const encontrados = texto.match(/\p{Extended_Pictographic}/gu);
  if (encontrados) {
    conEmoji++;
    mal(archivo + ' tiene ' + encontrados.length + ' emoji (' + [...new Set(encontrados)].join(' ') +
        '). Los íconos van como SVG de trazo en iconos.js.');
  }
}
if (!conEmoji) bien('ningún emoji en la interfaz: los íconos son SVG de trazo');

// Un solo color de acento. Si aparece un segundo, la señal amarilla deja de significar
// algo: el usuario ya no sabe que el amarillo quiere decir 'esto pasó'.
const coloresCrudos = (css.match(/#[0-9a-fA-F]{6}\b/g) || []).map((c) => c.toUpperCase());
const PERMITIDOS = new Set(['#0D1011', '#13181A', '#171C1F', '#222A2E', '#2A3235', '#1E2427',
  '#F0F3F4', '#97A2A7', '#5E696E', '#4A5458', '#FFC233', '#241D0C', '#4A3A14', '#E06A5A', '#16120A']);
const intrusos = [...new Set(coloresCrudos)].filter((c) => !PERMITIDOS.has(c));
if (intrusos.length) {
  mal('estilos.css usa colores que no están en los tokens: ' + intrusos.join(', ') +
      '. El amarillo es el único acento; si algo más tiene que destacarse, va con tamaño o peso.');
} else {
  bien('estilos.css usa solamente los colores de los tokens');
}

/*
 * La versión de app.js y la de sw.js tienen que ser la misma.
 *
 * Esto existe porque nos pasó: se cambió estilos.css, sw.js quedó igual, el navegador no
 * se enteró de que había algo nuevo, y en el teléfono se siguió viendo lo viejo. Subir
 * este número es lo que hace que el archivo del service worker cambie y el teléfono
 * busque la versión nueva.
 */
const versionApp = app.match(/const VERSION = '([^']+)'/);
const versionSw = leer('sw.js').match(/var VERSION = '([^']+)'/);

if (!versionApp) mal('app.js no define VERSION');
else if (!versionSw) mal('sw.js no define VERSION');
else if (versionApp[1] !== versionSw[1]) {
  mal('app.js dice ' + versionApp[1] + ' y sw.js dice ' + versionSw[1] + '. Tienen que ser iguales, ' +
      'o la marca que se ve en pantalla va a mentir sobre qué versión está corriendo.');
} else {
  bien('la versión de app.js y sw.js coinciden (' + versionApp[1] + ')');
}

// Sin esto, el service worker vuelve a guardar el archivo viejo que tiene el navegador
// en su propio caché, y la versión nueva no llega nunca al teléfono.
if (/cache:\s*'no-cache'/.test(leer('sw.js'))) {
  bien("sw.js revalida con cache: 'no-cache' (si no, GitHub sirve lo viejo 10 minutos)");
} else {
  mal("sw.js no usa cache: 'no-cache' al revalidar: los cambios pueden tardar 10 minutos en llegar");
}

if (/viewport-fit\s*=\s*cover/.test(html)) {
  bien('el viewport lleva viewport-fit=cover');
} else {
  mal('al <meta viewport> le falta viewport-fit=cover: sin eso env(safe-area-inset-*) ' +
      'devuelve 0 y el contenido se mete abajo del Dynamic Island');
}

for (const [nombre, patron, queEs] of [
  ['apple-mobile-web-app-capable', /name="apple-mobile-web-app-capable"\s+content="yes"/, 'abre sin la barra de Safari'],
  ['apple-mobile-web-app-status-bar-style', /name="apple-mobile-web-app-status-bar-style"/, 'el color de la barra de estado'],
  ['apple-mobile-web-app-title', /name="apple-mobile-web-app-title"/, 'el nombre abajo del ícono'],
  ['theme-color', /name="theme-color"/, 'el color del marco en Android']
]) {
  if (patron.test(html)) bien(nombre);
  else mal('falta <meta name="' + nombre + '">: ' + queEs);
}

if (/--safe-top:\s*env\(safe-area-inset-top/.test(css) && /--safe-bottom:\s*env\(safe-area-inset-bottom/.test(css)) {
  bien('estilos.css define --safe-top y --safe-bottom');
  // Mirado sobre .pantalla en particular, que es donde vive el contenido. Si el token se
  // usara solo en otra regla, la pantalla principal seguiría tapada y esto pasaría igual.
  const reglaPantalla = css.match(/\.pantalla\s*\{[^}]*\}/);
  if (reglaPantalla && /var\(--safe-top\)/.test(reglaPantalla[0])) {
    bien('.pantalla usa --safe-top para bajar el contenido');
  } else {
    mal('.pantalla no usa --safe-top: el contenido va a quedar abajo del Dynamic Island');
  }
  if (/var\(--safe-bottom\)/.test(css)) bien('y algo usa --safe-bottom para la barra de gestos');
  else mal('nadie usa --safe-bottom: la barra de abajo va a quedar tapada por la del sistema');
} else {
  mal('estilos.css no define --safe-top / --safe-bottom');
}

// El color del <meta> y el del manifest tienen que coincidir, o la app instalada cambia
// de color entre la pantalla de arranque y la app.
const metaColor = html.match(/name="theme-color"\s+content="([^"]+)"/);
if (metaColor && manifest && manifest.theme_color) {
  if (metaColor[1].toLowerCase() === String(manifest.theme_color).toLowerCase()) {
    bien('el theme-color del HTML y el del manifest coinciden (' + metaColor[1] + ')');
  } else {
    mal('theme-color del HTML (' + metaColor[1] + ') distinto al del manifest (' +
        manifest.theme_color + '): la app cambia de color al abrir');
  }
}

// Un ícono con fondo transparente queda con un recuadro blanco o negro en la pantalla de
// inicio, según el sistema. Tiene que ser opaco.
for (const icono of (manifest && manifest.icons) || []) {
  if (!hay(icono.src)) continue;
  const transparentes = contarPixelesTransparentes(join(RAIZ, icono.src));
  if (transparentes === null) ojo(icono.src + ': no se pudo leer la transparencia');
  else if (transparentes > 0) mal(icono.src + ' tiene ' + transparentes + ' píxeles transparentes: ' +
                                  'en la pantalla de inicio va a quedar con un recuadro alrededor');
  else bien(icono.src + ' es completamente opaco');
}

/** Cuenta los píxeles que no son 100% opacos. null si el PNG no se pudo leer. */
function contarPixelesTransparentes(ruta) {
  try {
    const b = readFileSync(ruta);
    if (b.readUInt8(25) !== 6) return 0;   // no es RGBA: no tiene canal alfa
    const ancho = b.readUInt32BE(16);
    const alto = b.readUInt32BE(20);
    let pos = 8;
    const partes = [];
    while (pos < b.length) {
      const largo = b.readUInt32BE(pos);
      if (b.toString('latin1', pos + 4, pos + 8) === 'IDAT') partes.push(b.subarray(pos + 8, pos + 8 + largo));
      pos += 12 + largo;
    }
    const crudo = inflateSync(Buffer.concat(partes));
    const porFila = ancho * 4 + 1;
    let cuenta = 0;
    for (let y = 0; y < alto; y++) {
      if (crudo[y * porFila] !== 0) return null;   // usa filtros: no lo sabemos leer acá
      for (let x = 0; x < ancho; x++) if (crudo[y * porFila + 1 + x * 4 + 3] !== 255) cuenta++;
    }
    return cuenta;
  } catch (e) {
    return null;
  }
}

titulo('6 · Carga offline (lista de precarga del service worker)');

const sw = leer('sw.js');
const bloque = sw.match(/var ARCHIVOS = \[([\s\S]*?)\];/);
let lista = [];
if (!bloque) {
  mal('no encontré la lista ARCHIVOS en sw.js');
} else {
  lista = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  bien(`la lista tiene ${lista.length} archivos`);
}

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json'
};

const servidor = createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const completo = join(RAIZ, ruta);
  if (!completo.startsWith(RAIZ) || !existsSync(completo) || !statSync(completo).isFile()) {
    res.writeHead(404).end('no está');
    return;
  }
  res.writeHead(200, { 'content-type': TIPOS[extname(completo)] || 'application/octet-stream' });
  res.end(readFileSync(completo));
});

servidor.listen(0, '127.0.0.1', async () => {
  const puerto = servidor.address().port;
  const base = `http://127.0.0.1:${puerto}/`;

  // Esto es exactamente lo que hace cache.addAll(): si alguna pide y no está, falla todo.
  let rotos = 0;
  for (const archivo of lista) {
    const url = new URL(archivo.replace(/^\.\//, ''), base);
    try {
      const r = await fetch(url);
      await r.arrayBuffer();   // vaciar el cuerpo libera la conexión
      if (r.ok) bien(`${r.status}  ${archivo}`);
      else { mal(`${r.status}  ${archivo} — cache.addAll va a fallar y la app NO va a abrir offline`); rotos++; }
    } catch (e) {
      mal(`${archivo} — ${e.message}`);
      rotos++;
    }
  }
  if (lista.length && !rotos) {
    bien('los ' + lista.length + ' archivos responden 200: cache.addAll no va a fallar');
  }

  // Todo archivo servible que no esté en la lista no va a estar disponible sin señal.
  const enDisco = ['index.html', 'estilos.css', 'app.js', 'manifest.webmanifest', 'tipos.js',
    'datos/reglas.json', 'datos/ejercicios.json', 'datos/conceptos.json', 'datos/rutinas.json',
    'logica/progresion.js', 'logica/historial.js', 'logica/almacen.js',
    'logica/catalogo.js', 'logica/respaldo.js', 'logica/temporizador.js',
    'iconos.js', 'pantallas/sesion.js'];
  const olvidados = enDisco.filter((f) => !lista.includes('./' + f));
  if (olvidados.length) olvidados.forEach((f) => mal(`${f} no está en la lista de precarga: no va a andar sin señal`));
  else bien('todos los archivos de la app están en la lista de precarga');

  await new Promise((r) => servidor.close(r));

  titulo('Resumen');
  console.log(`  ${fallas} fallas, ${avisos} avisos`);
  if (fallas === 0) {
    console.log('\n  Lo que se puede revisar sin navegador está bien.');
    console.log('  Falta lo que solo se puede probar en un teléfono real:');
    console.log('    · que el navegador registre el service worker');
    console.log('    · que lleguen las notificaciones');
    console.log('    · que el temporizador sobreviva con la pantalla bloqueada\n');
  }
  // Marcamos el código de salida en vez de llamar a process.exit(): forzar la salida
  // mientras fetch todavía tiene conexiones abiertas hace crashear a Node en Windows.
  process.exitCode = fallas ? 1 : 0;
});
