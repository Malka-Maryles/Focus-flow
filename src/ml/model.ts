import { ModelWeights } from './types';

export class AttentionNeuralNetwork {
  public inputDim = 16;
  public hidden1Dim = 32;
  public hidden2Dim = 16;
  public hidden3Dim = 8;
  public outputDim = 1;

  // Weights & Biases
  public W1: number[][]; // [32][16]
  public B1: number[];   // [32]
  public W2: number[][]; // [16][32]
  public B2: number[];   // [16]
  public W3: number[][]; // [8][16]
  public B3: number[];   // [8]
  public W4: number[][]; // [1][8]
  public B4: number[];   // [1]

  // Adam Optimizer Moments (m: 1st moment, v: 2nd moment)
  private mW1: number[][]; private vW1: number[][];
  private mB1: number[];   private vB1: number[];
  private mW2: number[][]; private vW2: number[][];
  private mB2: number[];   private vB2: number[];
  private mW3: number[][]; private vW3: number[][];
  private mB3: number[];   private vB3: number[];
  private mW4: number[][]; private vW4: number[][];
  private mB4: number[];   private vB4: number[];
  private timestep = 0;

  // Cached activations from last forward pass
  private lastX: number[] = [];
  private lastZ1: number[] = [];
  private lastA1: number[] = [];
  private lastZ2: number[] = [];
  private lastA2: number[] = [];
  private lastZ3: number[] = [];
  private lastA3: number[] = [];
  private lastOutput = 0;

  constructor() {
    // Initialize weights using He / Kaiming normal initialization
    this.W1 = this.initMatrix(this.hidden1Dim, this.inputDim, Math.sqrt(2 / this.inputDim));
    this.B1 = new Array(this.hidden1Dim).fill(0.01);

    this.W2 = this.initMatrix(this.hidden2Dim, this.hidden1Dim, Math.sqrt(2 / this.hidden1Dim));
    this.B2 = new Array(this.hidden2Dim).fill(0.01);

    this.W3 = this.initMatrix(this.hidden3Dim, this.hidden2Dim, Math.sqrt(2 / this.hidden2Dim));
    this.B3 = new Array(this.hidden3Dim).fill(0.01);

    this.W4 = this.initMatrix(this.outputDim, this.hidden3Dim, Math.sqrt(2 / this.hidden3Dim));
    this.B4 = new Array(this.outputDim).fill(0.0);

    // Initialize Adam states to 0
    this.mW1 = this.zeroMatrix(this.hidden1Dim, this.inputDim);
    this.vW1 = this.zeroMatrix(this.hidden1Dim, this.inputDim);
    this.mB1 = new Array(this.hidden1Dim).fill(0);
    this.vB1 = new Array(this.hidden1Dim).fill(0);

    this.mW2 = this.zeroMatrix(this.hidden2Dim, this.hidden1Dim);
    this.vW2 = this.zeroMatrix(this.hidden2Dim, this.hidden1Dim);
    this.mB2 = new Array(this.hidden2Dim).fill(0);
    this.vB2 = new Array(this.hidden2Dim).fill(0);

    this.mW3 = this.zeroMatrix(this.hidden3Dim, this.hidden2Dim);
    this.vW3 = this.zeroMatrix(this.hidden3Dim, this.hidden2Dim);
    this.mB3 = new Array(this.hidden3Dim).fill(0);
    this.vB3 = new Array(this.hidden3Dim).fill(0);

    this.mW4 = this.zeroMatrix(this.outputDim, this.hidden3Dim);
    this.vW4 = this.zeroMatrix(this.outputDim, this.hidden3Dim);
    this.mB4 = new Array(this.outputDim).fill(0);
    this.vB4 = new Array(this.outputDim).fill(0);
  }

  /**
   * Forward pass: computes output attention score in [0.0, 1.0].
   */
  public forward(x: number[]): number {
    this.lastX = x;

    // Layer 1
    this.lastZ1 = this.linear(x, this.W1, this.B1);
    this.lastA1 = this.lastZ1.map(this.leakyRelu);

    // Layer 2
    this.lastZ2 = this.linear(this.lastA1, this.W2, this.B2);
    this.lastA2 = this.lastZ2.map(this.leakyRelu);

    // Layer 3
    this.lastZ3 = this.linear(this.lastA2, this.W3, this.B3);
    this.lastA3 = this.lastZ3.map(this.leakyRelu);

    // Layer 4 (Output with Sigmoid)
    const z4 = this.linear(this.lastA3, this.W4, this.B4)[0];
    this.lastOutput = this.sigmoid(z4);

    return this.lastOutput;
  }

