# Design Document

## Overview

This design replaces FocusFlow's hand-crafted JavaScript neural network (`AttentionNeuralNetwork`) and skin-pixel face detector with a production-grade, fully browser-side inference pipeline. The new pipeline uses `@mediapipe/face_mesh` for real 478-landmark extraction and `onnxruntime-web` to execute an ONNX model directly in the browser via WebAssembly. No raw biometric data ever leaves the browser.

The change is entirely within the frontend (`src/`). The FastAPI backend is untouched.

---

## Architecture

### High-Level Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                         │
│                                                                  │
│  ┌─────────────────────────┐                                     │
│  │  WebcamLandmarkDetector │  ← replaces skin-pixel detector     │
│  │  (uses FaceMesh)        │                                     │
│  └────────────┬────────────┘                                     │
│               │ 478 LandmarkPoints per frame @ 10 FPS            │
│               ▼                                                  │
│  ┌─────────────────────────┐                                     │
│  │  AttentionPipeline      │  ← thin wrapper (unchanged API)     │
│  │  (src/services/)        │                                     │
│  └────────────┬────────────┘                                     │
│               │ addFrame(faceDetected, landmarks, isSimulation)  │
│               ▼                                                  │
│  ┌─────────────────────────┐                                     │
│  │  OnnxInferenceEngine    │  ← NEW: replaces ModelInferenceEngine│
│  │  (src/ml/onnxEngine.ts) │                                     │
│  │  ┌─────────────────┐   │                                     │
│  │  │  LandmarkBuffer  │   │  circular buffer, capacity = 100   │
│  │  └────────┬────────┘   │                                     │
│  │           │ Float32Array [1,100,478,3]                        │
│  │           ▼             │                                     │
│  │  ┌─────────────────┐   │                                     │
│  │  │   OrtSession    │   │  onnxruntime-web WASM               │
│  │  └─────────────────┘   │                                     │
│  └────────────┬────────────┘                                     │
│               │ InferenceOutput { attentionScore, isReady, … }   │
│               ▼                                                  │
│  ┌─────────────────────────┐                                     │
│  │     SessionPage         │  ← displays score, buffering UI    │
│  └─────────────────────────┘                                     │
│               │ { attentionScore, timestamp, faceDetected,       │
│               │   prediction_source }  ← only these fields       │
│               ▼                                                  │
│         Backend API  (FastAPI — unchanged)                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. `src/ml/onnxEngine.ts` — OnnxInferenceEngine (NEW)

This is the core new module. It owns the OrtSession, the LandmarkBuffer, tensor construction, and inference execution.

```typescript
import * as ort from 'onnxruntime-web';
import { LandmarkPoint } from './types';

export interface InferenceOutput {
  isReady: boolean;
  frameCount: number;
  requiredFrames: number;   // always 100
  faceDetected: boolean;
  attentionScore: number | null;      // [0.0, 1.0] or null during WarmUp
  attentionPercentage: number | null; // [0, 100] or null
  predictionSource: 'onnx_live' | 'onnx_simulation';
  isSimulated: boolean;
  diagnostics: null; // ONNX path emits no per-frame geometric diagnostics
}

export class OnnxInferenceEngine {
  private session: ort.InferenceSession | null = null;
  private buffer: LandmarkPoint[][] = [];   // circular, max 100 frames
  private readonly CAPACITY = 100;
  private readonly LANDMARKS = 478;
  private readonly DIMS = 3;
  private modelLoadError: string | null = null;

  /** Call once before the first session starts. */
  async initialize(modelPath: string): Promise<void> { … }

  /** Add one frame; returns inference result. */
  processFrame(
    faceDetected: boolean,
    landmarks: LandmarkPoint[] | null,
    isSimulation: boolean
  ): InferenceOutput { … }

  reset(): void { this.buffer = []; }
}
```

#### `initialize(modelPath)` — Model Loading

```
1. If session already exists, return immediately (singleton per browser session).
2. Try: session = await ort.InferenceSession.create(modelPath, {
     executionProviders: ['wasm', 'cpu']
   })
3. On fetch failure (model not found): set modelLoadError to the required message,
   throw so the caller can surface it.
4. On any other error: set modelLoadError, throw.
```

