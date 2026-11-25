import {
  ESCENARIOS_MAR, TEMPORAL_M, PERIODOS, ALTURA_OJOS, LIMITES, TEXTO_PERIODO,
  probabilidadEnAnios, textoCuerpo,
} from './escenarios.js';
import {
  pedirMDT, pedirPatricova, cotaEn, indiceCelda, centroCelda, zonasEnPunto, rasterizarZonas,
  dentroDeCV, M_POR_GRADO_LAT, mPorGradoLon,
} from './datos.js';
import {
  iniciarCamara, seguirUbicacion, pedirPermisoOrientacion, escucharOrientacion, norm360,
} from './sensores.js';
import { dibujarAgua, pintarMapaBase, dibujarMinimapa } from './render.js';

// Radio de datos alrededor del usuario (m). Unos 120 x 150 celdas de 5 m.
const RADIO_DATOS = 300;
// Distancia que hay que moverse para volver a pedir datos (m).
const RECARGA_M = 80;

// Lugares de ejemplo (coordenadas aproximadas, elegidas para la demostración).
const LUGARES_DEMO = [
  { nombre: 'Alzira, junto al Júcar', lat: 39.152, lon: -0.435, nota: 'Zona PATRICOVA de 100 años' },
  { nombre: 'Paiporta, barranco del Poyo', lat: 39.4275, lon: -0.4175, nota: 'Zona afectada por la DANA de 2024' },
  { nombre: 'El Palmar, Albufera', lat: 39.3095, lon: -0.3175, nota: 'Terreno a 1-2 m sobre el mar' },
  { nombre: 'Pinedo, junto a la playa', lat: 39.4185, lon: -0.3345, nota: 'Costa baja al sur de Valencia' },
  { nombre: 'Valencia, plaza del Ayuntamiento', lat: 39.4699, lon: -0.3763, nota: 'Centro de la ciudad' },
];

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

const estado = {
  modo: 'patricova',
  periodo: 100,
  nivelMar: 0.56,
  temporal: false,
  posicion: null, // { lat, lon, precision }
  fuentePos: null, // 'gps' | 'demo'
  centroDatos: null,
  malla: null,
  zonas: [],
  raster: null,
  superficie: null,
  mapaBase: null,
  errores: {},
  cargando: false,
  orientacion: { rumbo: 0, inclinacion: -10 * Math.PI / 180, giro: 0, absoluta: false },
  hayOrientacion: false,
  ajusteNorte: 0,
  camara: false,
};

// ---------- Inicio y permisos ----------

$('#btn-empezar').addEventListener('click', async () => {
  // iOS: el permiso de orientación tiene que pedirse lo primero, dentro del toque.
  const permisoOrientacion = pedirPermisoOrientacion();
  mostrarApp();
  const okOrientacion = await permisoOrientacion;
  activarOrientacion(okOrientacion);
  try {
    await iniciarCamara($('#video'));
    estado.camara = true;
  } catch (e) {
    usarFondoDemo();
    avisar('No se ha podido abrir la cámara. Se muestra un fondo de ejemplo.');
  }
  estado.fuentePos = 'gps';
  seguirUbicacion(
    (p) => { if (estado.fuentePos === 'gps') nuevaPosicion(p); },
    (e) => {
      estado.errores.gps = e.code === 1 ? 'Permiso de ubicación denegado' : 'No se obtiene la ubicación';
      actualizarTextos();
      if (!estado.posicion) avisar('Sin ubicación. Puedes probar con un lugar de ejemplo desde el botón (i).');
    },
  );
});

$('#btn-demo').addEventListener('click', () => { $('#inicio').hidden = true; $('#demo').hidden = false; });
$('#btn-demo-volver').addEventListener('click', () => { $('#demo').hidden = true; $('#inicio').hidden = false; });

