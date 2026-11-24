/// <reference lib="webworker" />
/**
 * ONNX Runtime Web inference off the main thread (the Cesium map never blocks).
 * The model's SHA-256 is verified against the manifest before it is used.
 */
import * as ort from "onnxruntime-web/wasm";

// static hosting has no COOP/COEP → no SharedArrayBuffer threads; Vite bundles the .wasm as an asset
ort.env.wasm.numThreads = 1;

let session: ort.InferenceSession | null = null;

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const buf = await (await fetch(msg.url)).arrayBuffer();
      const digest = await sha256(buf);
      if (digest !== msg.sha256) throw new Error(`model checksum mismatch (${digest.slice(0, 12)}… ≠ ${String(msg.sha256).slice(0, 12)}…)`);
      session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
      self.postMessage({ type: "loaded", bytes: buf.byteLength, sha256: digest });
    } else if (msg.type === "run") {
      if (!session) throw new Error("model not loaded");
      const input = new ort.Tensor("float32", msg.data as Float32Array, [1, 1, 256, 256]);
      const t = performance.now();
      const out = await session.run({ [session.inputNames[0]]: input });
      const ms = performance.now() - t;
      const logits = out[session.outputNames[0]].data as Float32Array;
      const prob = new Float32Array(logits.length);
      for (let i = 0; i < logits.length; i++) prob[i] = 1 / (1 + Math.exp(-logits[i]));
      self.postMessage({ type: "result", prob, ms }, [prob.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err instanceof Error ? err.message : err) });
  }
};
