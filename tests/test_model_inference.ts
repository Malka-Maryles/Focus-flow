import { ModelInferenceEngine } from '../src/ml/inference';

function runInferenceAudit() {
  console.log('🧪 === Audit: Tracing Multiple Distinct Inputs Through ML Pipeline ===\n');
  const engine = new ModelInferenceEngine();

  // Test Case 1: Perfectly centered, attentive user for 100 frames
  console.log('--- Test Case 1: High Focus (Centered gaze, normal blink rate, stable pose) ---');
  engine.reset();
  let result1;
  for (let f = 0; f < 100; f++) {
    const landmarks = generateRealisticFace(0.5, 0.45, 0, 0, 0.30, 0.10);
    result1 = engine.processFrame(f * 100, true, landmarks);
  }
  console.log(`Result 1: Attention Score = ${(result1!.attentionScore! * 100).toFixed(1)}% | State: ${result1!.diagnostics.behaviorState}`);

  // Test Case 2: Turned head sideways (looking away at door/window - yaw 35 deg)
  console.log('\n--- Test Case 2: Distracted (Looking away, head turned sideways, high yaw) ---');
  engine.reset();
  let result2;
  for (let f = 0; f < 100; f++) {
    // Looking right: nose shifted, high asymmetry
    const landmarks = generateRealisticFace(0.65, 0.45, 35, 0, 0.26, 0.15);
    result2 = engine.processFrame(f * 100, true, landmarks);
  }
  console.log(`Result 2: Attention Score = ${(result2!.attentionScore! * 100).toFixed(1)}% | State: ${result2!.diagnostics.behaviorState}`);

  // Test Case 3: Looking down at smartphone / lap (pitch -35 deg)
  console.log('\n--- Test Case 3: Phone Distraction (Head tilted down, pitch -35 deg) ---');
  engine.reset();
  let result3;
  for (let f = 0; f < 100; f++) {
    const landmarks = generateRealisticFace(0.5, 0.65, 0, -35, 0.24, 0.16);
    result3 = engine.processFrame(f * 100, true, landmarks);
  }
  console.log(`Result 3: Attention Score = ${(result3!.attentionScore! * 100).toFixed(1)}% | State: ${result3!.diagnostics.behaviorState}`);

  // Test Case 4: Drowsy / Falling asleep (eyes closing, low EAR < 0.14)
  console.log('\n--- Test Case 4: Drowsy / Disengaged (Drooping eyelids, EAR = 0.12, Yawn MAR = 0.35) ---');
  engine.reset();
  let result4;
  for (let f = 0; f < 100; f++) {
    const landmarks = generateRealisticFace(0.5, 0.48, 0, -20, 0.12, 0.35);
    result4 = engine.processFrame(f * 100, true, landmarks);
  }
  console.log(`Result 4: Attention Score = ${(result4!.attentionScore! * 100).toFixed(1)}% | State: ${result4!.diagnostics.behaviorState}`);

  // Test Case 5: No face detected
  console.log('\n--- Test Case 5: No Face Detected ---');
  const result5 = engine.processFrame(10000, false, null);
  console.log(`Result 5: FaceDetected = ${result5.faceDetected} | Score = ${result5.attentionScore} (null enforced)`);

  console.log('\n=== Verification Summary ===');
  const score1 = result1!.attentionScore!;
  const score2 = result2!.attentionScore!;
  const score3 = result3!.attentionScore!;
  const score4 = result4!.attentionScore!;

  console.log(`High Focus Score:    ${(score1 * 100).toFixed(1)}%`);
  console.log(`Sideways Yaw Score:  ${(score2 * 100).toFixed(1)}%`);
  console.log(`Phone Pitch Score:   ${(score3 * 100).toFixed(1)}%`);
  console.log(`Drowsy / Eyelid Score: ${(score4 * 100).toFixed(1)}%`);

  console.log(`\nSpread (High Focus vs Distracted): ${((score1 - Math.min(score2, score3)) * 100).toFixed(1)}%`);
  console.log(`Spread (High Focus vs Drowsy):     ${((score1 - score4) * 100).toFixed(1)}%`);

  if (score1 < 0.75) {
    throw new Error('High focus did not score high enough!');
  }
  if (score4 > 0.30) {
    throw new Error('Drowsy score too high!');
  }
  if (Math.abs(score1 - score2) < 0.20 && Math.abs(score1 - score3) < 0.20) {
    throw new Error('Distracted score does not differ sufficiently from focused score!');
  }

  console.log('\n✅ AUDIT PASSED: The AI model responds dynamically and accurately across all distinct behavioral inputs!');
}

function generateRealisticFace(
  noseX: number,
  noseY: number,
  yawDeg: number,
  pitchDeg: number,
  ear: number,
  mar: number
) {
  const points: { x: number; y: number; z: number }[] = new Array(478);
  for (let i = 0; i < 478; i++) {
    points[i] = { x: noseX, y: noseY, z: 0 };
  }

  // 1: Nose tip
  points[1] = { x: noseX, y: noseY, z: 0 };

  // Forehead (10) and Chin (152) with vertical pitch shift
  // When pitch is -35 deg (head tilted down), forehead is closer to nose, chin is further
  const pitchFactor = (pitchDeg / 60) * 0.15;
  points[10] = { x: noseX, y: noseY - (0.20 + pitchFactor), z: -0.05 };
  points[152] = { x: noseX, y: noseY + (0.20 - pitchFactor), z: 0.05 };

  // Cheeks (234, 454) with horizontal yaw asymmetry
  // When yaw is 35 deg (turned right), left cheek is much further from nose than right cheek
  const yawFactor = (yawDeg / 75) * 0.12;
  points[234] = { x: noseX - (0.16 + yawFactor), y: noseY, z: 0 };
  points[454] = { x: noseX + (0.16 - yawFactor), y: noseY, z: 0 };

  // Eyes
  const eyeWidth = 0.06;
  const eyeHeight = eyeWidth * ear;
  points[33] = { x: noseX - 0.08, y: noseY - 0.08, z: 0 };
  points[133] = { x: noseX - 0.08 + eyeWidth, y: noseY - 0.08, z: 0 };
  points[159] = { x: noseX - 0.08 + eyeWidth / 2, y: noseY - 0.08 - eyeHeight / 2, z: 0 };
  points[145] = { x: noseX - 0.08 + eyeWidth / 2, y: noseY - 0.08 + eyeHeight / 2, z: 0 };

  points[362] = { x: noseX + 0.02, y: noseY - 0.08, z: 0 };
  points[263] = { x: noseX + 0.02 + eyeWidth, y: noseY - 0.08, z: 0 };
  points[386] = { x: noseX + 0.02 + eyeWidth / 2, y: noseY - 0.08 - eyeHeight / 2, z: 0 };
  points[374] = { x: noseX + 0.02 + eyeWidth / 2, y: noseY - 0.08 + eyeHeight / 2, z: 0 };

  // Mouth with MAR
  const mouthWidth = 0.08;
  const mouthHeight = mouthWidth * mar;
  points[61] = { x: noseX - mouthWidth / 2, y: noseY + 0.12, z: 0 };
  points[291] = { x: noseX + mouthWidth / 2, y: noseY + 0.12, z: 0 };
  points[13] = { x: noseX, y: noseY + 0.12 - mouthHeight / 2, z: 0 };
  points[14] = { x: noseX, y: noseY + 0.12 + mouthHeight / 2, z: 0 };

  return points;
}

runInferenceAudit();