const listaDemo = $('#lista-demo');
for (const l of LUGARES_DEMO) {
  const b = document.createElement('button');
  b.innerHTML = `${l.nombre}<small>${l.nota}</small>`;
  b.addEventListener('click', async () => {
    const permiso = pedirPermisoOrientacion();
    $('#demo').hidden = true;
    mostrarApp();
    activarOrientacion(await permiso);
    try { await iniciarCamara($('#video')); estado.camara = true; } catch { usarFondoDemo(); }
    estado.fuentePos = 'demo';
    nuevaPosicion({ lat: l.lat, lon: l.lon, precision: 0, nombre: l.nombre });
  });
  listaDemo.appendChild(b);
}

function mostrarApp() {
  $('#inicio').hidden = true;
  $('#app').hidden = false;
  redimensionar();
  requestAnimationFrame(bucle);
}

function usarFondoDemo() {
  $('#video').hidden = true;
  $('#fondo-demo').hidden = false;
}

function activarOrientacion(ok) {
  if (ok) {
    escucharOrientacion((o) => {
      estado.hayOrientacion = true;
      const a = estado.orientacion;
      // Suavizado para que la capa no tiemble.
      const d = ((o.rumbo - a.rumbo + 540) % 360) - 180;
      a.rumbo = norm360(a.rumbo + d * 0.25);
      a.inclinacion += (o.inclinacion - a.inclinacion) * 0.25;
      a.giro += (o.giro - a.giro) * 0.25;
      a.absoluta = o.absoluta;
    });
  }
  // Si en 1,5 s no llegan datos de orientación, se activa el arrastre con el dedo.
  setTimeout(() => {
    if (!estado.hayOrientacion) {
      avisar('Sin sensores de orientación: arrastra la imagen para girar y mirar arriba o abajo.');
      activarArrastre();
    }
    $('#calibrar').hidden = false;
    actualizarTextos();
  }, 1500);
}

function activarArrastre() {
  const capa = $('#capa');
  let ultimo = null;
  capa.addEventListener('pointerdown', (e) => { ultimo = [e.clientX, e.clientY]; capa.setPointerCapture(e.pointerId); });
  capa.addEventListener('pointermove', (e) => {
    if (!ultimo || estado.hayOrientacion) return;
    const o = estado.orientacion;
    o.rumbo = norm360(o.rumbo - (e.clientX - ultimo[0]) * 0.2);
    o.inclinacion = Math.max(-1.2, Math.min(0.6, o.inclinacion + (e.clientY - ultimo[1]) * 0.003));
    ultimo = [e.clientX, e.clientY];
  });
  capa.addEventListener('pointerup', () => { ultimo = null; });
}

$('#btn-izq').addEventListener('click', () => { estado.ajusteNorte -= 5; actualizarTextos(); });
$('#btn-der').addEventListener('click', () => { estado.ajusteNorte += 5; actualizarTextos(); });

// ---------- Datos ----------

function distanciaM(a, b) {
  const dy = (a.lat - b.lat) * M_POR_GRADO_LAT;
  const dx = (a.lon - b.lon) * mPorGradoLon(a.lat);
  return Math.hypot(dx, dy);
}

function nuevaPosicion(p) {
  estado.posicion = p;
  delete estado.errores.gps;
  if (!estado.centroDatos || distanciaM(p, estado.centroDatos) > RECARGA_M) cargarDatos(p);
  else recalcular();
}

async function cargarDatos(p) {
  if (estado.cargando) return;
  estado.cargando = true;
  estado.centroDatos = { lat: p.lat, lon: p.lon };
  actualizarTextos();
  const [mdt, pat] = await Promise.allSettled([
    pedirMDT(p.lat, p.lon, RADIO_DATOS),
    pedirPatricova(p.lat, p.lon, RADIO_DATOS),
  ]);
  estado.cargando = false;
  if (mdt.status === 'fulfilled') { estado.malla = mdt.value; delete estado.errores.mdt; }
  else { estado.errores.mdt = 'No se pudo consultar la elevación del IGN'; console.warn(mdt.reason); }
  if (pat.status === 'fulfilled') { estado.zonas = pat.value; delete estado.errores.patricova; }
  else { estado.zonas = []; estado.errores.patricova = 'No se pudo consultar PATRICOVA'; console.warn(pat.reason); }
  estado.raster = estado.malla ? rasterizarZonas(estado.malla, estado.zonas, PERIODOS) : null;
  recalcular();
}

