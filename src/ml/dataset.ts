import { TrainingSample, SequenceFeatureVector } from './types';
import { FeatureExtractor } from './featureExtractor';

export class AttentionDatasetGenerator {
  private seed: number;

  constructor(seed = 42) {
    this.seed = seed;
  }

  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  private normal(mean = 0, std = 1): number {
    const u1 = Math.max(1e-7, this.random());
    const u2 = this.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }

  private uniform(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Generates N realistic 100-frame sequence samples across 4 distinct behavioral classes.
   */
  public generateDataset(totalSamples = 1200): {
    samples: TrainingSample[];
    means: number[];
    stds: number[];
  } {
    const samples: TrainingSample[] = [];
    const samplesPerClass = Math.floor(totalSamples / 4);

    // 1. High Focus Class (Attention: 0.82 - 0.98)
    for (let i = 0; i < samplesPerClass; i++) {
      const targetLabel = this.uniform(0.84, 0.98);
      const absPitch = Math.abs(this.normal(1.5, 1.2));
      const absYaw = Math.abs(this.normal(2.0, 1.5));
      const absRoll = Math.abs(this.normal(1.0, 0.8));

      const seq: SequenceFeatureVector = {
        absMeanPitch: absPitch,
        stdPitch: Math.abs(this.normal(1.2, 0.4)),
        absMeanYaw: absYaw,
        stdYaw: Math.abs(this.normal(1.5, 0.5)),
        absMeanRoll: absRoll,
        stdRoll: Math.abs(this.normal(0.8, 0.3)),
        meanEAR: this.normal(0.30, 0.02),
        stdEAR: Math.abs(this.normal(0.03, 0.008)),
        blinkRate: Math.max(0.05, this.normal(0.22, 0.06)),
        prolongedClosureRate: Math.max(0.0, this.normal(0.01, 0.005)),
        meanMAR: Math.abs(this.normal(0.12, 0.02)),
        meanGazeDeviation: Math.abs(this.normal(0.04, 0.015)),
        stdGazeDeviation: Math.abs(this.normal(0.02, 0.008)),
        movementVelocity: Math.abs(this.normal(0.008, 0.003)),
        facePresenceRatio: Math.min(1.0, Math.max(0.95, this.normal(0.99, 0.01))),
        headPoseDisplacement: Math.sqrt(absPitch * absPitch + absYaw * absYaw + absRoll * absRoll),
      };
      samples.push({
        features: FeatureExtractor.toArray(seq),
        label: targetLabel,
        category: 'high_focus',
      });
    }

    // 2. Moderate Focus Class (Attention: 0.58 - 0.79)
    for (let i = 0; i < samplesPerClass; i++) {
      const targetLabel = this.uniform(0.60, 0.79);
      const absPitch = Math.abs(this.normal(6.5, 2.5));
      const absYaw = Math.abs(this.normal(9.0, 3.5));
      const absRoll = Math.abs(this.normal(3.5, 1.5));

      const seq: SequenceFeatureVector = {
        absMeanPitch: absPitch,
        stdPitch: Math.abs(this.normal(3.2, 0.8)),
        absMeanYaw: absYaw,
        stdYaw: Math.abs(this.normal(4.5, 1.0)),
        absMeanRoll: absRoll,
        stdRoll: Math.abs(this.normal(1.8, 0.5)),
        meanEAR: this.normal(0.27, 0.03),
        stdEAR: Math.abs(this.normal(0.045, 0.01)),
        blinkRate: Math.max(0.1, this.normal(0.35, 0.08)),
        prolongedClosureRate: Math.max(0.0, this.normal(0.03, 0.01)),
        meanMAR: Math.abs(this.normal(0.15, 0.03)),
        meanGazeDeviation: Math.abs(this.normal(0.12, 0.03)),
        stdGazeDeviation: Math.abs(this.normal(0.05, 0.015)),
        movementVelocity: Math.abs(this.normal(0.022, 0.006)),
        facePresenceRatio: Math.min(1.0, Math.max(0.85, this.normal(0.94, 0.03))),
        headPoseDisplacement: Math.sqrt(absPitch * absPitch + absYaw * absYaw + absRoll * absRoll),
      };
      samples.push({
        features: FeatureExtractor.toArray(seq),
        label: targetLabel,
        category: 'moderate_focus',
      });
    }

    // 3. Distracted Class (Attention: 0.25 - 0.50)
    for (let i = 0; i < samplesPerClass; i++) {
      const targetLabel = this.uniform(0.25, 0.50);
      // Large head turn (yaw 20-40 deg) or looking down at phone (pitch 20-40 deg)
      const absPitch = Math.abs(this.normal(24.0, 6.0));
      const absYaw = Math.abs(this.normal(28.0, 7.0));
      const absRoll = Math.abs(this.normal(6.0, 3.0));

      const seq: SequenceFeatureVector = {
        absMeanPitch: absPitch,
        stdPitch: Math.abs(this.normal(6.5, 1.5)),
        absMeanYaw: absYaw,
        stdYaw: Math.abs(this.normal(7.5, 2.0)),
        absMeanRoll: absRoll,
        stdRoll: Math.abs(this.normal(3.5, 1.0)),
        meanEAR: this.normal(0.25, 0.04),
        stdEAR: Math.abs(this.normal(0.06, 0.015)),
        blinkRate: Math.max(0.1, this.normal(0.45, 0.12)),
        prolongedClosureRate: Math.max(0.0, this.normal(0.06, 0.02)),
        meanMAR: Math.abs(this.normal(0.18, 0.05)),
        meanGazeDeviation: Math.abs(this.normal(0.30, 0.06)),
        stdGazeDeviation: Math.abs(this.normal(0.09, 0.02)),
        movementVelocity: Math.abs(this.normal(0.048, 0.012)),
        facePresenceRatio: Math.min(1.0, Math.max(0.70, this.normal(0.82, 0.06))),
        headPoseDisplacement: Math.sqrt(absPitch * absPitch + absYaw * absYaw + absRoll * absRoll),
      };
      samples.push({
        features: FeatureExtractor.toArray(seq),
        label: targetLabel,
        category: 'distracted',
      });
    }

    // 4. Drowsy / Disengaged Class (Attention: 0.03 - 0.22)
    for (let i = 0; i < samplesPerClass; i++) {
      const targetLabel = this.uniform(0.03, 0.22);
      const absPitch = Math.abs(this.normal(26.0, 5.0)); // head nodding
      const absYaw = Math.abs(this.normal(5.0, 3.0));
      const absRoll = Math.abs(this.normal(8.0, 4.0));

      const seq: SequenceFeatureVector = {
        absMeanPitch: absPitch,
        stdPitch: Math.abs(this.normal(8.0, 2.0)),
        absMeanYaw: absYaw,
        stdYaw: Math.abs(this.normal(3.0, 1.0)),
        absMeanRoll: absRoll,
        stdRoll: Math.abs(this.normal(2.5, 0.8)),
        meanEAR: this.normal(0.13, 0.025), // closed/drooping eyes
        stdEAR: Math.abs(this.normal(0.07, 0.02)),
        blinkRate: Math.max(0.02, this.normal(0.12, 0.04)),
        prolongedClosureRate: Math.min(0.9, Math.max(0.25, this.normal(0.50, 0.12))),
        meanMAR: Math.abs(this.normal(0.35, 0.08)), // yawning
        meanGazeDeviation: Math.abs(this.normal(0.36, 0.08)),
        stdGazeDeviation: Math.abs(this.normal(0.06, 0.02)),
        movementVelocity: Math.abs(this.normal(0.015, 0.005)),
        facePresenceRatio: Math.min(1.0, Math.max(0.65, this.normal(0.78, 0.08))),
        headPoseDisplacement: Math.sqrt(absPitch * absPitch + absYaw * absYaw + absRoll * absRoll),
      };
      samples.push({
        features: FeatureExtractor.toArray(seq),
        label: targetLabel,
        category: 'drowsy',
      });
    }

    // Shuffle dataset with Fisher-Yates
    for (let i = samples.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [samples[i], samples[j]] = [samples[j], samples[i]];
    }

    // Calculate feature means & stds for standard Z-score normalization
    const featureCount = 16;
    const means: number[] = new Array(featureCount).fill(0);
    const stds: number[] = new Array(featureCount).fill(0);

    for (let f = 0; f < featureCount; f++) {
      const values = samples.map((s) => s.features[f]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
      means[f] = mean;
      stds[f] = Math.max(1e-6, Math.sqrt(variance));
    }

    // Apply normalization in-place
    for (const sample of samples) {
      for (let f = 0; f < featureCount; f++) {
        sample.features[f] = (sample.features[f] - means[f]) / stds[f];
      }
    }

    return { samples, means, stds };
  }
}
