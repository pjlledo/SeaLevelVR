// Cámara, ubicación y orientación del móvil.

const RAD = Math.PI / 180;

export async function iniciarCamara(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  return stream;
}

export function seguirUbicacion(alCambiar, alFallar) {
  if (!('geolocation' in navigator)) {
    alFallar(new Error('Este navegador no da la ubicación'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => alCambiar({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }),
    (e) => alFallar(e),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

// En iOS el permiso de orientación DEBE pedirse dentro del toque del usuario:
// llama a esta función la primera, antes de cualquier await.
export function pedirPermisoOrientacion() {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    return DOE.requestPermission().then((r) => r === 'granted').catch(() => false);
  }
  return Promise.resolve(!!DOE);
}

// Matriz de rotación del dispositivo (convención W3C, Z-X'-Y'').
// Ejes del mundo: x = Este, y = Norte, z = Arriba.
function matriz(alpha, beta, gamma) {
  const cA = Math.cos(alpha * RAD), sA = Math.sin(alpha * RAD);
  const cB = Math.cos(beta * RAD), sB = Math.sin(beta * RAD);
  const cG = Math.cos(gamma * RAD), sG = Math.sin(gamma * RAD);
  return [
    [cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG],
    [cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB],
    [-cB * sG, sB, cB * cG],
  ];
}

const norm360 = (g) => ((g % 360) + 360) % 360;
const difAng = (a, b) => ((a - b + 540) % 360) - 180;

// Devuelve rumbo (hacia dónde mira la cámara trasera), inclinación y giro de la pantalla.
function calcularPose(alpha, beta, gamma) {
  const R = matriz(alpha, beta, gamma);
  // Hacia delante de la cámara trasera = -Z del dispositivo.
  const F = [-R[0][2], -R[1][2], -R[2][2]];
  const arribaPantallaMundo = [R[0][1], R[1][1], R[2][1]];
  const rumboCamara = norm360(Math.atan2(F[0], F[1]) / RAD);
  const rumboSuperior = norm360(Math.atan2(arribaPantallaMundo[0], arribaPantallaMundo[1]) / RAD);
  const inclinacion = Math.asin(Math.max(-1, Math.min(1, F[2])));
  // "Arriba" del mundo visto en coordenadas del dispositivo, y orientación de la pantalla.
  const U = [R[2][0], R[2][1], R[2][2]];
  const th = ((screen.orientation?.angle ?? window.orientation ?? 0) * RAD);
  const arriba = [Math.sin(th), Math.cos(th)];
  const derecha = [Math.cos(th), -Math.sin(th)];
  const giro = Math.atan2(U[0] * derecha[0] + U[1] * derecha[1], U[0] * arriba[0] + U[1] * arriba[1]);
  return { rumboCamara, rumboSuperior, inclinacion, giro, verticalidad: Math.abs(F[2]) };
}

// Escucha la orientación y llama a cb({rumbo (grados), inclinacion (rad), giro (rad), absoluta}).
export function escucharOrientacion(cb) {
  let hayAbsoluta = false;
  let desfaseIOS = null; // grados entre el alpha relativo de iOS y el norte de la brújula

  const procesar = (e, esAbsoluta) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const p = calcularPose(e.alpha, e.beta, e.gamma);
    let rumbo = p.rumboCamara;
    let absoluta = esAbsoluta;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
      // iOS: alpha no apunta al norte. Se calcula el desfase con la brújula de iOS.
      // SUPOSICIÓN (verificar en iPhone real): webkitCompassHeading sigue a la cámara cuando
      // el móvil está vertical y al borde superior cuando está plano.
      const ref = p.verticalidad < 0.7 ? p.rumboCamara : p.rumboSuperior;
      const d = difAng(e.webkitCompassHeading, ref);
      desfaseIOS = desfaseIOS == null ? d : norm360(desfaseIOS + difAng(d, desfaseIOS) * 0.05);
      rumbo = norm360(p.rumboCamara + desfaseIOS);
      absoluta = true;
    }
    cb({ rumbo, inclinacion: p.inclinacion, giro: p.giro, absoluta });
  };

  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', (e) => { hayAbsoluta = true; procesar(e, true); });
  }
  window.addEventListener('deviceorientation', (e) => {
    if (hayAbsoluta) return;
    procesar(e, !!e.absolute);
  });
}

export { norm360, difAng };
