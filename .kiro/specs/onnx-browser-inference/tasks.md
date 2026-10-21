# Implementation Plan: ONNX Browser Inference

## Overview

Replace FocusFlow's hand-coded JavaScript neural network and skin-pixel face detector with a production-grade browser-side inference pipeline. The implementation introduces `OnnxInferenceEngine` (onnxruntime-web), replaces pixel-based face detection with real MediaPipe FaceMesh landmarks, and wires everything through the existing `AttentionPipeline` → `SessionPage` path. The backend is untouched.

## Tasks

- [x] 1. Add dependencies and configure build tooling
  - [x] 1.1 Add `onnxruntime-web` pinned dependency to `package.json`
    - Add `"onnxruntime-web": "1.18.0"` to the `dependencies` section in `package.json`
    - Verify `@mediapipe/face_mesh` and `@mediapipe/camera_utils` are already declared; pin their versions if they are listed with `^` ranges (to `0.4.1633559619` and `0.3.1675466862` respectively)
    - _Requirements: 8.1, 8.2_

  - [x] 1.2 Update `vite.config.ts` to exclude `onnxruntime-web` from Vite's dependency optimization
    - Add `optimizeDeps: { exclude: ['onnxruntime-web'] }` to the existing `defineConfig` call, preserving the current `plugins`, `resolve`, and `server` settings
    - This ensures the WASM binaries shipped by `onnxruntime-web` are served as static assets rather than bundled
    - _Requirements: 8.3_

  - [x] 1.3 Create the `public/models/` directory placeholder
    - Create `public/models/.gitkeep` so the directory is tracked in version control
    - Add a `public/models/README.md` containing: "Place `attention_model.onnx` here before starting a session. Expected input shape: [1, 100, 478, 3], output shape: [1, 1]."
    - _Requirements: 2.1, 7.1_

- [x] 2. Update shared types in `src/ml/types.ts`
  - [x] 2.1 Add the `PredictionSource` ONNX union variants and remove legacy variants
    - Replace the existing `PredictionSource` type with:
      `export type PredictionSource = 'onnx_live' | 'onnx_simulation';`
    - The legacy variants (`trained_neural_network_live`, `trained_neural_network_simulation`, `simulation`, `trained_neural_network`) are removed from the union — the legacy files are kept in the repo but are no longer part of the production type
    - _Requirements: 9.1, 9.2, 10.1_