#### `processFrame(...)` — Frame Processing & Inference

```
1. Build normalized landmark array:
   - If faceDetected: use landmarks directly (478 × {x,y,z})
   - If !faceDetected: use zero-filled array of 478 points

2. Push to buffer. If buffer.length > CAPACITY: buffer.shift().

3. If buffer.length < CAPACITY:
   return { isReady: false, attentionScore: null, frameCount: buffer.length, … }

4. Build Float32Array of length 143,400:
   for each frame f (0..99):
     for each landmark l (0..477):
       data[f*478*3 + l*3 + 0] = buffer[f][l].x
       data[f*478*3 + l*3 + 1] = buffer[f][l].y
       data[f*478*3 + l*3 + 2] = buffer[f][l].z

5. const tensor = new ort.Tensor('float32', data, [1, 100, 478, 3])
   const feeds = { input: tensor }   // input name must match model's input name
   const results = await session.run(feeds)

6. rawScore = results[outputName].data[0]
   attentionScore = Math.max(0.0, Math.min(1.0, rawScore))
   attentionPercentage = Math.round(attentionScore * 100)

7. On exception: log '[OnnxInferenceEngine] …', return attentionScore: null

8. predictionSource = isSimulation ? 'onnx_simulation' : 'onnx_live'

9. Return full InferenceOutput.
```

---

### 2. `src/ml/modelLoader.ts` — ModelLoader (NEW)

Singleton helper that manages the OrtSession lifecycle.

```typescript
export const MODEL_PATH = '/models/attention_model.onnx';
export const MODEL_MISSING_MESSAGE =
  'Model file missing. Please place `attention_model.onnx` in the `public/models/` folder.';

let engineInstance: OnnxInferenceEngine | null = null;

export async function loadModel(): Promise<OnnxInferenceEngine> {
  if (engineInstance) return engineInstance;
  const engine = new OnnxInferenceEngine();
  await engine.initialize(MODEL_PATH);   // throws on missing file
  engineInstance = engine;
  return engineInstance;
}

export function resetModelSingleton(): void {
  engineInstance = null;
}
```

---

### 3. `src/services/attentionPipeline.ts` — AttentionPipeline (UPDATED)

The public API consumed by `SessionPage` stays **identical** — only the internal engine is swapped.

```typescript
// Before:
import { ModelInferenceEngine } from '../ml/inference';

// After:
import { OnnxInferenceEngine, InferenceOutput } from '../ml/onnxEngine';
import { loadModel } from '../ml/modelLoader';

export type PipelineInferenceResult = InferenceOutput;
export type Landmark3D = LandmarkPoint;

export class AttentionPipeline {
  private engine: OnnxInferenceEngine | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = loadModel().then(e => { this.engine = e; });
    return this.initPromise;
  }

  addFrame(faceDetected, landmarks, isSimulation): PipelineInferenceResult {
    if (!this.engine) return NOT_READY_RESULT;
    return this.engine.processFrame(faceDetected, landmarks, isSimulation);
  }

  reset(): void { this.engine?.reset(); }
}
```

The `NOT_READY_RESULT` constant returns `{ isReady: false, attentionScore: null, frameCount: 0, … }` so `SessionPage` sees a clean buffering state while the model loads.

---

### 4. `src/components/WebcamLandmarkDetector.tsx` — UPDATED

The component replaces the pixel-based `detectRealFace()` and `generateLandmarks()` with a real MediaPipe FaceMesh integration.

#### Changes

| Removed | Added |
|---|---|
| `detectRealFace()` — skin-pixel analysis | `initFaceMesh()` — creates `FaceMesh` instance |
| `generateLandmarks()` — synthetic geometry | `onFaceMeshResults()` — callback receives real landmarks |
| Manual canvas pixel reads | MediaPipe `Camera` utility drives FaceMesh |
| `smoothCentroidX/Y/Pitch/Yaw/EAR` refs | Direct pass-through of `results.multiFaceLandmarks[0]` |

