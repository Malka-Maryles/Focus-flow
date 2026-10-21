import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, CameraOff, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { LandmarkPoint } from '../ml/types';
import type { FaceMesh } from '@mediapipe/face_mesh';
import type { Camera as MediaPipeCamera } from '@mediapipe/camera_utils';

// MediaPipe is loaded via CDN script tags at runtime (see loadMediaPipe below).
// The type-only imports above provide proper TypeScript types for the refs without
// bundling the CommonJS runtime code — constructors come from window globals.
// Note: MediaPipeCamera is aliased to avoid clashing with the lucide-react Camera icon.
type FaceMeshResults = any;

let FaceMeshCtor: any = null;
let CameraUtilsCtor: any = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadMediaPipe() {
  if (FaceMeshCtor && CameraUtilsCtor) return;
  const CDN = 'https://cdn.jsdelivr.net/npm';
  await injectScript(`${CDN}/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js`);
  await injectScript(`${CDN}/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js`);
  FaceMeshCtor = (window as any).FaceMesh;
  CameraUtilsCtor = (window as any).Camera;
  if (!FaceMeshCtor) throw new Error('MediaPipe FaceMesh failed to load from CDN');
  if (!CameraUtilsCtor) throw new Error('MediaPipe Camera utils failed to load from CDN');
}

export type InputMode = 'camera' | 'simulation';

export type SimulationScenario =
  | 'high_focus'
  | 'mild_distraction'
  | 'heavy_distraction'
  | 'drowsy'
  | 'no_face'
  | 'custom';

interface WebcamLandmarkDetectorProps {
  isActive: boolean;
  onFrameProcessed: (
    faceDetected: boolean,
    landmarks: LandmarkPoint[] | null,
    isSimulation?: boolean
  ) => void;
  onCameraReady?: () => void;
  onError?: (errorMsg: string) => void;
  onModeChange?: (mode: InputMode) => void;
}

