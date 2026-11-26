// Shaders GLSL ES 3.0 del revelado. Un triángulo a pantalla completa; uv (0,0) = arriba a la izquierda de la foto.

export const VERT = `#version 300 es
in vec2 aPos;
uniform float uFlip;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  if (uFlip > 0.5) vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Reduce la foto multiplicando por un peso (máscara) para el desenfoque normalizado: rgb*w, w. */
export const DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform float uUseMask;   // 0: peso 1; 1: peso = máscara; -1: peso = 1 - máscara
uniform vec4 uRect;       // zona de la foto (x, y, w, h)
out vec4 o;
void main() {
  vec2 uv = uRect.xy + vUv * uRect.zw;
  float m = texture(uMask, uv).r;
  float w = uUseMask > 0.5 ? m : (uUseMask < -0.5 ? 1.0 - smoothstep(0.25, 0.6, m) : 1.0);
  o = vec4(texture(uSrc, uv).rgb * w, w);
}`;

/** Desenfoque gaussiano separable de 9 tomas (sigma ≈ 2 · paso). */
export const BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;  // paso en uv
out vec4 o;
const float W[5] = float[](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
void main() {
  vec4 s = texture(uTex, vUv) * W[0];
  for (int i = 1; i < 5; i++) {
    s += texture(uTex, vUv + uDir * float(i)) * W[i];
    s += texture(uTex, vUv - uDir * float(i)) * W[i];
  }
  o = s;
}`;

export const MAIN = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uSrc, uBlurS, uBlurB, uPerson, uSkin, uSel, uFace;
uniform sampler3D uLut, uBwLut;
uniform vec4 uCrop;
uniform vec2 uOut;          // tamaño de salida en px
uniform float uExposure, uContrast, uWarmth, uTint, uSat, uHigh, uShadow;
uniform vec2 uWb;           // ganancias R y B
uniform float uHasLut, uLutAmount, uLutSize;
uniform float uBw, uHasBwLut;
uniform float uBokeh, uBeauty, uGrain, uVignette, uSeed;
uniform float uSplash, uHueCount, uHueTol, uUseSel;
uniform float uEyes, uTeeth, uUnder;   // retrato completo 0..1
uniform float uAngle, uZoom, uAspect;  // enderezar
uniform float uSpeed; uniform vec2 uSpeedDir;
uniform vec4 uHues;      // tonos 0..1
out vec4 o;

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// hombro suave: por encima de t se acerca a 1 sin quemar
vec3 shoulder(vec3 x) {
  const float t = 0.8;
  vec3 y = t + (1.0 - t) * (1.0 - exp(-(x - t) / (1.0 - t)));
  return mix(x, y, step(t, x));
}
vec3 lut(sampler3D l, vec3 c) {
  float n = uLutSize;
  return texture(l, clamp(c, 0.0, 1.0) * ((n - 1.0) / n) + 0.5 / n).rgb;
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 toBw(vec3 c) {
  if (uHasBwLut > 0.5) return lut(uBwLut, c);
  float y = dot(clamp(c, 0.0, 1.0), vec3(0.30, 0.59, 0.11));
  y = mix(y, y * y * (3.0 - 2.0 * y), 0.35);
  return vec3(y);
}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

void main() {
  vec2 uv = uCrop.xy + vUv * uCrop.zw;
  if (uAngle != 0.0) {
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    float ca = cos(uAngle), sa = sin(uAngle);
    p = mat2(ca, sa, -sa, ca) * p / uZoom;
    uv = p / vec2(uAspect, 1.0) + 0.5;
  }
  vec3 s = texture(uSrc, uv).rgb;

  // Belleza: separación de frecuencias solo en la piel (el desenfoque solo mezcla piel con piel)
  if (uBeauty > 0.0) {
    float m = smoothstep(0.35, 0.75, texture(uSkin, uv).r);
    // ojos, iris y boca (puntos de la cara, si se han calculado) no se suavizan nunca
    vec4 fp = texture(uFace, uv);
    m *= 1.0 - smoothstep(0.05, 0.4, max(max(fp.r, fp.g), fp.b));
    vec4 b = texture(uBlurS, uv);
    vec3 smoothSkin = b.a > 0.02 ? b.rgb / b.a : s;
    vec3 detail = s - smoothSkin;
    // Solo se suaviza lo de poco contraste (poros, granitos, rojeces); los bordes marcados —ojos, cejas, labios,
    // pestañas, contorno— se quedan como están, así la cara no se «desvanece».
    float edge = smoothstep(0.035, 0.11, length(detail));
    float k = 0.65 * uBeauty * (1.0 - edge);
    vec3 r = s - detail * k;
    // el tono se iguala un poco (rojeces), sin aclarar la piel
    float Y = dot(r, vec3(0.299, 0.587, 0.114)), Ys = dot(smoothSkin, vec3(0.299, 0.587, 0.114));
    r = mix(r, smoothSkin * (Y / max(Ys, 1e-3)), 0.25 * uBeauty * (1.0 - edge));
    // fuera del centro de la piel (bordes de la máscara: pelo, cejas, fondo) aún menos
    s = mix(s, r, m * m);
  }

  // Retrato completo: ojos (blanco más limpio y algo de luz), iris (más color), dientes (sin amarillo), ojeras
  if (uEyes + uTeeth + uUnder > 0.0) {
    vec4 fm = texture(uFace, uv);
    float Y0 = dot(s, vec3(0.299, 0.587, 0.114));
    if (uEyes > 0.0) {
      float e = fm.r * uEyes;
      vec3 white = mix(s, vec3(Y0), 0.5) * 1.06;            // el blanco del ojo, menos rojo
      s = mix(s, white, e * smoothstep(0.35, 0.6, Y0) * (1.0 - fm.g));
      s = mix(s, s * 1.06 + 0.01, e * 0.6);                  // un poco de luz
      vec3 vivid = mix(vec3(Y0), s, 1.35) * 1.05;            // iris con más color
      s = mix(s, vivid, fm.g * uEyes);
    }
    if (uTeeth > 0.0) {
      float t = fm.b * uTeeth * smoothstep(0.28, 0.5, Y0);   // solo lo claro de la boca: los dientes
      s = mix(s, vec3(Y0 * 1.07 + 0.015), t * 0.75);
    }
    if (uUnder > 0.0) {
      float u = fm.a * uUnder;
      vec3 lifted = s * 1.10 + vec3(0.02, 0.015, 0.01);      // la luz algo cálida del pómulo
      s = mix(s, lifted, u * 0.7);
    }
  }

  vec3 c = toLin(s);

  // Desenfoque de fondo: fondo desenfocado sin la persona (no hay halo) y la persona nítida encima
  if (uBokeh > 0.0) {
    float m = smoothstep(0.3, 0.7, texture(uPerson, uv).r);
    vec4 b = texture(uBlurB, uv);
    vec3 bg = b.a > 0.02 ? toLin(b.rgb / b.a) : c;
    bg *= 1.0 + 0.6 * uBokeh * smoothstep(0.5, 1.0, lum(bg));  // las luces se abren como discos
    c = mix(bg, c, m);
  }

  // Efecto velocidad: el fondo se barre en una dirección; solo se mezcla fondo con fondo (la persona no se arrastra)
  if (uSpeed > 0.0) {
    float m = smoothstep(0.3, 0.7, texture(uPerson, uv).r);
    vec3 acc = vec3(0.0);
    float ws = 0.0;
    for (int i = -12; i <= 12; i++) {
      vec2 q = uv + uSpeedDir * float(i);
      float wq = 1.0 - smoothstep(0.3, 0.7, texture(uPerson, q).r);
      acc += toLin(texture(uSrc, q).rgb) * wq;
      ws += wq;
    }
    vec3 motion = ws > 0.5 ? acc / ws : c;
    c = mix(motion, c, m);
  }

  // Balance, temperatura y tinte
  c *= vec3(uWb.x * exp2(uWarmth * 0.35), exp2(-uTint * 0.25), uWb.y * exp2(-uWarmth * 0.35));
  c *= exp2(uExposure);

  // Sombras y luces sobre la luminancia
  float L = lum(c);
  c *= 1.0 + uShadow * 0.9 * (1.0 - smoothstep(0.0, 0.18, L));
  c *= 1.0 + uHigh * 0.45 * smoothstep(0.25, 1.2, L);

  c = toSrgb(shoulder(c));

  // Contraste en curva S alrededor del gris medio
  if (uContrast > 0.0) c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  else c = mix(c, 0.5 + (c - 0.5) * 0.55, -uContrast);

  // Saturación
  float Y = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(Y), c, 1.0 + uSat);

  // Filtro (LUT)
  if (uHasLut > 0.5) c = mix(c, lut(uLut, c), uLutAmount);

  // Blanco y negro (la copia en B/N es entera en B/N, también con color selectivo)
  if (uBw > 0.5) c = toBw(c);
  else if (uSplash > 0.5) {
    // Color selectivo: se queda en color lo que cumple el tono Y el elemento elegidos
    float keep = 1.0;
    if (uHueCount > 0.5) {
      vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
      float hw = 0.0;
      for (int i = 0; i < 4; i++) {
        if (float(i) >= uHueCount) break;
        float d = abs(hsv.x - uHues[i]);
        d = min(d, 1.0 - d);
        hw = max(hw, 1.0 - smoothstep(uHueTol * 0.55, uHueTol, d));
      }
      keep *= hw * smoothstep(0.07, 0.2, hsv.y) * smoothstep(0.03, 0.1, hsv.z);
    }
    if (uUseSel > 0.5) keep *= smoothstep(0.3, 0.7, texture(uSel, uv).r);
    c = mix(toBw(c), c, keep);
  }

  // Viñeta (respeta la forma del encuadre)
  vec2 d = (vUv - 0.5) * vec2(uOut.x / max(uOut.x, uOut.y), uOut.y / max(uOut.x, uOut.y)) * 2.0;
  c *= 1.0 - uVignette * 0.55 * smoothstep(0.35, 1.25, length(d));

  // Grano, más en los medios tonos
  if (uGrain > 0.0) {
    float n = hash(vUv * uOut + uSeed) + hash(vUv * uOut * 1.7 - uSeed) - 1.0;
    float yy = dot(c, vec3(0.3, 0.59, 0.11));
    c += n * uGrain * 0.09 * (1.0 - abs(yy - 0.5) * 1.2);
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
