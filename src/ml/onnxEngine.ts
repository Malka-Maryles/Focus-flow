import * as ort from 'onnxruntime-web';
import { LandmarkPoint } from './types';

ort.env.wasm.wasmPaths = '/';

export interface InferenceOutput {
  isReady: boolean;
  frameCount: number;
  requiredFrames: number;
  faceDetected: boolean;
  attentionScore: number | null;
  attentionPercentage: number | null;
  predictionSource: 'onnx_live' | 'onnx_simulation';
  isSimulated: boolean;
  diagnostics: null;
}

export class OnnxInferenceEngine {
  private session: ort.InferenceSession | null = null;
  private buffer: LandmarkPoint[][] = [];
  private readonly CAPACITY = 100;
  private readonly LANDMARKS = 478;
  private readonly DIMS = 3;
  private modelLoadError: string | null = null;
  private _lastScore: number | null = null;
  // Store the most recent raw EAR so the sync path can apply penalty immediately
  private _lastEAR: number | null = null;

  async initialize(modelPath: string): Promise<void> {
    if (this.session) return;
    try {
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['wasm', 'cpu'],
      });
    } catch (err: any) {
      this.modelLoadError = err?.message ?? String(err);
      throw err;
    }
  }

  processFrame(
    faceDetected: boolean,
    landmarks: LandmarkPoint[] | null,
    isSimulation: boolean
  ): InferenceOutput {
    const frame: LandmarkPoint[] = faceDetected && landmarks
      ? landmarks
      : new Array(this.LANDMARKS).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

    // Compute EAR from the live frame immediately (synchronous, cheap)
    if (faceDetected && landmarks) {
      this._lastEAR = this._computeEAR(landmarks);
    } else {
      this._lastEAR = null;
    }

    this.buffer.push(frame);
    if (this.buffer.length > this.CAPACITY) {
      this.buffer.shift();
    }

    const predictionSource: 'onnx_live' | 'onnx_simulation' =
      isSimulation ? 'onnx_simulation' : 'onnx_live';

    if (this.buffer.length < this.CAPACITY) {
      return {
        isReady: false,
        frameCount: this.buffer.length,
        requiredFrames: this.CAPACITY,
        faceDetected,
        attentionScore: null,
        attentionPercentage: null,
        predictionSource,
        isSimulated: isSimulation,
        diagnostics: null,
      };
    }

    if (!this.session) {
      return {
        isReady: false,
        frameCount: this.buffer.length,
        requiredFrames: this.CAPACITY,
        faceDetected,
        attentionScore: null,
        attentionPercentage: null,
        predictionSource,
        isSimulated: isSimulation,
        diagnostics: null,
      };
    }

    const totalElements = this.CAPACITY * this.LANDMARKS * this.DIMS;
    const data = new Float32Array(totalElements);
    for (let f = 0; f < this.CAPACITY; f++) {
      const frameData = this.buffer[f];
      for (let l = 0; l < this.LANDMARKS; l++) {
        const lm = frameData[l] ?? { x: 0, y: 0, z: 0 };
        const base = f * this.LANDMARKS * this.DIMS + l * this.DIMS;
        data[base + 0] = lm.x;
        data[base + 1] = lm.y;
        data[base + 2] = lm.z;
      }
    }

    try {
      const tensor = new ort.Tensor('float32', data, [1, this.CAPACITY, this.LANDMARKS, this.DIMS]);
      const inputName = this.session.inputNames[0] ?? 'input';
      const outputName = this.session.outputNames[0] ?? 'output';

      // Fire async inference — result stored in _lastScore for next frame
      this._runInference(tensor, inputName, outputName);

      // Apply EAR penalty synchronously to the cached score from last inference
      let displayScore = this._lastScore;
      if (displayScore !== null && this._lastEAR !== null) {
        displayScore = this._applyEyePenalty(displayScore, this._lastEAR);
      }

      return {
        isReady: true,
        frameCount: this.buffer.length,
        requiredFrames: this.CAPACITY,
        faceDetected,
        attentionScore: displayScore,
        attentionPercentage: displayScore !== null ? Math.round(displayScore * 100) : null,
        predictionSource,
        isSimulated: isSimulation,
        diagnostics: null,
      };
    } catch (err) {
      console.error('[OnnxInferenceEngine] Error building tensor:', err);
      return {
        isReady: true,
        frameCount: this.buffer.length,
        requiredFrames: this.CAPACITY,
        faceDetected,
        attentionScore: null,
        attentionPercentage: null,
        predictionSource,
        isSimulated: isSimulation,
        diagnostics: null,
      };
    }
  }

  private async _runInference(
    tensor: ort.Tensor,
    inputName: string,
    outputName: string,
  ): Promise<void> {
    try {
      const feeds: Record<string, ort.Tensor> = { [inputName]: tensor };
      const results = await this.session!.run(feeds);
      const raw = results[outputName].data[0] as number;
      const normalized = (raw - 0.10) / (0.55 - 0.10);
      this._lastScore = Math.max(0.0, Math.min(1.0, normalized));
    } catch (err) {
      console.error('[OnnxInferenceEngine] Error during inference:', err);
      this._lastScore = null;
    }
  }

  /**
   * Compute Eye Aspect Ratio from MediaPipe 478-point landmarks.
   * Standard 6-point EAR formula, averaged over both eyes.
   */
  private _computeEAR(landmarks: LandmarkPoint[]): number | null {
    const dist = (a: LandmarkPoint, b: LandmarkPoint) =>
      Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const eyeEAR = (p1: number, p2: number, p3: number, p4: number, p5: number, p6: number): number | null => {
      if (!landmarks[p1] || !landmarks[p2] || !landmarks[p3] ||
          !landmarks[p4] || !landmarks[p5] || !landmarks[p6]) return null;
      const v1 = dist(landmarks[p2], landmarks[p6]);
      const v2 = dist(landmarks[p3], landmarks[p5]);
      const h  = dist(landmarks[p1], landmarks[p4]);
      return h === 0 ? null : (v1 + v2) / (2.0 * h);
    };

    // MediaPipe left eye: 33, 160, 158, 133, 153, 144
    // MediaPipe right eye: 362, 385, 387, 263, 380, 373
    const left  = eyeEAR(33,  160, 158, 133, 153, 144);
    const right = eyeEAR(362, 385, 387, 263, 380, 373);

    if (left === null || right === null) return null;
    return (left + right) / 2;
  }

  /**
   * EAR-based eye closure penalty applied synchronously to the displayed score.
   * Thresholds: EAR < 0.15 = clearly closed → cap at 35%
   *             EAR 0.15–0.22 = partially closed → linear blend
   */
  private _applyEyePenalty(score: number, ear: number): number {
    if (ear < 0.15) {
      return Math.min(score, 0.35);
    } else if (ear < 0.22) {
      const t = (ear - 0.15) / 0.07; // 0..1
      const cap = 0.35 + 0.65 * t;   // 0.35..1.0
      return Math.min(score, cap);
    }
    return score;
  }

  reset(): void {
    this.buffer = [];
    this._lastScore = null;
    this._lastEAR = null;
  }
}
