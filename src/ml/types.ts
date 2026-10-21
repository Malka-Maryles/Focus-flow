/**
 * Machine Learning Feature Extraction & Pipeline Types
 */

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface FrameFeatures {
  timestamp: number;
  faceDetected: boolean;
  landmarks: LandmarkPoint[] | null;
  pitch: number;    // Head pitch in degrees (up/down)
  yaw: number;      // Head yaw in degrees (left/right)
  roll: number;     // Head roll in degrees (tilt)
  leftEAR: number;  // Left Eye Aspect Ratio
  rightEAR: number; // Right Eye Aspect Ratio
  avgEAR: number;   // Average EAR
  mar: number;      // Mouth Aspect Ratio
  gazeDeviation: number; // Distance of gaze center from screen center
}

export interface SequenceFeatureVector {
  // 16 symmetric, scale-invariant features extracted from 100 frames (~10s)
  absMeanPitch: number;       // Magnitude of head tilt up/down (deg)
  stdPitch: number;           // Pitch instability
  absMeanYaw: number;         // Magnitude of head turn left/right (deg)
  stdYaw: number;             // Yaw instability / looking around
  absMeanRoll: number;        // Head tilt magnitude (deg)
  stdRoll: number;            // Roll instability
  meanEAR: number;            // Eye openness (EAR ~0.28-0.34 for alert, <0.18 for drowsy)
  stdEAR: number;             // Eye blink variance
  blinkRate: number;          // Blinks per second
  prolongedClosureRate: number;// Fraction of time eyes closed
  meanMAR: number;            // Yawning / mouth opening
  meanGazeDeviation: number;  // Off-center gaze distance [0..1]
  stdGazeDeviation: number;   // Gaze wander / roaming
  movementVelocity: number;   // Spatial movement jitter
  facePresenceRatio: number;  // Fraction of frames face was detected [0..1]
  headPoseDisplacement: number;// Net 3D angular displacement
}

export interface TrainingSample {
  features: number[]; // 16 normalized feature values
  label: number;      // Target attention score in [0.0, 1.0]
  category: 'high_focus' | 'moderate_focus' | 'distracted' | 'drowsy';
}

export interface TrainingMetrics {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  trainMAE: number;
  valMAE: number;
}

export interface ModelEvaluationReport {
  testLoss: number;
  testMAE: number;
  testR2: number;
  samplesEvaluated: number;
  classPredictions: {
    highFocusMean: number;
    moderateFocusMean: number;
    distractedMean: number;
    drowsyMean: number;
  };
}

export interface ModelWeights {
  inputDim: number;
  hidden1Dim: number;
  hidden2Dim: number;
  hidden3Dim: number;
  outputDim: number;
  W1: number[][]; // [hidden1Dim][inputDim]
  B1: number[];   // [hidden1Dim]
  W2: number[][]; // [hidden2Dim][hidden1Dim]
  B2: number[];   // [hidden2Dim]
  W3: number[][]; // [hidden3Dim][hidden2Dim]
  B3: number[];   // [hidden3Dim]
  W4: number[][]; // [outputDim][hidden3Dim]
  B4: number[];   // [outputDim]
  featureMeans: number[];
  featureStds: number[];
  trainingTimestamp: string;
  version: string;
}

export type PredictionSource = 'onnx_live' | 'onnx_simulation';