- [x] 3. Implement `src/ml/onnxEngine.ts` — OnnxInferenceEngine
  - [x] 3.1 Create the `OnnxInferenceEngine` class with the `InferenceOutput` interface
    - Define and export the `InferenceOutput` interface as specified in the design:
      `isReady`, `frameCount`, `requiredFrames` (always 100), `faceDetected`, `attentionScore` (number | null), `attentionPercentage` (number | null), `predictionSource` ('onnx_live' | 'onnx_simulation'), `isSimulated`, `diagnostics` (null)
    - Declare the class with private fields: `session` (ort.InferenceSession | null), `buffer` (LandmarkPoint[][], circular, max 100), `CAPACITY = 100`, `LANDMARKS = 478`, `DIMS = 3`, `modelLoadError` (string | null)
    - _Requirements: 4.1, 4.2, 5.1_

  - [x] 3.2 Implement `initialize(modelPath: string): Promise<void>`
    - If `session` is already set, return immediately (singleton guard — covers Requirement 2.4)
    - Call `ort.InferenceSession.create(modelPath, { executionProviders: ['wasm', 'cpu'] })` inside a try/catch
    - On success assign to `this.session`; on any error set `this.modelLoadError` and re-throw so the caller can surface it
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Implement `processFrame(faceDetected, landmarks, isSimulation): InferenceOutput`
    - Step 1 — Normalize landmark input: if `faceDetected` is true use the provided landmarks array directly; if false create a zero-filled array of 478 `{x:0, y:0, z:0}` points (covers Requirement 3.6 / P5)
    - Step 2 — Push the frame into `this.buffer`; if `buffer.length > CAPACITY` call `buffer.shift()` (covers P1, Requirement 3.2)
    - Step 3 — If `buffer.length < CAPACITY` return early with `{ isReady: false, attentionScore: null, frameCount: buffer.length, requiredFrames: 100, … }` (covers P2, Requirements 3.3, 3.4)
    - Step 4 — Build `Float32Array` of length 143,400 in frame-major → landmark-major → xyz-minor order: `data[f*478*3 + l*3 + d]` (covers P4, Requirement 4.1)
    - Step 5 — Wrap in `new ort.Tensor('float32', data, [1, 100, 478, 3])`, call `await this.session!.run({ input: tensor })`, read `results[outputName].data[0]`, clamp to [0.0, 1.0], compute `attentionPercentage = Math.round(score * 100)` (covers Requirements 4.2, 4.3)
    - Step 6 — On exception log with prefix `[OnnxInferenceEngine]` and return `attentionScore: null` without re-throwing (covers Requirement 4.4)
    - Step 7 — Set `predictionSource = isSimulation ? 'onnx_simulation' : 'onnx_live'` and return full `InferenceOutput` (covers P6, Requirements 9.1, 9.2)
    - _Requirements: 3.1–3.6, 4.1–4.5, 5.1, 9.1, 9.2_

  - [x] 3.4 Implement `reset(): void`
    - Set `this.buffer = []` to clear the circular buffer so the next session starts with a clean WarmUpPeriod
    - _Requirements: 5.5, P7_

  - [x] 3.5 Write property tests for `OnnxInferenceEngine` buffer and tensor logic
    - Use Vitest with `fast-check` (or equivalent) to generate arbitrary frame sequences
    - **Property P1: Buffer Capacity Invariant** — for any sequence of N processFrame calls, `buffer.length <= 100` always holds
    - **Property P2: WarmUp Gate** — for any sequence of n < 100 frames, `attentionScore === null` and `isReady === false`
    - **Property P4: Tensor Shape Determinism** — given the same 100 LandmarkPoint frames, `buildTensor()` always produces a Float32Array of exactly 143,400 elements with identical values
    - **Property P5: Zero-Fill for Missing Face** — when `faceDetected === false`, the stored frame contains exactly 478 `{x:0, y:0, z:0}` points
    - **Property P6: Prediction Source Tag** — `predictionSource === 'onnx_live'` iff `isSimulation === false`
    - **Property P7: Reset Clears Buffer** — after `reset()`, `buffer.length === 0` and the next call returns `isReady: false`
    - _Requirements: 3.1–3.6, 4.1, 9.1, 9.2_

- [x] 4. Implement `src/ml/modelLoader.ts` — ModelLoader singleton
  - [x] 4.1 Create `modelLoader.ts` with exported constants and `loadModel()` function
    - Export `MODEL_PATH = '/models/attention_model.onnx'`
    - Export `MODEL_MISSING_MESSAGE = 'Model file missing. Please place \`attention_model.onnx\` in the \`public/models/\` folder.'`
    - Declare a module-level `let engineInstance: OnnxInferenceEngine | null = null`
    - Implement `export async function loadModel(): Promise<OnnxInferenceEngine>`: if `engineInstance` is not null return it; otherwise create a new `OnnxInferenceEngine`, call `await engine.initialize(MODEL_PATH)`, assign to `engineInstance`, and return it
    - Implement `export function resetModelSingleton(): void` that sets `engineInstance = null` (needed for tests)
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 4.2 Write property test for singleton session guarantee
    - **Property P8: Singleton Session** — calling `loadModel()` N times (with a mocked `InferenceSession.create`) results in exactly one `InferenceSession.create` call regardless of N
    - **Validates: Requirements 2.4**
    - _Requirements: 2.4_

- [x] 5. Checkpoint — verify new ML modules compile and unit tests pass
  - Run `npm run lint` (i.e., `tsc --noEmit`) to confirm `onnxEngine.ts` and `modelLoader.ts` have no TypeScript errors before proceeding to integration work.

