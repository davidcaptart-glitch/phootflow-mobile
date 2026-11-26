# PhootFlow Lite y Pro (móvil)

Dos apps para el móvil sobre una misma base. Son PWA (se instalan desde el navegador) y, con el mismo código, apps
nativas de Android e iOS con Capacitor (ver «Apps nativas»).

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
npm run android:lite    # app nativa: compila, sincroniza y abre Android Studio (también android:pro)
npm run cap:sync        # recompila la web nativa de las dos apps y la copia a android/ e ios/
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
apps/lite/              PhootFlow Lite (capacitor.config.ts, android/, ios/, assets/logo.png)
apps/pro/               PhootFlow Pro (igual)
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

## Apps nativas (Android / iOS) con Capacitor

Lite y Pro son también apps nativas con [Capacitor 8](https://capacitorjs.com): la misma web dentro de una app,
con acceso a la galería, al menú Compartir y a las compras de la tienda. La PWA no cambia.

| App | appId | Carpeta | Proyectos nativos |
|---|---|---|---|
| PhootFlow Lite | `com.phootflow.lite` | `apps/lite` | `apps/lite/android`, `apps/lite/ios` |
| PhootFlow Pro | `com.phootflow.pro` | `apps/pro` | `apps/pro/android`, `apps/pro/ios` |

Todo lo que cambia entre la PWA y la app nativa está en `packages/core/src/platform/`. `index.ts` elige al cargar:
`web.ts` en el navegador y `capacitor.ts` dentro de la app nativa (`Capacitor.isNativePlatform()`).

| Función | PWA (`web.ts`) | App nativa (`capacitor.ts`) |
|---|---|---|
| Elegir fotos | `<input type=file>` | `@capacitor/camera` `chooseFromGallery` (selector de fotos del sistema, varias, sin permisos) |
| Compartir | `navigator.share` / descarga | `@capacitor/filesystem` (copia en la caché) + `@capacitor/share` |
| Guardar | descarga | `@capacitor-community/media`: álbum «PhootFlow» en la galería (Android) / Fotos (iOS) |
| Huella de la licencia | id aleatorio en `localStorage` | `@capacitor/device` `getId()` pasado por SHA-256 (no cambia al borrar datos) |
| Datos guardados | `localStorage` | `@capacitor/preferences` |
| Licencia | clave PF-… | clave PF-… **o compra en la tienda** (RevenueCat), ver abajo |

Archivos de cada app: `capacitor.config.ts` (appId, nombre, splash), `assets/logo.png` (el logo de `public/mark.png`
a 1024 px; de él salen iconos y splash sobre `#05070f` con `npm run assets`), `android/` e `ios/` (proyectos
nativos, en git; sus builds y la copia de la web, no).

La web de la app nativa se compila con `npm run build:native` (`vite build --mode native`): igual que la PWA pero
**sin service worker ni manifiesto** (dentro de la app no hacen falta y en iOS dan problemas). Los modelos de IA de
`public/modelos/` (~70 MB, fuera de git, `python tools/modelos.py`) entran en el paquete si están en la carpeta al
compilar; sin ellos la app compila igual, pero las funciones que los usan necesitan conexión.

### Probar en un Android paso a paso (Windows)

1. **Instala [Android Studio](https://developer.android.com/studio)**. Trae el SDK de Android y el JDK 21 que pide
   Capacitor 8 (un JDK 17 suelto no vale). Ábrelo una vez y deja que termine de descargar el SDK (API 36).
2. **Prepara el repo** (una vez): `npm install` en la raíz. Para tener la IA sin conexión, copia o genera los modelos
   en `apps/lite/public/modelos/` y `apps/pro/public/modelos/` (`python tools/modelos.py`).
3. **Compila la web y cópiala al proyecto Android**:
   ```
   npm run android:lite        # o: npm run android:pro
   ```
   Hace `build:native` + `npx cap sync` (copia `dist/` y los plugins a `apps/lite/android`) y abre Android Studio.
   Si no se abre solo: en Android Studio, *File → Open…* y elige la carpeta `apps/lite/android` (o `apps/pro/android`).
4. **Espera a que termine «Gradle sync»** (barra de abajo; la primera vez descarga Gradle y librerías, unos minutos).
   Si se queja del JDK: *File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK* =
   «jbr-21» (el de Android Studio).
5. **Prepara el móvil**: *Ajustes → Información del teléfono*, toca 7 veces «Número de compilación» para activar las
   opciones de desarrollador; en *Opciones de desarrollador* activa «Depuración USB». Conéctalo por USB y acepta
   «¿Permitir depuración USB?». Sin móvil: *Device Manager → Create device* para un emulador.
6. **Ejecuta**: elige el móvil en la lista de dispositivos de arriba y pulsa ▶ *Run 'app'*. Se instala y se abre.
7. **Depurar la web dentro de la app**: en Chrome del PC, `chrome://inspect/#devices` → «inspect» en PhootFlow:
   consola, red y elementos como en la PWA.
8. **Después de cada cambio en el código**: `npm run cap:sync -w @phootflow/lite` (o `npm run cap:sync` para las
   dos) y otra vez ▶ en Android Studio.

APK sin abrir Android Studio (con un JDK 21 en `JAVA_HOME`, p. ej. el de Android Studio:
`C:\Program Files\Android\Android Studio\jbr`): en `apps/lite/android`, `gradlew.bat assembleDebug` →
`app/build/outputs/apk/debug/app-debug.apk`.

**Publicar en Google Play**: en Android Studio, *Build → Generate Signed App Bundle* (`.aab`) con una clave de
subida propia (`.jks`, **fuera del repo**: el `.gitignore` excluye `*.jks`, `*.keystore` y `keystore.properties`).
Antes, sube `versionCode` / `versionName` en `android/app/build.gradle`.

**Iconos y splash**: si cambia el logo, reemplaza `apps/<app>/assets/logo.png` (1024 × 1024, fondo transparente) y
ejecuta `npm run assets -w @phootflow/lite` (o `pro`): regenera los iconos de Android (normales, redondos y
adaptativos) y de iOS, y el splash claro y oscuro, todo sobre `#05070f`. Hoy salen de `mark.png` (393 px) ampliado;
con el logo original a más resolución quedarán más nítidos.

**Guardar en la galería (Android)**: va a la carpeta multimedia de la app
(`Android/media/com.phootflow.lite/PhootFlow`), que la galería muestra como álbum «PhootFlow» y no pide permisos.
Android la borra al desinstalar la app.

### iOS (necesita un Mac)

Los proyectos `apps/*/ios` ya están generados (Swift Package Manager, sin CocoaPods), con iconos, splash y los
textos de permisos de Fotos y cámara en `Info.plist`. Xcode solo existe para macOS, así que para compilar:

1. En el Mac: Xcode (App Store), Node 20+ y `npm install` en la raíz del repo.
2. `npm run ios -w @phootflow/lite` (compila, sincroniza y abre Xcode).
3. En Xcode: *App → Signing & Capabilities* → elige el equipo (cuenta de Apple Developer) y, para las compras,
   añade la capacidad *In-App Purchase*.
4. Conecta el iPhone (con *Modo desarrollador* activado en Ajustes → Privacidad y seguridad) y pulsa ▶.
5. Para depurar la web: Safari del Mac → *Desarrollo → [iPhone] → PhootFlow*.

Si se borra la carpeta `ios/`, se regenera con `npx cap add ios` dentro de `apps/<app>` (funciona también en
Windows), luego `npm run assets -- --ios` y volver a poner las claves `NS…UsageDescription` en `Info.plist`.

### Compras en la tienda (preparado, falta activarlo)

El código está listo detrás de la interfaz (`platform.purchase` / `platform.restorePurchases`), con
[RevenueCat](https://www.revenuecat.com) (`@revenuecat/purchases-capacitor`), que habla con Google Play Billing y
StoreKit. Mientras no haya claves, la app nativa **no enseña «Comprar»** y se activa con clave PF-…, como la PWA.

Cómo funciona: «Comprar PhootFlow Lite» en la pantalla de licencia → la tienda cobra (producto de **compra única**
`phootflow_lite` / `phootflow_pro`, en `STORE_PRODUCTS` de `capacitor.ts`) → la app manda al servidor de licencias
`{ accion: "compra", tienda, recibo, producto, huella, nombre, version }` (`license.activateWithPurchase`) → el
servidor valida la compra, crea o recupera la licencia y devuelve el token firmado de siempre → desde ahí todo es
igual que con clave (7 días sin conexión, comprobación cada 6 h). «Restaurar compras» hace lo mismo con las compras
anteriores de la cuenta (móvil nuevo, reinstalación). El `recibo` es un JSON
`{ proveedor: "revenuecat", app_user_id, transaccion, producto_tienda, purchase_token }`; el usuario de RevenueCat
(`app_user_id`) es la huella del móvil.

Lo que falta, en orden:

1. **Cuentas**: Google Play Console (pago único) y Apple Developer Program (anual). En las dos, dar de alta las apps
   `com.phootflow.lite` y `com.phootflow.pro`, y los datos fiscales y bancarios.
2. **Productos**: en cada tienda, un producto integrado de compra única (no suscripción) por app, con id
   `phootflow_lite` y `phootflow_pro`. Si se prefiere suscripción, cambiar `PRODUCT_CATEGORY.NON_SUBSCRIPTION` en
   `capacitor.ts` y la lectura de `restorePurchases`. Google Play pide subir antes un `.aab` firmado a una pista de
   prueba interna para poder crear productos.
3. **RevenueCat**: crear el proyecto, conectar las dos tiendas (cuenta de servicio de Google Play y clave de App
   Store Connect) y poner las **claves públicas del SDK** en `apps/lite/.env.local` y `apps/pro/.env.local`
   (fuera de git por `*.local`):
   ```
   VITE_REVENUECAT_ANDROID_KEY=goog_...
   VITE_REVENUECAT_IOS_KEY=appl_...
   ```
   Al compilar con `npm run build:native` aparecen «Comprar» y «Restaurar compras».
4. **Servidor de licencias** (Edge Function `licencias`, repo PhootFlow, `servidor_licencias/`): aceptar
   `accion: "compra"`:
   - Validar con la API REST de RevenueCat (`GET https://api.revenuecat.com/v1/subscribers/{app_user_id}` con la
     **clave secreta** de RevenueCat como secreto de Supabase, nunca en la app ni en el repo) que la `transaccion`
     está en `non_subscriptions[producto_tienda]` y que el producto coincide con `producto`.
   - Buscar la licencia por `compra_ref` (= id de la transacción). Si no existe, crearla con `producto`,
     `origen` = `google_play` / `app_store` (columnas `origen` y `compra_ref` ya creadas en la migración 002),
     titular «Compra en tienda» y una clave generada como las demás.
   - Vincular la `huella` como en la activación por clave (409 si está en otro móvil, o liberar la anterior si la
     compra es de la misma cuenta: a decidir) y devolver `{ token }` con la `clave` dentro: la app la guarda y la usa
     en las comprobaciones periódicas, que no cambian.
   - Respuestas que la app entiende: 200 `{ token }`, 402/403 compra no válida, 409 en uso en otro dispositivo.
   - Opcional: webhook de RevenueCat para revocar la licencia si hay reembolso.
5. **Probar**: Google Play con «testers de licencias» (compras de prueba sin cobro) en la pista interna; iOS con una
   cuenta Sandbox de App Store Connect o un archivo StoreKit en Xcode.
6. **Normas de las tiendas**: dentro de las apps nativas solo se puede vender con la compra de la tienda (no enlazar
   a la venta de claves). Activar con una clave que ya se tiene sí se puede dejar.

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
- **Apps nativas** (Capacitor 8): proyectos Android e iOS de las dos apps, plataforma nativa (`capacitor.ts`) y compras
  preparadas sin claves. `cap sync` probado; **sin probar todavía en un móvil** ni compilado en Xcode.
- Pendiente: publicar las PWA en un dominio (`MOVIL` en `admin_licencias_gui.py`).
