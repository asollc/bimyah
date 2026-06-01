import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { X, Check } from "lucide-react";

type Props = {
  imageUrl: string;
  fileName: string;
  mimeType: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

const ASPECT = 5 / 7;

export function CardCropModal({ imageUrl, fileName, mimeType, onCancel, onConfirm }: Props) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-white/15 bg-[#0a0a0a] p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-widest text-white/70">
            Crop to 5:7
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
            aspect={ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/50">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[var(--gold)]"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-3d btn-3d-dark text-[11px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !pixels}
            className="btn-3d btn-3d-gold inline-flex items-center gap-1 text-[11px] disabled:opacity-60"
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
  const base = fileName.replace(/\.[^.]+$/, "") || "card-back";
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

export default CardCropModal;
