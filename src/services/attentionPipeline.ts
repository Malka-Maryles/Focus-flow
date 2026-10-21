import { OnnxInferenceEngine, InferenceOutput } from '../ml/onnxEngine';
import { loadModel } from '../ml/modelLoader';
import { LandmarkPoint } from '../ml/types';

export type PipelineInferenceResult = InferenceOutput;
export type Landmark3D = LandmarkPoint;

const NOT_READY_RESULT: PipelineInferenceResult = {
  isReady: false,
  attentionScore: null,
  attentionPercentage: null,
  frameCount: 0,
  requiredFrames: 100,
  faceDetected: false,
  predictionSource: 'onnx_live',
  isSimulated: false,
  diagnostics: null,
};

export class AttentionPipeline {
  private engine: OnnxInferenceEngine | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = loadModel().then((e) => {
      this.engine = e;
    });
    return this.initPromise;
  }

  addFrame(
    faceDetected: boolean,
    rawLandmarks: LandmarkPoint[] | null,
    isSimulation = false
  ): PipelineInferenceResult {
    if (!this.engine) return NOT_READY_RESULT;
    return this.engine.processFrame(faceDetected, rawLandmarks, isSimulation);
  }

  reset(): void {
    this.engine?.reset();
    // Reset the init promise so next session gets a fresh start
    this.initPromise = null;
  }
}
