# PhootFlow Lite y Pro (móvil)

Dos apps para el móvil sobre una misma base. Hoy son PWA (se instalan desde el navegador). Mañana serán apps nativas de
Android e iOS con Capacitor, sobre el mismo código.

| App | Para qué | Licencia |
|---|---|---|
| **Lite** (`apps/lite`) | Eliges fotos → dices qué quieres editar → editas **una** en vivo → todas quedan igual → las subes a redes o haces un post o carrusel con plantilla. | producto `lite` (o `pro`) |
| **Pro** (`apps/pro`) | Todo en uno: revelado tipo Lightroom (lo principal) + retoque tipo Photoshop + diseño completo tipo Canva + publicar. | producto `pro` |

Todo se procesa en el móvil: las fotos no salen del teléfono.

## Comandos

```
npm install
npm run dev:lite        # http://localhost:5173 (con --host, también desde el móvil en la misma Wi-Fi)
npm run dev:pro         # http://localhost:5174
npm test                # pruebas del motor y de la licencia (vitest)
npm run typecheck
npm run build           # apps/*/dist: lo que se publica (con service worker)
npm run luts            # regenera los filtros desde ../PhootFlow/assets/luts (python + numpy)
```

En desarrollo, la pantalla de licencia tiene «Seguir sin licencia» y el inicio de Lite tiene «Fotos de ejemplo»
(sintéticas: misma escena con distinta luz y balance de blancos). Ninguno de los dos aparece en la versión publicada.

## Estructura

```
packages/core/          base común (@phootflow/core)
  src/engine/           lógica pura, sin DOM (con pruebas): tipos, formatos de redes, medidas de cada foto,
                        congruencia («edita una y todas igual»), recorte inteligente
  src/render/           revelador WebGL2 (shaders.ts, renderer.ts), decodificar fotos, filtros (LUT)
  src/ai/               IA local con MediaPipe: caras y segmentación persona / piel / pelo
  src/design/           tablero de diseño (una o varias páginas en fila) y plantillas para redes
  src/license/          licencia: mismo servidor y token Ed25519 que el PhootFlow de escritorio
  src/platform/         TODO lo que depende de dónde corre la app (ver «Apps nativas»)
  src/ui/               tema y pantalla de licencia comunes
  assets/luts/          73 LUT de la biblioteca de escritorio, 33³ en uint8 (+ catalogo.json, LICENCIAS.md)
apps/lite/              PhootFlow Lite
apps/pro/               PhootFlow Pro
tools/exportar_luts.py  biblioteca de escritorio → assets/luts
tests/                  vitest
```

### Cómo funciona «edita una y todas quedan igual»

1. Cada foto se mide a 256 px (`engine/analyze.ts`): luz media ponderada (el centro y las caras pesan más),
   percentiles, dominante de color (gris mundial sobre zonas casi neutras), caras y caja de las personas.
2. La foto guía lleva su corrección automática más lo que el usuario toca (`Look`).
3. Cada una de las demás se **iguala a la guía** antes de aplicar el mismo `Look` (`engine/congruence.ts`):
   misma luz media (al 90 %) y misma dominante de partida (al 85 %). Las luces y las sombras se protegen en cada foto.
   Filtro, B/N, belleza, fondo, grano y viñeta son idénticos para todas.
4. Recorte por foto (`engine/crop.ts`): el más grande del formato, centrado en las personas y con los ojos en el
   tercio superior. El fondo solo se desenfoca en fotos con un sujeto claro, y la belleza solo en caras de ≥ 5 % del ancho
   (igual que en escritorio).

### Revelado (WebGL2, `render/shaders.ts`)

Un solo paso por foto. Primero belleza (separación de frecuencias solo en la piel) y desenfoque de fondo; después
balance, exposición, luces y sombras en luz lineal, y un hombro suave. Luego, contraste en S, saturación, LUT 3D,
B/N, viñeta y grano. Los desenfoques se **normalizan por máscara**: el fondo se desenfoca sin la persona, así que
no queda halo, y la piel solo se mezcla con piel. La misma clase sirve para la vista en vivo, las miniaturas de los
filtros y la exportación.

### Recorte por destino

En «Recorte» no se elige una proporción, sino para qué es la foto. Destinos: Instagram (publicación vertical,
cuadrada y 3:4, historias y Reels, foto de perfil), TikTok, WhatsApp (estado, perfil), Facebook (publicación,
horizontal, portada, perfil), X (publicación, cabecera), LinkedIn (publicación, portada, perfil), YouTube (miniatura),
Pinterest y copias 10×15. Cada destino sale con su tamaño exacto (`engine/formats.ts`). Se pueden marcar varios a la
vez: cada foto sale en todos. Las fotos de perfil se previsualizan en círculo.

### Color selectivo

Lo elegido se queda en color y el resto pasa a B/N. Se puede elegir:
- **por elementos**, que la IA reconoce en cada foto y se pueden combinar. Persona: ropa, complementos, pelo, cara,
  piel, persona entera, fondo. Objetos (DeepLab v3): coche, moto, bici, perro, gato, caballo, pájaro, plantas o
  flores, botella o copa, mesa, silla o sofá, barco, avión, tren, pantalla.
