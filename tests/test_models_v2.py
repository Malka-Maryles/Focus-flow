import onnxruntime as ort
import numpy as np
import os

models_dir = r'Malka Maryles - focusflow-models/focusflow-models'

# Test with 100-frame sequences (proper window size)
# and more extreme landmark differences

def make_seq_focused(seq_len=100):
    """Perfectly centered face, stable, eyes open"""
    frames = []
    for _ in range(seq_len):
        pts = np.zeros((478, 3), dtype=np.float32)
        pts[:, 0] = 0.5  # centered x
        pts[:, 1] = 0.5  # centered y
        # key landmarks
        pts[1]   = [0.5,  0.5,   0.0]   # nose tip
        pts[10]  = [0.5,  0.3,  -0.05]  # forehead
        pts[152] = [0.5,  0.7,   0.05]  # chin
        pts[234] = [0.34, 0.5,   0.0]   # left cheek
        pts[454] = [0.66, 0.5,   0.0]   # right cheek
        # eyes open (EAR ~0.3)
        pts[33]  = [0.42, 0.44, 0.0]
        pts[133] = [0.48, 0.44, 0.0]
        pts[159] = [0.45, 0.41, 0.0]
        pts[145] = [0.45, 0.47, 0.0]
        pts[362] = [0.52, 0.44, 0.0]
        pts[263] = [0.58, 0.44, 0.0]
        pts[386] = [0.55, 0.41, 0.0]
        pts[374] = [0.55, 0.47, 0.0]
        frames.append(pts)
    return np.array(frames)[np.newaxis]  # [1, seq, 478, 3]

def make_seq_distracted(seq_len=100):
    """Head turned right 35 degrees"""
    frames = []
    for _ in range(seq_len):
        pts = np.zeros((478, 3), dtype=np.float32)
        pts[:, 0] = 0.65  # shifted right
        pts[:, 1] = 0.5
        pts[1]   = [0.65, 0.5,  0.0]
        pts[10]  = [0.65, 0.3, -0.05]
        pts[152] = [0.65, 0.7,  0.05]
        pts[234] = [0.44, 0.5,  0.0]  # left cheek close (yaw right)
        pts[454] = [0.74, 0.5,  0.0]  # right cheek far
        frames.append(pts)
    return np.array(frames)[np.newaxis]

def make_seq_drowsy(seq_len=100):
    """Eyes nearly closed (EAR ~0.08)"""
    frames = []
    for _ in range(seq_len):
        pts = np.zeros((478, 3), dtype=np.float32)
        pts[:, 0] = 0.5
        pts[:, 1] = 0.5
        pts[1]   = [0.5, 0.5,  0.0]
        pts[10]  = [0.5, 0.3, -0.05]
        pts[152] = [0.5, 0.7,  0.05]
        pts[234] = [0.34, 0.5, 0.0]
        pts[454] = [0.66, 0.5, 0.0]
        # eyes nearly closed (EAR ~0.08)
        pts[33]  = [0.42, 0.44, 0.0]
        pts[133] = [0.48, 0.44, 0.0]
        pts[159] = [0.45, 0.435, 0.0]  # very small vertical gap
        pts[145] = [0.45, 0.445, 0.0]
        pts[362] = [0.52, 0.44, 0.0]
        pts[263] = [0.58, 0.44, 0.0]
        pts[386] = [0.55, 0.435, 0.0]
        pts[374] = [0.55, 0.445, 0.0]
        frames.append(pts)
    return np.array(frames)[np.newaxis]

seqs = {
    'focused_100':    make_seq_focused(100),
    'distracted_100': make_seq_distracted(100),
    'drowsy_100':     make_seq_drowsy(100),
    'focused_30':     make_seq_focused(30),
    'distracted_30':  make_seq_distracted(30),
}

print("Testing all models with 100-frame and 30-frame sequences\n")
print(f"{'Model':<12} {'Seq':>4}  {'focused':>10}  {'distracted':>12}  {'spread':>8}")
print("-" * 60)

for fname in sorted(os.listdir(models_dir)):
    if not fname.endswith('.onnx'):
        continue
    path = os.path.join(models_dir, fname)
    try:
        sess = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
        inp_name = sess.get_inputs()[0].name
        out_name = sess.get_outputs()[0].name  # first output (regression_scores or output)

        for seq_len in [100, 30]:
            key_f = f'focused_{seq_len}'
            key_d = f'distracted_{seq_len}'
            if key_f not in seqs:
                continue
            f_score = sess.run([out_name], {inp_name: seqs[key_f]})[0].flat[0]
            d_score = sess.run([out_name], {inp_name: seqs[key_d]})[0].flat[0]
            spread = f_score - d_score
            print(f"{fname:<12} {seq_len:>4}  {f_score:>10.4f}  {d_score:>12.4f}  {spread:>8.4f}")
    except Exception as e:
        print(f"{fname}: ERROR - {e}")

print("\n--- v4 family: classification output (5 classes) ---")
for fname in ['v4.onnx', 'v4_7.onnx']:
    path = os.path.join(models_dir, fname)
    try:
        sess = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
        inp_name = sess.get_inputs()[0].name
        for sname, seq in [('focused', seqs['focused_100']), ('distracted', seqs['distracted_100']), ('drowsy', seqs['drowsy_100'])]:
            out = sess.run(None, {inp_name: seq})
            reg = out[0].flat[0]
            cls = out[1].flatten()
            print(f"  {fname} {sname}: regression={reg:.4f}  classes={[f'{v:.3f}' for v in cls]}")
    except Exception as e:
        print(f"{fname}: ERROR - {e}")
