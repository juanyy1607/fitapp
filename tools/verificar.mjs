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

for (const js of ['db.js', 'app.js', 'sw.js']) {
  try {
    execFileSync(process.execPath, ['--check', join(RAIZ, js)], { stdio: 'pipe' });
    bien(`${js} sin errores de sintaxis`);
  } catch (e) {
    mal(`${js}: ${String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')}`);
  }
}

// db.js se carga en la página Y en el service worker. Si toca `document` o `window`,
// el service worker revienta apenas arranca y la estrategia B nunca va a funcionar.
const db = leer('db.js');
const prohibido = db.split('\n')
  .map((l, i) => ({ n: i + 1, l }))
  .filter((x) => !/^\s*(\*|\/\/|\/\*)/.test(x.l))
  .filter((x) => /\b(document|window)\b/.test(x.l));
if (prohibido.length) {
  prohibido.forEach((x) => mal(`db.js:${x.n} usa document/window: rompe adentro del service worker`));
} else {
  bien('db.js no toca document ni window (puede correr en el service worker)');
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
const ids = new Set([...app.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]));
const faltantes = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html));
if (faltantes.length) faltantes.forEach((id) => mal(`app.js busca el id "${id}" y no está en index.html`));
else bien(`los ${ids.size} ids que usa app.js existen en index.html`);

// ========================================================== 5. offline

titulo('5 · Carga offline (lista de precarga del service worker)');

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
  const enDisco = ['index.html', 'styles.css', 'app.js', 'db.js', 'manifest.webmanifest'];
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