- **por colores**, con botones o tocando la foto (cuentagotas), con un margen.
- **por las dos cosas**: «Ropa + Rojo» deja en color solo la prenda roja.

Como son tipos de elemento, se aplican igual a todas las fotos. Las máscaras se guardan por foto
(`Photo.masks`) y se unen en una textura (`unionMask` → `Renderer.setSelection`).

### Mis ediciones (biblioteca dentro de la app)

`packages/core/src/library.ts` (IndexedDB). Cada sesión guarda sus fotos originales, la guía, el estilo y las
herramientas. Se guarda al llegar a Resultados. Cada versión exportada (destino, color o B/N) y cada diseño o carrusel
se guarda al exportar o publicar. Desde «Mis ediciones» se ven las versiones por foto, se vuelven a compartir, se
borran o se sigue editando la sesión con el mismo estilo. La app pide al navegador que no la borre
(`navigator.storage.persist`) y muestra el espacio usado.

### Más herramientas de Lite

- **Estilos guardados** (`core/styles.ts`): seis predefinidos y los tuyos (guardar, renombrar, actualizar, borrar),
  aplicados sobre la propia foto guía. **Crear mi estilo** con cinco preguntas (ambiente, luz, contraste, color,
  acabado: `applySimple`). Se puede empezar con un estilo o guardar uno desde «Mis ediciones».
- **Belleza** con retrato completo (`ai/portrait.ts`, MediaPipe FaceLandmarker): piel, ojos (blanco e iris), dientes
  y ojeras, con máscaras dibujadas a partir de los 478 puntos de la cara.
- **Enderezar automático** (`engine/straighten.ts`, transformada de Hough limitada a ±10°) y **efecto velocidad**
  (fondo barrido en una dirección, persona nítida) en «Fondo».
- **Antes / después** (`apps/lite/src/BeforeAfter.tsx`): cortinilla vertical u horizontal, o botones.
- **Mejorar con IA** y **redimensionar con IA** (`ai/enhance.ts`, Real-ESRGAN x4v3): por foto en el visor; al exportar,
  cada destino sale con su tamaño exacto aunque la foto se quede corta (`Look.aiResize`); «Ampliar ×2 / ×4»
  (límite de 16 MP, lo que admite un iPhone). Sin la IA, ampliación clásica.
- **Personas** (`ai/people.ts`, SFace + agrupación de `people-math.ts`): buscar, filtrar, nombrar y compartir sus
  fotos.
- **Quitar objetos y personas** (`ai/inpaint.ts`, MI-GAN): tocar la figura (la IA la separa) o pintar, y la IA
  rellena; se aplica a la foto original y se puede deshacer.

### Diseño con lienzo continuo (carruseles)

`apps/lite/src/screens/Design.tsx` + `core/design/board.ts` + `core/design/carousels.ts`. Las páginas del carrusel
van seguidas en una tira (hasta 10). Fotos, textos, formas y stickers pueden cruzar de una página a otra, y se
mueven, escalan y giran con un dedo, con el tirador ⟲ o con dos dedos. Hay capas (al frente, subir, bajar), duplicar,
marcos (rectángulo, círculo, arco) con borde y sombra, encuadrar la foto dentro del marco y **recortar a la persona**
sin fondo (segmentación de MediaPipe). Fondos de color o degradado, zoom «Ver todo» / «Una página» (también con
pellizco), páginas y formato (4:5, 1:1, 3:4, historia). 18 plantillas de carrusel propias (`carousels.ts` +
`collection.ts`: editorial, scrapbook, mosaico continuo, escalera, gran titular, bloques de color, postales, moodboard,
minimal, cine panorámico, panorámica, foto que cruza, polaroids, arcos, círculos, tira de película, collage libre,
portada + fotos), 11 de una imagen (titular, fotomatón, marco grueso, dos fotos cruzadas, cita, cuadrícula 3×3,
historia con arco…) y empezar en blanco.

**Fotos para diseñar** (`apps/lite/src/assets.ts`): las de la sesión (con su estilo), las ya editadas de «Mis
ediciones» y las del teléfono. Se entra desde Resultados, desde el inicio («Diseñar para redes», sin sesión: el diseño
se guarda como su propia entrada) o desde «Mis ediciones» («Elegir para diseñar» → «Diseñar con N fotos»). **Vista
previa** deslizando página a página como en Instagram. Publicar abre Compartir con las páginas en orden y las guarda
en «Mis ediciones».

### Modelos de IA que sirve la app

`python tools/modelos.py` deja en `apps/*/public/modelos/` (fuera de git) Real-ESRGAN (`.onnx` + `.data`, SHA-256 del
zip como escritorio), SFace (copiado del escritorio si ya está) y MI-GAN (SHA-256 fijado). Se descargan en el móvil
solo al usarlos y el service worker los guarda. Los de MediaPipe vienen de Google; para la app nativa se pueden
incluir todos en el paquete.

## Versiones, actualización y «Novedades»