- [x] 6. Update `src/services/attentionPipeline.ts` — swap inference engine
  - [x] 6.1 Replace the `ModelInferenceEngine` import with `OnnxInferenceEngine` and `loadModel`
    - Remove `import { ModelInferenceEngine, InferenceOutput } from '../ml/inference'`
    - Add `import { OnnxInferenceEngine, InferenceOutput } from '../ml/onnxEngine'` and `import { loadModel } from '../ml/modelLoader'`
    - Re-export `PipelineInferenceResult = InferenceOutput` and `Landmark3D = LandmarkPoint` as before so `SessionPage` imports remain unchanged
    - _Requirements: 10.1, 10.4_

  - [x] 6.2 Refactor `AttentionPipeline` class to use async `init()` and the ONNX engine
    - Change the private field to `private engine: OnnxInferenceEngine | null = null` (remove constructor assignment)
    - Add `private initPromise: Promise<void> | null = null`
    - Implement `async init(): Promise<void>`: if `this.initPromise` is set return it; otherwise `this.initPromise = loadModel().then(e => { this.engine = e; })` and return it
    - Update `addFrame()`: if `this.engine` is null return a `NOT_READY_RESULT` constant `{ isReady: false, attentionScore: null, attentionPercentage: null, frameCount: 0, requiredFrames: 100, faceDetected: false, predictionSource: 'onnx_live', isSimulated: false, diagnostics: null }`; otherwise delegate to `this.engine.processFrame(faceDetected, landmarks, isSimulation)`
    - Update `reset()` to call `this.engine?.reset()`
    - _Requirements: 2.1, 2.4, 3.3, 5.5, 6.2_

- [x] 7. Update `src/pages/SessionPage.tsx` — model init, error panel, bufferRequired
  - [x] 7.1 Add model error state and call `pipeline.init()` at session start
    - Add `const [modelError, setModelError] = useState<string | null>(null)` state
    - In `handleStartSession`, before creating the session, call `await pipelineRef.current.init()` inside a try/catch; if the caught error message includes `'Model file missing'` (or matches `MODEL_MISSING_MESSAGE`) call `setModelError(err.message)` and `return` early
    - Import `MODEL_MISSING_MESSAGE` from `'../ml/modelLoader'` for the string comparison
    - _Requirements: 2.1, 7.1, 7.2_

  - [x] 7.2 Add the missing model error panel to the JSX
    - Add a `{modelError && ( <div role="alert" … > )}` block immediately above the main learning workspace grid
    - The panel must display the exact string from `MODEL_MISSING_MESSAGE` prefixed with a bold label (e.g., "שגיאה:")
    - Style with Tailwind classes `mb-4 p-4 bg-red-50 border border-red-300 rounded-xl text-red-800 text-sm`
    - _Requirements: 7.1_

  - [x] 7.3 Disable the "Start Session" button when `modelError` is set
    - Change the existing `disabled={!selectedContent}` on the Start Session button to `disabled={!selectedContent || !!modelError}`
    - _Requirements: 7.2_

  - [x] 7.4 Update `bufferRequired` prop from `30` to `100`
    - In the `<AttentionGauge … />` JSX call, change `bufferRequired={30}` to `bufferRequired={100}` to reflect the new 100-frame warm-up period
    - _Requirements: 5.3, 5.4_

  - [x] 7.5 Ensure `prediction_source` is sent in every reading payload
    - Confirm the existing `sessionService.addReading` call already includes `prediction_source: result.predictionSource`; if not, add it
    - No raw landmark data, video frames, or image data should appear in the payload — verify and remove if present
    - _Requirements: 6.1, 9.3_

- [x] 8. Checkpoint — integration wiring compiles cleanly
  - Run `npm run lint` (`tsc --noEmit`) to confirm all updated files (`attentionPipeline.ts`, `SessionPage.tsx`, `types.ts`) compile without errors.

