import onnxruntime as ort
import numpy as np
import os

models_dir = r'Malka Maryles - focusflow-models/focusflow-models'

def make_landmarks(nose_x, nose_y, yaw_deg, pitch_deg, ear, mar):
    pts = np.zeros((478, 3), dtype=np.float32)
    pts[:] = [nose_x, nose_y, 0]
    pts[1] = [nose_x, nose_y, 0]
    pitch_f = (pitch_deg / 60) * 0.15
    pts[10] = [nose_x, nose_y - (0.20 + pitch_f), -0.05]
    pts[152] = [nose_x, nose_y + (0.20 - pitch_f), 0.05]
    yaw_f = (yaw_deg / 75) * 0.12
    pts[234] = [nose_x - (0.16 + yaw_f), nose_y, 0]
    pts[454] = [nose_x + (0.16 - yaw_f), nose_y, 0]
    return pts

scenarios = {
    'focused':    make_landmarks(0.5,  0.45,  0,   0,  0.30, 0.10),
    'distracted': make_landmarks(0.65, 0.45, 35,   0,  0.26, 0.15),
    'drowsy':     make_landmarks(0.5,  0.48,  0, -20,  0.12, 0.35),
}
SEQ = 30

for fname in sorted(os.listdir(models_dir)):
    if not fname.endswith('.onnx'):
        continue
    path = os.path.join(models_dir, fname)
    try:
        sess = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
        inp = sess.get_inputs()[0]
        outputs = sess.get_outputs()
        print(f'\n=== {fname} (input: {inp.name}) ===')
        for sname, lm in scenarios.items():
            seq = np.tile(lm, (SEQ, 1, 1))[np.newaxis]  # [1, SEQ, 478, 3]
            out = sess.run(None, {inp.name: seq})
            parts = []
            for o, oval in zip(outputs, out):
                parts.append(f'{o.name}={oval.flat[0]:.4f}')
            print(f'  {sname}: {" | ".join(parts)}')
    except Exception as e:
        print(f'{fname}: ERROR - {e}')
