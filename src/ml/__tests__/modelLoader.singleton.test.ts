import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// vi.mock is hoisted to the top of the file by Vitest, so any variables
// referenced inside the factory must be created with vi.hoisted() to be
// available at that point.
const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

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
import { loadModel, resetModelSingleton } from '../modelLoader';

describe('modelLoader singleton — Property P8: Singleton Session', () => {
  beforeEach(() => {
    resetModelSingleton();
    createMock.mockClear();
  });

  afterEach(() => {
    resetModelSingleton();
  });

  // **Validates: Requirements 2.4**
  it('calling loadModel() N times results in exactly one InferenceSession.create call regardless of N', async () => {
    const property = fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (n) => {
      // Reset state fresh for each generated input
      resetModelSingleton();
      createMock.mockClear();

      // Call loadModel N times (sequentially, awaiting each)
      for (let i = 0; i < n; i++) {
        await loadModel();
      }

      // The singleton must ensure InferenceSession.create is called exactly once
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    await fc.assert(property, { numRuns: 100 });
  });
});
