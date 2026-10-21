# Requirements Document

## Introduction

This feature replaces FocusFlow's custom hand-coded JavaScript neural network and DIY skin-pixel face detector with a production-grade attention measurement pipeline that runs entirely in the browser. The new pipeline uses **MediaPipe FaceMesh** to extract 478 3D facial landmarks per frame and feeds a sliding window of 100 frames (≈10 seconds at 10 FPS) directly into a real **ONNX model** loaded and executed by `onnxruntime-web`. Scores (attention probability), timestamps, and content position are the only data sent to the server; raw video and landmark data never leave the browser.

The feature touches three main areas:
1. **Landmark extraction** — swap DIY skin detection for real MediaPipe FaceMesh inside `WebcamLandmarkDetector`.
2. **Model inference** — replace `AttentionNeuralNetwork` + `trained_model_weights.json` with an ONNX Runtime Web session loading `attention_model.onnx` from the public assets folder.
3. **Pipeline wiring** — update `AttentionPipeline` and `SessionPage` to work with the new engine, including buffering logic, "waiting for data" UI, and graceful degradation when the model file is missing.

---

## Glossary

- **ONNX_Model**: The file `attention_model.onnx` placed in `public/models/` and served as a static asset. Input shape `[1, 100, 478, 3]`, output shape `[1, 1]` (scalar attention probability in [0, 1]).
- **OrtSession**: An `onnxruntime-web` `InferenceSession` instance that holds a loaded ONNX_Model and executes forward passes in the browser via WebAssembly or WebGL.
- **LandmarkBuffer**: A circular buffer of the most recent 100 frames, each frame containing 478 `LandmarkPoint` objects `{x, y, z}` produced by MediaPipe FaceMesh.
- **FaceMesh**: The `@mediapipe/face_mesh` library that processes a webcam video element and emits 478 3D normalized landmark coordinates per detected face.
- **ModelLoader**: The browser-side module responsible for fetching and initialising an OrtSession from the ONNX_Model path.
- **InferenceEngine**: The new `OnnxInferenceEngine` class that owns the OrtSession, manages the LandmarkBuffer, prepares `Float32Array` tensors, runs inference, and returns an `InferenceOutput`.
- **AttentionPipeline**: The service class (`src/services/attentionPipeline.ts`) that wraps the InferenceEngine and is consumed by `SessionPage`.
- **SessionPage**: The React page component that drives webcam capture, calls AttentionPipeline per frame, displays real-time scores, and sends readings to the backend.
- **SamplingRate**: 10 frames per second (one frame every 100 ms).
- **WarmUpPeriod**: The first ≈10 seconds (100 frames) before the LandmarkBuffer is full. No score is produced during this period.
- **PredictionSource**: A string tag attached to every reading: `'onnx_live'` for real webcam inference or `'onnx_simulation'` for landmark-simulation mode.
- **Score**: A floating-point attention probability in [0.0, 1.0] output by the ONNX_Model.

---

## Requirements

### Requirement 1: MediaPipe FaceMesh Landmark Extraction

**User Story:** As a student using the learning session, I want the system to track my face accurately with 478 3D landmarks per frame, so that the attention model receives rich, real facial geometry rather than approximated skin-pixel data.

#### Acceptance Criteria

1. WHEN a webcam session is active, THE FaceMesh SHALL process each video frame at the SamplingRate of 10 frames per second and emit exactly 478 `LandmarkPoint` objects with normalized `{x, y, z}` coordinates for a detected face.
2. WHEN FaceMesh detects no face in a frame, THE FaceMesh SHALL emit an empty landmark array and set `faceDetected` to `false` for that frame.
3. WHEN FaceMesh emits landmarks, THE WebcamLandmarkDetector SHALL pass them directly to the AttentionPipeline's `addFrame` method without geometric re-computation or manual EAR/MAR extraction.
4. IF the `@mediapipe/face_mesh` library fails to initialize, THEN THE WebcamLandmarkDetector SHALL display an error message stating the failure cause and prevent the session from starting.
5. THE WebcamLandmarkDetector SHALL NOT perform any pixel-level skin-tone analysis or geometric landmark synthesis after this feature is implemented.

---

### Requirement 2: ONNX Model Loading

**User Story:** As a developer deploying FocusFlow, I want the ONNX model to be loaded once at session initialization directly in the browser, so that inference runs entirely client-side without any server round-trip.

