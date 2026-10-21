import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AttentionDatasetGenerator } from './dataset';
import { AttentionNeuralNetwork } from './model';
import { TrainingMetrics, ModelEvaluationReport } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runTraining(): {
  metrics: TrainingMetrics[];
  report: ModelEvaluationReport;
  weightsPath: string;
} {
  console.log('🧠 === FocusFlow Machine Learning Training Pipeline ===');
  console.log('1. Generating 1,200 diverse behavioral sequences...');

  const generator = new AttentionDatasetGenerator(42);
  const { samples, means, stds } = generator.generateDataset(1200);

  // Train (70%), Val (15%), Test (15%) split
  const trainCount = Math.floor(samples.length * 0.70);
  const valCount = Math.floor(samples.length * 0.15);

  const trainSet = samples.slice(0, trainCount);
  const valSet = samples.slice(trainCount, trainCount + valCount);
  const testSet = samples.slice(trainCount + valCount);

  console.log(`   - Train samples: ${trainSet.length}`);
  console.log(`   - Validation samples: ${valSet.length}`);
  console.log(`   - Test samples: ${testSet.length}`);

  // Instantiate Model
  const model = new AttentionNeuralNetwork();
  const epochs = 60;
  const learningRate = 0.003;
  const metrics: TrainingMetrics[] = [];

  console.log('\n2. Training Deep Neural Network (16 -> 32 -> 16 -> 8 -> 1)...');

  let initialLoss = 0;
  let finalLoss = 0;

  for (let epoch = 1; epoch <= epochs; epoch++) {
    // Shuffle training set
    for (let i = trainSet.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [trainSet[i], trainSet[j]] = [trainSet[j], trainSet[i]];
    }

    let epochTrainLoss = 0;
    let epochTrainMAE = 0;
    let lastGradNorm = 0;

    for (const sample of trainSet) {
      const pred = model.forward(sample.features);
      const { loss, gradNorm } = model.backward(sample.label, learningRate);
      epochTrainLoss += loss;
      epochTrainMAE += Math.abs(pred - sample.label);
      lastGradNorm = gradNorm;
    }

    const avgTrainLoss = epochTrainLoss / trainSet.length;
    const avgTrainMAE = epochTrainMAE / trainSet.length;

    // Validation evaluation
    let epochValLoss = 0;
    let epochValMAE = 0;
    for (const sample of valSet) {
      const pred = model.forward(sample.features);
      const loss = 0.5 * Math.pow(pred - sample.label, 2);
      epochValLoss += loss;
      epochValMAE += Math.abs(pred - sample.label);
    }
    const avgValLoss = epochValLoss / valSet.length;
    const avgValMAE = epochValMAE / valSet.length;

    metrics.push({
      epoch,
      trainLoss: avgTrainLoss,
      valLoss: avgValLoss,
      trainMAE: avgTrainMAE,
      valMAE: avgValMAE,
    });

    if (epoch === 1) initialLoss = avgTrainLoss;
    if (epoch === epochs) finalLoss = avgTrainLoss;

    if (epoch % 10 === 0 || epoch === 1) {
      console.log(
        `   [Epoch ${epoch.toString().padStart(2, '0')}/${epochs}] ` +
        `Train Loss: ${avgTrainLoss.toFixed(5)} | Val Loss: ${avgValLoss.toFixed(5)} | ` +
        `Val MAE: ${avgValMAE.toFixed(4)} | GradNorm: ${lastGradNorm.toFixed(6)}`
      );
    }
  }

  // Verify parameter learning
  console.log('\n3. Verifying Gradient Updates & Optimization Convergence:');
  console.log(`   - Initial Loss (Epoch 1): ${initialLoss.toFixed(5)}`);
  console.log(`   - Final Loss (Epoch ${epochs}): ${finalLoss.toFixed(5)}`);
  const lossReduction = ((initialLoss - finalLoss) / initialLoss) * 100;
  console.log(`   - Loss Reduction: ${lossReduction.toFixed(1)}%`);

  if (finalLoss >= initialLoss) {
    throw new Error('Model failed to learn: final loss did not decrease!');
  }

  // 4. Test Set Evaluation on Unseen Data
  console.log('\n4. Evaluating on Unseen Test Dataset (180 samples):');
  let testLossSum = 0;
  let testMAESum = 0;
  const preds: number[] = [];
  const targets: number[] = [];

  const classPredictions: Record<string, number[]> = {
    high_focus: [],
    moderate_focus: [],
    distracted: [],
    drowsy: [],
  };

  for (const sample of testSet) {
    const pred = model.forward(sample.features);
    preds.push(pred);
    targets.push(sample.label);
    testLossSum += 0.5 * Math.pow(pred - sample.label, 2);
    testMAESum += Math.abs(pred - sample.label);
    classPredictions[sample.category].push(pred);
  }

  const testLoss = testLossSum / testSet.length;
  const testMAE = testMAESum / testSet.length;

  // Calculate R^2 Score
  const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
  const ssTotal = targets.reduce((sum, t) => sum + Math.pow(t - meanTarget, 2), 0);
  const ssResidual = targets.reduce((sum, t, idx) => sum + Math.pow(t - preds[idx], 2), 0);
  const testR2 = 1 - ssResidual / ssTotal;

  const avgClass = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const report: ModelEvaluationReport = {
    testLoss,
    testMAE,
    testR2,
    samplesEvaluated: testSet.length,
    classPredictions: {
      highFocusMean: avgClass(classPredictions.high_focus),
      moderateFocusMean: avgClass(classPredictions.moderate_focus),
      distractedMean: avgClass(classPredictions.distracted),
      drowsyMean: avgClass(classPredictions.drowsy),
    },
  };

  console.log(`   - Test MSE Loss: ${testLoss.toFixed(5)}`);
  console.log(`   - Test Mean Absolute Error (MAE): ${(testMAE * 100).toFixed(2)}% (${testMAE.toFixed(4)})`);
  console.log(`   - Test R² (Coefficient of Determination): ${testR2.toFixed(4)}`);
  console.log('   - Mean Model Prediction by Behavioral Category:');
  console.log(`     * High Focus Category:     ${(report.classPredictions.highFocusMean * 100).toFixed(1)}%`);
  console.log(`     * Moderate Focus Category: ${(report.classPredictions.moderateFocusMean * 100).toFixed(1)}%`);
  console.log(`     * Distracted Category:     ${(report.classPredictions.distractedMean * 100).toFixed(1)}%`);
  console.log(`     * Drowsy/Disengaged:       ${(report.classPredictions.drowsyMean * 100).toFixed(1)}%`);

  // Verify that outputs are distinctly separated and NOT identical
  const outputSpread = report.classPredictions.highFocusMean - report.classPredictions.drowsyMean;
  console.log(`   - Dynamic Range Spread: ${(outputSpread * 100).toFixed(1)}%`);

  if (outputSpread < 0.40) {
    throw new Error('Model predictions lack separation: output spread too narrow!');
  }

  // 5. Save Model Weights
  const weights = model.exportWeights(means, stds);
  const weightsPath = path.resolve(__dirname, 'trained_model_weights.json');
  fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2), 'utf-8');
  console.log(`\n5. Saved trained model weights to: ${weightsPath}`);

  return { metrics, report, weightsPath };
}

// Run directly when called via node/tsx
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTraining();
}