export const WebcamLandmarkDetector: React.FC<WebcamLandmarkDetectorProps> = ({
  isActive,
  onFrameProcessed,
  onCameraReady,
  onError,
  onModeChange,
}) => {
  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [scenario, setScenario] = useState<SimulationScenario>('high_focus');

  // Custom simulation slider parameters
  const [customYaw, setCustomYaw] = useState<number>(0); // -45 to 45
  const [customPitch, setCustomPitch] = useState<number>(0); // -35 to 35
  const [customEAR, setCustomEAR] = useState<number>(0.30); // 0.08 to 0.38
  const [customMAR, setCustomMAR] = useState<number>(0.12); // 0.05 to 0.50
  const [customGazeDev, setCustomGazeDev] = useState<number>(0.04); // 0.0 to 0.5

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameId = useRef<number | null>(null);
  const simTimerId = useRef<any>(null);
  const lastSampleTime = useRef<number>(0);
  const simTickRef = useRef<number>(0);

  // Task 9.1 — FaceMesh and Camera utility refs (proper types from @mediapipe packages)
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const cameraUtilRef = useRef<MediaPipeCamera | null>(null);

  const [permissionStatus, setPermissionStatus] = useState<
    'idle' | 'prompting' | 'granted' | 'denied' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [faceInFrame, setFaceInFrame] = useState<boolean>(false);
  const [faceCoords, setFaceCoords] = useState<{ x: number; y: number; yaw: number; pitch: number }>({
    x: 50,
    y: 50,
    yaw: 0,
    pitch: 0,
  });

  // Task 9.4 — Updated stopCamera: also stops FaceMesh Camera utility and closes FaceMesh
  const stopCamera = useCallback(() => {
    if (cameraUtilRef.current) {
      cameraUtilRef.current.stop();
      cameraUtilRef.current = null;
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setFaceInFrame(false);
  }, []);

  // Task 9.3 — onFaceMeshResults callback: receives real 478-point landmarks from MediaPipe
  const onFaceMeshResults = useCallback((results: FaceMeshResults) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const raw = results.multiFaceLandmarks[0]; // 478 normalized {x, y, z}
      const landmarks: LandmarkPoint[] = raw.map((lm: { x: number; y: number; z: number }) => ({ x: lm.x, y: lm.y, z: lm.z }));
      setFaceInFrame(true);
      onFrameProcessed(true, landmarks, false);
    } else {
      setFaceInFrame(false);
      onFrameProcessed(false, null, false);
    }
  }, [onFrameProcessed]);

  // Task 9.2 — initFaceMesh: replaces startCamera + startDetectionLoop + detectRealFace
  const initFaceMesh = async () => {
    setPermissionStatus('prompting');
    setErrorMessage(null);

    try {
      // Request camera stream first
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('הדפדפן אינו תומך בגישה ישירה למצלמה.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Load @mediapipe packages dynamically (they are CJS, not ESM-bundleable)
      await loadMediaPipe();

      // Initialize FaceMesh
      const faceMesh = new FaceMeshCtor!({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults(onFaceMeshResults);
      await faceMesh.initialize();
      faceMeshRef.current = faceMesh;

      // Start Camera utility to feed frames to FaceMesh at ~10 FPS
      const camera = new CameraUtilsCtor!(videoRef.current!, {
        onFrame: async () => {
          const now = performance.now();
          if (now - lastSampleTime.current < 95) return; // 10 FPS gate
          lastSampleTime.current = now;
          if (faceMeshRef.current && videoRef.current) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480,
      });

      cameraUtilRef.current = camera;
      camera.start();

      setPermissionStatus('granted');
      onCameraReady?.();
    } catch (err: any) {
      let msg = 'לא ניתן להפעיל את מצלמת הרשת.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'הרשאת הגישה למצלמה נדחתה בדפדפן.';
        setPermissionStatus('denied');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'לא זוהתה מצלמת רשת מחוברת.';
        setPermissionStatus('error');
      } else {
        msg = err.message || msg;
        setPermissionStatus('error');
      }
      setErrorMessage(msg);
      onError?.(msg);
    }
  };

  /**
   * Generates realistic 478 MediaPipe facial landmarks according to head pose physics.
   * Used exclusively by the simulation loop (runSimulationTick).
   */
  const generateLandmarks = (
    cx: number,
    cy: number,
    yawDeg: number,
    pitchDeg: number,
    earVal: number,
    marVal: number
  ): LandmarkPoint[] => {
    const landmarks: LandmarkPoint[] = new Array(478);
    const faceRadiusX = 0.16;
    const faceRadiusY = 0.22;

    // Landmark 1: Nose tip
    landmarks[1] = { x: cx, y: cy, z: 0 };

    // Landmark 10: Forehead
    const pitchShift = (pitchDeg / 60) * 0.10;
    landmarks[10] = {
      x: cx,
      y: cy - (faceRadiusY * 0.85 + pitchShift),
      z: -0.05,
    };

    // Landmark 152: Chin
    landmarks[152] = {
      x: cx,
      y: cy + (faceRadiusY * 0.85 - pitchShift),
      z: 0.05,
    };

    // Cheeks: 234 (left), 454 (right) with real yaw asymmetry
    const yawShift = (yawDeg / 75) * 0.08;
    landmarks[234] = {
      x: cx - (faceRadiusX + yawShift),
      y: cy,
      z: 0,
    };
    landmarks[454] = {
      x: cx + (faceRadiusX - yawShift),
      y: cy,
      z: 0,
    };

    // Eyes: 33, 133, 159, 145 (left eye) & 362, 263, 386, 374 (right eye)
    const eyeSpan = faceRadiusX * 0.55;
    const eyeH = 0.05 * earVal;

    // Left eye
    landmarks[33] = { x: cx - eyeSpan - 0.025, y: cy - 0.06, z: 0 };
    landmarks[133] = { x: cx - eyeSpan + 0.025, y: cy - 0.06, z: 0 };
    landmarks[159] = { x: cx - eyeSpan, y: cy - 0.06 - eyeH, z: 0 };
    landmarks[145] = { x: cx - eyeSpan, y: cy - 0.06 + eyeH, z: 0 };

    // Right eye
    landmarks[362] = { x: cx + eyeSpan - 0.025, y: cy - 0.06, z: 0 };
    landmarks[263] = { x: cx + eyeSpan + 0.025, y: cy - 0.06, z: 0 };
    landmarks[386] = { x: cx + eyeSpan, y: cy - 0.06 - eyeH, z: 0 };
    landmarks[374] = { x: cx + eyeSpan, y: cy - 0.06 + eyeH, z: 0 };

    // Mouth: 13, 14, 61, 291
    const mouthH = 0.06 * marVal;
    landmarks[61] = { x: cx - 0.04, y: cy + 0.12, z: 0 };
    landmarks[291] = { x: cx + 0.04, y: cy + 0.12, z: 0 };
    landmarks[13] = { x: cx, y: cy + 0.12 - mouthH, z: 0 };
    landmarks[14] = { x: cx, y: cy + 0.12 + mouthH, z: 0 };

    // Fill remaining points with face mesh contour
    for (let i = 0; i < 478; i++) {
      if (!landmarks[i]) {
        const theta = (i / 478) * 2 * Math.PI;
        landmarks[i] = {
          x: cx + Math.cos(theta) * faceRadiusX,
          y: cy + Math.sin(theta) * faceRadiusY,
          z: 0,
        };
      }
    }

    return landmarks;
  };

  /**
   * Simulation Loop: executes at 10 FPS (100ms) with realistic human micro-movements
   * and feeds genuine 3D landmarks into the machine learning pipeline.
   */
  const runSimulationTick = () => {
    simTickRef.current++;
    const t = simTickRef.current;

    // Small organic jitter (breathing / subtle gaze tremor)
    const jitter = Math.sin(t * 0.3) * 0.8;
    const jitterGaze = Math.cos(t * 0.2) * 0.005;

    let cx = 0.5;
    let cy = 0.5;
    let yaw = 0;
    let pitch = 0;
    let ear = 0.30;
    let mar = 0.12;
    let hasFace = true;

    switch (scenario) {
      case 'high_focus':
        // Centered posture, high alertness, eyes wide, steady gaze
        cx = 0.5 + jitterGaze;
        cy = 0.48;
        yaw = 1.5 + jitter;
        pitch = 1.0 + Math.sin(t * 0.1) * 0.5;
        // Blink every 35 ticks (~3.5 seconds)
        ear = (t % 35 === 0 || t % 35 === 1) ? 0.08 : (0.31 + Math.sin(t * 0.5) * 0.01);
        mar = 0.11;
        break;

      case 'mild_distraction':
        // Looking slightly away, gaze wandering, turning head 12-25 deg
        cx = 0.54 + Math.sin(t * 0.1) * 0.05;
        cy = 0.50;
        yaw = 22 + Math.sin(t * 0.2) * 8;
        pitch = 8 + Math.cos(t * 0.15) * 4;
        ear = 0.28;
        mar = 0.14;
        break;

      case 'heavy_distraction':
        // Looking down at smartphone or away from monitor (yaw 32 deg, pitch 26 deg)
        cx = 0.60;
        cy = 0.58;
        yaw = 32 + Math.sin(t * 0.15) * 6;
        pitch = 28 + Math.cos(t * 0.2) * 5;
        ear = 0.24;
        mar = 0.16;
        break;

      case 'drowsy':
        // Drooping eyelids (EAR ~0.12), periodic yawning (MAR ~0.42), head nodding down
        cx = 0.5;
        cy = 0.54 + Math.sin(t * 0.08) * 0.04;
        yaw = Math.sin(t * 0.1) * 4;
        pitch = 24 + Math.sin(t * 0.08) * 8; // head nodding
        // Slow prolonged eyelid closures
        ear = (t % 20 < 7) ? 0.09 : 0.15;
        // Periodic yawn
        mar = (t % 50 > 30) ? 0.45 : 0.14;
        break;

      case 'no_face':
        hasFace = false;
        break;

      case 'custom':
        yaw = customYaw + jitter;
        pitch = customPitch;
        ear = customEAR;
        mar = customMAR;
        cx = 0.5 + (customGazeDev - 0.04);
        break;
    }

    setFaceInFrame(hasFace);

    if (!hasFace) {
      onFrameProcessed(false, null, true);
      drawSimulationCanvas(0.5, 0.5, 0, 0, 0, 0, false);
      return;
    }

    setFaceCoords({
      x: Math.round(cx * 100),
      y: Math.round(cy * 100),
      yaw: Math.round(yaw),
      pitch: Math.round(pitch),
    });

    const landmarks = generateLandmarks(cx, cy, yaw, pitch, ear, mar);
    drawSimulationCanvas(cx, cy, yaw, pitch, ear, mar, true);

    onFrameProcessed(true, landmarks, true);
  };

  /**
   * Visual renderer for simulation avatar radar
   */
  const drawSimulationCanvas = (
    cx: number,
    cy: number,
    yaw: number,
    pitch: number,
    ear: number,
    mar: number,
    detected: boolean
  ) => {
    const canvas = simCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Dark sleek radar background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (!detected) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('תרחיש: משתמש עזב את השולחן (אין פנים)', w / 2, h / 2);
      return;
    }

    const fx = cx * w;
    const fy = cy * h;
    const radiusX = 45;
    const radiusY = 60;

    // Head Contour
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate((yaw * Math.PI) / 180 * 0.2);

    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Eyes
    const eyeH = Math.max(1, 14 * (ear / 0.32));
    ctx.fillStyle = ear < 0.16 ? '#f43f5e' : '#10b981';
    // Left eye
    ctx.beginPath();
    ctx.ellipse(-18, -15, 7, eyeH, 0, 0, 2 * Math.PI);
    ctx.fill();
    // Right eye
    ctx.beginPath();
    ctx.ellipse(18, -15, 7, eyeH, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Nose
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, 10);
    ctx.stroke();

    // Mouth
    const mouthH = Math.max(2, 20 * (mar / 0.4));
    ctx.strokeStyle = mar > 0.30 ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 26, 14, mouthH, 0, 0, Math.PI);
    ctx.stroke();

    ctx.restore();

    // Top overlay badge
    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Yaw: ${Math.round(yaw)}°  Pitch: ${Math.round(pitch)}°  EAR: ${ear.toFixed(2)}`, 12, 22);
  };

  // Task 9.4 — handleSelectMode now calls initFaceMesh() instead of startCamera()
  const handleSelectMode = (newMode: InputMode) => {
    setInputMode(newMode);
    onModeChange?.(newMode);
    if (newMode === 'camera') {
      if (simTimerId.current) {
        clearInterval(simTimerId.current);
        simTimerId.current = null;
      }
      if (isActive) {
        initFaceMesh();
      }
    } else {
      stopCamera();
      if (isActive) {
        if (!simTimerId.current) {
          simTimerId.current = setInterval(runSimulationTick, 100);
        }
      }
    }
  };

  // Task 9.4 — useEffect now calls initFaceMesh() instead of startCamera().
  // Simulation-only deps (scenario, customYaw, etc.) are removed from the camera branch.
  useEffect(() => {
    if (inputMode === 'camera') {
      if (isActive) {
        initFaceMesh();
      } else {
        stopCamera();
      }
    } else {
      stopCamera();
      if (isActive) {
        if (simTimerId.current) clearInterval(simTimerId.current);
        simTimerId.current = setInterval(runSimulationTick, 100);
      } else {
        if (simTimerId.current) {
          clearInterval(simTimerId.current);
          simTimerId.current = null;
        }
      }
    }

    return () => {
      stopCamera();
      if (simTimerId.current) {
        clearInterval(simTimerId.current);
        simTimerId.current = null;
      }
    };
  }, [isActive, inputMode, scenario, customYaw, customPitch, customEAR, customMAR, customGazeDev]);

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-800 flex flex-col w-full">
      {/* Mode Selection Header Bar */}
      <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-indigo-400" />
          <span>מקור קלט למודל:</span>
        </span>

        <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
          <button
            type="button"
            onClick={() => handleSelectMode('camera')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              inputMode === 'camera'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            מצלמה חיה
          </button>
          <button
            type="button"
            onClick={() => handleSelectMode('simulation')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
              inputMode === 'simulation'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>סימולציית AI</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="relative aspect-video max-h-[300px] w-full flex items-center justify-center bg-slate-950 overflow-hidden">
        {inputMode === 'camera' ? (
          <>
            {/* Video is visible — FaceMesh Camera utility feeds it, we display it directly */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${
                permissionStatus === 'granted' ? 'block' : 'hidden'
              }`}
            />
            {/* Canvas kept for potential overlay use but hidden */}
            <canvas ref={canvasRef} className="hidden" />

            {permissionStatus === 'granted' && (
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-semibold text-white/90 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                  MediaPipe FaceMesh פעיל
                </span>
              </div>
            )}

            {permissionStatus === 'granted' && !faceInFrame && (
              <div className="absolute bottom-3 inset-x-4 bg-amber-500/90 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold text-center shadow-lg backdrop-blur-xs flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-slate-950" />
                <span>לא זוהו פנים מול המצלמה! נא למקם את הפנים מול המסך</span>
              </div>
            )}

            {permissionStatus === 'idle' && !isActive && (
              <div className="text-center p-6 text-slate-400">
                <Camera className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-medium text-slate-300">
                  המצלמה תופעל בלחיצה על &quot;התחל סשן למידה&quot;
                </p>
                <span className="text-xs text-slate-500 mt-1 block">
                  או בחרו בלשונית &quot;סימולציית AI&quot; למעלה לבדיקת המודל ללא מצלמה
                </span>
              </div>
            )}

            {permissionStatus === 'prompting' && (
              <div className="text-center p-6 text-slate-300 flex flex-col items-center">
                <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin mb-2" />
                <p className="text-sm font-semibold">ממתין לאישור הרשאת המצלמה בדפדפן...</p>
                <span className="text-xs text-slate-400 mt-1">לחצו על &quot;אפשר&quot; (Allow) בחלונית</span>
              </div>
            )}

            {(permissionStatus === 'denied' || permissionStatus === 'error') && (
              <div className="text-center p-4 max-w-sm mx-auto text-rose-300">
                <CameraOff className="w-8 h-8 mx-auto mb-2 text-rose-400" />
                <h4 className="text-xs font-bold text-white mb-1">המצלמה אינה זמינה כעת</h4>
                <p className="text-[11px] text-rose-200 mb-3">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => handleSelectMode('simulation')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>מעבר לסימולציית AI לבדיקת המודל</span>
                </button>
              </div>
            )}
          </>
        ) : (
          /* Simulation Mode Visualizer */
          <>
            <canvas ref={simCanvasRef} width={480} height={300} className="w-full h-full object-contain" />
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-indigo-950/80 border border-indigo-500/40 px-2.5 py-1 rounded-full text-[11px] font-semibold text-indigo-200">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>סימולציה מודרכת • בדיקת AI אמיתית</span>
            </div>
          </>
        )}
      </div>

      {/* Simulation Scenario Controls Strip */}
      {inputMode === 'simulation' && (
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-300 text-[11px]">בחירת תרחיש התנהגות לבדיקה:</span>
            <span className="text-[10px] text-amber-400 font-mono">הזנת נקודות 3D למודל הנוירונים</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            <button
              type="button"
              onClick={() => setScenario('high_focus')}
              className={`p-1.5 rounded-lg text-center border transition-all ${
                scenario === 'high_focus'
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-200 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block text-[11px]">🎯 ריכוז</span>
              <span className="text-[9px] opacity-75">קשב גבוה</span>
            </button>

            <button
              type="button"
              onClick={() => setScenario('mild_distraction')}
              className={`p-1.5 rounded-lg text-center border transition-all ${
                scenario === 'mild_distraction'
                  ? 'bg-amber-950 border-amber-500 text-amber-200 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block text-[11px]">📱 הסחה קלה</span>
              <span className="text-[9px] opacity-75">מבט הצידה</span>
            </button>

            <button
              type="button"
              onClick={() => setScenario('heavy_distraction')}
              className={`p-1.5 rounded-lg text-center border transition-all ${
                scenario === 'heavy_distraction'
                  ? 'bg-orange-950 border-orange-500 text-orange-200 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block text-[11px]">📵 הסחה כבדה</span>
              <span className="text-[9px] opacity-75">מבט בטלפון</span>
            </button>

            <button
              type="button"
              onClick={() => setScenario('drowsy')}
              className={`p-1.5 rounded-lg text-center border transition-all ${
                scenario === 'drowsy'
                  ? 'bg-rose-950 border-rose-500 text-rose-200 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block text-[11px]">🥱 עייפות</span>
              <span className="text-[9px] opacity-75">נמנום/פיהוק</span>
            </button>

            <button
              type="button"
              onClick={() => setScenario('no_face')}
              className={`p-1.5 rounded-lg text-center border transition-all ${
                scenario === 'no_face'
                  ? 'bg-slate-800 border-slate-400 text-white font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block text-[11px]">❌ אין פנים</span>
              <span className="text-[9px] opacity-75">עזיבת עמדה</span>
            </button>

            <button
              type="button"
              onClick={() => setScenario('custom')}
              className={`p-1.5 rounded-lg text-center border transition-all ${
                scenario === 'custom'
                  ? 'bg-indigo-950 border-indigo-500 text-indigo-200 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block text-[11px]">🎛️ כוונון</span>
              <span className="text-[9px] opacity-75">ידני</span>
            </button>
          </div>

          {/* Custom Sliders Panel */}
          {scenario === 'custom' && (
            <div className="mt-3 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <label className="text-slate-400 block mb-1">
                  הטיית ראש ימינה/שמאלה (Yaw): {customYaw}°
                </label>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  value={customYaw}
                  onChange={(e) => setCustomYaw(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  הטיית ראש מעלה/מטה (Pitch): {customPitch}°
                </label>
                <input
                  type="range"
                  min="-30"
                  max="30"
                  value={customPitch}
                  onChange={(e) => setCustomPitch(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  פתיחת עיניים (EAR): {customEAR.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.08"
                  max="0.38"
                  step="0.02"
                  value={customEAR}
                  onChange={(e) => setCustomEAR(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  פתיחת פה / פיהוק (MAR): {customMAR.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.08"
                  max="0.50"
                  step="0.02"
                  value={customMAR}
                  onChange={(e) => setCustomMAR(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
