import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { X, Check, ZoomIn, ZoomOut } from "lucide-react";

type Props = {
  imageUrl: string;
  fileName: string;
  mimeType: string;
  aspect: number;
  label?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

/** Generic image cropper that targets a container aspect ratio.
 *  Used for admin uploads (category cards, custom categories) so the
 *  saved image fills its slot without awkward letterboxing. */
export function ImageCropModal({
  imageUrl,
  fileName,
  mimeType,
  aspect,
  label,
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!pixels) return;
    setBusy(true);
    try {
      const file = await cropToFile(imageUrl, pixels, fileName, mimeType);
      onConfirm(file);
    } finally {
      setBusy(false);
    }
  }

  const ratioLabel =
    Math.abs(aspect - 1) < 0.01
      ? "1:1"
      : `${Math.round(aspect * 100) / 100}:1`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-white/15 bg-[#0a0a0a] p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-widest text-white/70">
            Crop {label ?? "image"} ({ratioLabel})
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-white/60 hover:text-white"
            aria-label="Cancel crop"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative h-80 w-full overflow-hidden rounded-lg bg-black">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
            className="rounded p-1 text-white/60 hover:text-white"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={1}
            max={5}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-white"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(5, z + 0.2))}
            className="rounded p-1 text-white/60 hover:text-white"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/20 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !pixels}
            className="inline-flex items-center gap-1 rounded bg-white px-3 py-1.5 text-[11px] text-black hover:bg-white/90 disabled:opacity-60"
          >
            <Check className="h-3 w-3" />
            {busy ? "Saving…" : "Use crop"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function cropToFile(
  src: string,
  area: Area,
  fileName: string,
  mimeType: string,
): Promise<File> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );
  const outType =
    mimeType === "image/png" || mimeType === "image/webp" ? mimeType : "image/jpeg";
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode crop"))),
      outType,
      0.92,
    ),
  );
  const ext = outType === "image/png" ? "png" : outType === "image/webp" ? "webp" : "jpg";
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}-cropped.${ext}`, { type: outType });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default ImageCropModal;
