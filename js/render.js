// Dibujo de la capa de agua sobre la cámara y del minimapa.

import { indiceCelda, M_POR_GRADO_LAT, mPorGradoLon } from './datos.js';

const RAD = Math.PI / 180;

// Campo de visión del lado largo de la pantalla. SUPOSICIÓN: ~65° es típico de la cámara
// principal de un móvil; cada modelo es distinto y el recorte "cover" del vídeo también influye.
export const FOV_LADO_LARGO = 65 * RAD;

/**
 * Dibuja la lámina de agua.
 * Para cada columna de la pantalla se calcula el rumbo que representa y se recorre el terreno
 * en esa dirección. Donde la celda está inundada, se proyecta la superficie del agua a la pantalla
 * según la altura de los ojos del usuario y la inclinación del móvil.
 *
 * e = { malla, superficie (Float32Array, NaN = seco), lat, lon, ojos (cota de los ojos, m),
 *       rumbo (grados), inclinacion (rad), giro (rad), cubierto (bool) }
 */
export function dibujarAgua(ctx, ancho, alto, e) {
  ctx.clearRect(0, 0, ancho, alto);
  const f = Math.max(ancho, alto) / 2 / Math.tan(FOV_LADO_LARGO / 2);
  ctx.save();
  ctx.translate(ancho / 2, alto / 2);
  ctx.rotate(e.giro || 0);
  const semi = Math.hypot(ancho, alto) / 2 + 4;

  // Horizonte
  const yHorizonte = f * Math.tan(e.inclinacion);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-semi, yHorizonte);
  ctx.lineTo(semi, yHorizonte);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('horizonte', -semi + 24, yHorizonte - 6);

  if (e.cubierto) {
    // El agua quedaría por encima de los ojos.
    ctx.fillStyle = 'rgba(20, 90, 160, 0.55)';
    ctx.fillRect(-semi, -semi, semi * 2, semi * 2);
    ctx.restore();
    return;
  }
  if (!e.malla || !e.superficie) { ctx.restore(); return; }

  const m = e.malla;
  const mLon = mPorGradoLon(e.lat);
  const paso = 4; // píxeles por columna
  const pasoM = 2; // metros entre muestras del terreno
  const radio = Math.min(m.ncols * m.csx * mLon, m.nrows * m.csy * M_POR_GRADO_LAT) / 2;
  const grad = ctx.createLinearGradient(0, yHorizonte, 0, yHorizonte + alto);
  grad.addColorStop(0, 'rgba(70, 170, 230, 0.35)');
  grad.addColorStop(1, 'rgba(20, 100, 190, 0.6)');

  const orillas = [];
  ctx.fillStyle = grad;
  for (let x = -semi; x < semi; x += paso) {
    const az = e.rumbo * RAD + Math.atan(x / f);
    const sx = Math.sin(az), cy = Math.cos(az);
    let yCerca = null, yLejos = null, dInicio = 0;
    const cerrar = () => {
      if (yCerca != null) {
        ctx.fillRect(x, yLejos, paso + 0.5, Math.max(1, yCerca - yLejos));
        if (dInicio > 1) orillas.push([x, yCerca]);
      }
      yCerca = yLejos = null;
    };
    for (let d = 1; d <= radio; d += pasoM) {
      const i = indiceCelda(m, e.lat + (cy * d) / M_POR_GRADO_LAT, e.lon + (sx * d) / mLon);
      if (i < 0) break;
      const s = e.superficie[i];
      if (Number.isNaN(s)) { cerrar(); continue; }
      let rel = Math.atan2(s - e.ojos, d) - e.inclinacion;
      rel = Math.max(-1.45, Math.min(1.45, rel));
      const y = -f * Math.tan(rel);
      if (yCerca == null) { yCerca = d <= 1 ? semi : y; dInicio = d; }
      yLejos = y;
    }
    cerrar();
  }
  // Orilla: donde empieza el agua en cada columna.
  ctx.fillStyle = 'rgba(210, 240, 255, 0.95)';
  for (const [x, y] of orillas) ctx.fillRect(x, y - 1.5, paso + 0.5, 3);
  ctx.restore();
}

/**
 * Minimapa visto desde arriba (norte arriba): relieve en grises, agua en azul,
 * zonas geomorfológicas en naranja claro, usuario y cono de visión.
 */
export function pintarMapaBase(m, superficie, geomorf, mostrarGeomorf) {
  const lienzo = document.createElement('canvas');
  lienzo.width = m.ncols;
  lienzo.height = m.nrows;
  const ctx = lienzo.getContext('2d');
  const img = ctx.createImageData(m.ncols, m.nrows);
  let min = Infinity, max = -Infinity;
  for (const v of m.z) if (!Number.isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
  const rango = Math.max(1, max - min);
  for (let i = 0; i < m.z.length; i++) {
    const v = m.z[i];
    let r, g, b;
    const gris = Number.isNaN(v) ? 40 : 60 + Math.round(((v - min) / rango) * 150);
    r = g = b = gris;
    if (mostrarGeomorf && geomorf && geomorf[i]) { r = 200; g = 150; b = 90; }
    const s = superficie ? superficie[i] : NaN;
    if (!Number.isNaN(s)) {
      const prof = Math.max(0, s - v);
      const k = Math.min(1, 0.45 + prof / 3);
      r = Math.round(r * (1 - k) + 25 * k);
      g = Math.round(g * (1 - k) + 120 * k);
      b = Math.round(b * (1 - k) + 220 * k);
    }
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return lienzo;
}

export function dibujarMinimapa(ctx, lado, base, m, lat, lon, rumbo) {
  ctx.clearRect(0, 0, lado, lado);
  if (!base || !m) return;
  const anchoM = m.ncols * m.csx * mPorGradoLon(lat);
  const altoM = m.nrows * m.csy * M_POR_GRADO_LAT;
  const escala = lado / Math.max(anchoM, altoM);
  const w = anchoM * escala, h = altoM * escala;
  const ox = (lado - w) / 2, oy = (lado - h) / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, ox, oy, w, h);
  // Posición del usuario dentro de la rejilla
  const px = ox + ((lon - m.x0) / (m.ncols * m.csx)) * w;
  const py = oy + (1 - (lat - m.y0) / (m.nrows * m.csy)) * h;
  // Cono de visión
  const a = (rumbo - 90) * RAD;
  const ab = FOV_LADO_LARGO * 0.38;
  ctx.fillStyle = 'rgba(255, 230, 120, 0.35)';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, lado * 0.45, a - ab, a + ab);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd84d';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Norte
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('N', lado / 2 - 4, 12);
  // Escala
  const barraM = 100;
  ctx.fillRect(8, lado - 10, barraM * escala, 3);
  ctx.fillText('100 m', 8, lado - 14);
}
