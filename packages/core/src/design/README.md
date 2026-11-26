# Diseñar — motor (fase 2)

Motor de la pantalla «Diseñar», **común a Lite y Pro** y pensado para **redes sociales**: posts, historias,
reels y carruseles. Aquí no hay interfaz. Todo se importa desde `@phootflow/core`.

Coordenadas del tablero (sin cambios): `x` va de 0 a `pages` (1 = ancho de una página) e `y` de 0 a 1 (alto de
página). El orden de `board.items` es el orden de las capas.

## Compatibilidad con los diseños guardados

Todos los campos nuevos son **opcionales**. Si faltan, se pinta exactamente como antes.

| Función | Para qué |
|---|---|
| `normalizeBoard(raw)` | Convierte cualquier tablero guardado (fase 1, a medias o con basura) en uno válido. Rellena valores, descarta elementos desconocidos, acota números y rehace los ids repetidos. Pone `v: 2`. |
| `serializeBoard(b)` / `parseBoard(json)` | Guardar y leer en JSON. Leer ya normaliza. |

## 1. Capas (`layers.ts`, sin lienzo)

Campos nuevos en cualquier elemento:

| Campo | Qué hace |
|---|---|
| `locked` | No se mueve, escala, gira ni borra. |
| `hidden` | No se pinta. `hitTest` lo ignora. `paintBoard(..., { showHidden: true })` lo pinta al 30 %. |
| `group` | Id de grupo. |
| `opacity` | 0..1. |
| `anim` | Animación de entrada (ver §6). |

Ninguna función cambia el tablero que recibe: todas devuelven uno nuevo.

| Función | Qué hace |
|---|---|
| `groupIds(b, id)` | Al tocar un elemento, da los ids de su grupo entero. |
| `expandSelection(b, ids)` | Amplía una selección con los grupos completos. |
| `groupItems(b, ids)` → `{ board, group }` | Agrupa (2 o más). Las capas del grupo quedan juntas. |
| `ungroupItems(b, ids)` | Deshace el grupo. |
| `duplicateItems(b, ids, dx?, dy?)` → `{ board, ids }` | Duplica encima de los originales. Las copias forman un grupo nuevo. |
| `deleteItems(b, ids)` | Borra. Respeta lo bloqueado. |
| `setLocked`, `setHidden`, `setOpacity(b, ids, v)` | Bloquear, ocultar, opacidad. |
| `moveItems(b, ids, dx, dy)` | Mueve (en unidades del tablero). |
| `scaleItems(b, ids, s, origin?)` | Escala el grupo junto, sin deformar. Por defecto alrededor del centro. |
| `rotateItems(b, ids, deg, origin?)` | Gira el grupo junto: cada elemento gira y se recoloca. |
| `alignItems(b, ids, "left" \| "hcenter" \| "right" \| "top" \| "vcenter" \| "bottom", to?)` | Alinea a la selección. Con un solo elemento (o `to: "page"`), a su página. |
| `distributeItems(b, ids, "h" \| "v")` | Reparte 3 o más con huecos iguales. |
| `snap(b, ids, dx, dy, { threshold? })` → `{ dx, dy, guides }` | Imán (ver abajo). |
| `itemRect(it, ratio, measure?)` / `itemAABB(...)` | Caja sin girar o envolvente, en unidades del tablero. |
| `measureWith(ctx)` | Medidor de texto exacto. Sin él, se usa una aproximación. |

**Imán.** Mientras se arrastra, pasa el desplazamiento acumulado desde que empezó el gesto: `snap` lo corrige
para enganchar bordes y centros de la página, de cada corte del carrusel y de los demás elementos visibles.
Devuelve las guías que hay que dibujar:

- `{ axis: "x", at, from, to }`: línea vertical en `x = at`, de `y = from` a `y = to`.
- `axis: "y"`: línea horizontal.
- `kind: "page" | "item"`: si engancha con la página o con otro elemento.

Las unidades son las del tablero: multiplica `x` por `pw` e `y` por `ph`.

## 2. Texto (`text.ts` y `board.ts`)

Campos nuevos de `TextItem`:

| Campo | Qué hace |
|---|---|
| `lineHeight` | Interlineado (por defecto 1.18). Las varias líneas ya existían: van con `\n`. |
| `stroke: { color, width }` | Contorno (ancho en em). |
| `shadowStyle: { color, blur, dx, dy }` | Sombra configurable (en em). Manda sobre `shadow`. |
| `boxPad`, `boxRadius` | Relleno y radio de la caja de fondo `box` (en em). |
| `curve` | Texto en arco: grados (`+` ∩, `−` ∪, entre −360 y 360). Con curva se ignora `align`. |
| `effect` | Efecto con nombre (ver la lista de abajo). |

- **Efectos**, en `TEXT_EFFECTS`: `ninguno`, `neon`, `eco`, `elevado`, `sombra-dura`, `contorno`, `hueco` y
  `brillo`. Cada uno tiene su nombre en español para la interfaz.
- **Fuentes**: `FONTS` crece de 6 a 14 sin romper los ids viejos. `FONT_LIST` da `{ id, name, css, source:
  "incluida" | "sistema", style }` para el selector. «Jakarta» viene incluida; el resto son cadenas de fuentes
  del sistema seguras en iOS y Android.
- **Utilidades de color**: `parseColor`, `formatColor`, `luminance` y `mix`.

## 3. Formas (`shapes.ts`)

`ShapeItem.shape` admite: `rect`, `roundrect`, `circle`, `line`, `arrow`, `star`, `polygon` y `frame`.
La lista con nombres está en `SHAPES`.

| Campo | Qué hace |
|---|---|
| `grad: { to, angle }` | Degradado de `fill` a `to`. |
| `stroke`, `strokeWidth` | Contorno. En `line`/`arrow` es el color y el grosor del trazo; en `frame`, el grosor del marco. Va en fracción del alto de página. |
| `points`, `inner` | Puntas y radio interior de la estrella. |
| `sides` | Lados del polígono. |

Una `line` sin `strokeWidth` (diseños viejos) se sigue pintando como el rectángulo relleno de antes.

## 4. Kit de marca (`brand.ts`)

Se guarda con `platform.kvGet/kvSet` en las claves `pf.design.brands` y `pf.design.brand.active`.

`Brand = { id, name, colors[], titleFont, bodyFont, logo (data URL) }`

| Función | Qué hace |
|---|---|
| `newBrand(name)` | Crea una marca nueva. |
| `listBrands()`, `saveBrand(b)`, `deleteBrand(id)` | Listar, guardar y borrar marcas. |
| `getActiveBrand()`, `setActiveBrand(id)` | Marca en uso. |
| `normalizeBrand(raw)` | Limpia una marca leída (vieja o a medias). |
| `applyBrand(board, brand, { colors?, fonts?, keepBlackWhite? })` | Recolorea por claridad: el color más oscuro del diseño pasa al más oscuro de la marca, y así con el resto. Conserva la transparencia y deja el blanco y el negro puros. Los textos grandes toman `titleFont` y el resto `bodyFont`. |
| `addBrandLogo(board, brand, { page, corner, size, aspect })` | Pone el logo como `PhotoItem` con `fit: "contain"` y `photo = brandLogoKey(brand)`. |

**Ojo:** antes de pintar, la interfaz carga `brand.logo` como imagen y la mete en el mapa de imágenes con la
clave `brandLogoKey(brand)`.

## 5. Redimensionar (`resize.ts`)

- **`resizeBoard(board, formato)`**: pasa el diseño a otro formato.
  - Lo que va a sangre sigue a sangre.
  - Las bandas a todo el ancho o alto siguen así.
  - El resto escala igual en los dos ejes (sin deformarse), conserva su posición relativa y, si tocaba un
    borde, sigue pegado a él.
  - Textos y stickers escalan su tamaño.
  - En los carruseles, lo que cruza páginas sigue cruzando.
- **`DESIGN_FORMATS`**: destinos de redes para el selector (post 4:5, 1:1, 3:4, historia/reel 9:16, TikTok,
  estado de WhatsApp, pin, horizontales, portadas, miniatura de YouTube).
- **`safeZone(formato)`** → `{ top, bottom, left, right }`: la parte de la imagen que tapa la interfaz de la red
  (historias, reels, TikTok). Sirve para dibujar la guía de zona segura. Las plantillas no ponen texto ahí.

## 6. Exportar (`export.ts`, `gif.ts`, `pdf.ts`, `anim.ts`)

Funciones nuevas de pintado:

- `paintBoard(ctx, b, photos, pw, ph, { time?, showHidden? })`: sin `time`, se pinta el estado final, igual que
  antes.