  /**
   * Backward pass with analytical gradient computation and Adam optimizer updates.
   */
  public backward(target: number, lr = 0.001, beta1 = 0.9, beta2 = 0.999, eps = 1e-8): {
    loss: number;
    gradNorm: number;
  } {
    this.timestep++;
    const pred = this.lastOutput;

    // Loss: Mean Squared Error = 0.5 * (pred - target)^2
    const loss = 0.5 * Math.pow(pred - target, 2);

    // Output gradient: dL/dZ4 = (pred - target) * pred * (1 - pred)
    const dZ4 = (pred - target) * pred * (1 - pred);

    // Layer 4 Gradients
    const dW4: number[][] = [this.lastA3.map((a) => dZ4 * a)];
    const dB4 = [dZ4];

    // Layer 3 Gradients
    // dL/dA3 = dZ4 * W4
    const dA3: number[] = new Array(this.hidden3Dim).fill(0);
    for (let j = 0; j < this.hidden3Dim; j++) {
      dA3[j] = dZ4 * this.W4[0][j];
    }
    const dZ3 = dA3.map((da, idx) => da * this.dLeakyRelu(this.lastZ3[idx]));
    const dW3 = this.outerProduct(dZ3, this.lastA2);
    const dB3 = dZ3;

    // Layer 2 Gradients
    const dA2: number[] = new Array(this.hidden2Dim).fill(0);
    for (let j = 0; j < this.hidden2Dim; j++) {
      let sum = 0;
      for (let i = 0; i < this.hidden3Dim; i++) {
        sum += dZ3[i] * this.W3[i][j];
      }
      dA2[j] = sum;
    }
    const dZ2 = dA2.map((da, idx) => da * this.dLeakyRelu(this.lastZ2[idx]));
    const dW2 = this.outerProduct(dZ2, this.lastA1);
    const dB2 = dZ2;

    // Layer 1 Gradients
    const dA1: number[] = new Array(this.hidden1Dim).fill(0);
    for (let j = 0; j < this.hidden1Dim; j++) {
      let sum = 0;
      for (let i = 0; i < this.hidden2Dim; i++) {
        sum += dZ2[i] * this.W2[i][j];
      }
      dA1[j] = sum;
    }
    const dZ1 = dA1.map((da, idx) => da * this.dLeakyRelu(this.lastZ1[idx]));
    const dW1 = this.outerProduct(dZ1, this.lastX);
    const dB1 = dZ1;

    // Apply Adam updates
    this.updateAdam(this.W1, dW1, this.mW1, this.vW1, lr, beta1, beta2, eps);
    this.updateAdamVec(this.B1, dB1, this.mB1, this.vB1, lr, beta1, beta2, eps);

    this.updateAdam(this.W2, dW2, this.mW2, this.vW2, lr, beta1, beta2, eps);
    this.updateAdamVec(this.B2, dB2, this.mB2, this.vB2, lr, beta1, beta2, eps);

    this.updateAdam(this.W3, dW3, this.mW3, this.vW3, lr, beta1, beta2, eps);
    this.updateAdamVec(this.B3, dB3, this.mB3, this.vB3, lr, beta1, beta2, eps);

    this.updateAdam(this.W4, dW4, this.mW4, this.vW4, lr, beta1, beta2, eps);
    this.updateAdamVec(this.B4, dB4, this.mB4, this.vB4, lr, beta1, beta2, eps);

    // Calculate gradient norm to verify active parameter updates
    const gradNorm = Math.sqrt(
      dZ4 * dZ4 +
      dZ3.reduce((s, g) => s + g * g, 0) +
      dZ2.reduce((s, g) => s + g * g, 0) +
      dZ1.reduce((s, g) => s + g * g, 0)
    );

    return { loss, gradNorm };
  }

