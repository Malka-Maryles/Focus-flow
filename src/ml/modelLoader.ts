import { OnnxInferenceEngine } from './onnxEngine';

export const MODEL_PATH = '/models/attention_model.onnx';
export const MODEL_MISSING_MESSAGE =
  'Model file missing. Please place `attention_model.onnx` in the `public/models/` folder.';

let engineInstance: OnnxInferenceEngine | null = null;

/**
 * Returns the singleton OnnxInferenceEngine, initializing it on first call.
 * Subsequent calls return the already-initialized instance without re-fetching.
 */
export async function loadModel(): Promise<OnnxInferenceEngine> {
  if (engineInstance) return engineInstance;
  const engine = new OnnxInferenceEngine();
  await engine.initialize(MODEL_PATH);
  engineInstance = engine;
  return engineInstance;
}

/**
 * Resets the singleton — used in tests to get a fresh engine.
 */
export function resetModelSingleton(): void {
  engineInstance = null;
}
