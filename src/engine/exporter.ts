import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { Project } from "../types";
import type { BrandAssets } from "./kit";
import { ASPECTS, buildTimeline, renderFrame, seekVideosExact } from "./renderer";
import { SAMPLE_RATE, renderSoundtrack } from "../audio/engine";

/** AAC plays everywhere; Opus-in-MP4 is the fallback where the browser can't encode AAC. */
async function pickAudioCodec(): Promise<{ codec: string; mux: "aac" | "opus" } | null> {
  if (typeof AudioEncoder === "undefined") return null;
  for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]] as const) {
    try {
      const { supported } = await AudioEncoder.isConfigSupported({ codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192_000 });
      if (supported) return { codec, mux };
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/** Feed a rendered soundtrack through an AudioEncoder into the muxer. */
async function encodeAudio(buffer: AudioBuffer, codec: string, muxer: Muxer<ArrayBufferTarget>) {
  let error: Error | null = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (error = e as Error) });
  enc.configure({ codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192_000 });
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const block = 4800;
  for (let i = 0; i < buffer.length; i += block) {
    const n = Math.min(block, buffer.length - i);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(i, i + n), 0);
    data.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data });
    enc.encode(ad);
    ad.close();
  }
  await enc.flush();
  enc.close();
  if (error) throw error;
}

export interface ExportOptions {
  fps: number;
  /** 1 = 1080p short side, 2 = 4K-ish. */
  scale: number;
  onProgress?: (k: number) => void;
  signal?: AbortSignal;
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function fileBase(project: Project) {
  const slug = (project.brand.name || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const kind = project.template === "logo-sting" ? "logo-sting" : project.template === "brand-reel" ? "reel" : "in-motion";
  return `${slug || "brand"}-${kind}-${project.aspect.replace(":", "x")}`;
}

async function pickCodec(width: number, height: number): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return null;
  for (const codec of ["avc1.640034", "avc1.640028", "avc1.4d0034", "avc1.42003e"]) {
    const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 12_000_000, framerate: 30 });
    if (supported) return codec;
  }
  return null;
}

/**
 * Render the timeline frame by frame (faster than real time, every frame exact)
 * and encode an MP4 with WebCodecs. Falls back to a real-time WebM recording
 * on browsers without WebCodecs.
 */
export async function exportVideo(project: Project, assets: BrandAssets, opts: ExportOptions) {
  const base = ASPECTS[project.aspect];
  const width = Math.round((base.w * opts.scale) / 2) * 2;
  const height = Math.round((base.h * opts.scale) / 2) * 2;
  const { total } = buildTimeline(project);
  if (total <= 0) throw new Error("Turn on at least one scene first.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const codec = await pickCodec(width, height);
  if (!codec) return exportWebmRealtime(project, assets, canvas, total, opts);

  // The soundtrack is rendered first (a second or two) so it can go in the same file.
  const soundtrack = await renderSoundtrack(project);
  const audioCodec = soundtrack ? await pickAudioCodec() : null;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: opts.fps },
    audio: audioCodec ? { codec: audioCodec.mux, sampleRate: SAMPLE_RATE, numberOfChannels: 2 } : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encodeError = e as Error),
  });
  encoder.configure({ codec, width, height, bitrate: 14_000_000 * opts.scale * opts.scale, framerate: opts.fps });

  const frames = Math.round(total * opts.fps);
  for (let f = 0; f < frames; f++) {
    if (opts.signal?.aborted) {
      encoder.close();
      throw new DOMException("Export cancelled", "AbortError");
    }
    if (encodeError) throw encodeError;
    const t = f / opts.fps;
    const req = renderFrame(ctx, width, height, project, assets, t);
    if (req.length) {
      await seekVideosExact(req);
      renderFrame(ctx, width, height, project, assets, t);
    }
    const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / opts.fps), duration: Math.round(1e6 / opts.fps) });
    encoder.encode(frame, { keyFrame: f % (opts.fps * 2) === 0 });
    frame.close();
    // Keep the encoder queue short and let the UI breathe.
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (f % 6 === 0) {
      opts.onProgress?.(f / frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encoder.flush();
  encoder.close();
  if (soundtrack && audioCodec) await encodeAudio(soundtrack, audioCodec.codec, muxer);
  muxer.finalize();
  opts.onProgress?.(1);
  download(new Blob([target.buffer], { type: "video/mp4" }), fileBase(project) + ".mp4");
}

async function exportWebmRealtime(project: Project, assets: BrandAssets, canvas: HTMLCanvasElement, total: number, opts: ExportOptions) {
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(opts.fps);
  // Play the rendered soundtrack into the recording in real time alongside the frames.
  const soundtrack = await renderSoundtrack(project);
  let audioCtx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  if (soundtrack) {
    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const dest = audioCtx.createMediaStreamDestination();
    source = audioCtx.createBufferSource();
    source.buffer = soundtrack;
    source.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }
  const rec = new MediaRecorder(stream, { mimeType: "video/webm", videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start();
  source?.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= total || opts.signal?.aborted) return resolve();
      renderFrame(ctx, canvas.width, canvas.height, project, assets, t);
      opts.onProgress?.(t / total);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  audioCtx?.close();
  if (opts.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
  download(new Blob(chunks, { type: "video/webm" }), fileBase(project) + ".webm");
}

/** Save the current preview frame as a PNG. */
export function exportStill(project: Project, assets: BrandAssets, t: number) {
  const base = ASPECTS[project.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = base.w;
  canvas.height = base.h;
  renderFrame(canvas.getContext("2d")!, base.w, base.h, project, assets, t);
  canvas.toBlob((b) => b && download(b, `${fileBase(project)}-${t.toFixed(1)}s.png`), "image/png");
}

export function exportProjectFile(project: Project) {
  download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), fileBase(project) + ".logomotion.json");
}
