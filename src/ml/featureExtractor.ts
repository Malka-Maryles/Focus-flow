import { LandmarkPoint, FrameFeatures, SequenceFeatureVector } from './types';

/**
 * Extracts facial geometry & temporal metrics from 478 MediaPipe FaceMesh landmarks.
 */
export class FeatureExtractor {
  /**
   * Extract instantaneous frame features from a set of landmarks.
   */
  public static extractFrameFeatures(
    timestamp: number,
    landmarks: LandmarkPoint[] | null
  ): FrameFeatures {
    const hasKeypoints = Boolean(
      landmarks &&
      landmarks[1] &&
      landmarks[152] &&
      landmarks[10] &&
      landmarks[234] &&
      landmarks[454] &&
      landmarks[33] &&
      landmarks[263]
    );

    if (!landmarks || (!hasKeypoints && landmarks.length < 468)) {
      return {
        timestamp,
        faceDetected: false,
        landmarks: null,
        pitch: 0,
        yaw: 0,
        roll: 0,
        leftEAR: 0,
        rightEAR: 0,
        avgEAR: 0,
        mar: 0,
        gazeDeviation: 1.0,
      };
    }

    // 1. Head Pose Estimation from 3D Landmark Geometry
    const nose = landmarks[1];         // Nose tip
    const chin = landmarks[152];       // Chin
    const forehead = landmarks[10];    // Forehead
    const leftCheek = landmarks[234];  // Left face boundary
    const rightCheek = landmarks[454]; // Right face boundary

    // Yaw: asymmetry between nose and cheeks (-90 to +90 deg)
    const distLeft = Math.abs(nose.x - leftCheek.x);
    const distRight = Math.abs(rightCheek.x - nose.x);
    const totalWidth = Math.max(0.001, distLeft + distRight);
    const yaw = ((distLeft - distRight) / totalWidth) * 75; // in degrees

    // Pitch: vertical ratio between forehead-nose and nose-chin
    const upperHeight = Math.abs(nose.y - forehead.y);
    const lowerHeight = Math.abs(chin.y - nose.y);
    const totalHeight = Math.max(0.001, upperHeight + lowerHeight);
    const pitch = ((upperHeight - lowerHeight) / totalHeight) * 60; // in degrees

    // Roll: angle between cheeks
    const dyRoll = rightCheek.y - leftCheek.y;
    const dxRoll = rightCheek.x - leftCheek.x;
    const roll = Math.atan2(dyRoll, dxRoll) * (180 / Math.PI); // in degrees

    // 2. Eye Aspect Ratio (EAR)
    const leftEAR = this.calculateEAR(
      landmarks[159], landmarks[145], landmarks[33], landmarks[133]
    );
    const rightEAR = this.calculateEAR(
      landmarks[386], landmarks[374], landmarks[362], landmarks[263]
    );
    const avgEAR = (leftEAR + rightEAR) / 2;

    // 3. Mouth Aspect Ratio (MAR)
    const mar = this.calculateMAR(
      landmarks[13], landmarks[14], landmarks[61], landmarks[291]
    );

    // 4. Gaze Center Deviation from Screen Center (0.5, 0.5)
    const midEyeX = (landmarks[33].x + landmarks[263].x) / 2;
    const midEyeY = (landmarks[33].y + landmarks[263].y) / 2;
    const dx = midEyeX - 0.5;
    const dy = midEyeY - 0.5;
    const gazeDeviation = Math.sqrt(dx * dx + dy * dy);

    return {
      timestamp,
      faceDetected: true,
      landmarks,
      pitch,
      yaw,
      roll,
      leftEAR,
      rightEAR,
      avgEAR,
      mar,
      gazeDeviation,
    };
  }

