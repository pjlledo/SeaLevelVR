# Sea Level VR · prototipo

Webapp educativa para el móvil: apuntas con la cámara y ves dibujada hasta dónde llegaría el agua en una **inundación** (mapas oficiales PATRICOVA) o con una **subida del nivel del mar**, calculada con la altura real del terreno. Zona inicial: Comunitat Valenciana.

> ⚠️ Es una aproximación con fines educativos. No sirve para tomar decisiones de seguridad. En una emergencia, sigue a Protección Civil y llama al 112.

## Qué hace

1. **Pantalla de permisos**: explica para qué se piden cámara, ubicación y orientación. En iPhone el permiso de orientación se pide al pulsar «Empezar», como exige Safari.
2. **Vídeo de la cámara trasera** a pantalla completa, con una capa dibujada encima que sigue la brújula y el giroscopio. No usa WebXR, que no existe en Safari de iPhone.
3. **Ubicación** por GPS (o un lugar de ejemplo si no hay GPS).
4. **Consultas reales**, desde el propio navegador y sin servidor propio, en un radio de unos 300 m:
   - **PATRICOVA 2015** (peligrosidad de inundación, Generalitat Valenciana / ICV): polígonos de las capas de peligrosidad 1 a 6 y geomorfológica, en GeoJSON.
   - **MDT05 del IGN** (modelo del terreno de 5 m) por WCS, en formato de texto ASCII.
5. **Capa de agua**: para cada columna de la pantalla se calcula hacia qué rumbo mira, se recorre el terreno en esa dirección y se dibuja la superficie del agua en perspectiva, con una línea clara donde empieza la «orilla».
6. **Deslizador de escenarios**:
   - *Inundación (PATRICOVA)*: periodo de retorno de 25, 100 o 500 años.
   - *Subida del mar*: de 0 a 3 m, con atajos para los escenarios del IPCC en 2100 y un temporal opcional (+1 m, ilustrativo).
7. **Resultado en tu punto**: cota del suelo, zona PATRICOVA, «el agua te llegaría por las rodillas», distancia y dirección del agua más cercana, y una silueta de 1,6 m como escala.
8. **Minimapa** visto desde arriba con el agua, tu posición y hacia dónde miras. Ayuda cuando la brújula falla. Al pulsarlo se abre el **mapa de toda la Comunitat Valenciana** (ver más abajo).
9. **Textos pedagógicos** (qué significa un periodo de retorno, probabilidad en 30 años, método «bañera») y una hoja «i» con los límites de precisión y las fuentes.

## Mapa de toda la Comunitat Valenciana

Al pulsar el minimapa se abre un mapa (Leaflet, copiado en `vendor/leaflet`) que va de la calle a toda la Comunitat:

- **Inundación**: las zonas PATRICOVA del periodo elegido (25, 100 o 500 años) más la peligrosidad geomorfológica. Las dibuja el propio servicio del ICV para cada trozo del mapa (petición `export` de ArcGIS), con sus colores oficiales.
- **Subida del mar**: la app pide al IGN el terreno de la zona visible y pinta en azul lo que queda por debajo del nivel elegido (método «bañera»). Cuanto más alejado el zoom, más gruesas las celdas: 5 m, 25 m, 200 m, 500 m o 1 km. Se muestra en pantalla qué tamaño se está usando.
- **Tocar un punto**: cota del IGN, zona PATRICOVA o agua del escenario, y distancia a ti.
- Mapa base del IGN (callejero gris) o foto aérea PNOA.

**Por qué no se descargan todos los datos del PATRICOVA.** Lo he valorado y no compensa en un sitio estático:

- El servicio del ICV ya entrega las zonas dibujadas para cualquier escala, con pocos KB por trozo, y la caché del navegador evita repetir peticiones.
- Descargar todo obligaría a mantener un proceso de preparación y decenas de MB de geometría en el repositorio (solo la capa geomorfológica tiene casi 7.000 polígonos), además de actualizarlo a mano.
- PATRICOVA está en revisión. Consultando el servicio, la app mostrará la versión nueva en cuanto el ICV la publique.
- La contrapartida es depender de que el ICV y el IGN estén disponibles, algo que ya pasaba con la vista de cámara. Si se quiere uso sin conexión, el siguiente paso sería guardar en caché las teselas visitadas (service worker), no descargar todo.

