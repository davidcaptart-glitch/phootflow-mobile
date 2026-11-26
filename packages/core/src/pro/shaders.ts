// Shader del revelado de Pro (una pasada). Entradas: la foto y tres desenfoques de ella para el detalle (fino),
// la textura (medio), la claridad (grande) y la neblina (muy grande). El orden imita a Lightroom:
// detalle → balance y exposición (lineal) → neblina → luces/sombras/blancos/negros → presencia → curva →
// mezcla de color → intensidad y saturación → gradación → perfil (LUT) → B/N → viñeta → grano.

export const PRO_MAIN = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uSrc, uB1, uBT, uB2, uB3, uCurve;
uniform sampler3D uLut;
uniform vec4 uCrop;
uniform vec2 uOut;
uniform float uAspect, uAngle, uZoom, uFlipH, uRot;    // geometría
uniform vec2 uWb;
uniform float uTemp, uTint, uExposure, uContrast, uHigh, uShadow, uWhites, uBlacks;
uniform float uVib, uSat, uTexture, uClarity, uDehaze;
uniform float uHasCurve;
uniform vec3 uHsl[8];
uniform float uHasHsl;
uniform vec3 uGradeS, uGradeM, uGradeH, uGradeG;   // (tono 0..1, sat 0..1, lum −1..1)
uniform float uBlend, uBalance, uHasGrade;
uniform float uSharpen, uSharpMask, uNoise, uColorNoise;
uniform float uVignette, uVigMid, uGrain, uGrainSize, uSeed;
uniform float uHasLut, uLutAmount, uLutSize;
uniform float uBw;
uniform float uBwMix[8];
uniform float uOriginal;   // 1 = sin ajustes (antes)
out vec4 o;

const float HUES[8] = float[](0.0, 30.0, 60.0, 120.0, 180.0, 225.0, 270.0, 315.0);

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 shoulder(vec3 x) {
  const float t = 0.8;
  vec3 y = t + (1.0 - t) * (1.0 - exp(-(x - t) / (1.0 - t)));
  return mix(x, y, step(t, x));
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
// peso de cada uno de los 8 colores para un tono (grados): interpolación lineal entre centros vecinos
void bandWeights(float h, out float w[8]) {
  for (int i = 0; i < 8; i++) w[i] = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = HUES[i];
    float b = i == 7 ? 360.0 : HUES[i + 1];
    float hh = h < a ? h + 360.0 : h;
    if (hh >= a && hh < b) {
      float t = (hh - a) / (b - a);
      w[i] = 1.0 - t;
      w[i == 7 ? 0 : i + 1] = t;
    }
  }
}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec3 lut3(vec3 c) {
  float n = uLutSize;
  return texture(uLut, clamp(c, 0.0, 1.0) * ((n - 1.0) / n) + 0.5 / n).rgb;
}

vec2 sourceUv(vec2 v) {
  vec2 q = uCrop.xy + v * uCrop.zw;                 // dentro de la foto girada
  if (uFlipH > 0.5) q.x = 1.0 - q.x;
  if (uAngle != 0.0) {
    vec2 p = (q - 0.5) * vec2(uAspect, 1.0);
    float ca = cos(uAngle), sa = sin(uAngle);
    p = mat2(ca, sa, -sa, ca) * p / uZoom;
    q = p / vec2(uAspect, 1.0) + 0.5;
  }
  // deshacer el giro de 90° (uRot: 0, 1, 2, 3 cuartos de vuelta a la derecha)
  if (uRot > 2.5) q = vec2(1.0 - q.y, q.x);
  else if (uRot > 1.5) q = vec2(1.0 - q.x, 1.0 - q.y);
  else if (uRot > 0.5) q = vec2(q.y, 1.0 - q.x);
  return q;
}