#### Acceptance Criteria

1. WHEN the browser application starts a learning session, THE ModelLoader SHALL fetch `attention_model.onnx` from the path `public/models/attention_model.onnx` and initialize an OrtSession using `onnxruntime-web`.
2. THE OrtSession SHALL execute using the WebAssembly backend as the primary execution provider, with a fallback to the CPU backend if WebAssembly is unavailable.
3. IF `attention_model.onnx` is not found at `public/models/attention_model.onnx`, THEN THE ModelLoader SHALL surface an error message that reads: "Model file missing. Please place `attention_model.onnx` in the `public/models/` folder." and SHALL prevent inference from running.
4. THE ModelLoader SHALL load the OrtSession exactly once per browser session; subsequent calls SHALL reuse the existing OrtSession without re-fetching the file.
5. THE ONNX_Model SHALL NOT be loaded on the server side; THE ModelLoader SHALL execute exclusively in the browser runtime.

---

### Requirement 3: Sliding-Window Landmark Buffer

**User Story:** As a student, I want the system to accumulate landmark data over a rolling 10-second window before producing a score, so that the model always has a full and meaningful sequence to evaluate.

#### Acceptance Criteria

1. THE LandmarkBuffer SHALL store the most recent 100 frames, where each frame is an array of exactly 478 `LandmarkPoint` objects with `{x, y, z}` fields.
2. WHEN a new frame arrives and the LandmarkBuffer already contains 100 frames, THE LandmarkBuffer SHALL remove the oldest frame before inserting the new one, maintaining a constant capacity of 100.
3. WHILE the LandmarkBuffer contains fewer than 100 frames, THE InferenceEngine SHALL return `isReady: false` and `attentionScore: null` to indicate the WarmUpPeriod is in progress.
4. WHEN the LandmarkBuffer reaches exactly 100 frames for the first time, THE InferenceEngine SHALL produce the first Score without further delay.
5. AFTER the first Score is produced, THE InferenceEngine SHALL produce a new Score on every subsequent frame addition as the sliding window advances.
6. IF a frame has `faceDetected: false`, THE LandmarkBuffer SHALL store that frame with a zero-filled landmark array of 478 points, so that the buffer length always advances at the SamplingRate.

---

### Requirement 4: Tensor Preparation and ONNX Inference

**User Story:** As a developer, I want landmark data converted into the exact tensor shape the ONNX model expects, so that inference produces valid attention scores.

#### Acceptance Criteria

1. WHEN the LandmarkBuffer contains 100 frames, THE InferenceEngine SHALL flatten the buffer into a single `Float32Array` of length `100 × 478 × 3 = 143,400` values, ordered as `[frame_0_landmark_0_x, frame_0_landmark_0_y, frame_0_landmark_0_z, frame_0_landmark_1_x, …, frame_99_landmark_477_z]`.
2. THE InferenceEngine SHALL wrap the `Float32Array` in an `onnxruntime-web` `Tensor` with shape `[1, 100, 478, 3]` and dtype `float32` before calling `OrtSession.run`.
3. WHEN `OrtSession.run` returns, THE InferenceEngine SHALL read the first element of the output tensor as the raw Score and clamp it to the range [0.0, 1.0].
4. IF `OrtSession.run` throws an exception, THEN THE InferenceEngine SHALL log the error with the prefix `[OnnxInferenceEngine]` and return `attentionScore: null` for that frame without crashing the session.
5. THE InferenceEngine SHALL NOT apply any additional feature extraction, normalization, or manual geometric computation to the landmark data before passing it to the OrtSession; raw normalized coordinates SHALL be passed directly.

---

### Requirement 5: Score Output and Continuous Updates

**User Story:** As a student, I want to see my attention score update continuously throughout the session, so that I get real-time feedback on my focus level.

#### Acceptance Criteria

1. AFTER the WarmUpPeriod, THE InferenceEngine SHALL emit a new Score on every frame processed at the SamplingRate (approximately every 100 ms).
2. THE AttentionPipeline SHALL expose the Score as `attentionScore` (a float in [0.0, 1.0]) and `attentionPercentage` (an integer in [0, 100]) in its `PipelineInferenceResult`.
3. THE SessionPage SHALL display the buffering progress to the user WHILE the WarmUpPeriod is in progress, indicating how many of the 100 required frames have been collected.
4. WHEN the WarmUpPeriod ends and the first Score is produced, THE SessionPage SHALL transition from the buffering state to the live score display without requiring user interaction.
5. WHEN the user ends the learning session, THE InferenceEngine SHALL reset the LandmarkBuffer to empty so that the next session starts with a clean WarmUpPeriod.

