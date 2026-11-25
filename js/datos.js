// Consultas a los servicios oficiales, directamente desde el navegador (ambos admiten CORS).
//  - PATRICOVA 2015 (Generalitat Valenciana / ICV), ArcGIS REST, GeoJSON. CC BY.
//  - MDT05 del IGN por WCS 2.0, formato ASCII (Esri ASCII grid). CC BY 4.0 scne.es.

import { CALADO_DIBUJO } from './escenarios.js';

const ICV = 'https://carto.icv.gva.es/arcgis/rest/services/tm_infraestructuras/ordenacion_territorial/MapServer';
const WCS = 'https://servicios.idee.es/wcs-inspire/mdt';

// Capas REST: 4..9 = Peligrosidad 1..6, 10 = Peligrosidad geomorfológica (nivel 7).
const CAPAS_PELIGROSIDAD = [4, 5, 6, 7, 8, 9, 10];

export const M_POR_GRADO_LAT = 111320;
export const mPorGradoLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

// Caja aproximada de la Comunitat Valenciana (para avisar si el usuario está fuera).
export function dentroDeCV(lat, lon) {
  return lat > 37.8 && lat < 40.85 && lon > -1.55 && lon < 0.55;
}

async function pedir(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}

function caja(lat, lon, radioM) {
  const dLat = radioM / M_POR_GRADO_LAT;
  const dLon = radioM / mPorGradoLon(lat);
  return { s: lat - dLat, n: lat + dLat, o: lon - dLon, e: lon + dLon };
}

// ---------- MDT05 (IGN) ----------

export async function pedirMDT(lat, lon, radioM) {
  const c = caja(lat, lon, radioM);
  const url = `${WCS}?service=WCS&request=GetCoverage&version=2.0.1&CoverageId=Elevacion4258_5`
    + `&subset=Lat(${c.s.toFixed(6)},${c.n.toFixed(6)})&subset=Long(${c.o.toFixed(6)},${c.e.toFixed(6)})`
    + `&format=application/asc`;
  const txt = await (await pedir(url)).text();
  return parsearASC(txt);
}

// El WCS responde un multipart con el .asc dentro. Se recorta y se lee la rejilla.
export function parsearASC(txt) {
  const i = txt.search(/ncols/i);
  if (i < 0) throw new Error('El servicio de elevación no devolvió datos');
  let cuerpo = txt.slice(i);
  const fin = cuerpo.indexOf('--wcs');
  if (fin >= 0) cuerpo = cuerpo.slice(0, fin);
  const lineas = cuerpo.trim().split(/\r?\n/);
  const h = {};
  let k = 0;
  while (k < lineas.length && /^\s*[a-z_]/i.test(lineas[k])) {
    const [clave, valor] = lineas[k].trim().split(/\s+/);
    h[clave.toLowerCase()] = parseFloat(valor);
    k++;
  }
  const ncols = h.ncols, nrows = h.nrows, cs = h.cellsize;
  const x0 = h.xllcorner ?? h.xllcenter - cs / 2;
  const y0 = h.yllcorner ?? h.yllcenter - cs / 2;
  const valores = lineas.slice(k).join(' ').trim().split(/\s+/).map(Number);
  if (!ncols || !nrows || valores.length < ncols * nrows) throw new Error('Rejilla de elevación incompleta');
  const z = new Float32Array(ncols * nrows);
  for (let j = 0; j < z.length; j++) {
    const v = valores[j];
    z[j] = h.nodata_value !== undefined && v === h.nodata_value ? NaN : v;
  }
  return { ncols, nrows, cs, x0, y0, z };
}

// Índice de la celda que contiene (lat, lon); -1 si está fuera. Fila 0 = norte.
export function indiceCelda(m, lat, lon) {
  const c = Math.floor((lon - m.x0) / m.cs);
  const rs = Math.floor((lat - m.y0) / m.cs);
  if (c < 0 || c >= m.ncols || rs < 0 || rs >= m.nrows) return -1;
  return (m.nrows - 1 - rs) * m.ncols + c;
}

export function centroCelda(m, i) {
  const r = Math.floor(i / m.ncols), c = i % m.ncols;
  return { lat: m.y0 + (m.nrows - r - 0.5) * m.cs, lon: m.x0 + (c + 0.5) * m.cs };
}

