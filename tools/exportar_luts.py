"""Exporta la biblioteca de LUT de PhootFlow (escritorio) a archivos para las apps móviles.

Lee ../PhootFlow/assets/luts/biblioteca.npz + .json y escribe en packages/core/assets/luts/:
- <n>.bin: tabla 3D 33³ RGB en uint8, en el orden [b][g][r] que espera texImage3D (r más rápido).
- catalogo.json: [{id, name, group, file, bw}] en el orden de la biblioteca.
Las licencias (MIT, CC BY, CC0) se copian a LICENCIAS.md: las de CC BY obligan a citar al autor.

    python tools/exportar_luts.py [ruta del repo de escritorio]
"""
import json
import os
import shutil
import sys

import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
desk = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "..", "PhootFlow")
src = os.path.join(desk, "assets", "luts")
out = os.path.join(here, "..", "packages", "core", "assets", "luts")
os.makedirs(out, exist_ok=True)

meta = json.load(open(os.path.join(src, "biblioteca.json"), encoding="utf-8"))
cat = []
with np.load(os.path.join(src, "biblioteca.npz")) as z:
    for i, m in enumerate(meta["luts"]):
        a = z[m["array"]].astype(np.int32)
        tab = np.cumsum(np.cumsum(a, axis=1), axis=2) / 4095.0  # inversa de luts.pack_table
        u8 = np.round(np.clip(tab, 0, 1) * 255).astype(np.uint8)
        name = f"{i:02d}.bin"
        u8.tofile(os.path.join(out, name))
        # ¿B/N? la salida no tiene color
        bw = bool(np.abs(tab[..., 0] - tab[..., 1]).max() < 0.02 and np.abs(tab[..., 1] - tab[..., 2]).max() < 0.02)
        cat.append({"id": m["id"], "name": m["name"], "group": m["group"], "file": name, "bw": bw})
json.dump({"size": int(meta["size"]), "luts": cat}, open(os.path.join(out, "catalogo.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
shutil.copy(os.path.join(src, "LICENCIAS.md"), os.path.join(out, "LICENCIAS.md"))
print(f"{len(cat)} LUT -> {out}  ({sum(c['bw'] for c in cat)} de B/N)")
