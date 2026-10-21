import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// vi.mock is hoisted to the top of the file by Vitest, so any variables
// referenced inside the factory must be created with vi.hoisted().
const { createMock, capturedTensors } = vi.hoisted(() => {
  const capturedTensors: Array<{ type: string; data: Float32Array; dims: number[] }> = [];
  const createMock = vi.fn();
  return { createMock, capturedTensors };
});

vi.mock('onnxruntime-web', () => {
  const mockSession = {
    inputNames: ['input'],
    outputNames: ['output'],
    run: vi.fn().mockResolvedValue({ output: { data: [0.5], type: 'float32', dims: [1, 1] } }),
  };

  createMock.mockResolvedValue(mockSession);

  const MockTensor = class {
    type: string;
    data: Float32Array;
    dims: number[];
    constructor(type: string, data: Float32Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
      capturedTensors.push(this);
    }
  };

  return {
    default: {
      env: { wasm: { wasmPaths: '/' } },
      InferenceSession: { create: createMock },
      Tensor: MockTensor,
    },
    env: { wasm: { wasmPaths: '/' } },
    InferenceSession: { create: createMock },
    Tensor: MockTensor,
  };
});

// Import after the mock is set up
import { OnnxInferenceEngine } from '../onnxEngine';

// Arbitraries — constrained to valid landmark coordinate space [0, 1]
const coordArb = fc.integer({ min: 0, max: 10000 }).map((n) => n / 10000);
const pointArb = fc.record({ x: coordArb, y: coordArb, z: coordArb });
const frameArb = fc.array(pointArb, { minLength: 478, maxLength: 478 });