- La versión de cada app es la de `apps/<app>/package.json` (Vite la pone en `__APP_VERSION__`; la usan la licencia,
  el aviso de actualización y «Novedades»).
- Para publicar una versión: sube `version` en `apps/<app>/package.json` y añade arriba de `apps/<app>/src/changelog.ts`
  una entrada con la versión, la fecha y frases cortas para el usuario (qué puede hacer ahora, sin tecnicismos).
- La PWA se pone al día sola (`packages/core/src/updates/pwa.ts`, service worker en modo «prompt»): la versión nueva
  se descarga en segundo plano y se aplica al abrir la app, al volver a ella tras un rato o al dejarla en segundo
  plano, siempre que no haya una edición en curso (`setUnsavedWork`). Si la hay, sale el aviso «Hay una versión
  nueva · Actualizar» y nunca se recarga sin preguntar. Mientras está abierta comprueba cada 30 min.
- Al abrir una versión nueva sale una vez la hoja «Novedades de la versión X» (`ui/Updates.tsx`, última vista en
  `platform.kv` «novedades_vistas»); después, desde «Compartir la app» › «Novedades» u `openWhatsNew()`.
  El registro sirve igual en las apps nativas; allí la actualización la hace la tienda.

## Licencias

Mismo servidor que el escritorio (`servidor_licencias/` en el repo PhootFlow): Edge Function `licencias` de
Supabase, con el campo `producto` (migración `002_productos.sql`). La app manda `producto: "lite"` o `"pro"`:

- Una clave de PC no abre el móvil, y una de móvil no abre el PC (403 `producto_distinto`, con mensaje claro).
- Una clave **Pro abre también Lite**.
- En la PWA, la huella del móvil es un id aleatorio guardado en el navegador. Si se borran los datos, se libera
  desde la administración (como al cambiar de PC).
- 7 días sin conexión y comprobación cada 6 h, igual que en escritorio.

Las claves se crean con la ventana de licencias de escritorio (campo «Producto») o con
`python admin_licencias.py crear "Ana" --producto lite`.

## Apps nativas (Android / iOS), más adelante

Todo lo que cambia entre la PWA y la app nativa está en `packages/core/src/platform/`. `web.ts` es lo de hoy; para
las nativas se añade `capacitor.ts` con la misma interfaz y se elige al arrancar:

| Hoy (PWA) | Nativo (Capacitor) |
|---|---|
| `<input type=file>` | galería con acceso directo (`@capacitor/camera` pickImages o un plugin de fototeca) |
| `navigator.share` / descarga | `@capacitor/share` + `@capacitor/filesystem`; guardar en Fotos con un plugin de galería |
| id aleatorio en `localStorage` | `@capacitor/device` `getId()` (no cambia al borrar datos) |
| `localStorage` | `@capacitor/preferences` |
| clave PF-… | **compra en la tienda** (`platform.purchase` / `restorePurchases`) |

Pasos: `npm i @capacitor/core @capacitor/cli`, `npx cap init`, `npx cap add android` / `ios`, con `webDir` en
`apps/lite/dist` (una app nativa por producto). Los modelos de IA y las LUT se pueden incluir en el paquete para
que funcione sin conexión desde el primer día.

**Compra en las tiendas.** Google Play Billing y StoreKit (directamente o con RevenueCat). La app manda el recibo
a la Edge Function (`accion: "compra"`); la función lo valida con la tienda, crea o renueva la licencia
(`origen` = `google_play` / `app_store`, `compra_ref` = id de la compra; columnas ya creadas en la migración 002)
y devuelve el mismo token firmado. La comprobación de la app no cambia. Apple obliga a vender dentro de la app de
iOS con su sistema de compras; la PWA se sigue vendiendo con claves.

**Publicar directamente en redes** (sin pasar por el menú Compartir): Instagram Graph API y TikTok Content
Posting API. Necesitan cuenta profesional, un servidor (Edge Function) y que Meta y TikTok revisen la app. Hoy, el
botón «Publicar» abre el menú Compartir con las imágenes ya en el tamaño de cada red (y el carrusel en orden), y
copia el texto del post para pegarlo.

## Estado (0.1.0)

- **Lite**: completa de principio a fin. Elegir fotos, elegir herramientas, editor en vivo (filtros con miniaturas
  de la propia foto y deslizar para cambiar de filtro; fondo; belleza; recorte con 5 formatos de redes; B/N con sus
  LUT; luz y color), aplicar a todas igualándolas a la guía, exportar y compartir. Diseño: 9 plantillas (post,
  historia, polaroid, collages, carrusel y carrusel continuo), textos, stickers, fondo, encuadre de cada foto y
  publicar. Probada en el navegador con fotos sintéticas; **sin probar todavía en un móvil real** (iPhone/Android)
  ni con fotos reales.
- **Pro**: esqueleto con licencia propia y los modos Revelar (funciona sobre una foto: luz, color y perfiles) /
  Retocar / Diseñar. Ver `ROADMAP.md`.
- Licencias por producto desplegadas en Supabase (migración 002 + función v2, probadas en vivo).
- Pendiente: publicar las PWA en un dominio (`MOVIL` en `admin_licencias_gui.py`).
