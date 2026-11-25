// Escenarios y textos pedagógicos.
// Todas las cifras de este archivo están citadas en README.md (sección "Fuentes").

// Subida del nivel del mar en 2100 respecto a 1995-2014.
// IPCC AR6, valores GLOBALES (no específicos de Valencia), vía EEA (2025).
// "m" es el valor central aproximado que usa la app; "rango" es el rango probable (66 %).
export const ESCENARIOS_MAR = [
  { id: 'hoy', etiqueta: 'Hoy', m: 0, rango: null,
    nota: 'Nivel medio del mar actual (las alturas del IGN se miden respecto al nivel medio en Alicante).' },
  { id: 'ssp119', etiqueta: '2100 · emisiones muy bajas', m: 0.38, rango: '0,28–0,55 m',
    nota: 'IPCC AR6, escenario SSP1-1.9. Media global, no es una cifra local de Valencia.' },
  { id: 'ssp245', etiqueta: '2100 · intermedio', m: 0.56, rango: '0,44–0,76 m',
    nota: 'IPCC AR6, escenario SSP2-4.5. Media global, no es una cifra local de Valencia.' },
  { id: 'ssp585', etiqueta: '2100 · emisiones muy altas', m: 0.77, rango: '0,63–1,02 m',
    nota: 'IPCC AR6, escenario SSP5-8.5. Media global, no es una cifra local de Valencia.' },
  { id: 'ilu2', etiqueta: 'Ilustrativo · 2 m', m: 2, rango: null,
    nota: 'ILUSTRATIVO: no corresponde a ninguna proyección para 2100. Sirve para ver cómo cambia el paisaje.' },
];

// Sobreelevación por temporal: valor ILUSTRATIVO elegido por la app, no medido.
export const TEMPORAL_M = 1.0;

// PATRICOVA 2015: periodos de retorno que ofrece el deslizador.
export const PERIODOS = [25, 100, 500];

// Calado que la app dibuja para cada franja de PATRICOVA (orientativo, decisión de la app:
// PATRICOVA solo dice "más" o "menos" de 0,8 m, no una cota exacta).
export const CALADO_DIBUJO = { alto: 1.0, bajo: 0.4 };

export const ALTURA_OJOS = 1.6; // m, persona adulta media (suposición)

export function probabilidadEnAnios(T, anios = 30) {
  return 1 - Math.pow(1 - 1 / T, anios);
}

export function textoCuerpo(prof) {
  if (prof <= 0) return 'seco';
  if (prof < 0.2) return 'por los tobillos';
  if (prof < 0.5) return 'por las rodillas';
  if (prof < 1.0) return 'por la cintura';
  if (prof < ALTURA_OJOS) return 'por el pecho';
  return 'te cubriría';
}

export const TEXTO_PERIODO = {
  25: 'Una inundación "de 25 años" tiene un 4 % de probabilidad cada año.',
  100: 'Una inundación "de 100 años" tiene un 1 % de probabilidad cada año, no ocurre "una vez por siglo".',
  500: 'Una inundación "de 500 años" tiene un 0,2 % de probabilidad cada año. Es rara, pero posible.',
};

export const LIMITES = [
  'El agua dibujada es una aproximación: el GPS puede desviarse unos metros y la brújula entre 10 y 20 grados.',
  'La altura del suelo viene de un mapa oficial (MDT05 del IGN), no del GPS. El servicio la entrega redondeada a metros enteros.',
  'PATRICOVA son zonas de planificación con periodos de retorno, no una predicción de la próxima riada. Su calado solo distingue "más" o "menos" de 0,8 m; la app dibuja 1 m o 0,4 m como valor orientativo.',
  'La subida del mar se muestra como si el agua llenara todo lo que queda por debajo de esa altura ("método bañera"). En la realidad hay diques, motas y drenajes, y zonas bajas sin conexión con el mar no se inundarían.',
  'La capa no sabe dónde hay edificios ni lomas que tapen la vista: el agua se dibuja aunque haya algo delante.',
  'No uses esta app para decisiones de seguridad. En una emergencia, sigue a Protección Civil y llama al 112.',
];