---

### Requirement 6: Privacy — Data Stays in the Browser

**User Story:** As a student, I want to be sure that my raw video and facial landmark data never leave my device, so that my biometric data remains private.

#### Acceptance Criteria

1. THE SessionPage SHALL only transmit `attentionScore`, `timestamp`, `faceDetected`, and `prediction_source` fields to the backend API when recording a reading; it SHALL NOT include raw landmark coordinates, video frames, or image data in any API request.
2. THE AttentionPipeline SHALL NOT serialize or forward the LandmarkBuffer or any `LandmarkPoint` array to any network endpoint.
3. THE InferenceEngine SHALL perform all tensor construction and OrtSession execution in the browser process; no landmark data or tensor data SHALL be sent to the server.

---

### Requirement 7: Missing Model File — User Guidance

**User Story:** As a student setting up FocusFlow for the first time, I want a clear error message if the ONNX model file is missing, so that I know exactly what to do to fix it without guessing.

#### Acceptance Criteria

1. IF `attention_model.onnx` cannot be fetched from `public/models/attention_model.onnx` at session start, THEN THE SessionPage SHALL display a visible error panel containing the exact message: "Model file missing. Please place `attention_model.onnx` in the `public/models/` folder."
2. WHEN the model file is missing, THE SessionPage SHALL disable the "Start Session" button and SHALL NOT permit inference to run with any default, hardcoded, or simulated scores.
3. THE InferenceEngine SHALL NOT substitute simulation output, hardcoded values, or any fallback scores in place of a missing ONNX_Model.

---

### Requirement 8: Dependency Integration

**User Story:** As a developer, I want `onnxruntime-web` and `@mediapipe/face_mesh` declared as explicit project dependencies, so that the build and runtime environments are reproducible.

#### Acceptance Criteria

1. THE project `package.json` SHALL declare `onnxruntime-web` as a dependency with a pinned version.
2. THE project `package.json` SHALL declare `@mediapipe/face_mesh` as a dependency with a pinned version.
3. WHERE the Vite build configuration requires adjustment to correctly bundle or exclude `onnxruntime-web` WASM assets, THE build configuration SHALL be updated accordingly so that the compiled application can load the OrtSession without manual file copying.
4. THE `ONNX_MODEL_PATH` environment variable SHALL NOT be referenced or required on the server side; THE backend configuration SHALL remain unchanged from the current FastAPI setup.

---

### Requirement 9: Prediction Source Tagging

**User Story:** As a developer, I want every score stored in the database to be tagged with its source (live ONNX inference vs. landmark simulation), so that stored readings are distinguishable for analysis.

#### Acceptance Criteria

1. WHEN inference is driven by real webcam FaceMesh landmarks, THE InferenceEngine SHALL set `predictionSource` to `'onnx_live'`.
2. WHEN inference is driven by simulated landmarks (simulation mode in WebcamLandmarkDetector), THE InferenceEngine SHALL set `predictionSource` to `'onnx_simulation'`.
3. THE SessionPage SHALL include `prediction_source` in every reading payload sent to the backend, using the value from `predictionSource` in the `PipelineInferenceResult`.

---

### Requirement 10: Removal of Legacy Inference Code

**User Story:** As a developer, I want the hand-coded neural network and feature extractor removed from the production path, so that the codebase does not maintain two competing inference paths.

#### Acceptance Criteria

1. THE `AttentionNeuralNetwork` class in `src/ml/model.ts` SHALL be removed from all production import paths used by `AttentionPipeline` and `SessionPage`.
2. THE `FeatureExtractor` class in `src/ml/featureExtractor.ts` SHALL be removed from all production import paths used by `AttentionPipeline` and `SessionPage`; the new InferenceEngine SHALL consume raw landmarks directly without the 16-feature extraction step.
3. THE `trained_model_weights.json` file SHALL NOT be imported or loaded by any module in the production inference path.
4. WHEN the legacy files (`model.ts`, `featureExtractor.ts`, `inference.ts`) are retained in the repository for reference, THE AttentionPipeline SHALL import exclusively from the new `OnnxInferenceEngine` module.