- `paintPage(ctx, b, photos, i, pw, ph, opts)`: pinta una sola página.

**Animaciones** (`Anim = { kind, delay?, dur?, dir? }`). Los tipos (`ANIMS`) son: `aparecer`, `deslizar`
(con dirección), `zoom`, `subir`, `girar` y `lento`, un zoom suave tipo Ken Burns para las fotos de los vídeos.

| Función | Qué hace |
|---|---|
| `animAt(anim, t)` | Estado de un elemento en el instante `t`. |
| `animEnd(items)` | Cuándo termina la última animación. |
| `autoAnimate(board, kind, step?)` | Anima todo de golpe, escalonado por página. Los fondos no se animan. |
| `motionPlan(board, { pages?, perPage? })` | Qué página se ve en cada tramo del vídeo. |

**Vídeo para Reels / Historias / TikTok.** Las páginas salen una tras otra, cada una con sus animaciones.

`exportVideo(board, photos, { width?, fps?, bitrate?, perPage?, pages?, music?, onProgress? }) → Blob`

- Graba con `MediaRecorder` en tiempo real, así que tarda lo que dura el vídeo.
- Sale en MP4 si el navegador lo admite; si no, en WebM. `videoMime()` / `canRecordVideo()` dicen si se puede.
- **Música:** `music: { file: Blob, start?, volume?, fadeIn?, fadeOut? }` con la canción que elija el usuario.
  Se recorta desde `start`, se repite si es corta y lleva fundidos de entrada y salida (`musicEnvelope`).
- **Música de Instagram o TikTok:** sus bibliotecas no se pueden meter en el archivo, porque no hay API y la
  licencia solo vale dentro de su app. Hay que exportar sin música (o con la propia) y añadir la canción en el
  editor de la red al publicar. La interfaz debería explicarlo con un texto corto.

**GIF:** `exportGif(board, photos, { width = 540, fps = 12, ... }) → Blob`. Lleva un codificador GIF89a propio
(LZW, paleta global y tramado) y junta en uno los fotogramas iguales seguidos.

**PDF:** `exportPdf(board, photos, { widthMm = 210, dpi = 300, quality, title }) → Blob`. Es un PDF propio, sin
librerías: una página del PDF por cada página del tablero, en JPEG a 300 ppp. Es secundario en una app de redes;
sirve para imprimir o enviar a un cliente.

`exportBoard` (JPEG por página) sigue igual y ahora pinta página a página.

## 7. Plantillas (`pro-templates.ts`)

- **`PRO_TEMPLATES`** (20): bodas, eventos, deporte, negocio y portfolio, en formato post 4:5, historia 9:16 o
  carrusel.
- **`VIDEO_TEMPLATES`** (6): `video: true` y `perPage` (segundos por escena). Cada página es una escena con
  animaciones ya puestas: reel de fotos, tráiler de boda, promo de evento, mejores momentos, producto y
  portfolio. Se rellenan con las fotos elegidas (como cualquier plantilla) y se exportan con
  `exportVideo(board, photos, { perPage: t.perPage, music })`.
- **`Template`** gana los campos opcionales `category`, `video` y `perPage`.
- **`TEMPLATE_CATEGORIES`**: las categorías con su nombre, para pestañas o filtros.
- **`allTemplates()`, `templatesIn(categoría)` y `templateById(id)`** ya buscan en todas las listas.

**Lite y Pro:** todo esto vive en `core`, así que sirve para las dos apps. Las plantillas de vídeo y la música
también se pueden mostrar en Lite. Que Pro tenga algo en exclusiva (por ejemplo, el kit de marca o el PDF) es
decisión de la interfaz.

## Pruebas

`tests/design.test.ts` (38 pruebas) cubre: normalización y compatibilidad, capas, grupos, alinear, distribuir,
imán, efectos y curva, formas, marca (con un `platform` falso), redimensionar, animación, LZW y GIF (ida y
vuelta con un decodificador estándar), estructura del PDF (tabla xref) y plantillas (ids únicos, tableros
válidos, texto fuera de la zona que tapa la red).

El pintado se prueba con un contexto 2D falso (que no se rompa) y se revisó a ojo en el navegador. Quedan **sin
probar** en esta rama la grabación real de vídeo (con y sin música), `exportGif` y `exportPdf` en un dispositivo;
la parte pura que usan sí está probada.