// Superficie del agua (cota en m) en cada celda; NaN = seco.
function recalcular() {
  const m = estado.malla;
  if (!m) { estado.superficie = null; actualizarTextos(); return; }
  const sup = new Float32Array(m.z.length).fill(NaN);
  if (estado.modo === 'mar') {
    const W = nivelAgua();
    for (let i = 0; i < m.z.length; i++) {
      const z = m.z[i];
      if (Number.isNaN(z)) continue;
      // El MDT pone el mar a 0 m: el mar siempre se dibuja.
      if (z <= 0 || z < W) sup[i] = Math.max(W, 0);
    }
  } else if (estado.raster) {
    const prof = estado.raster.prof[estado.periodo];
    for (let i = 0; i < m.z.length; i++) if (prof[i] > 0 && !Number.isNaN(m.z[i])) sup[i] = m.z[i] + prof[i];
  }
  estado.superficie = sup;
  estado.mapaBase = pintarMapaBase(m, sup, estado.raster?.geomorf, estado.modo === 'patricova');
  actualizarTextos();
}

function nivelAgua() {
  return estado.nivelMar + (estado.temporal ? TEMPORAL_M : 0);
}

// Situación en el punto del usuario.
function analisis() {
  const p = estado.posicion, m = estado.malla;
  if (!p || !m) return null;
  const suelo = cotaEn(m, p.lat, p.lon);
  const i = indiceCelda(m, p.lat, p.lon);
  const zonasAqui = zonasEnPunto(estado.zonas, p.lat, p.lon);
  let prof = 0;
  if (estado.modo === 'mar') prof = Math.max(0, nivelAgua() - suelo);
  else if (i >= 0 && estado.raster) prof = estado.raster.prof[estado.periodo][i];
  // Agua más cercana
  let cerca = null;
  if (estado.superficie) {
    const mLon = mPorGradoLon(p.lat);
    for (let k = 0; k < estado.superficie.length; k++) {
      if (Number.isNaN(estado.superficie[k])) continue;
      const c = centroCelda(m, k);
      const dx = (c.lon - p.lon) * mLon, dy = (c.lat - p.lat) * M_POR_GRADO_LAT;
      const d = Math.hypot(dx, dy);
      if (!cerca || d < cerca.d) cerca = { d, rumbo: norm360((Math.atan2(dx, dy) * 180) / Math.PI) };
    }
  }
  return { suelo, prof, zonasAqui, cerca };
}

const PUNTOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
const puntoCardinal = (g) => PUNTOS[Math.round(g / 45) % 8];

// ---------- Textos ----------

