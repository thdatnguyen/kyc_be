import { createRequire } from 'module';
import path from 'path';
import { env } from '@core/config/env';
import { logger } from '@core/config/logger';
import { FaceMatchResult } from '@features/applications/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type HumanInstance = any;

let humanPromise: Promise<HumanInstance> | null = null;

const nodeRequire = createRequire(__filename);

// The `@vladmandic/human` `exports` map doesn't expose the `.js` subpaths, so
// resolve the Node+WASM build by its on-disk path (bypasses exports resolution).
// This avoids the native `tfjs-node` binding that segfaults on Railway / Apple Silicon.
const humanWasmPath = path.join(
  path.dirname(nodeRequire.resolve('@vladmandic/human')),
  'human.node-wasm.js',
);
// Local path to the WASM backend's `.wasm` binaries (read from disk, not CDN).
const wasmPath = path.dirname(nodeRequire.resolve('@tensorflow/tfjs-backend-wasm')) + path.sep;

// Pure-JS image decoders (JPEG + PNG — the formats the mobile app uploads).
const jpeg = nodeRequire('jpeg-js') as any;
const { PNG } = nodeRequire('pngjs') as any;

/**
 * Lazily load and cache the Human model (Node+WASM build — no native binary).
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
    const selfieTensor = bufferToTensor(selfie);
    const documentTensor = bufferToTensor(document);

    try {
      const [selfieResult, docResult] = await Promise.all([
        human.detect(selfieTensor),
        human.detect(documentTensor),
      ]);

      const selfieEmbedding = extractEmbedding(selfieResult);
      const docEmbedding = extractEmbedding(docResult);

      if (!selfieEmbedding || !docEmbedding) {
        return { modelLoaded: true, error: 'Could not detect a face in one or both images' };
      }

      const similarity = cosineSimilarity(selfieEmbedding, docEmbedding);
      return { modelLoaded: true, similarity, matched: similarity >= env.FACE_MATCH_THRESHOLD };
    } finally {
      selfieTensor.dispose();
      documentTensor.dispose();
    }
  } catch (error) {
    logger.error('Face match failed', { error });
    return { modelLoaded: false, error: (error as Error).message };
  }
}

/**
 * Decodes a JPEG/PNG buffer into a `tf.Tensor3D` ([height, width, 3], int32).
 * The WASM build only accepts a Tensor, not a raw Buffer.
 */
function bufferToTensor(buffer: Buffer): any {
  // Lazy-require tfjs so tests (FACE_MATCH_ENABLED=false) never load it.
  const tf = nodeRequire('@tensorflow/tfjs') as any;

  // JPEG
  if (buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const raw = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: false });
    return tf.tensor3d(new Uint8Array(raw.data), [raw.height, raw.width, 3], 'int32');
  }

  // PNG
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const png = PNG.sync.read(buffer);
    const rgb = new Uint8Array(png.width * png.height * 3);
    for (let i = 0, j = 0; i < png.data.length; i += 4, j += 3) {
      rgb[j] = png.data[i];
      rgb[j + 1] = png.data[i + 1];
      rgb[j + 2] = png.data[i + 2];
    }
    return tf.tensor3d(rgb, [png.height, png.width, 3], 'int32');
  }

  throw new Error('Unsupported image format for face match');
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