void main() {
  vec2 uv = sourceUv(vUv);
  vec3 s = texture(uSrc, uv).rgb;
  if (uOriginal > 0.5) { o = vec4(s, 1.0); return; }
  vec3 b1 = texture(uB1, uv).rgb, bt = texture(uBT, uv).rgb, b2 = texture(uB2, uv).rgb, b3 = texture(uB3, uv).rgb;
  vec3 s0 = s;

  // ---- Detalle (en sRGB, sobre la foto): ruido, color del ruido y enfoque
  if (uNoise > 0.0) {
    float e = length(s - b1);
    s = mix(s, b1, uNoise * (1.0 - smoothstep(0.015, 0.09, e)));
  }
  if (uColorNoise > 0.0) {
    float Y = lum(s);
    s = mix(s, vec3(Y) + (bt - vec3(lum(bt))), uColorNoise);
  }
  if (uSharpen > 0.0) {
    float edge = smoothstep(uSharpMask * 0.12, uSharpMask * 0.12 + 0.03, length(s0 - bt));
    s += (s0 - b1) * uSharpen * 1.6 * edge;
  }
  if (uTexture != 0.0) s += (b1 - bt) * uTexture * 1.4;

  vec3 c = toLin(clamp(s, 0.0, 1.0));

  // ---- Balance de blancos y exposición
  c *= vec3(uWb.x * exp2(uTemp * 0.35), exp2(-uTint * 0.25), uWb.y * exp2(-uTemp * 0.35));
  c *= exp2(uExposure);

  // ---- Neblina (canal oscuro de la versión muy desenfocada)
  if (uDehaze != 0.0) {
    vec3 hz = toLin(b3) * vec3(uWb.x, 1.0, uWb.y) * exp2(uExposure);
    float dark = min(min(hz.r, hz.g), hz.b);
    if (uDehaze > 0.0) {
      float t = uDehaze * 0.85 * clamp(dark, 0.0, 0.9);
      c = max(c - t, 0.0) / max(1.0 - t, 0.15);
    } else {
      c = mix(c, vec3(lum(c)) * 0.6 + 0.25, -uDehaze * 0.45);
    }
  }

  // ---- Tono por zonas
  float L = lum(c);
  c *= 1.0 + uShadow * 0.9 * (1.0 - smoothstep(0.0, 0.2, L));
  c *= 1.0 + uHigh * 0.5 * smoothstep(0.2, 1.2, L);
  c *= 1.0 + uWhites * 0.45 * smoothstep(0.45, 1.6, L);
  if (uBlacks > 0.0) c += uBlacks * 0.02 * (1.0 - smoothstep(0.0, 0.1, L));
  else c *= 1.0 + uBlacks * 0.85 * (1.0 - smoothstep(0.0, 0.07, L));

  c = toSrgb(shoulder(c));

  // ---- Claridad (contraste local en los medios tonos)
  if (uClarity != 0.0) {
    float Y = lum(c);
    float d = lum(s0) - lum(b2);
    c += d * uClarity * 1.1 * (1.0 - clamp(abs(Y - 0.5) * 1.7, 0.0, 1.0));
  }
  c = clamp(c, 0.0, 1.0);

  // ---- Contraste
  if (uContrast > 0.0) c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  else c = mix(c, 0.5 + (c - 0.5) * 0.55, -uContrast);

  // ---- Curva (general y por canal)
  if (uHasCurve > 0.5) {
    c = vec3(texture(uCurve, vec2(c.r * 255.0 / 256.0 + 0.5 / 256.0, 0.5)).a,
             texture(uCurve, vec2(c.g * 255.0 / 256.0 + 0.5 / 256.0, 0.5)).a,
             texture(uCurve, vec2(c.b * 255.0 / 256.0 + 0.5 / 256.0, 0.5)).a);
    c = vec3(texture(uCurve, vec2(c.r * 255.0 / 256.0 + 0.5 / 256.0, 0.5)).r,
             texture(uCurve, vec2(c.g * 255.0 / 256.0 + 0.5 / 256.0, 0.5)).g,
             texture(uCurve, vec2(c.b * 255.0 / 256.0 + 0.5 / 256.0, 0.5)).b);
  }

  // ---- Mezcla de color (tono, saturación y luminancia de 8 colores)
  if (uHasHsl > 0.5) {
    vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
    float w[8];
    bandWeights(hsv.x * 360.0, w);
    vec3 a = vec3(0.0);
    for (int i = 0; i < 8; i++) a += uHsl[i] * w[i];
    float sw = smoothstep(0.04, 0.25, hsv.y);           // los grises no cambian
    hsv.x = fract(hsv.x + a.x * 0.085 * sw);
    hsv.y = clamp(hsv.y * (1.0 + a.y * sw), 0.0, 1.0);
    vec3 n = hsv2rgb(hsv);
    n *= 1.0 + a.z * 0.45 * sw;
    c = n;
  }

  // ---- Intensidad (protege lo ya saturado y la piel) y saturación
  if (uVib != 0.0) {
    vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
    float skin = 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.06, abs(hsv.x - 0.07)));
    float k = uVib * (1.0 - hsv.y) * (uVib > 0.0 ? skin : 1.0);
    float Y = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(Y), c, 1.0 + k);
  }
  if (uSat != 0.0) {
    float Y = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(Y), c, 1.0 + uSat);
  }

  // ---- Gradación de color
  if (uHasGrade > 0.5) {
    float Y = clamp(lum(c), 0.0, 1.0);
    float wid = 0.25 + uBlend * 0.5;
    float mid = 0.5 + uBalance * 0.3;
    float ws = 1.0 - smoothstep(mid - wid, mid, Y);
    float wh = smoothstep(mid, mid + wid, Y);
    float wm = clamp(1.0 - ws - wh, 0.0, 1.0);
    vec3 ts = (hsv2rgb(vec3(uGradeS.x, 1.0, 1.0)) - 0.5) * uGradeS.y;
    vec3 tm = (hsv2rgb(vec3(uGradeM.x, 1.0, 1.0)) - 0.5) * uGradeM.y;
    vec3 th = (hsv2rgb(vec3(uGradeH.x, 1.0, 1.0)) - 0.5) * uGradeH.y;
    vec3 tg = (hsv2rgb(vec3(uGradeG.x, 1.0, 1.0)) - 0.5) * uGradeG.y;
    c += (ts * ws + tm * wm + th * wh + tg) * 0.35;
    c += (uGradeS.z * ws + uGradeM.z * wm + uGradeH.z * wh + uGradeG.z) * 0.18;
  }

  // ---- Perfil (LUT)
  if (uHasLut > 0.5) c = mix(c, lut3(c), uLutAmount);

  // ---- Blanco y negro con mezcla por colores
  if (uBw > 0.5) {
    vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
    float w[8];
    bandWeights(hsv.x * 360.0, w);
    float m = 0.0;
    for (int i = 0; i < 8; i++) m += uBwMix[i] * w[i];
    float y = dot(clamp(c, 0.0, 1.0), vec3(0.30, 0.59, 0.11));
    y *= 1.0 + m * 0.7 * smoothstep(0.03, 0.3, hsv.y);
    c = vec3(y);
  }

  // ---- Viñeta (según la forma del encuadre; el punto medio la acerca o la aleja del centro)
  if (uVignette != 0.0) {
    vec2 d = (vUv - 0.5) * vec2(uOut.x / max(uOut.x, uOut.y), uOut.y / max(uOut.x, uOut.y)) * 2.0;
    float r0 = 0.15 + uVigMid * 0.85;
    float v = smoothstep(r0, r0 + 0.9, length(d));
    c = uVignette < 0.0 ? c * (1.0 + uVignette * 0.8 * v) : mix(c, vec3(1.0), uVignette * 0.7 * v);
  }

  // ---- Grano
  if (uGrain > 0.0) {
    vec2 g = floor(vUv * uOut / (1.0 + uGrainSize * 3.0));
    float n = hash(g + uSeed) + hash(g * 1.7 - uSeed) - 1.0;
    float yy = dot(c, vec3(0.3, 0.59, 0.11));
    c += n * uGrain * 0.1 * (1.0 - abs(yy - 0.5) * 1.2);
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Ajustes de UNA máscara sobre la imagen ya revelada (como masks.adjust de escritorio), fundidos con su alfa.
 * El alfa está en coordenadas de la foto original: se busca con la misma geometría que el revelado. */
export const PRO_LOCAL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uIn, uAlpha, uSrc, uB1, uBT, uB2, uB3;
uniform vec4 uCrop;
uniform float uAspect, uAngle, uZoom, uFlipH, uRot;
uniform float uBasic[7];     // exposición, contraste, altas luces, sombras, temperatura, matiz, nitidez
uniform float uPres[5];      // textura, claridad, neblina, intensidad, saturación
uniform float uCurveZ[4];    // iluminaciones, claros, oscuros, sombras
uniform vec3 uHslM[8];
uniform float uGradeM[8];    // sh tono, sh sat, mid tono, mid sat, hi tono, hi sat, fusión, equilibrio
uniform float uShow;         // ver la máscara en magenta
uniform float uFlag;         // 1 = hay color/curva que aplicar
out vec4 o;

const float HUES[8] = float[](0.0, 30.0, 60.0, 120.0, 180.0, 225.0, 270.0, 315.0);
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
void bandWeights(float h, out float w[8]) {
  for (int i = 0; i < 8; i++) w[i] = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = HUES[i];
    float b = i == 7 ? 360.0 : HUES[i + 1];
    float hh = h < a ? h + 360.0 : h;
    if (hh >= a && hh < b) { float t = (hh - a) / (b - a); w[i] = 1.0 - t; w[i == 7 ? 0 : i + 1] = t; }
  }
}
vec2 sourceUv(vec2 v) {
  vec2 q = uCrop.xy + v * uCrop.zw;
  if (uFlipH > 0.5) q.x = 1.0 - q.x;
  if (uAngle != 0.0) {
    vec2 p = (q - 0.5) * vec2(uAspect, 1.0);
    float ca = cos(uAngle), sa = sin(uAngle);
    p = mat2(ca, sa, -sa, ca) * p / uZoom;
    q = p / vec2(uAspect, 1.0) + 0.5;
  }
  if (uRot > 2.5) q = vec2(1.0 - q.y, q.x);
  else if (uRot > 1.5) q = vec2(1.0 - q.x, 1.0 - q.y);
  else if (uRot > 0.5) q = vec2(q.y, 1.0 - q.x);
  return q;
}
// curva tonal por zonas (como la paramétrica de Studio): cuatro campanas centradas en cada cuarto
float zoneCurve(float x) {
  float y = x;
  y += uCurveZ[0] * 0.22 * smoothstep(0.5, 0.875, x) * (1.0 - smoothstep(0.875, 1.0, x) * 0.6);
  y += uCurveZ[1] * 0.20 * exp(-pow((x - 0.625) / 0.16, 2.0));
  y += uCurveZ[2] * 0.20 * exp(-pow((x - 0.375) / 0.16, 2.0));
  y += uCurveZ[3] * 0.22 * (1.0 - smoothstep(0.125, 0.5, x)) * (smoothstep(0.0, 0.125, x) * 0.6 + 0.4);
  return y;
}