function actualizarTextos() {
  const p = estado.posicion;
  const a = analisis();
  const chips = [];
  if (p) {
    chips.push(estado.fuentePos === 'demo' ? `📍 Ejemplo: ${p.nombre}` : `📍 GPS ±${Math.round(p.precision)} m`);
    if (!dentroDeCV(p.lat, p.lon)) chips.push(['⚠️ Fuera de la Comunitat Valenciana: PATRICOVA no cubre este punto', true]);
  }
  if (estado.cargando) chips.push('⏳ Consultando PATRICOVA y el MDT…');
  if (a) chips.push(`⛰️ Suelo ${fmt(a.suelo)} m (IGN)`);
  if (a && estado.modo === 'patricova') {
    chips.push(a.zonasAqui.length
      ? [`🌊 Aquí: ${a.zonasAqui[0].descripcion}`, true]
      : '🌊 Aquí: fuera de zonas PATRICOVA');
  }
  if (estado.hayOrientacion && !estado.orientacion.absoluta) chips.push(['🧭 Sin norte magnético: usa «Ajustar norte»', true]);
  for (const e of Object.values(estado.errores)) chips.push([`⚠️ ${e}`, true]);
  $('#chips').innerHTML = '';
  for (const c of chips) {
    const [t, alerta] = Array.isArray(c) ? c : [c, false];
    const s = document.createElement('span');
    s.className = 'chip' + (alerta ? ' alerta' : '');
    s.textContent = t;
    s.title = t;
    $('#chips').appendChild(s);
  }
  $('#ajuste').textContent = `${estado.ajusteNorte > 0 ? '+' : ''}${estado.ajusteNorte}°`;

  // Controles
  $('#periodo-valor').textContent = `${estado.periodo} años`;
  const W = nivelAgua();
  $('#nivel-valor').textContent = `+${fmt(estado.nivelMar, 2)} m${estado.temporal ? ` + temporal = ${fmt(W, 2)} m` : ''}`;
  for (const b of document.querySelectorAll('#chips-mar button')) {
    b.classList.toggle('activo', Math.abs(Number(b.dataset.m) - estado.nivelMar) < 0.001);
  }

  // Frase principal
  const frase = $('#frase'), detalle = $('#detalle');
  let prof = 0;
  if (!p) { frase.textContent = 'Buscando tu ubicación…'; detalle.textContent = ''; }
  else if (!a) {
    frase.textContent = estado.cargando ? 'Consultando los mapas oficiales…' : 'Sin datos de elevación para este punto';
    detalle.textContent = '';
  } else {
    prof = a.prof;
    const cerca = a.cerca && a.cerca.d > 8
      ? `El agua más cercana está a unos ${Math.round(a.cerca.d / 10) * 10} m hacia el ${puntoCardinal(a.cerca.rumbo)}.`
      : '';
    if (estado.modo === 'patricova') {
      if (prof > 0) {
        frase.textContent = `Aquí el agua llegaría ${textoCuerpo(prof)} (≈${fmt(prof)} m)`;
        const z = a.zonasAqui.find((zz) => !zz.geomorfologica);
        detalle.textContent = `${z ? z.descripcion + '. ' : ''}El calado dibujado es orientativo.`;
      } else {
        const zonaMayor = a.zonasAqui.find((z) => !z.geomorfologica);
        frase.textContent = zonaMayor
          ? `Con ${estado.periodo} años este punto no se inunda; con ${zonaMayor.retorno} años, sí`
          : `Este punto no está en zona inundable de ${estado.periodo} años`;
        detalle.textContent = a.zonasAqui.some((z) => z.geomorfologica)
          ? 'Estás en zona de peligrosidad geomorfológica: el relieve indica que el agua ha pasado por aquí, sin calado calculado. '
          : '';
        detalle.textContent += cerca || (estado.zonas.length ? '' : 'No hay zonas PATRICOVA en unos 300 m.');
      }
      const prob = Math.round(probabilidadEnAnios(estado.periodo) * 100);
      $('#nota-escenario').textContent = `${TEXTO_PERIODO[estado.periodo]} En 30 años, la probabilidad de vivir al menos una es del ${prob} %.`;
    } else {
      const margen = a.suelo - W;
      if (prof > 0) {
        frase.textContent = `El mar llegaría ${textoCuerpo(prof)} (≈${fmt(prof)} m)`;
        detalle.textContent = `Tu suelo está a ${fmt(a.suelo)} m y el agua a ${fmt(W, 2)} m sobre el nivel actual.`;
      } else {
        frase.textContent = `El agua quedaría ${fmt(margen)} m por debajo de tus pies`;
        detalle.textContent = cerca;
      }
      const esc = ESCENARIOS_MAR.find((e) => Math.abs(e.m - estado.nivelMar) < 0.001);
      $('#nota-escenario').textContent = (esc ? esc.nota + (esc.rango ? ` Rango probable: ${esc.rango}.` : '') : 'Valor elegido a mano.')
        + ' El cálculo pinta todo lo que queda por debajo de ese nivel, esté o no conectado con el mar.'
        + (estado.temporal ? ' El temporal (+1 m) es ilustrativo.' : '');
    }
  }
  // Regla del cuerpo: 90 unidades = 1,8 m
  const hAgua = Math.min(90, (prof / 1.8) * 90);
  $('#regla-agua').setAttribute('y', String(90 - hAgua));
  $('#regla-agua').setAttribute('height', String(hAgua));
}

