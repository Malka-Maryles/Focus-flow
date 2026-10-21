import React from 'react';
import { AlertTriangle, UserX, CheckCircle, Info, Sparkles, Activity, Brain } from 'lucide-react';

interface AttentionGaugeProps {
  score: number | null;
  faceDetected: boolean;
  isBuffering: boolean;
  bufferCount: number;
  bufferRequired: number;
  threshold?: number;
  isSimulated?: boolean;
  diagnostics?: {
    pitch: number;
    yaw: number;
    roll: number;
    ear: number;
    mar: number;
    gazeDeviation: number;
    blinkRate: number;
    behaviorState: string;
  };
}

export const AttentionGauge: React.FC<AttentionGaugeProps> = ({
  score,
  faceDetected,
  isBuffering,
  bufferCount,
  bufferRequired,
  threshold = 0.45,
  isSimulated = false,
  diagnostics,
}) => {
  const percentage = score !== null ? Math.round(score * 100) : null;

  // Determine state-based styling
  type StateKey = 'idle' | 'noFace' | 'buffering' | 'high' | 'mid' | 'low';

  let state: StateKey = 'idle';
  if (!faceDetected) state = 'noFace';
  else if (isBuffering) state = 'buffering';
  else if (percentage !== null) {
    if (percentage >= 70) state = 'high';
    else if (percentage >= threshold * 100) state = 'mid';
    else state = 'low';
  }

  const stateConfig: Record<StateKey, {
    card: string;
    badge: string;
    stroke: string;
    glow: string;
    text: string;
    icon: React.ReactNode;
  }> = {
    idle: {
      card: 'border-slate-200',
      badge: 'bg-slate-50 text-slate-600 border-slate-200',
      stroke: '#94a3b8',
      glow: '',
      text: 'ממתין לתחילת מדידה',
      icon: <Info className="w-3.5 h-3.5 shrink-0" />,
    },
    noFace: {
      card: 'border-amber-200',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      stroke: '#f59e0b',
      glow: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]',
      text: 'לא זוהו פנים מול המצלמה',
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
    },
    buffering: {
      card: 'border-indigo-200',
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      stroke: '#6366f1',
      glow: 'drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]',
      text: `מכייל רצף (${bufferCount}/${bufferRequired})`,
      icon: <Info className="w-3.5 h-3.5 shrink-0" />,
    },
    high: {
      card: 'border-emerald-200',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      stroke: '#10b981',
      glow: 'drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]',
      text: diagnostics?.behaviorState || 'קשב גבוה וממוקד',
      icon: <CheckCircle className="w-3.5 h-3.5 shrink-0" />,
    },
    mid: {
      card: 'border-amber-200',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      stroke: '#f59e0b',
      glow: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]',
      text: diagnostics?.behaviorState || 'קשב בינוני',
      icon: <Info className="w-3.5 h-3.5 shrink-0" />,
    },
    low: {
      card: 'border-rose-200',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      stroke: '#f43f5e',
      glow: 'drop-shadow-[0_0_10px_rgba(244,63,94,0.45)]',
      text: diagnostics?.behaviorState || 'קשב נמוך — נדרשת התמקדות',
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
    },
  };

  const cfg = stateConfig[state];

  // SVG circular gauge
  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  let displayPct = 0;
  if (state === 'buffering') displayPct = Math.round((bufferCount / bufferRequired) * 100);
  else if (percentage !== null) displayPct = percentage;

  const strokeDashoffset = circumference - (displayPct / 100) * circumference;

  return (
    <div className={`bg-white rounded-2xl border ${cfg.card} p-5 flex flex-col items-center shadow-sm transition-colors duration-500`}>
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-3">
        <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          <span>מדד קשב חי</span>
        </span>
        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
          isSimulated
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-indigo-50 text-indigo-600 border-indigo-100'
        }`}>
          {isSimulated ? '✦ סימולציה' : '⬤ חי'}
        </span>
      </div>

      {/* Circular Gauge */}
      <div className="relative w-40 h-40 flex items-center justify-center my-1">
        <svg
          className={`w-full h-full transform -rotate-90 transition-all duration-500 ${cfg.glow}`}
          viewBox="0 0 160 160"
        >
          {/* Track */}
          <circle cx="80" cy="80" r={radius} stroke="#e2e8f0" strokeWidth="10" fill="transparent" />
          {/* Progress arc */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={cfg.stroke}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          {state === 'noFace' ? (
            <div className="flex flex-col items-center gap-1 animate-pulse">
              <UserX className="w-7 h-7 text-amber-500" />
              <span className="text-xs font-bold text-amber-700">אין פנים</span>
            </div>
          ) : state === 'buffering' ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-2xl font-bold text-indigo-600 font-mono leading-none">
                {displayPct}%
              </span>
              <span className="text-[10px] text-slate-400 font-medium">טוען נתונים</span>
            </div>
          ) : percentage !== null ? (
            <div className="flex flex-col items-center gap-0.5">
              <span
                className="text-3xl font-black tracking-tight leading-none transition-colors duration-500"
                style={{ color: cfg.stroke }}
              >
                {percentage}%
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {(percentage / 100).toFixed(2)}
              </span>
            </div>
          ) : (
            <Brain className="w-8 h-8 text-slate-300" />
          )}
        </div>
      </div>

      {/* Status badge */}
      <div className={`mt-2 px-3.5 py-1.5 rounded-full text-xs font-bold border ${cfg.badge} flex items-center gap-1.5 transition-all duration-500`}>
        {cfg.icon}
        <span>{cfg.text}</span>
      </div>

      {/* Metrics strip — only when live data available */}
      {faceDetected && !isBuffering && diagnostics && (
        <div className="grid grid-cols-3 gap-2 w-full mt-3 pt-3 border-t border-slate-100 text-center">
          {[
            { label: 'זווית ראש', value: `${Math.abs(diagnostics.yaw)}°` },
            { label: 'עיניים', value: diagnostics.ear.toFixed(2) },
            { label: 'מצמוצים', value: `${diagnostics.blinkRate.toFixed(1)}/ש` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
              <span className="text-[10px] text-slate-400 block leading-tight">{label}</span>
              <span className="text-xs font-mono font-bold text-slate-700">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer tag */}
      <div className="mt-3 pt-2 border-t border-slate-100 w-full text-center">
        <span className="text-[10px] text-indigo-500 font-medium flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span>ONNX Runtime Web • MediaPipe FaceMesh 478pt</span>
        </span>
      </div>
    </div>
  );
};
