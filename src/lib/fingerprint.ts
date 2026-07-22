// Lightweight device fingerprint — best-effort, never PII.
// Returns a bundle of hashed signals combined server-side for duplicate detection.

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canvasHashParts(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 220; c.height = 30;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 120, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("CloudEarn-fp \u2601\ufe0f", 2, 2);
    return c.toDataURL();
  } catch { return ""; }
}

function webglString(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const dbg: any = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const version = gl.getParameter(gl.VERSION);
    return `${vendor}||${renderer}||${version}`;
  } catch { return ""; }
}

async function audioHashString(): Promise<string> {
  try {
    const AC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AC) return "";
    const ctx = new AC(1, 4400, 44100);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 1000;
    const comp = ctx.createDynamicsCompressor();
    osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
    const buf: AudioBuffer = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let s = 0;
    for (let i = 4000; i < data.length; i++) s += Math.abs(data[i]);
    return s.toFixed(6);
  } catch { return ""; }
}

export interface FingerprintBundle {
  fp_hash: string;
  webgl_hash: string;
  audio_hash: string;
  tz: string;
  lang: string;
  platform: string;
}

export async function computeFingerprintBundle(): Promise<FingerprintBundle> {
  const ua = (() => { try { return navigator.userAgent || ""; } catch { return ""; } })();
  const hw = (() => { try { return String((navigator as any).hardwareConcurrency ?? ""); } catch { return ""; } })();
  const mem = (() => { try { return String((navigator as any).deviceMemory ?? ""); } catch { return ""; } })();
  const screenStr = (() => { try { return `${screen.width}x${screen.height}x${screen.colorDepth}`; } catch { return ""; } })();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
  const lang = (() => { try { return navigator.language || ""; } catch { return ""; } })();
  const platform = (() => { try { return (navigator as any).platform || ""; } catch { return ""; } })();
  const canvas = canvasHashParts();
  const webgl = webglString();
  const audio = await audioHashString();

  const [fp_hash, webgl_hash, audio_hash] = await Promise.all([
    sha256([ua, hw, mem, screenStr, tz, canvas].join("||")),
    webgl ? sha256(webgl) : Promise.resolve(""),
    audio ? sha256(audio) : Promise.resolve(""),
  ]);
  return { fp_hash, webgl_hash, audio_hash, tz, lang, platform };
}

/** Back-compat: returns the primary fp_hash string. */
export async function computeFingerprint(): Promise<string> {
  const b = await computeFingerprintBundle();
  return b.fp_hash;
}