// ---------- Controles ----------

for (const b of document.querySelectorAll('.modos button')) {
  b.addEventListener('click', () => {
    estado.modo = b.dataset.modo;
    for (const o of document.querySelectorAll('.modos button')) o.classList.toggle('activo', o === b);
    $('#ctl-patricova').hidden = estado.modo !== 'patricova';
    $('#ctl-mar').hidden = estado.modo !== 'mar';
    recalcular();
  });
}
$('#periodo').addEventListener('input', (e) => { estado.periodo = PERIODOS[Number(e.target.value)]; recalcular(); });
$('#nivel').addEventListener('input', (e) => { estado.nivelMar = Number(e.target.value); recalcular(); });
$('#temporal').addEventListener('change', (e) => { estado.temporal = e.target.checked; recalcular(); });
for (const esc of ESCENARIOS_MAR) {
  const b = document.createElement('button');
  b.textContent = esc.etiqueta;
  b.dataset.m = esc.m;
  b.addEventListener('click', () => {
    estado.nivelMar = esc.m;
    $('#nivel').value = String(esc.m);
    recalcular();
  });
  $('#chips-mar').appendChild(b);
}
for (const t of LIMITES) {
  const li = document.createElement('li');
  li.textContent = t;
  $('#lista-limites').appendChild(li);
}
$('#btn-info').addEventListener('click', () => $('#info').showModal());

let temporizadorAviso;
function avisar(t) {
  const el = $('#aviso-flotante');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 6000);
}

// ---------- Dibujo ----------

const capa = $('#capa');
const ctx = capa.getContext('2d');
const mini = $('#minimapa');
const ctxMini = mini.getContext('2d');
let dpr = 1;

function redimensionar() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  capa.width = Math.round(innerWidth * dpr);
  capa.height = Math.round(innerHeight * dpr);
  mini.width = mini.height = Math.round(132 * dpr);
}
addEventListener('resize', redimensionar);

function bucle() {
  const p = estado.posicion;
  const o = estado.orientacion;
  const rumbo = norm360(o.rumbo + estado.ajusteNorte);
  const a = p && estado.malla ? cotaEn(estado.malla, p.lat, p.lon) : null;
  let cubierto = false;
  let ojos = 0;
  if (a != null) {
    ojos = a + ALTURA_OJOS;
    const i = indiceCelda(estado.malla, p.lat, p.lon);
    const s = i >= 0 && estado.superficie ? estado.superficie[i] : NaN;
    cubierto = !Number.isNaN(s) && s >= ojos;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dibujarAgua(ctx, innerWidth, innerHeight, {
    malla: estado.malla, superficie: estado.superficie,
    lat: p?.lat, lon: p?.lon, ojos, rumbo, inclinacion: o.inclinacion, giro: o.giro, cubierto,
  });
  ctxMini.setTransform(dpr, 0, 0, dpr, 0, 0);
  dibujarMinimapa(ctxMini, 132, estado.mapaBase, estado.malla, p?.lat, p?.lon, rumbo);
  requestAnimationFrame(bucle);
}

// Para pruebas: ?lat=39.152&lon=-0.435 salta la pantalla de inicio en modo ejemplo.
const q = new URLSearchParams(location.search);
if (q.has('lat') && q.has('lon')) {
  mostrarApp();
  usarFondoDemo();
  activarOrientacion(false);
  estado.fuentePos = 'demo';
  nuevaPosicion({ lat: Number(q.get('lat')), lon: Number(q.get('lon')), precision: 0, nombre: q.get('nombre') || 'punto de la URL' });
}