// Cota interpolada (bilineal) en un punto. Los datos de origen vienen en metros enteros.
export function cotaEn(m, lat, lon) {
  const fx = (lon - m.x0) / m.cs - 0.5;
  const fy = (m.y0 + m.nrows * m.cs - lat) / m.cs - 0.5;
  const c0 = Math.max(0, Math.min(m.ncols - 2, Math.floor(fx)));
  const r0 = Math.max(0, Math.min(m.nrows - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - c0)), ty = Math.max(0, Math.min(1, fy - r0));
  const z = (r, c) => m.z[r * m.ncols + c];
  const a = z(r0, c0), b = z(r0, c0 + 1), c = z(r0 + 1, c0), d = z(r0 + 1, c0 + 1);
  const v = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  return Number.isNaN(v) ? m.z[indiceCelda(m, lat, lon)] : v;
}

// ---------- PATRICOVA 2015 (GVA / ICV) ----------

export async function pedirPatricova(lat, lon, radioM) {
  const c = caja(lat, lon, radioM);
  const env = `${c.o},${c.s},${c.e},${c.n}`;
  const consultas = CAPAS_PELIGROSIDAD.map(async (capa) => {
    const url = `${ICV}/${capa}/query?geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326`
      + `&spatialRel=esriSpatialRelIntersects&outFields=n_pelig,d_pelig,calado,retorno,zona,corriente`
      + `&returnGeometry=true&maxAllowableOffset=0.00002&geometryPrecision=6&f=geojson`;
    const j = await (await pedir(url)).json();
    if (j.error) throw new Error(j.error.message || 'Error del servicio PATRICOVA');
    return (j.features || []).map((f) => zonaDesdeFeature(f, capa)).filter(Boolean);
  });
  return (await Promise.all(consultas)).flat();
}

function zonaDesdeFeature(f, capa) {
  if (!f.geometry) return null;
  const p = f.properties || {};
  const nivel = Number(p.n_pelig) || (capa === 10 ? 7 : capa - 3);
  const geomorfologica = nivel === 7;
  const calado = String(p.calado || '');
  const alto = calado.includes('>');
  const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
    : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pol of poligonos) for (const anillo of pol) for (const [x, y] of anillo) {
    if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y;
    if (x > bbox[2]) bbox[2] = x; if (y > bbox[3]) bbox[3] = y;
  }
  return {
    nivel,
    geomorfologica,
    retorno: Number(p.retorno) || null,
    calado: calado || (geomorfologica ? 'sin calado' : ''),
    profDibujo: geomorfologica ? 0 : alto ? CALADO_DIBUJO.alto : CALADO_DIBUJO.bajo,
    descripcion: p.d_pelig || (geomorfologica ? 'Peligrosidad geomorfológica' : `Peligrosidad ${nivel}`),
    zona: p.zona || '',
    corriente: p.corriente || '',
    poligonos,
    bbox,
  };
}

// Punto en polígono (par-impar sobre todos los anillos: respeta los huecos).
function dentroPoligono(pol, x, y) {
  let dentro = false;
  for (const anillo of pol) {
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

export function zonaContiene(z, lat, lon) {
  if (lon < z.bbox[0] || lon > z.bbox[2] || lat < z.bbox[1] || lat > z.bbox[3]) return false;
  return z.poligonos.some((pol) => dentroPoligono(pol, lon, lat));
}

export function zonasEnPunto(zonas, lat, lon) {
  return zonas.filter((z) => zonaContiene(z, lat, lon)).sort((a, b) => a.nivel - b.nivel);
}

// Para cada celda del MDT: profundidad dibujada según PATRICOVA para cada periodo de retorno.
export function rasterizarZonas(m, zonas, periodos) {
  const n = m.ncols * m.nrows;
  const prof = Object.fromEntries(periodos.map((T) => [T, new Float32Array(n)]));
  const geomorf = new Uint8Array(n);
  if (!zonas.length) return { prof, geomorf };
  for (let i = 0; i < n; i++) {
    const { lat, lon } = centroCelda(m, i);
    for (const z of zonas) {
      if (!zonaContiene(z, lat, lon)) continue;
      if (z.geomorfologica) { geomorf[i] = 1; continue; }
      for (const T of periodos) {
        if (z.retorno && z.retorno <= T && z.profDibujo > prof[T][i]) prof[T][i] = z.profDibujo;
      }
    }
  }
  return { prof, geomorf };
}