#### Pseudocode

```typescript
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

// In component body:
const faceMeshRef = useRef<FaceMesh | null>(null);
const cameraUtilRef = useRef<Camera | null>(null);

const initFaceMesh = async () => {
  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceMesh.onResults(onFaceMeshResults);
  await faceMesh.initialize();
  faceMeshRef.current = faceMesh;

  cameraUtilRef.current = new Camera(videoRef.current, {
    onFrame: async () => {
      const now = performance.now();
      if (now - lastSampleTime.current < 95) return; // 10 FPS gate
      lastSampleTime.current = now;
      await faceMesh.send({ image: videoRef.current });
    },
    width: 640,
    height: 480,
  });
  cameraUtilRef.current.start();
};

const onFaceMeshResults = (results) => {
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const rawLandmarks = results.multiFaceLandmarks[0]; // 478 points
    const landmarks: LandmarkPoint[] = rawLandmarks.map(lm => ({
      x: lm.x, y: lm.y, z: lm.z
    }));
    setFaceInFrame(true);
    onFrameProcessed(true, landmarks, false);
  } else {
    setFaceInFrame(false);
    onFrameProcessed(false, null, false);
  }
};
```

The simulation loop (`runSimulationTick`) is **kept as-is**: it still generates 478-landmark arrays and calls `onFrameProcessed(true, landmarks, true)`. The ONNX engine accepts these the same way as live landmarks, tagged with `'onnx_simulation'`.

---

### 5. `src/pages/SessionPage.tsx` — UPDATED

Two changes:

**a) Model loading on session start**

```typescript
// Before starting session:
try {
  await pipelineRef.current.init(); // loads OrtSession once
} catch (err: any) {
  if (err.message?.includes('Model file missing')) {
    setModelError(MODEL_MISSING_MESSAGE);
    return;
  }
  throw err;
}
```

**b) Buffering UI**

The `bufferRequired` prop passed to `AttentionGauge` changes from `30` to `100` to reflect the new warm-up period. The existing buffering progress bar already reads from `bufferCount / bufferRequired`, so the UI automatically shows correct progress.

```tsx
// Before:
<AttentionGauge bufferRequired={30} … />

// After:
<AttentionGauge bufferRequired={100} … />
```

**c) Missing model error panel**

```tsx
{modelError && (
  <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-300 rounded-xl text-red-800 text-sm">
    <strong>שגיאה:</strong> {modelError}
  </div>
)}
```

The "Start Session" button is disabled when `modelError` is set:

```tsx
<button
  onClick={handleStartSession}
  disabled={!selectedContent || !!modelError}
  …
>
```

---

### 6. `src/ml/types.ts` — UPDATED

Add the new prediction source union to replace legacy values:

```typescript
// Add to existing file:
export type PredictionSource = 'onnx_live' | 'onnx_simulation';
```

The legacy `trained_neural_network_live` / `trained_neural_network_simulation` variants are removed from the union (the old files are kept in the repo but not imported by the pipeline).

---

### 7. `vite.config.ts` — UPDATED (or created)

`onnxruntime-web` ships WASM binaries that must be served as static files. Vite needs to be told not to bundle them:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  build: {
    rollupOptions: {
      external: [],
    },
  },
  // Copy WASM assets from node_modules to public during build
  // (handled via vite-plugin-static-copy or manual public/ placement)
});
```

The `.wasm` and `.mjs` files from `node_modules/onnxruntime-web/dist/` are copied to `public/` so the browser can fetch them at runtime. This is done in a `postinstall` script or manually.

---

### 8. `package.json` — UPDATED

```json
"dependencies": {
  "@mediapipe/face_mesh": "0.4.1633559619",   // already present, pin version
  "@mediapipe/camera_utils": "0.3.1675466862", // already present
  "onnxruntime-web": "1.18.0"                  // NEW, pinned
}
```

---

## Data Flow: Frame to Score

```
Webcam frame (video element)
        │
        ▼ MediaPipe FaceMesh (WASM, ~10ms)
