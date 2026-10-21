import onnxruntime as ort
import numpy as np

path = r'Malka Maryles - focusflow-models/focusflow-models/v4_7.onnx'
sess = ort.InferenceSession(path, providers=['CPUExecutionProvider'])

print("Input names:", [i.name for i in sess.get_inputs()])
print("Output names:", [o.name for o in sess.get_outputs()])
print()

# Test extreme cases to find min/max range
def run(seq):
    return sess.run(None, {'input_x': seq})

# All zeros (no face / blank)
zeros = np.zeros((1, 100, 478, 3), dtype=np.float32)
out_zeros = run(zeros)
print(f"All zeros: regression={out_zeros[0].flat[0]:.4f}  class_logits={out_zeros[1].flatten()}")

# All center (0.5) — face present and centered
center = np.full((1, 100, 478, 3), 0.5, dtype=np.float32)
out_center = run(center)
print(f"All center: regression={out_center[0].flat[0]:.4f}  class_logits={out_center[1].flatten()}")

# Face at extremes (x=0 head left, x=1 head right)
left_face = np.full((1, 100, 478, 3), 0.5, dtype=np.float32)
left_face[0, :, :, 0] = 0.1  # all x coords far left
out_left = run(left_face)
print(f"Face at x=0.1: regression={out_left[0].flat[0]:.4f}")

right_face = np.full((1, 100, 478, 3), 0.5, dtype=np.float32)
right_face[0, :, :, 0] = 0.9  # all x coords far right
out_right = run(right_face)
print(f"Face at x=0.9: regression={out_right[0].flat[0]:.4f}")

# Random noise
np.random.seed(42)
noise = np.random.uniform(0, 1, (1, 100, 478, 3)).astype(np.float32)
out_noise = run(noise)
print(f"Random noise: regression={out_noise[0].flat[0]:.4f}")

# classification output interpretation
print()
print("Classification output has 5 values. Argmax for each scenario:")
scenarios_seqs = {
    'zeros': zeros,
    'center_stable': center,
    'noise': noise,
}
for name, seq in scenarios_seqs.items():
    out = run(seq)
    cls = out[1].flatten()
    argmax = np.argmax(cls)
    print(f"  {name}: argmax={argmax} ({cls})")