## Probarlo en el móvil

La cámara, el GPS y la orientación solo funcionan con **HTTPS**. Es una web estática (HTML, CSS y JavaScript sin compilar), así que basta con cualquier hosting estático.

### Opción 1: GitHub Pages (recomendada)

1. En GitHub, ve a **Settings → Pages**.
2. En *Build and deployment*, elige *Deploy from a branch*, la rama (`main` cuando se fusione este PR, o la rama del PR para probarlo antes) y la carpeta `/ (root)`.
3. Espera uno o dos minutos y abre en el móvil `https://pjlledo.github.io/SeaLevelVR/`.

### Opción 2: en tu ordenador

```bash
python3 -m http.server 8000
```

Abre `http://localhost:8000` en el ordenador (localhost cuenta como seguro, pero no hay cámara trasera ni brújula: arrastra con el ratón para girar). Para el móvil necesitas un túnel HTTPS, por ejemplo `npx localtunnel --port 8000` o `cloudflared tunnel --url http://localhost:8000`.

### Atajos de prueba

- `?lat=39.152&lon=-0.435` abre directamente ese punto con un fondo de ejemplo (sin cámara ni GPS).
- El botón «Probar sin GPS» ofrece cinco lugares de ejemplo: Alzira, Paiporta, El Palmar, Pinedo y el centro de Valencia.
- En el móvil, «Ajustar norte» corrige la brújula a mano en pasos de 5°: apunta a algo cuya dirección conozcas.

### Qué comprobar en un móvil real

- iPhone (Safari): que aparece el permiso de «Movimiento y orientación» y que la capa gira bien al mover el móvil.
- Android (Chrome): que la capa apunta al norte correcto sin ajustar.
- Que la línea del horizonte coincide con el horizonte real al sostener el móvil en vertical. Si no, el campo de visión supuesto (65°) no encaja con esa cámara.

## Cómo se calcula

- **Cota del suelo** = MDT05 del IGN interpolado en tu posición. **No** se usa la altitud del GPS, que falla varios metros y está referida al elipsoide, no al nivel del mar.
- **Ojos** = cota del suelo + 1,6 m.
- **Subida del mar**: una celda se inunda si su cota es menor que el nivel elegido (método «bañera»). El mar (cota 0 en el MDT) siempre se dibuja.
- **PATRICOVA**: una celda se inunda en el periodo T si está dentro de una zona con periodo de retorno ≤ T. Se dibuja 1 m de agua si el calado es «> 0,8 m» y 0,4 m si es «< 0,8 m». La peligrosidad geomorfológica (sin calado) solo se colorea en el minimapa.
- **Proyección**: en cada columna de la pantalla, la superficie del agua a una distancia *d* se ve con un ángulo `atan((cota_agua − ojos) / d)` respecto al horizonte; se le resta la inclinación del móvil y se pasa a píxeles con el campo de visión.

## Suposiciones (a verificar)

- **Campo de visión de la cámara**: 65° en el lado largo de la pantalla. Varía con cada modelo.
- **Brújula en iPhone**: se supone que `webkitCompassHeading` sigue la dirección de la cámara con el móvil vertical y la del borde superior con el móvil plano. Hay que comprobarlo en un iPhone real; mientras tanto existe el ajuste manual.
- **Calado dibujado** de 0,4 m y 1 m para las franjas de PATRICOVA: decisión de la app, no dato oficial.
- **Temporal de +1 m** y escenario de 2 m: ilustrativos, no proyecciones.
- **Subida del mar en Valencia**: no hay cifra local en la investigación previa; se usan medias globales del IPCC AR6 y se dice en pantalla.
- **«30 cm de agua en movimiento arrastran un coche»** u otras cifras de seguridad no se incluyen hasta tener una fuente oficial española.
- **Altura de los ojos**: 1,6 m.
- La caja usada para avisar «fuera de la Comunitat Valenciana» es aproximada.

