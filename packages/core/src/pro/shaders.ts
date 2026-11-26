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