void main() {
  vec3 y = texture(uIn, vec2(vUv.x, 1.0 - vUv.y)).rgb;   // el FBO tiene la fila de abajo primero
  vec2 uv = sourceUv(vUv);
  float a = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : texture(uAlpha, uv).r;
  vec3 out3 = y;
  if (a > 0.001) {
    // exposición, temperatura y matiz en lineal con hombro suave
    if (uBasic[0] != 0.0 || uBasic[4] != 0.0 || uBasic[5] != 0.0) {
      vec3 l = toLin(out3) * exp2(uBasic[0]);
      vec3 g = vec3(exp2(0.35 * uBasic[4]), exp2(-0.25 * uBasic[5]), exp2(-0.35 * uBasic[4]));
      l *= g / dot(g, vec3(0.2126, 0.7152, 0.0722));
      const float k = 0.85;
      l = mix(l, k + (1.0 - k) * (1.0 - exp(-(l - k) / (1.0 - k))), step(k, l));
      out3 = toSrgb(l);
    }
    float L = lum(out3);
    vec3 s = texture(uSrc, uv).rgb;
    float ls = lum(s);
    float d = 0.0;
    if (uBasic[1] != 0.0) d += (L * L * (3.0 - 2.0 * L) - L) * uBasic[1];
    if (uBasic[2] != 0.0) d += pow(clamp((L - 0.45) / 0.55, 0.0, 1.0), 1.5) * 0.35 * uBasic[2];
    if (uBasic[3] != 0.0) d += pow(clamp(1.0 - L / 0.55, 0.0, 1.0), 1.5) * 0.35 * uBasic[3];
    if (uPres[1] != 0.0) d += (ls - lum(texture(uB2, uv).rgb)) * 0.9 * uPres[1];
    if (uPres[0] != 0.0) d += (ls - lum(texture(uBT, uv).rgb)) * 0.8 * uPres[0];
    if (uBasic[6] != 0.0) d += (ls - lum(texture(uB1, uv).rgb)) * 1.4 * uBasic[6];
    out3 += d;
    if (uPres[2] != 0.0) {
      out3 = clamp(out3, 0.0, 1.0);
      vec3 b3 = texture(uB3, uv).rgb;
      float dc = min(min(b3.r, b3.g), b3.b);
      if (uPres[2] > 0.0) { float v = 0.7 * uPres[2] * dc; out3 = (out3 - v) / max(1.0 - v, 0.25); }
      else out3 = out3 + (-uPres[2]) * 0.45 * (0.8 - out3) * (0.4 + dc);
    }
    if (uPres[4] != 0.0) { float g = lum(out3); out3 = g + (out3 - g) * (1.0 + uPres[4]); }
    if (uFlag > 0.5) {
      out3 = clamp(out3, 0.0, 1.0);
      // curva tonal por zonas
      out3 = vec3(zoneCurve(out3.r), zoneCurve(out3.g), zoneCurve(out3.b));
      // mezcla de color
      vec3 hsv = rgb2hsv(clamp(out3, 0.0, 1.0));
      float w[8];
      bandWeights(hsv.x * 360.0, w);
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 8; i++) acc += uHslM[i] * w[i];
      float sw = smoothstep(0.04, 0.25, hsv.y);
      hsv.x = fract(hsv.x + acc.x * 0.085 * sw);
      hsv.y = clamp(hsv.y * (1.0 + acc.y * sw), 0.0, 1.0);
      out3 = hsv2rgb(hsv) * (1.0 + acc.z * 0.45 * sw);
      // intensidad
      if (uPres[3] != 0.0) {
        vec3 h2 = rgb2hsv(clamp(out3, 0.0, 1.0));
        float k = uPres[3] * (1.0 - h2.y);
        float Y = dot(out3, vec3(0.299, 0.587, 0.114));
        out3 = mix(vec3(Y), out3, 1.0 + k);
      }
      // gradación por tonos
      float Y = clamp(lum(out3), 0.0, 1.0);
      float wid = 0.25 + uGradeM[6] * 0.5, mid = 0.5 + uGradeM[7] * 0.3;
      float ws = 1.0 - smoothstep(mid - wid, mid, Y), wh = smoothstep(mid, mid + wid, Y), wm = clamp(1.0 - ws - wh, 0.0, 1.0);
      out3 += ((hsv2rgb(vec3(uGradeM[0], 1.0, 1.0)) - 0.5) * uGradeM[1] * ws
             + (hsv2rgb(vec3(uGradeM[2], 1.0, 1.0)) - 0.5) * uGradeM[3] * wm
             + (hsv2rgb(vec3(uGradeM[4], 1.0, 1.0)) - 0.5) * uGradeM[5] * wh) * 0.35;
    }
    out3 = clamp(out3, 0.0, 1.0);
  }
  vec3 r = mix(y, out3, a);
  if (uShow > 0.5) r = mix(r, vec3(0.96, 0.05, 0.54), 0.55 * a);
  o = vec4(r, 1.0);
}`;

/** Copia una textura a la pantalla (última pasada). */
export const PRO_COPY = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uIn;
out vec4 o;
void main() { o = vec4(texture(uIn, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0); }`;