## Límites conocidos

- **El IGN entrega las alturas en metros enteros** por este servicio (comprobado el 25/11/2026 en GeoTIFF y ASCII). Con subidas de menos de un metro el resultado salta de golpe; la interpolación suaviza la cota en tu punto, pero no añade precisión.
- El GPS se desvía unos metros y la brújula entre 10 y 20 grados; la capa puede «deslizarse».
- La capa no conoce edificios ni lomas que tapen la vista: dibuja el agua aunque haya algo delante.
- El método «bañera» inunda zonas bajas aunque estén protegidas por motas o no conecten con el mar.
- PATRICOVA 2015 está en revisión: en octubre de 2026 se presentó la fase 1 (zona DANA) con más superficie inundable, pero aún no está publicada como servicio.
- Solo se consultan unos 300 m alrededor; al moverte más de 80 m se vuelven a pedir los datos.
- Si los servicios del ICV o del IGN cambian o dejan de permitir CORS, la app dejará de cargar datos (sale un aviso). No hay copia de respaldo todavía.

## Fuentes de datos

| Dato | Fuente | Licencia |
|---|---|---|
| Peligrosidad de inundación | PATRICOVA 2015, Generalitat Valenciana / Institut Cartogràfic Valencià. Servicio REST `https://carto.icv.gva.es/arcgis/rest/services/tm_infraestructuras/ordenacion_territorial/MapServer` (capas 4–10). [Ficha en datos.gob.es](https://datos.gob.es/es/catalogo/a10002983-patricova-peligrosidad-por-inundacion-plan-de-accion-territorial-de-caracter-sectorial-sobre-prevencion-del-riesgo-de-inundacion-en-la-comunitat-valenciana) · [diccionario de campos](https://icvficherosweb.icv.gva.es/04/geonetwork/definicion_datos/orde_patricova_peligrosidad_inun.pdf) | CC BY ([condiciones del ICV](http://www.icv.gva.es/es/condiciones-de-uso-de-la-geoinformacion-icv)) |
| Elevación del terreno | MDT05, Instituto Geográfico Nacional. WCS `https://servicios.idee.es/wcs-inspire/mdt`, cobertura `Elevacion4258_5` | CC BY 4.0 scne.es ([condiciones](https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf)). La app muestra «Obra derivada de MDT05 CC-BY 4.0 scne.es» |
| Subida del nivel del mar | IPCC AR6, resumido por la Agencia Europea de Medio Ambiente: [Global and European sea level rise](https://www.eea.europa.eu/en/analysis/indicators/global-and-european-sea-level-rise/). SSP1-1.9: 0,28–0,55 m; SSP2-4.5: 0,44–0,76 m; SSP5-8.5: 0,63–1,02 m en 2100 respecto a 1995–2014 (medias globales) | — |

La investigación previa con todas las comprobaciones está en el documento «Investigación de datos: Sea Level VR» del proyecto.

## Estructura

```
index.html          pantallas y controles
css/estilos.css     estilos
js/app.js           flujo, estado y textos
js/datos.js         consultas a PATRICOVA y al MDT, rejilla y polígonos
js/sensores.js      cámara, GPS y orientación
js/render.js        capa de agua y minimapa
js/mapa.js          mapa de toda la Comunitat (Leaflet, PATRICOVA del ICV, mar con el MDT)
vendor/leaflet/     Leaflet 1.9.4 (licencia BSD-2)
js/escenarios.js    cifras de escenarios y textos pedagógicos
```

No hay paso de compilación. La única dependencia, Leaflet, va copiada en `vendor/`.

## Siguientes pasos posibles

- Probar en un iPhone y un Android reales y ajustar campo de visión y brújula.
- Cifra local de subida del mar para Valencia (herramienta AR6 de la NASA o proyecciones del MITECO / IH Cantabria).
- Inundación por mar solo en zonas conectadas con el mar.
- Copia de respaldo de los datos de una zona piloto por si fallan los servicios.
- Incorporar la nueva cartografía de PATRICOVA cuando se publique.