describe('OnnxInferenceEngine — Property Tests', () => {
  beforeEach(() => {
    capturedTensors.length = 0;
    createMock.mockClear();
  });

  afterEach(async () => {
    // Let any fire-and-forget _runInference promises settle
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // **Validates: Requirements 3.2**
  it('P1: Buffer Capacity Invariant — frameCount <= 100 for any sequence of N processFrame calls', async () => {
    const property = fc.property(
      fc.array(
        fc.record({
          faceDetected: fc.boolean(),
          isSimulation: fc.boolean(),
        }),
        { minLength: 1, maxLength: 300 }
      ),
      (sequence) => {
        const engine = new OnnxInferenceEngine();
        for (const { faceDetected, isSimulation } of sequence) {
          const result = engine.processFrame(faceDetected, null, isSimulation);
          expect(result.frameCount).toBeLessThanOrEqual(100);
        }
      }
    );
    await fc.assert(property, { numRuns: 50 });
  });

  // **Validates: Requirements 3.3, 3.4**
  it('P2: WarmUp Gate — for any n < 100 frames, attentionScore === null and isReady === false', async () => {
    const property = fc.property(
      fc.array(
        fc.record({
          faceDetected: fc.boolean(),
          isSimulation: fc.boolean(),
        }),
        { minLength: 0, maxLength: 99 }
      ),
      (sequence) => {
        const engine = new OnnxInferenceEngine();
        for (const { faceDetected, isSimulation } of sequence) {
          const result = engine.processFrame(faceDetected, null, isSimulation);
          expect(result.attentionScore).toBeNull();
          expect(result.isReady).toBe(false);
        }
      }
    );
    await fc.assert(property, { numRuns: 50 });
  });

  // **Validates: Requirements 4.1**
  it('P4: Tensor Shape Determinism — same 100 frames always produce identical 143,400-element Float32Array', async () => {
    const property = fc.asyncProperty(
      fc.array(frameArb, { minLength: 100, maxLength: 100 }),
      async (frames) => {
        capturedTensors.length = 0;

        const engine = new OnnxInferenceEngine();
        await engine.initialize('/mock-model.onnx');

        // First run: feed 100 frames
        for (const frame of frames) {
          engine.processFrame(true, frame, false);
        }
        // Let async inference settle
        await new Promise((resolve) => setTimeout(resolve, 0));

        const firstTensor = capturedTensors[capturedTensors.length - 1];
        expect(firstTensor).toBeDefined();
        expect(firstTensor.data).toBeInstanceOf(Float32Array);
        expect(firstTensor.data.length).toBe(143400);
        expect(firstTensor.dims).toEqual([1, 100, 478, 3]);

        // Second run: reset and feed the same frames
        engine.reset();
        capturedTensors.length = 0;
        for (const frame of frames) {
          engine.processFrame(true, frame, false);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));

        const secondTensor = capturedTensors[capturedTensors.length - 1];
        expect(secondTensor).toBeDefined();
        expect(secondTensor.data.length).toBe(143400);
        expect(secondTensor.dims).toEqual([1, 100, 478, 3]);

        // Values must be identical
        for (let i = 0; i < 143400; i++) {
          expect(secondTensor.data[i]).toBe(firstTensor.data[i]);
        }
      }
    );
    await fc.assert(property, { numRuns: 5 });
  }, 30000);

  // **Validates: Requirements 3.6**
  it('P5: Zero-Fill for Missing Face — faceDetected=false stores 478 {x:0,y:0,z:0} points', async () => {
    const property = fc.asyncProperty(
      fc.array(fc.boolean(), { minLength: 100, maxLength: 100 }),
      fc.array(frameArb, { minLength: 100, maxLength: 100 }),
      async (faceDetectedSeq, landmarkFrames) => {
        capturedTensors.length = 0;

        const engine = new OnnxInferenceEngine();
        await engine.initialize('/mock-model.onnx');

        for (let i = 0; i < 100; i++) {
          const faceDetected = faceDetectedSeq[i];
          const landmarks = faceDetected ? landmarkFrames[i] : null;
          engine.processFrame(faceDetected, landmarks, false);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));

        const tensor = capturedTensors[capturedTensors.length - 1];
        expect(tensor).toBeDefined();
        expect(tensor.data.length).toBe(143400);
        expect(tensor.dims).toEqual([1, 100, 478, 3]);

        // For each frame where faceDetected was false, verify all 478*3 = 1434 elements are 0
        for (let f = 0; f < 100; f++) {
          if (!faceDetectedSeq[f]) {
            const start = f * 478 * 3;
            const end = start + 478 * 3;
            for (let i = start; i < end; i++) {
              expect(tensor.data[i]).toBe(0);
            }
          }
        }
      }
    );
    await fc.assert(property, { numRuns: 5 });
  }, 30000);

  // **Validates: Requirements 9.1, 9.2**
  it('P6: Prediction Source Tag — predictionSource === onnx_live iff isSimulation === false', async () => {
    const property = fc.property(
      fc.array(fc.boolean(), { minLength: 1, maxLength: 200 }),
      (isSimulationSeq) => {
        const engine = new OnnxInferenceEngine();
        for (const isSimulation of isSimulationSeq) {
          const result = engine.processFrame(false, null, isSimulation);
          expect(result.predictionSource === 'onnx_live').toBe(!isSimulation);
          expect(result.predictionSource === 'onnx_simulation').toBe(isSimulation);
        }
      }
    );
    await fc.assert(property, { numRuns: 50 });
  });

  // **Validates: Requirements 5.5**
  it('P7: Reset Clears Buffer — after reset(), next call returns isReady: false and frameCount === 1', async () => {
    const property = fc.property(
      fc.integer({ min: 100, max: 300 }),
      (n) => {
        const engine = new OnnxInferenceEngine();
        // Fill buffer beyond capacity (frameCount caps at 100)
        for (let i = 0; i < n; i++) {
          engine.processFrame(false, null, false);
        }
        // Reset clears the buffer
        engine.reset();
        // Next call after reset: buffer was empty, now has 1 frame
        const result = engine.processFrame(false, null, false);
        expect(result.frameCount).toBe(1);
        expect(result.isReady).toBe(false);
      }
    );
    await fc.assert(property, { numRuns: 50 });
  });
});
