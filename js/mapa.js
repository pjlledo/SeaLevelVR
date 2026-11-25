// Mapa a pantalla completa: se abre al pulsar el minimapa.
// Se puede desplazar con un dedo (o el ratón), hacer zoom con dos dedos (o la rueda)
// y tocar un punto para ver su cota y el agua que tendría.

import { M_POR_GRADO_LAT, mPorGradoLon } from './datos.js';

const RAD = Math.PI / 180;
const ZOOM_MIN = 0.3; // respecto al zoom que encaja toda la rejilla
const ZOOM_MAX = 12;

/**
 * obtener() debe devolver el estado actual:
 * { malla, base (canvas del relieve), zonas, lat, lon, rumbo, modo }
 * describir(lat, lon) devuelve un texto con la situación de ese punto.
 */
export function crearMapaCompleto({ seccion, lienzo, info, btnCerrar, btnCentrar, obtener, describir }) {
  const ctx = lienzo.getContext('2d');
  // Vista: centro en metros dentro de la rejilla y escala en píxeles por metro.
  const vista = { cx: 0, cy: 0, escala: 1, ajuste: 1 };
  const punteros = new Map();
  let gesto = null; // { tipo, ... }
  let marca = null; // punto tocado { lat, lon }
  let abierto = false;
  let dpr = 1;

  // Coordenadas en metros: x hacia el este desde el borde oeste, y hacia el sur desde el borde norte.
  const aMetros = (m, lat, lon) => ({
    x: (lon - m.x0) * mPorGradoLon(m.latRef),
    y: (m.y0 + m.nrows * m.csy - lat) * M_POR_GRADO_LAT,
  });
  const aGrados = (m, x, y) => ({
    lon: m.x0 + x / mPorGradoLon(m.latRef),
    lat: m.y0 + m.nrows * m.csy - y / M_POR_GRADO_LAT,
  });
  const tam = (m) => ({
    w: m.ncols * m.csx * mPorGradoLon(m.latRef),
    h: m.nrows * m.csy * M_POR_GRADO_LAT,
  });
  const malla = () => {
    const m = obtener().malla;
    if (m && m.latRef == null) m.latRef = m.y0 + (m.nrows * m.csy) / 2;
    return m;
  };
  const aPantalla = (x, y) => ({
    sx: (x - vista.cx) * vista.escala + lienzo.clientWidth / 2,
    sy: (y - vista.cy) * vista.escala + lienzo.clientHeight / 2,
  });
  const desdePantalla = (sx, sy) => ({
    x: (sx - lienzo.clientWidth / 2) / vista.escala + vista.cx,
    y: (sy - lienzo.clientHeight / 2) / vista.escala + vista.cy,
  });

  function redimensionar() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    lienzo.width = Math.round(lienzo.clientWidth * dpr);
    lienzo.height = Math.round(lienzo.clientHeight * dpr);
  }

  function centrar(conZoom) {
    const m = malla();
    const e = obtener();
    if (!m) return;
    const t = tam(m);
    vista.ajuste = Math.min(lienzo.clientWidth / t.w, lienzo.clientHeight / t.h) * 0.95;
    if (conZoom) vista.escala = vista.ajuste;
    const p = e.lat != null ? aMetros(m, e.lat, e.lon) : { x: t.w / 2, y: t.h / 2 };
    vista.cx = p.x;
    vista.cy = p.y;
  }

  function limitar() {
    const m = malla();
    if (!m) return;
    const t = tam(m);
    vista.escala = Math.max(vista.ajuste * ZOOM_MIN, Math.min(vista.ajuste * ZOOM_MAX, vista.escala));
    vista.cx = Math.max(0, Math.min(t.w, vista.cx));
    vista.cy = Math.max(0, Math.min(t.h, vista.cy));
  }

  function zoomEn(sx, sy, factor) {
    const antes = desdePantalla(sx, sy);
    vista.escala *= factor;
    limitar();
    const despues = desdePantalla(sx, sy);
    vista.cx += antes.x - despues.x;
    vista.cy += antes.y - despues.y;
    limitar();
  }

  function dibujar() {
    if (!abierto) return;
    const m = malla();
    const e = obtener();
    const W = lienzo.clientWidth, H = lienzo.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1622';
    ctx.fillRect(0, 0, W, H);
    if (!m || !e.base) {
      ctx.fillStyle = '#fff';
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aún no hay datos del terreno para este punto', W / 2, H / 2);
      ctx.textAlign = 'start';
      requestAnimationFrame(dibujar);
      return;
    }
    const t = tam(m);
    const o = aPantalla(0, 0);
    ctx.imageSmoothingEnabled = vista.escala < 1.5;
    ctx.drawImage(e.base, o.sx, o.sy, t.w * vista.escala, t.h * vista.escala);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(o.sx, o.sy, t.w * vista.escala, t.h * vista.escala);

    // Contornos de las zonas PATRICOVA
    if (e.modo === 'patricova') {
      for (const z of e.zonas || []) {
        ctx.strokeStyle = z.geomorfologica ? 'rgba(230,170,90,0.9)' : 'rgba(255,255,255,0.85)';
        ctx.setLineDash(z.geomorfologica ? [6, 4] : []);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const pol of z.poligonos) for (const anillo of pol) {
          anillo.forEach(([lon, lat], k) => {
            const p = aMetros(m, lat, lon);
            const s = aPantalla(p.x, p.y);
            if (k === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
          });
          ctx.closePath();
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Usuario y cono de visión
    if (e.lat != null) {
      const p = aMetros(m, e.lat, e.lon);
      const s = aPantalla(p.x, p.y);
      const a = (e.rumbo - 90) * RAD;
      ctx.fillStyle = 'rgba(255, 230, 120, 0.3)';
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy);
      ctx.arc(s.sx, s.sy, Math.min(W, H) * 0.35, a - 0.43, a + 0.43);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd84d';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Punto tocado
    if (marca) {
      const p = aMetros(m, marca.lat, marca.lon);
      const s = aPantalla(p.x, p.y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.sx - 9, s.sy); ctx.lineTo(s.sx + 9, s.sy);
      ctx.moveTo(s.sx, s.sy - 9); ctx.lineTo(s.sx, s.sy + 9);
      ctx.stroke();
    }

    // Norte y escala
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('N ↑', W - 40, 80);
    const opciones = [10, 20, 50, 100, 200, 500];
    const barra = opciones.find((d) => d * vista.escala > 70) || 500;
    const yb = H - 150;
    ctx.fillRect(16, yb, barra * vista.escala, 4);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${barra} m`, 16, yb - 6);

    requestAnimationFrame(dibujar);
  }

  function mostrarPunto(sx, sy) {
    const m = malla();
    if (!m) return;
    const { x, y } = desdePantalla(sx, sy);
    const t = tam(m);
    if (x < 0 || y < 0 || x > t.w || y > t.h) {
      marca = null;
      info.textContent = 'Fuera de la zona con datos (unos 300 m alrededor de ti).';
      return;
    }
    marca = aGrados(m, x, y);
    const e = obtener();
    let dist = '';
    if (e.lat != null) {
      const p = aMetros(m, e.lat, e.lon);
      const d = Math.hypot(x - p.x, y - p.y);
      dist = ` · a ${Math.round(d)} m de ti`;
    }
    info.textContent = describir(marca.lat, marca.lon) + dist;
  }

  // ---------- Gestos ----------
  lienzo.addEventListener('pointerdown', (ev) => {
    try { lienzo.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
    punteros.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY, x0: ev.offsetX, y0: ev.offsetY });
    if (punteros.size === 1) gesto = { tipo: 'mover', movido: false };
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      gesto = { tipo: 'pellizco', dist: Math.hypot(a.x - b.x, a.y - b.y), movido: true };
    }
  });
  lienzo.addEventListener('pointermove', (ev) => {
    const p = punteros.get(ev.pointerId);
    if (!p || !gesto) return;
    const dx = ev.offsetX - p.x, dy = ev.offsetY - p.y;
    p.x = ev.offsetX; p.y = ev.offsetY;
    if (gesto.tipo === 'mover' && punteros.size === 1) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 6) gesto.movido = true;
      vista.cx -= dx / vista.escala;
      vista.cy -= dy / vista.escala;
      limitar();
    } else if (gesto.tipo === 'pellizco' && punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesto.dist > 0) zoomEn((a.x + b.x) / 2, (a.y + b.y) / 2, d / gesto.dist);
      gesto.dist = d;
    }
  });
  const soltar = (ev) => {
    const p = punteros.get(ev.pointerId);
    punteros.delete(ev.pointerId);
    if (gesto?.tipo === 'mover' && !gesto.movido && p) mostrarPunto(p.x, p.y);
    if (punteros.size === 0) gesto = null;
    else if (punteros.size === 1) gesto = { tipo: 'mover', movido: true };
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomEn(ev.offsetX, ev.offsetY, Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });
  lienzo.addEventListener('dblclick', (ev) => zoomEn(ev.offsetX, ev.offsetY, 2));

  for (const [sel, f] of [['[data-zoom="+"]', 1.6], ['[data-zoom="-"]', 1 / 1.6]]) {
    seccion.querySelector(sel)?.addEventListener('click', () => zoomEn(lienzo.clientWidth / 2, lienzo.clientHeight / 2, f));
  }
  btnCentrar.addEventListener('click', () => centrar(false));
  btnCerrar.addEventListener('click', () => cerrar());
  addEventListener('resize', () => { if (abierto) { redimensionar(); centrar(false); limitar(); } });
  addEventListener('keydown', (ev) => { if (abierto && ev.key === 'Escape') cerrar(); });

  function abrir() {
    seccion.hidden = false;
    abierto = true;
    redimensionar();
    centrar(true);
    vista.escala = vista.ajuste * 1.5; // un poco de zoom de entrada, centrado en el usuario
    limitar();
    marca = null;
    info.textContent = 'Arrastra para moverte, pellizca para acercar y toca un punto para ver su altura.';
    requestAnimationFrame(dibujar);
  }
  function cerrar() {
    seccion.hidden = true;
    abierto = false;
    punteros.clear();
    gesto = null;
  }

  return { abrir, cerrar, estaAbierto: () => abierto };
}
