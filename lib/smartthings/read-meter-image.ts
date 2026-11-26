import { readMeterText } from "./meter-screenshot";

export const imageTypes = ["image/png", "image/jpeg", "image/webp"];

async function screenshotCanvas(file: File, signal: AbortSignal) {
  if (!file.size || file.size > 10 * 1024 * 1024 || (file.type && !imageTypes.includes(file.type))) {
    throw Error("10MB 이하인 PNG, JPG 또는 WebP 캡처를 선택해 주세요.");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signature = [...bytes].map(n => n.toString(16).padStart(2, "0")).join("");
  if (!/^(?:89504e470d0a1a0a|ffd8ff|52494646.{8}57454250)/.test(signature)) {
    throw Error("사진 앱에서 PNG 또는 JPG로 저장한 화면을 선택해 주세요.");
  }
  signal.throwIfAborted();
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const { naturalWidth: w, naturalHeight: h } = image;
    if (!w || !h || w * h > 20_000_000) throw Error("전력과 측정 시각이 보이는 부분만 잘라서 다시 선택해 주세요.");
    const scale = Math.min(1.6, 2500 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const context = canvas.getContext("2d");
    if (!context) throw Error("이 브라우저에서 이미지를 열 수 없어요.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readMeterImage(file: File, signal: AbortSignal) {
  const canvas = await screenshotCanvas(file, signal);
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const root = new URL("/meter-ocr/", window.location.origin).href;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let closed = false;
  let rejectRead!: (error: Error) => void;
  const interruption = new Promise<never>((_, reject) => { rejectRead = reject; });
  const abort = () => rejectRead(new DOMException("Cancelled", "AbortError"));
  const timeout = window.setTimeout(() => rejectRead(Error("읽는 시간이 길어졌어요. 전력 부분을 잘라서 다시 선택해 주세요.")), 90_000);
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const job = async () => {
      const reader = await createWorker(["eng", "kor"], OEM.LSTM_ONLY, {
        workerPath: root + "worker.min.js", corePath: root, langPath: root,
        cacheMethod: "none", workerBlobURL: false,
        errorHandler: () => rejectRead(Error("글자 읽기 도구가 열리지 않았어요. 연결을 확인하고 다시 시도해 주세요.")),
      });
      if (closed) { await reader.terminate(); return null; }
      worker = reader;
      await reader.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      signal.throwIfAborted();
      const result = await reader.recognize(canvas);
      return readMeterText(result.data.text);
    };
    return await Promise.race([job(), interruption]);
  } finally {
    closed = true;
    if (worker) void worker.terminate();
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    canvas.width = canvas.height = 0;
  }
}
