// Mapa a pantalla completa de toda la Comunitat Valenciana (se abre al pulsar el minimapa).
//
// Decisión: no se descarga PATRICOVA entero. El propio servicio del ICV dibuja las zonas
// para cada trozo del mapa (petición "export" de ArcGIS), así que se ve todo el territorio a
// cualquier escala, siempre con la versión vigente y sin mantener copias en el repositorio.
// La subida del mar se calcula con el MDT del IGN de la zona visible, con celdas más grandes
// cuanto más lejos está el zoom (de 5 m a 1 km).
//
// Usa Leaflet (BSD-2), copiado en vendor/leaflet.

import {
  COBERTURAS_MDT, CAPAS_POR_PERIODO, CAPA_GEOMORFOLOGICA, pedirRejilla, urlImagenPatricova,
  identificarPatricova, pedirMDT, cotaEn, M_POR_GRADO_LAT, mPorGradoLon,
} from './datos.js';

const L = window.L;
const CV = [[37.75, -1.65], [40.87, 0.8]]; // caja de la Comunitat Valenciana
const MAX_CELDAS = 360; // celdas por lado al pedir el MDT de la vista

const fmt = (n, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

// Capa de teselas que pide cada tesela de 256 px al servicio "export" de PATRICOVA.
function capaPatricova(obtenerCapas) {
  const Capa = L.GridLayer.extend({
    createTile(coords, hecho) {
      const img = document.createElement('img');
      img.alt = '';
      const tam = this.getTileSize();
      const nw = this._map.unproject(coords.scaleBy(tam), coords.z);
      const se = this._map.unproject(coords.add([1, 1]).scaleBy(tam), coords.z);
      const a = L.CRS.EPSG3857.project(nw), b = L.CRS.EPSG3857.project(se);
      img.onload = () => hecho(null, img);
      img.onerror = () => hecho(new Error('tesela PATRICOVA'), img);
      img.src = urlImagenPatricova([a.x, b.y, b.x, a.y], tam.x, tam.y, obtenerCapas());
      return img;
    },
  });
  return new Capa({
    opacity: 0.7,
    bounds: CV,
    attribution: 'PATRICOVA 2015 © Generalitat Valenciana / ICV (CC BY)',
  });
}

export function crearMapaCompleto({ seccion, contenedor, info, estadoEscala, btnCerrar, btnCentrar, btnTodo, obtener }) {
  let mapa = null;
  let capaPat = null;
  let capaAgua = null;
  let marcaUsuario = null;
  let marcaPunto = null;
  let abierto = false;
  let peticionAgua = null;
  let temporizador = null;

  function crear() {
    mapa = L.map(contenedor, {
      zoomControl: false,
      minZoom: 6,
      maxZoom: 18,
      maxBounds: [[36.5, -3.5], [42, 2.5]],
      attributionControl: true,
    });
    mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    const base = L.tileLayer(
      'https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0&layer=IGNBase-gris&style=default'
      + '&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}',
      { maxZoom: 18, attribution: 'Mapa base © IGN, CC BY 4.0 scne.es' },
    );
    const orto = L.tileLayer(
      'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default'
      + '&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}',
      { maxZoom: 19, attribution: 'PNOA © IGN, CC BY 4.0 scne.es' },
    );
    base.addTo(mapa);
    L.control.layers({ 'Mapa': base, 'Foto aérea': orto }, null, { position: 'topright' }).addTo(mapa);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa);

    capaPat = capaPatricova(() => {
      const e = obtener();
      return [...CAPAS_POR_PERIODO[e.periodo], CAPA_GEOMORFOLOGICA];
    });

    mapa.on('moveend', programarAgua);
    mapa.on('click', (ev) => consultarPunto(ev.latlng.lat, ev.latlng.lng));
    for (const [sel, f] of [['[data-zoom="+"]', 1], ['[data-zoom="-"]', -1]]) {
      seccion.querySelector(sel)?.addEventListener('click', () => mapa.setZoom(mapa.getZoom() + f));
    }
  }

  // ---------- Capas según el escenario ----------

  function actualizar() {
    if (!mapa) return;
    const e = obtener();
    if (e.modo === 'patricova') {
      if (capaAgua) { mapa.removeLayer(capaAgua); capaAgua = null; }
      if (!mapa.hasLayer(capaPat)) capaPat.addTo(mapa);
      else capaPat.redraw();
      estadoEscala.textContent = `Zonas PATRICOVA hasta ${e.periodo} años (en naranja claro, la peligrosidad geomorfológica).`;
    } else {
      if (mapa.hasLayer(capaPat)) mapa.removeLayer(capaPat);
      programarAgua();
    }
    if (e.lat != null) {
      if (!marcaUsuario) {
        marcaUsuario = L.circleMarker([e.lat, e.lon], {
          radius: 8, color: '#222', weight: 2, fillColor: '#ffd84d', fillOpacity: 1,
        }).bindTooltip('Tú').addTo(mapa);
      } else marcaUsuario.setLatLng([e.lat, e.lon]);
    }
  }

  function programarAgua() {
    clearTimeout(temporizador);
    temporizador = setTimeout(calcularAgua, 250);
  }

  async function calcularAgua() {
    const e = obtener();
    if (!mapa || !abierto || e.modo !== 'mar') return;
    const b = mapa.getBounds().pad(0.05);
    // Solo la parte visible que cae dentro de la Comunitat Valenciana (con un margen).
    const c = {
      s: Math.max(b.getSouth(), CV[0][0] - 0.1), n: Math.min(b.getNorth(), CV[1][0] + 0.1),
      o: Math.max(b.getWest(), CV[0][1] - 0.1), e: Math.min(b.getEast(), CV[1][1] + 0.1),
    };
    if (c.s >= c.n || c.o >= c.e) {
      if (capaAgua) { mapa.removeLayer(capaAgua); capaAgua = null; }
      estadoEscala.textContent = 'Fuera de la Comunitat Valenciana: la subida del mar solo se calcula dentro.';
      return;
    }
    const latC = (c.s + c.n) / 2;
    const ladoM = Math.max((c.e - c.o) * mPorGradoLon(latC), (c.n - c.s) * M_POR_GRADO_LAT);
    const [res, cobertura] = COBERTURAS_MDT.find(([r]) => ladoM / r <= MAX_CELDAS) || COBERTURAS_MDT.at(-1);
    peticionAgua?.abort();
    const ctl = new AbortController();
    peticionAgua = ctl;
    estadoEscala.textContent = `Calculando el agua con celdas de ${res} m…`;
    try {
      const m = await pedirRejilla(c, cobertura, ctl.signal);
      if (ctl.signal.aborted) return;
      pintarAgua(m, e.nivel);
      estadoEscala.textContent = `Mar a +${fmt(e.nivel, 2)} m. Terreno con celdas de ${res} m: `
        + (res > 25 ? 'acerca el zoom para más detalle.' : 'máximo detalle disponible.');
    } catch (err) {
      if (!ctl.signal.aborted) estadoEscala.textContent = 'No se pudo consultar la elevación del IGN para esta zona.';
    }
  }

  // Dibuja en azul las celdas por debajo del nivel elegido (y por encima de 0, porque el mar
  // ya aparece en el mapa base). Las filas se recolocan en Mercator para que encajen con el mapa.
  function pintarAgua(m, nivel) {
    const norte = m.y0 + m.nrows * m.csy, sur = m.y0;
    const oeste = m.x0, este = m.x0 + m.ncols * m.csx;
    const yMerc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const yN = yMerc(norte), yS = yMerc(sur);
    const lienzo = document.createElement('canvas');
    lienzo.width = m.ncols;
    lienzo.height = m.nrows;
    const ctx = lienzo.getContext('2d');
    const img = ctx.createImageData(m.ncols, m.nrows);
    let celdas = 0;
    for (let j = 0; j < m.nrows; j++) {
      const y = yN + ((j + 0.5) / m.nrows) * (yS - yN);
      const lat = (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;
      const r = Math.min(m.nrows - 1, Math.max(0, Math.floor((norte - lat) / m.csy)));
      for (let c = 0; c < m.ncols; c++) {
        const z = m.z[r * m.ncols + c];
        if (!(z > 0 && z < nivel)) continue;
        const k = (j * m.ncols + c) * 4;
        const prof = nivel - z;
        img.data[k] = 30; img.data[k + 1] = 120; img.data[k + 2] = 225;
        img.data[k + 3] = Math.round(255 * Math.min(0.85, 0.45 + prof / 4));
        celdas++;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (capaAgua) mapa.removeLayer(capaAgua);
    capaAgua = L.imageOverlay(lienzo.toDataURL(), [[sur, oeste], [norte, este]], {
      opacity: 0.8, attribution: 'Obra derivada de MDT CC-BY 4.0 scne.es',
      className: 'agua-pixelada',
    }).addTo(mapa);
    return celdas;
  }

  // ---------- Consulta de un punto ----------

  async function consultarPunto(lat, lon) {
    const e = obtener();
    if (marcaPunto) marcaPunto.setLatLng([lat, lon]);
    else marcaPunto = L.marker([lat, lon], { icon: L.divIcon({ className: 'marca-punto', html: '+', iconSize: [22, 22] }) }).addTo(mapa);
    info.textContent = 'Consultando este punto…';
    const partes = [];
    const [cota, zonas] = await Promise.allSettled([
      pedirMDT(lat, lon, 12).then((m) => cotaEn(m, lat, lon)),
      e.modo === 'patricova' ? identificarPatricova(lat, lon) : Promise.resolve(null),
    ]);
    if (cota.status === 'fulfilled' && Number.isFinite(cota.value)) {
      const z = cota.value;
      partes.push(`Suelo a ${fmt(z)} m`);
      if (e.modo === 'mar') {
        partes.push(z <= 0 ? 'mar' : z < e.nivel ? `agua ≈${fmt(e.nivel - z)} m` : `${fmt(z - e.nivel)} m por encima del agua`);
      }
    } else partes.push('sin altura del IGN');
    if (zonas.status === 'fulfilled' && zonas.value) {
      const enPeriodo = zonas.value.filter((z) => !z.retorno || z.retorno <= e.periodo);
      partes.push(zonas.value.length
        ? (enPeriodo[0] || zonas.value[0]).descripcion + (enPeriodo.length ? '' : ` (no entra con ${e.periodo} años)`)
        : 'fuera de zonas PATRICOVA');
    } else if (zonas.status === 'rejected') partes.push('PATRICOVA no responde');
    if (e.lat != null) {
      const d = mapa.distance([lat, lon], [e.lat, e.lon]);
      partes.push(d < 1000 ? `a ${Math.round(d)} m de ti` : `a ${fmt(d / 1000)} km de ti`);
    }
    info.textContent = partes.join(' · ');
  }

  // ---------- Abrir y cerrar ----------

  btnCerrar.addEventListener('click', () => cerrar());
  btnCentrar.addEventListener('click', () => {
    const e = obtener();
    if (e.lat != null) mapa.setView([e.lat, e.lon], 16);
  });
  btnTodo.addEventListener('click', () => mapa.fitBounds(CV));
  addEventListener('keydown', (ev) => { if (abierto && ev.key === 'Escape') cerrar(); });

  function abrir() {
    seccion.hidden = false;
    abierto = true;
    if (!mapa) crear();
    mapa.invalidateSize();
    const e = obtener();
    if (e.lat != null) mapa.setView([e.lat, e.lon], 15);
    else mapa.fitBounds(CV);
    info.textContent = 'Arrastra para moverte, pellizca para acercar y toca un punto para ver su altura y su zona.';
    actualizar();
  }
  function cerrar() {
    seccion.hidden = true;
    abierto = false;
    peticionAgua?.abort();
  }

  return { abrir, cerrar, actualizar, estaAbierto: () => abierto };
}