  // --- Adam Update Helpers ---
  private updateAdam(
    W: number[][],
    dW: number[][],
    mW: number[][],
    vW: number[][],
    lr: number,
    beta1: number,
    beta2: number,
    eps: number
  ) {
    const t = this.timestep;
    const b1Corr = 1 - Math.pow(beta1, t);
    const b2Corr = 1 - Math.pow(beta2, t);

    for (let r = 0; r < W.length; r++) {
      for (let c = 0; c < W[r].length; c++) {
        const g = dW[r][c];
        mW[r][c] = beta1 * mW[r][c] + (1 - beta1) * g;
        vW[r][c] = beta2 * vW[r][c] + (1 - beta2) * g * g;

        const mHat = mW[r][c] / b1Corr;
        const vHat = vW[r][c] / b2Corr;
        W[r][c] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
      }
    }
  }

  private updateAdamVec(
    B: number[],
    dB: number[],
    mB: number[],
    vB: number[],
    lr: number,
    beta1: number,
    beta2: number,
    eps: number
  ) {
    const t = this.timestep;
    const b1Corr = 1 - Math.pow(beta1, t);
    const b2Corr = 1 - Math.pow(beta2, t);

    for (let r = 0; r < B.length; r++) {
      const g = dB[r];
      mB[r] = beta1 * mB[r] + (1 - beta1) * g;
      vB[r] = beta2 * vB[r] + (1 - beta2) * g * g;

      const mHat = mB[r] / b1Corr;
      const vHat = vB[r] / b2Corr;
      B[r] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
    }
  }

  // --- Math Helpers ---
  private linear(x: number[], W: number[][], B: number[]): number[] {
    const out: number[] = new Array(W.length);
    for (let r = 0; r < W.length; r++) {
      let sum = B[r];
      const row = W[r];
      for (let c = 0; c < row.length; c++) {
        sum += row[c] * x[c];
      }
      out[r] = sum;
    }
    return out;
  }

  private outerProduct(vec1: number[], vec2: number[]): number[][] {
    const mat: number[][] = [];
    for (let i = 0; i < vec1.length; i++) {
      const row: number[] = new Array(vec2.length);
      for (let j = 0; j < vec2.length; j++) {
        row[j] = vec1[i] * vec2[j];
      }
      mat.push(row);
    }
    return mat;
  }

  private leakyRelu(x: number): number {
    return x > 0 ? x : 0.01 * x;
  }

  private dLeakyRelu(x: number): number {
    return x > 0 ? 1 : 0.01;
  }

  private sigmoid(x: number): number {
    if (x > 20) return 1.0;
    if (x < -20) return 0.0;
    return 1.0 / (1.0 + Math.exp(-x));
  }

  private initMatrix(rows: number, cols: number, scale: number): number[][] {
    const mat: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = new Array(cols);
      for (let c = 0; c < cols; c++) {
        row[c] = (Math.random() * 2 - 1) * scale;
      }
      mat.push(row);
    }
    return mat;
  }

  private zeroMatrix(rows: number, cols: number): number[][] {
    const mat: number[][] = [];
    for (let r = 0; r < rows; r++) {
      mat.push(new Array(cols).fill(0));
    }
    return mat;
  }

  public exportWeights(means: number[], stds: number[]): ModelWeights {
    return {
      inputDim: this.inputDim,
      hidden1Dim: this.hidden1Dim,
      hidden2Dim: this.hidden2Dim,
      hidden3Dim: this.hidden3Dim,
      outputDim: this.outputDim,
      W1: this.W1,
      B1: this.B1,
      W2: this.W2,
      B2: this.B2,
      W3: this.W3,
      B3: this.B3,
      W4: this.W4,
      B4: this.B4,
      featureMeans: means,
      featureStds: stds,
      trainingTimestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  public loadWeights(weights: ModelWeights): void {
    this.inputDim = weights.inputDim;
    this.hidden1Dim = weights.hidden1Dim;
    this.hidden2Dim = weights.hidden2Dim;
    this.hidden3Dim = weights.hidden3Dim;
    this.outputDim = weights.outputDim;
    this.W1 = weights.W1;
    this.B1 = weights.B1;
    this.W2 = weights.W2;
    this.B2 = weights.B2;
    this.W3 = weights.W3;
    this.B3 = weights.B3;
    this.W4 = weights.W4;
    this.B4 = weights.B4;
  }
}
