// Fotos sintéticas para probar en el navegador del PC (solo en desarrollo): misma escena con distinta luz y
// dominante, para ver que «edita una y todas quedan igual» las iguala. No son fotos reales.
import type { PickedPhoto } from "@phootflow/core";

function scene(seed: number, ev: number, cast: [number, number, number], portrait: boolean, tilt = 0): Promise<Blob> {
  const w = portrait ? 1200 : 1600, h = portrait ? 1600 : 1200;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  // cámara torcida: el horizonte sube a la derecha `tilt` grados
  g.translate(w / 2, h / 2); g.rotate((-tilt * Math.PI) / 180); g.scale(1.15, 1.15); g.translate(-w / 2, -h / 2);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#7fa6d6"); sky.addColorStop(0.55, "#f1d3a5"); sky.addColorStop(1, "#4a5d3a");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // colinas y árboles
  g.fillStyle = "#3d5b34";
  g.beginPath(); g.moveTo(0, h * 0.7);
  for (let x = 0; x <= w; x += 40) g.lineTo(x, h * (0.66 + 0.04 * Math.sin(x / 120 + seed)));
  g.lineTo(w, h); g.lineTo(0, h); g.fill();
  for (let i = 0; i < 14; i++) {
    const x = ((i * 137 + seed * 61) % w), r = 30 + ((i * 53) % 40);
    g.fillStyle = `hsl(${100 + (i * 7) % 30} 35% ${22 + (i % 4) * 5}%)`;
    g.beginPath(); g.arc(x, h * 0.64, r, 0, 7); g.fill();
  }
  // una «persona»: cabeza y cuerpo
  const px = w * (0.35 + 0.3 * ((seed * 0.37) % 1)), py = h * 0.52;
  g.fillStyle = "#1f2a44"; g.beginPath(); g.ellipse(px, py + h * 0.2, w * 0.09, h * 0.2, 0, 0, 7); g.fill();
  g.fillStyle = "#e0b394"; g.beginPath(); g.ellipse(px, py - h * 0.04, w * 0.045, h * 0.06, 0, 0, 7); g.fill();
  g.fillStyle = "#3a2618"; g.beginPath(); g.ellipse(px, py - h * 0.085, w * 0.048, h * 0.03, 0, 0, 7); g.fill();
  // luces de fondo (para ver el bokeh)
  for (let i = 0; i < 18; i++) {
    g.fillStyle = "rgba(255,240,200,.9)";
    g.beginPath(); g.arc((i * 211 + seed * 97) % w, h * (0.3 + ((i * 29) % 25) / 100), 5, 0, 7); g.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // luz y balance de blancos de la toma, como en una cámara: ganancias por canal en luz lineal
  const lin = (v: number) => Math.pow(v / 255, 2.2), enc = (v: number) => 255 * Math.pow(Math.min(1, v), 1 / 2.2);
  const k = Math.pow(2, ev), gain = cast.map((c) => Math.pow(2, c / 40));
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let j = 0; j < 3; j++) d[i + j] = enc(lin(d[i + j]) * k * gain[j]);
  }
  g.putImageData(img, 0, 0);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
}

export async function samplePhotos(): Promise<PickedPhoto[]> {
  const specs: [number, number, [number, number, number], boolean, number?][] = [
    [1, 0, [0, 0, 0], false], [2, -0.9, [12, 0, -14], false], [3, 0.5, [-8, 2, 14], true],
    [4, -0.4, [0, 6, 0], false, 4], [5, 0.2, [16, 4, -10], true], [6, -1.2, [0, 0, 8], false],
  ];
  return Promise.all(specs.map(async ([s, ev, cast, p, t], i) => ({ name: `ejemplo_${i + 1}.jpg`, blob: await scene(s, ev, cast, p, t ?? 0) })));
}
