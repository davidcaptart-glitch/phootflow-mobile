"""Deja los modelos de IA que sirve la propia app en apps/*/public/modelos/ (no van a git: .gitignore).

- real_esrgan_general_x4v3.onnx + .data  (Mejorar con IA; BSD-3; ≈5 MB; los pesos van en el .data). Del zip oficial de Qualcomm AI Hub, el mismo
  que descarga PhootFlow escritorio, con la misma comprobación SHA-256 (fx_engine.UPSCALE_SHA256).
- migan_pipeline_v2.onnx  (Quitar objetos y personas; MIT; ≈28 MB). De Hugging Face (andraniksargsyan/migan).
- face_recognition_sface_2021dec.onnx  (Personas; Apache-2.0; ≈39 MB). Se copia de %APPDATA%\\PhootFlow\\modelos si
  el escritorio ya lo descargó; si no, de OpenCV Zoo.

    python tools/modelos.py
"""
import hashlib
import io
import os
import shutil
import sys
import urllib.request
import zipfile

here = os.path.dirname(os.path.abspath(__file__))
APPS = [os.path.join(here, "..", "apps", a, "public", "modelos") for a in ("lite", "pro")]
DESK = os.path.join(os.environ.get("APPDATA", ""), "PhootFlow", "modelos")

ESRGAN_URL = ("https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/"
              "real_esrgan_general_x4v3/releases/v0.66.0/real_esrgan_general_x4v3-onnx-float.zip")
ESRGAN_SHA = "fc094329b24a00c936ebc1cc4c51bc59633e7dc36f4a553344342171cbd3c7cf"
MIGAN = "migan_pipeline_v2.onnx"
MIGAN_URL = "https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx"
MIGAN_SHA = "6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b"
SFACE = "face_recognition_sface_2021dec.onnx"
SFACE_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/"
             "face_recognition_sface_2021dec.onnx")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "PhootFlow"}), timeout=120) as r:
        return r.read()


def put(name, data):
    for d in APPS:
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), "wb") as f:
            f.write(data)
    print(f"{name}: {len(data) / 1e6:.1f} MB")


def esrgan(zip_bytes=None):
    names = ("real_esrgan_general_x4v3.onnx", "real_esrgan_general_x4v3.data")
    if all(os.path.exists(os.path.join(d, n)) for d in APPS for n in names):
        return print("Real-ESRGAN: ya está")
    z = zip_bytes or get(ESRGAN_URL)
    if hashlib.sha256(z).hexdigest() != ESRGAN_SHA:
        sys.exit("El zip de Real-ESRGAN no supera la comprobación SHA-256")
    with zipfile.ZipFile(io.BytesIO(z)) as zf:
        # el .onnx lleva los pesos aparte (.data); onnxruntime-web los carga con externalData
        for n in names:
            member = next(m for m in zf.namelist() if m.endswith("/" + n) or m == n)
            put(n, zf.read(member))


def migan():
    """MI-GAN (Picsart AI Research, MIT): quitar objetos y personas rellenando el hueco. ≈28 MB."""
    if all(os.path.exists(os.path.join(d, MIGAN)) for d in APPS):
        return print(f"{MIGAN}: ya está")
    data = get(MIGAN_URL)
    sha = hashlib.sha256(data).hexdigest()
    if MIGAN_SHA and sha != MIGAN_SHA:
        sys.exit("MI-GAN no supera la comprobación SHA-256")
    print(f"{MIGAN}: SHA-256 {sha}")
    put(MIGAN, data)


def sface():
    src = os.path.join(DESK, SFACE)
    if os.path.exists(src):
        for d in APPS:
            os.makedirs(d, exist_ok=True)
            shutil.copy(src, os.path.join(d, SFACE))
        return print(f"{SFACE}: copiado del escritorio")
    put(SFACE, get(SFACE_URL))


if __name__ == "__main__":
    what = sys.argv[1:] or ["esrgan", "sface", "migan"]
    if "migan" in what:
        migan()
    if "sface" in what:
        sface()
    if "esrgan" in what:
        esrgan()