  /**
   * Aggregate a sequence of 100 frames into a 16-dimensional feature vector.
   */
  public static extractSequenceFeatures(frames: FrameFeatures[]): SequenceFeatureVector {
    const totalFrames = frames.length;
    if (totalFrames === 0) {
      return this.getEmptySequenceFeatures();
    }

    const validFrames = frames.filter((f) => f.faceDetected);
    const facePresenceRatio = validFrames.length / totalFrames;

    if (validFrames.length === 0) {
      return this.getEmptySequenceFeatures();
    }

    const pitches = validFrames.map((f) => f.pitch);
    const yaws = validFrames.map((f) => f.yaw);
    const rolls = validFrames.map((f) => f.roll);
    const ears = validFrames.map((f) => f.avgEAR);
    const mars = validFrames.map((f) => f.mar);
    const gazes = validFrames.map((f) => f.gazeDeviation);

    const meanPitch = this.mean(pitches);
    const absMeanPitch = Math.abs(meanPitch);
    const stdPitch = this.std(pitches, meanPitch);

    const meanYaw = this.mean(yaws);
    const absMeanYaw = Math.abs(meanYaw);
    const stdYaw = this.std(yaws, meanYaw);

    const meanRoll = this.mean(rolls);
    const absMeanRoll = Math.abs(meanRoll);
    const stdRoll = this.std(rolls, meanRoll);

    const meanEAR = this.mean(ears);
    const stdEAR = this.std(ears, meanEAR);

    // Blink detection: EAR < 0.18
    let blinkCount = 0;
    let closedFrameCount = 0;
    for (let i = 1; i < ears.length; i++) {
      if (ears[i] < 0.18) {
        closedFrameCount++;
        if (ears[i - 1] >= 0.18) {
          blinkCount++;
        }
      }
    }

    const windowDurationSec = Math.max(1, totalFrames * 0.1);
    const blinkRate = blinkCount / windowDurationSec;
    const prolongedClosureRate = closedFrameCount / validFrames.length;

    const meanMAR = this.mean(mars);
    const meanGazeDeviation = this.mean(gazes);
    const stdGazeDeviation = this.std(gazes, meanGazeDeviation);

    // Movement velocity (frame-to-frame change in nose position)
    let totalMovement = 0;
    for (let i = 1; i < validFrames.length; i++) {
      const prev = validFrames[i - 1].landmarks;
      const curr = validFrames[i].landmarks;
      if (prev && curr && prev[1] && curr[1]) {
        const dx = curr[1].x - prev[1].x;
        const dy = curr[1].y - prev[1].y;
        totalMovement += Math.sqrt(dx * dx + dy * dy);
      }
    }
    const movementVelocity = totalMovement / validFrames.length;

    // Total angular displacement magnitude
    const headPoseDisplacement = Math.sqrt(
      absMeanPitch * absMeanPitch + absMeanYaw * absMeanYaw + absMeanRoll * absMeanRoll
    );

    return {
      absMeanPitch,
      stdPitch,
      absMeanYaw,
      stdYaw,
      absMeanRoll,
      stdRoll,
      meanEAR,
      stdEAR,
      blinkRate,
      prolongedClosureRate,
      meanMAR,
      meanGazeDeviation,
      stdGazeDeviation,
      movementVelocity,
      facePresenceRatio,
      headPoseDisplacement,
    };
  }

  public static toArray(features: SequenceFeatureVector): number[] {
    return [
      features.absMeanPitch,
      features.stdPitch,
      features.absMeanYaw,
      features.stdYaw,
      features.absMeanRoll,
      features.stdRoll,
      features.meanEAR,
      features.stdEAR,
      features.blinkRate,
      features.prolongedClosureRate,
      features.meanMAR,
      features.meanGazeDeviation,
      features.stdGazeDeviation,
      features.movementVelocity,
      features.facePresenceRatio,
      features.headPoseDisplacement,
    ];
  }

  private static calculateEAR(
    top: LandmarkPoint,
    bottom: LandmarkPoint,
    left: LandmarkPoint,
    right: LandmarkPoint
  ): number {
    const vertical = Math.sqrt(
      Math.pow(top.x - bottom.x, 2) + Math.pow(top.y - bottom.y, 2)
    );
    const horizontal = Math.max(
      0.001,
      Math.sqrt(Math.pow(left.x - right.x, 2) + Math.pow(left.y - right.y, 2))
    );
    return vertical / horizontal;
  }

  private static calculateMAR(
    top: LandmarkPoint,
    bottom: LandmarkPoint,
    left: LandmarkPoint,
    right: LandmarkPoint
  ): number {
    const vertical = Math.sqrt(
      Math.pow(top.x - bottom.x, 2) + Math.pow(top.y - bottom.y, 2)
    );
    const horizontal = Math.max(
      0.001,
      Math.sqrt(Math.pow(left.x - right.x, 2) + Math.pow(left.y - right.y, 2))
    );
    return vertical / horizontal;
  }

  private static mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private static std(arr: number[], meanVal: number): number {
    if (arr.length <= 1) return 0;
    const variance =
      arr.reduce((sum, val) => sum + Math.pow(val - meanVal, 2), 0) /
      (arr.length - 1);
    return Math.sqrt(variance);
  }

  private static getEmptySequenceFeatures(): SequenceFeatureVector {
    return {
      absMeanPitch: 0,
      stdPitch: 0,
      absMeanYaw: 0,
      stdYaw: 0,
      absMeanRoll: 0,
      stdRoll: 0,
      meanEAR: 0,
      stdEAR: 0,
      blinkRate: 0,
      prolongedClosureRate: 1.0,
      meanMAR: 0,
      meanGazeDeviation: 1.0,
      stdGazeDeviation: 0,
      movementVelocity: 0,
      facePresenceRatio: 0,
      headPoseDisplacement: 0,
    };
  }
}