478 × {x, y, z} normalized coordinates  OR  [] if no face
        │
        ▼ OnnxInferenceEngine.processFrame()
LandmarkBuffer.push(frame)
        │
   [< 100 frames]──► return { isReady: false, attentionScore: null }
        │
   [= 100 frames]
        │
        ▼ Float32Array [143,400] constructed (frame-major, landmark-major, xyz-minor)
        │
        ▼ OrtSession.run({ input: Tensor([1,100,478,3], float32) })
        │
        ▼ output[0] → clamp to [0,1]
        │
attentionScore: 0.0–1.0
        │
        ▼ AttentionPipeline → SessionPage
        │
        ▼ (every ~1 second)
Backend API: { attentionScore, timestamp, faceDetected, prediction_source }
```

---

## File Inventory

| File | Status | Change |
|---|---|---|
| `src/ml/onnxEngine.ts` | NEW | Core inference engine using onnxruntime-web |
| `src/ml/modelLoader.ts` | NEW | Singleton model loader |
| `src/services/attentionPipeline.ts` | UPDATED | Swap engine; keep public API |
| `src/components/WebcamLandmarkDetector.tsx` | UPDATED | Replace skin-pixel with FaceMesh |
| `src/pages/SessionPage.tsx` | UPDATED | Model init, error panel, bufferRequired=100 |
| `src/ml/types.ts` | UPDATED | Add `onnx_live`/`onnx_simulation` to PredictionSource |
| `vite.config.ts` | UPDATED/CREATED | Exclude onnxruntime-web from bundling |
| `package.json` | UPDATED | Add `onnxruntime-web` pinned dependency |
| `public/models/` | NEW DIR | Placeholder for `attention_model.onnx` |
| `src/ml/model.ts` | LEGACY | Kept in repo, removed from production imports |
| `src/ml/featureExtractor.ts` | LEGACY | Kept in repo, removed from production imports |
| `src/ml/inference.ts` | LEGACY | Kept in repo, removed from production imports |
| `src/ml/trained_model_weights.json` | LEGACY | Kept in repo, not imported by pipeline |

---

## Correctness Properties (for Property-Based Testing)

The following properties must hold for any valid implementation:

### P1 — Buffer Capacity Invariant
`buffer.length <= 100` at all times, for any sequence of `processFrame` calls.

### P2 — WarmUp Gate
For any sequence of `n < 100` frames, `processFrame` must return `attentionScore === null` and `isReady === false`.

### P3 — Score Range
For any sequence of ≥ 100 frames with a loaded session, if `attentionScore !== null` then `0.0 <= attentionScore <= 1.0`.

### P4 — Tensor Shape Determinism
Given the same 100-frame buffer, `buildTensor()` must always produce a `Float32Array` of exactly 143,400 elements with the same values.

### P5 — Zero-Fill for Missing Face
If `faceDetected === false`, the landmark array stored in the buffer must be exactly 478 `{x:0, y:0, z:0}` points.

### P6 — Prediction Source Tag
`predictionSource` is `'onnx_live'` if and only if `isSimulation === false`.

### P7 — Reset Clears Buffer
After `reset()`, `buffer.length === 0` and the next `processFrame` returns `isReady === false`.

### P8 — Singleton Session
Calling `loadModel()` N times must result in exactly one `InferenceSession.create` call.

---

## Error Handling Summary

| Failure | Where Detected | Behaviour |
|---|---|---|
| `attention_model.onnx` not found | `ModelLoader.initialize()` | Throws; `SessionPage` catches and shows error panel; Start Session disabled |
| `OrtSession.run()` throws | `OnnxInferenceEngine.processFrame()` | Logs `[OnnxInferenceEngine]`, returns `attentionScore: null` |
| FaceMesh fails to initialize | `WebcamLandmarkDetector.initFaceMesh()` | Calls `onError(msg)`, prevents session start |
| No face detected | FaceMesh `onResults` | `onFrameProcessed(false, null, false)` → zero-filled frame stored |