- [ ] 9. Update `src/components/WebcamLandmarkDetector.tsx` — replace skin-pixel detector with FaceMesh
  - [x] 9.1 Add FaceMesh and Camera imports and refs
    - Add `import { FaceMesh } from '@mediapipe/face_mesh'` and `import { Camera } from '@mediapipe/camera_utils'` at the top of the file
    - Declare `const faceMeshRef = useRef<FaceMesh | null>(null)` and `const cameraUtilRef = useRef<Camera | null>(null)` inside the component
    - _Requirements: 1.1, 1.4, 8.2_

  - [x] 9.2 Implement `initFaceMesh()` async function
    - Create a `FaceMesh` instance with `locateFile` pointing to the jsDelivr CDN path for the model assets
    - Call `faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 })`
    - Register `faceMesh.onResults(onFaceMeshResults)`
    - Await `faceMesh.initialize()`; wrap in try/catch — on failure call `onError?.(msg)` with the failure cause and return without starting the camera (covers Requirement 1.4)
    - Assign to `faceMeshRef.current`
    - Create a `Camera` instance from `@mediapipe/camera_utils` pointing at `videoRef.current`, with an `onFrame` callback that gates to 10 FPS (`if (performance.now() - lastSampleTime.current < 95) return`) then calls `await faceMesh.send({ image: videoRef.current })`; set width=640, height=480
    - Call `cameraUtilRef.current.start()`
    - _Requirements: 1.1, 1.4_

  - [x] 9.3 Implement `onFaceMeshResults(results)` callback
    - If `results.multiFaceLandmarks?.length > 0`: map the 478 raw landmark objects to `LandmarkPoint[]` `{x: lm.x, y: lm.y, z: lm.z}`, call `setFaceInFrame(true)`, then call `onFrameProcessed(true, landmarks, false)`
    - If no landmarks detected: call `setFaceInFrame(false)` and `onFrameProcessed(false, null, false)`
    - Remove all calls to `detectRealFace()` and `generateLandmarks()` from the live camera path
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 9.4 Replace `startCamera()` and `startDetectionLoop()` calls with `initFaceMesh()`
    - In the live-camera branch of `handleSelectMode` and in the `useEffect` that watches `isActive` / `inputMode`, call `initFaceMesh()` instead of `startCamera()` / `startDetectionLoop()`
    - In `stopCamera()` (or a new `stopFaceMesh()` helper), stop the `Camera` utility (`cameraUtilRef.current?.stop()`), close the `FaceMesh` instance if an API exists, and set both refs to null
    - Remove the `detectRealFace()`, `generateLandmarks()`, `startDetectionLoop()`, and related canvas pixel-read logic from the component (the smoothing refs and canvas writes are also no longer needed for the live path)
    - The simulation path (`runSimulationTick` + `drawSimulationCanvas`) is kept exactly as-is; it continues to call `onFrameProcessed(true, landmarks, true)`
    - _Requirements: 1.3, 1.5_

  - [x] 9.5 Write unit tests for `onFaceMeshResults` handler logic
    - Test that when 478 landmarks are returned, `onFrameProcessed` is called with `(true, landmarks, false)` where `landmarks` has length 478 and each element has `{x, y, z}` fields
    - Test that when no face is detected, `onFrameProcessed` is called with `(false, null, false)`
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 10. Remove legacy modules from production import paths
  - [x] 10.1 Verify `src/ml/model.ts`, `src/ml/featureExtractor.ts`, and `src/ml/inference.ts` are not imported by any production module
    - Search for import statements referencing these files in `attentionPipeline.ts` and `SessionPage.tsx`; remove any that remain after previous tasks
    - The files themselves are retained in the repository for reference — do not delete them
    - Also confirm `src/ml/trained_model_weights.json` is not imported by any file in the production inference path
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 11. Final checkpoint — full lint pass and runtime smoke test
  - Run `npm run lint` (`tsc --noEmit`) across the entire project to confirm zero TypeScript errors
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The design uses TypeScript throughout; all new files follow the existing `.ts` / `.tsx` conventions in `src/`
- The FastAPI backend is completely unchanged — only frontend files are modified
- The simulation loop in `WebcamLandmarkDetector` is preserved as-is; it feeds synthetic 478-point landmark arrays to the same ONNX engine path, tagged as `'onnx_simulation'`
- The model file `attention_model.onnx` must be placed manually in `public/models/` before a live session can start; the error panel in `SessionPage` guides the user if it is missing
- Legacy inference files (`model.ts`, `featureExtractor.ts`, `inference.ts`, `trained_model_weights.json`) are kept in the repo but removed from all production import paths
- Property tests validate universal correctness properties of the buffer and tensor logic without requiring a real ONNX session (mock the session)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["3.5", "4.2", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "9.1"] },
    { "id": 7, "tasks": ["9.2", "10.1"] },
    { "id": 8, "tasks": ["9.3", "9.4"] },
    { "id": 9, "tasks": ["9.5"] }
  ]
}
```
