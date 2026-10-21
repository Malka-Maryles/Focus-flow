import { AttentionNeuralNetwork } from './model';
import { FeatureExtractor } from './featureExtractor';
import { ModelWeights, FrameFeatures, SequenceFeatureVector } from './types';
import weightsData from './trained_model_weights.json';

export interface InferenceOutput {
  isReady: boolean;
  frameCount: number;
  requiredFrames: number;
  faceDetected: boolean;
  attentionScore: number | null; // 0.0 to 1.0 or null
  attentionPercentage: number | null; // 0 to 100
  predictionSource: 'trained_neural_network_live' | 'trained_neural_network_simulation';
  isSimulated: boolean;
  diagnostics: {
    pitch: number;
    yaw: number;
    roll: number;
    ear: number;
    mar: number;
    gazeDeviation: number;
    blinkRate: number;
    behaviorState: 'ממוקד וקשוב' | 'הסחת דעת קלה' | 'מוסח דעת' | 'עייף / מנומנם' | 'מכייל';
  };
}

export class ModelInferenceEngine {
  private model: AttentionNeuralNetwork;
  private featureMeans: number[];
  private featureStds: number[];
  private frameBuffer: FrameFeatures[] = [];
  private readonly maxFrames = 100;

  constructor() {
    this.model = new AttentionNeuralNetwork();
    const weights = weightsData as unknown as ModelWeights;
    this.model.loadWeights(weights);
    this.featureMeans = weights.featureMeans;
    this.featureStds = weights.featureStds;
  }

  /**
   * Add a new frame with its detected landmarks, update sequence buffer,
   * and compute real model inference score with clear source attribution.
   */
  public processFrame(
    timestamp: number,
    faceDetected: boolean,
    landmarks: { x: number; y: number; z: number }[] | null,
    isSimulation = false
  ): InferenceOutput {
    const frameFeatures = FeatureExtractor.extractFrameFeatures(
      timestamp,
      faceDetected ? landmarks : null
    );

    this.frameBuffer.push(frameFeatures);
    if (this.frameBuffer.length > this.maxFrames) {
      this.frameBuffer.shift();
    }

    const frameCount = this.frameBuffer.length;
    const isCalibrated = frameCount >= 30; // 3 seconds for full calibration
    const hasMinimumFrames = frameCount >= 8; // 0.8s for initial live score
    const predictionSource = isSimulation
      ? 'trained_neural_network_simulation'
      : 'trained_neural_network_live';

    // If currently no face in frame
    if (!faceDetected) {
      return {
        isReady: isCalibrated,
        frameCount,
        requiredFrames: this.maxFrames,
        faceDetected: false,
        attentionScore: null,
        attentionPercentage: null,
        predictionSource,
        isSimulated: isSimulation,
        diagnostics: {
          pitch: 0,
          yaw: 0,
          roll: 0,
          ear: 0,
          mar: 0,
          gazeDeviation: 1.0,
          blinkRate: 0,
          behaviorState: 'מוסח דעת',
        },
      };
    }

    // If fewer than 8 frames, show brief calibration
    if (!hasMinimumFrames) {
      return {
        isReady: false,
        frameCount,
        requiredFrames: this.maxFrames,
        faceDetected: true,
        attentionScore: null,
        attentionPercentage: null,
        predictionSource,
        isSimulated: isSimulation,
        diagnostics: {
          pitch: Math.round(frameFeatures.pitch),
          yaw: Math.round(frameFeatures.yaw),
          roll: Math.round(frameFeatures.roll),
          ear: Math.round(frameFeatures.avgEAR * 100) / 100,
          mar: Math.round(frameFeatures.mar * 100) / 100,
          gazeDeviation: Math.round(frameFeatures.gazeDeviation * 100) / 100,
          blinkRate: 0,
          behaviorState: 'מכייל',
        },
      };
    }

    // Check face presence across available frames
    const validCount = this.frameBuffer.filter((f) => f.faceDetected).length;
    if (validCount / frameCount < 0.4) {
      return {
        isReady: isCalibrated,
        frameCount,
        requiredFrames: this.maxFrames,
        faceDetected: false,
        attentionScore: null,
        attentionPercentage: null,
        predictionSource,
        isSimulated: isSimulation,
        diagnostics: {
          pitch: 0,
          yaw: 0,
          roll: 0,
          ear: 0,
          mar: 0,
          gazeDeviation: 1.0,
          blinkRate: 0,
          behaviorState: 'מוסח דעת',
        },
      };
    }

    // Extract 16-dimensional sequence features
    const seqFeatures: SequenceFeatureVector =
      FeatureExtractor.extractSequenceFeatures(this.frameBuffer);
    const rawFeatures = FeatureExtractor.toArray(seqFeatures);

    // Normalize using training dataset parameters
    const normalizedFeatures = rawFeatures.map((val, idx) => {
      const mean = this.featureMeans[idx] || 0;
      const std = this.featureStds[idx] || 1;
      return (val - mean) / std;
    });

    // Run forward pass through the trained neural network
    const rawScore = this.model.forward(normalizedFeatures);
    const attentionScore = Math.max(0.02, Math.min(0.99, Math.round(rawScore * 1000) / 1000));
    const attentionPercentage = Math.round(attentionScore * 100);

    let behaviorState: 'ממוקד וקשוב' | 'הסחת דעת קלה' | 'מוסח דעת' | 'עייף / מנומנם' = 'ממוקד וקשוב';
    if (seqFeatures.prolongedClosureRate > 0.25 || seqFeatures.meanMAR > 0.28 || frameFeatures.avgEAR < 0.15) {
      behaviorState = 'עייף / מנומנם';
    } else if (attentionPercentage >= 70) {
      behaviorState = 'ממוקד וקשוב';
    } else if (attentionPercentage >= 45) {
      behaviorState = 'הסחת דעת קלה';
    } else {
      behaviorState = 'מוסח דעת';
    }

    // Diagnostic logging for transparency and debugging
    if (frameCount % 20 === 0) {
      console.debug(`[FocusFlow AI] Inference computed (${predictionSource}):`, {
        attentionPercentage,
        behaviorState,
        yaw: Math.round(frameFeatures.yaw),
        pitch: Math.round(frameFeatures.pitch),
        ear: Math.round(frameFeatures.avgEAR * 100) / 100,
        mar: Math.round(frameFeatures.mar * 100) / 100,
        isSimulated: isSimulation,
      });
    }

    return {
      isReady: true,
      frameCount,
      requiredFrames: this.maxFrames,
      faceDetected: true,
      attentionScore,
      attentionPercentage,
      predictionSource,
      isSimulated: isSimulation,
      diagnostics: {
        pitch: Math.round(frameFeatures.pitch),
        yaw: Math.round(frameFeatures.yaw),
        roll: Math.round(frameFeatures.roll),
        ear: Math.round(frameFeatures.avgEAR * 100) / 100,
        mar: Math.round(frameFeatures.mar * 100) / 100,
        gazeDeviation: Math.round(frameFeatures.gazeDeviation * 100) / 100,
        blinkRate: Math.round(seqFeatures.blinkRate * 10) / 10,
        behaviorState,
      },
    };
  }

  public reset(): void {
    this.frameBuffer = [];
  }
}
