import { createRequire } from 'module';
import path from 'path';
import { env } from '@core/config/env';
import { logger } from '@core/config/logger';
import { FaceMatchResult } from '@features/applications/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type HumanInstance = any;

let humanPromise: Promise<HumanInstance> | null = null;

// The `@vladmandic/human` `exports` map doesn't expose the `.js` subpaths, so
// resolve the Node+WASM build by its on-disk path (bypasses exports resolution).
// This avoids the native `tfjs-node` binding that segfaults on Railway / Apple Silicon.
const nodeRequire = createRequire(__filename);
const humanWasmPath = path.join(
  path.dirname(nodeRequire.resolve('@vladmandic/human')),
  'human.node-wasm.js',
);
// Local path to the WASM backend's `.wasm` binaries (read from disk, not CDN).
const wasmPath = path.dirname(nodeRequire.resolve('@tensorflow/tfjs-backend-wasm')) + path.sep;

/**
 * Lazily load and cache the Human model. Uses the Node+WASM build
 * (`human.node-wasm.js`) so there is NO native C++ binary — this avoids the
 * tfjs-node segfault/arch-mismatch that crashes containers on Railway and
 * Apple Silicon. Falls back to graceful NEEDS_REVIEW if it can't initialise.
 */
async function getHuman(): Promise<HumanInstance> {
  if (!humanPromise) {
    humanPromise = (async () => {
      const { Human } = await import(humanWasmPath);
      const config = {
        backend: 'wasm' as const,
        wasmPath: wasmPath,
        modelBasePath: 'https://vladmandic.github.io/human-models/models/',
        debug: false,
        async: false,
        face: {
          enabled: true,
          detector: { enabled: true, rotation: true },
          mesh: { enabled: false },
          iris: { enabled: false },
          description: { enabled: true }, // enables face embedding
          emotion: { enabled: false },
          liveness: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
      };
      const human = new Human(config);
      await human.load();
      return human;
    })();
  }
  return humanPromise;
}

export async function compareFaces(selfie: Buffer, document: Buffer): Promise<FaceMatchResult> {
  if (!env.FACE_MATCH_ENABLED) {
    return { modelLoaded: false, error: 'Face match disabled by configuration' };
  }

  try {
    const human = await getHuman();
    const [selfieResult, docResult] = await Promise.all([
      human.detect(selfie),
      human.detect(document),
    ]);

    const selfieEmbedding = extractEmbedding(selfieResult);
    const docEmbedding = extractEmbedding(docResult);

    if (!selfieEmbedding || !docEmbedding) {
      return { modelLoaded: true, error: 'Could not detect a face in one or both images' };
    }

    const similarity = cosineSimilarity(selfieEmbedding, docEmbedding);
    return { modelLoaded: true, similarity, matched: similarity >= env.FACE_MATCH_THRESHOLD };
  } catch (error) {
    logger.error('Face match failed', { error });
    return { modelLoaded: false, error: (error as Error).message };
  }
}

function extractEmbedding(result: any): Float32Array | null {
  const persons = result?.persons;
  if (!Array.isArray(persons) || persons.length === 0) return null;

  // Prefer the first (largest/primary) detected face.
  const face = persons[0]?.face ?? persons[0];
  const embedding = face?.embedding;
  if (!embedding) return null;

  return embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
