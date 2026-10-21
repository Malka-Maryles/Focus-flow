import { describe, it, expect, vi } from 'vitest';
import type { LandmarkPoint } from '../../ml/types';

// Pure handler logic extracted from WebcamLandmarkDetector.tsx for unit testing.
// This mirrors the onFaceMeshResults callback without requiring React rendering.
function handleFaceMeshResults(
  results: { multiFaceLandmarks?: Array<Array<{ x: number; y: number; z: number }>> },
  onFrameProcessed: (
    faceDetected: boolean,
    landmarks: LandmarkPoint[] | null,
    isSimulation: boolean
  ) => void
): void {
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const raw = results.multiFaceLandmarks[0];
    const landmarks = raw.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }));
    onFrameProcessed(true, landmarks, false);
  } else {
    onFrameProcessed(false, null, false);
  }
}

// Helper: generate N landmark points with deterministic values
function makeLandmarks(count: number): Array<{ x: number; y: number; z: number }> {
  return Array.from({ length: count }, (_, i) => ({
    x: i / count,
    y: (i * 2) / count,
    z: (i * 3) / count,
  }));
}

describe('onFaceMeshResults handler logic', () => {
  // Requirements: 1.1, 1.2
  it('calls onFrameProcessed(true, landmarks, false) with 478 mapped {x,y,z} points when face is detected', () => {
    const rawLandmarks = makeLandmarks(478);
    const results = { multiFaceLandmarks: [rawLandmarks] };
    const onFrameProcessed = vi.fn();

    handleFaceMeshResults(results, onFrameProcessed);

    expect(onFrameProcessed).toHaveBeenCalledTimes(1);

    const [faceDetected, landmarks, isSimulation] = onFrameProcessed.mock.calls[0];
    expect(faceDetected).toBe(true);
    expect(isSimulation).toBe(false);

    // Landmarks array must have exactly 478 entries
    expect(landmarks).not.toBeNull();
    expect(landmarks).toHaveLength(478);

    // Each element must have {x, y, z} fields matching the raw source
    landmarks!.forEach((lm: LandmarkPoint, i: number) => {
      expect(lm).toHaveProperty('x', rawLandmarks[i].x);
      expect(lm).toHaveProperty('y', rawLandmarks[i].y);
      expect(lm).toHaveProperty('z', rawLandmarks[i].z);
    });
  });

  // Requirement: 1.2
  it('calls onFrameProcessed(false, null, false) when multiFaceLandmarks is an empty array', () => {
    const results = { multiFaceLandmarks: [] };
    const onFrameProcessed = vi.fn();

    handleFaceMeshResults(results, onFrameProcessed);

    expect(onFrameProcessed).toHaveBeenCalledTimes(1);
    expect(onFrameProcessed).toHaveBeenCalledWith(false, null, false);
  });

  // Requirement: 1.2, 1.3
  it('calls onFrameProcessed(false, null, false) when multiFaceLandmarks is undefined', () => {
    const results = {};
    const onFrameProcessed = vi.fn();

    handleFaceMeshResults(results, onFrameProcessed);

    expect(onFrameProcessed).toHaveBeenCalledTimes(1);
    expect(onFrameProcessed).toHaveBeenCalledWith(false, null, false);
  });
});
