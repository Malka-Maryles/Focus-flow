import React, { useState } from 'react';
import { Reading } from '../types';
import { TrendingUp, AlertTriangle, UserX, Clock, Sparkles } from 'lucide-react';

interface ChartPoint {
  timeLabel: string;
  timestamp: string;
  score: number | null;
  faceDetected: boolean;
  percentage: number | null;
}

interface AttentionTimelineChartProps {
  readings: Reading[] | { timestamp: string; score: number | null; faceDetected: boolean; prediction_source?: string }[];
  title?: string;
  height?: number;
  showThreshold?: boolean;
  threshold?: number; // e.g. 0.45
  compact?: boolean;
  sourceBadge?: string;
}

export const AttentionTimelineChart: React.FC<AttentionTimelineChartProps> = ({
  readings,
  title = 'ציר זמן קשב וריכוז',
  height = 220,
  showThreshold = true,
  threshold = 0.45,
  compact = false,
  sourceBadge,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!readings || readings.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
        <TrendingUp className="w-10 h-10 text-slate-300 mb-2" />
        <h4 className="text-sm font-semibold text-slate-700">אין עדיין נתוני קשב להצגת גרף</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          הגרף יופיע ויתעדכן בזמן אמת ברגע שתפעילו את סשן הלמידה וייקלטו דגימות פנים ומדדי קשב.
        </p>
      </div>
    );
  }

  // Format readings into standardized points
  const points: ChartPoint[] = readings.map((r, idx) => {
    const rawScore = 'attention_score' in r ? r.attention_score : r.score;
    const hasFace = 'face_detected' in r ? r.face_detected : r.faceDetected;
    const score = hasFace && typeof rawScore === 'number' ? Math.max(0, Math.min(1, rawScore)) : null;

    let timeLabel = `${idx + 1}s`;
    try {
      const d = new Date(r.timestamp);
      timeLabel = d.toLocaleTimeString('he-IL', { minute: '2-digit', second: '2-digit' });
    } catch {
      timeLabel = `${idx}s`;
    }

    return {
      timeLabel,
      timestamp: r.timestamp,
      score,
      faceDetected: hasFace,
      percentage: score !== null ? Math.round(score * 100) : null,
    };
  });

  // Calculate session average from valid points
  const validScores = points.filter((p) => p.score !== null).map((p) => p.score as number);
  const avgPercent = validScores.length > 0
    ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100)
    : null;

  // Calculate coordinates for SVG
  const paddingLeft = compact ? 25 : 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = compact ? 25 : 35;

  const svgWidth = 800;
  const svgHeight = height;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const getX = (index: number) => {
    if (points.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (points.length - 1)) * chartWidth;
  };

  const getY = (score: number) => {
    return paddingTop + (1 - score) * chartHeight;
  };

  // Build SVG path for valid segments
  const validCoordinates = points.map((p, idx) => ({
    x: getX(idx),
    y: p.score !== null ? getY(p.score) : null,
    score: p.score,
    point: p,
  }));

  // Create SVG path string with smooth bezier curves
  let pathD = '';
  let areaD = '';
  let inSegment = false;
  let segmentStartX = 0;
  let lastX = 0;
  let lastY = 0;

  for (let i = 0; i < validCoordinates.length; i++) {
    const curr = validCoordinates[i];
    if (curr.y !== null) {
      if (!inSegment) {
        pathD += `M ${curr.x} ${curr.y} `;
        areaD += `M ${curr.x} ${paddingTop + chartHeight} L ${curr.x} ${curr.y} `;
        segmentStartX = curr.x;
        inSegment = true;
      } else {
        const cpX1 = lastX + (curr.x - lastX) * 0.5;
        const cpX2 = lastX + (curr.x - lastX) * 0.5;
        pathD += `C ${cpX1} ${lastY}, ${cpX2} ${curr.y}, ${curr.x} ${curr.y} `;
        areaD += `C ${cpX1} ${lastY}, ${cpX2} ${curr.y}, ${curr.x} ${curr.y} `;
      }
      lastX = curr.x;
      lastY = curr.y;
    } else {
      if (inSegment) {
        areaD += `L ${lastX} ${paddingTop + chartHeight} Z `;
        inSegment = false;
      }
    }
  }

  if (inSegment) {
    areaD += `L ${lastX} ${paddingTop + chartHeight} Z `;
  }

  // Handle single point segment to show a clean line indicator
  if (points.length === 1 && validCoordinates[0].y !== null) {
    const singleX = validCoordinates[0].x;
    const singleY = validCoordinates[0].y!;
    pathD = `M ${singleX - 20} ${singleY} L ${singleX + 20} ${singleY}`;
  }

  const thresholdY = getY(threshold);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs overflow-hidden">
      {/* Chart Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <span className="text-[11px] text-slate-400">({points.length} דגימות)</span>
          {avgPercent !== null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
              ממוצע: {avgPercent}%
            </span>
          )}
          {sourceBadge && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {sourceBadge}
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>קשב גבוה (&gt;70%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>בינוני (45-70%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>נמוך (&lt;45%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span>אין פנים</span>
          </div>
        </div>
      </div>

      {/* SVG Container */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto select-none"
          style={{ minWidth: compact ? 260 : 380 }}
        >
          <defs>
            {/* Area gradient */}
            <linearGradient id="attentionGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y-axis labels */}
          {[1.0, 0.75, 0.5, 0.25, 0.0].map((level) => {
            const y = getY(level);
            return (
              <g key={level}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                {!compact && (
                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="text-[10px] fill-slate-400 font-mono"
                  >
                    {Math.round(level * 100)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Threshold reference line */}
          {showThreshold && (
            <g>
              <line
                x1={paddingLeft}
                y1={thresholdY}
                x2={svgWidth - paddingRight}
                y2={thresholdY}
                stroke="#f43f5e"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.8"
              />
              <text
                x={svgWidth - paddingRight}
                y={thresholdY - 5}
                textAnchor="end"
                className="text-[9px] fill-rose-500 font-semibold"
              >
                סף התראה ({Math.round(threshold * 100)}%)
              </text>
            </g>
          )}

          {/* Gradient area fill */}
          {areaD && <path d={areaD} fill="url(#attentionGradient)" />}

          {/* Primary curve path */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Individual Points and Missing Face Bars */}
          {validCoordinates.map((c, idx) => {
            const isHovered = hoveredIndex === idx;
            const p = c.point;

            if (c.y !== null && p.score !== null) {
              const color =
                p.score >= 0.7
                  ? '#10b981'
                  : p.score >= threshold
                  ? '#f59e0b'
                  : '#f43f5e';

              return (
                <g key={idx}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={isHovered ? 6 : 3.5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2 : 1.5}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                </g>
              );
            } else {
              // No face indicator line
              return (
                <line
                  key={idx}
                  x1={c.x}
                  y1={paddingTop + chartHeight - 15}
                  x2={c.x}
                  y2={paddingTop + chartHeight}
                  stroke="#cbd5e1"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            }
          })}

          {/* X-Axis time markers */}
          <line
            x1={paddingLeft}
            y1={paddingTop + chartHeight}
            x2={svgWidth - paddingRight}
            y2={paddingTop + chartHeight}
            stroke="#cbd5e1"
            strokeWidth="1"
          />

          {points.length > 0 && (
            <>
              <text
                x={paddingLeft}
                y={svgHeight - 10}
                textAnchor="start"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {points[0].timeLabel}
              </text>
              {points.length > 2 && (
                <text
                  x={paddingLeft + chartWidth / 2}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {points[Math.floor(points.length / 2)].timeLabel}
                </text>
              )}
              <text
                x={svgWidth - paddingRight}
                y={svgHeight - 10}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {points[points.length - 1].timeLabel}
              </text>
            </>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <div
            className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 bg-slate-900 text-white rounded-xl py-1.5 px-3 shadow-xl text-xs flex flex-col items-center gap-0.5 border border-slate-800"
            style={{
              left: `${(getX(hoveredIndex) / svgWidth) * 100}%`,
              top: `${
                validCoordinates[hoveredIndex]?.y !== null
                  ? (validCoordinates[hoveredIndex].y! / svgHeight) * 100
                  : 50
              }%`,
            }}
          >
            <div className="flex items-center gap-1.5 font-bold">
              {points[hoveredIndex].percentage !== null ? (
                <>
                  <span
                    className={
                      points[hoveredIndex].percentage! >= 70
                        ? 'text-emerald-400'
                        : points[hoveredIndex].percentage! >= threshold * 100
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }
                  >
                    {points[hoveredIndex].percentage}%
                  </span>
                  <span className="text-[10px] text-slate-300 font-normal">קשב</span>
                </>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <UserX className="w-3 h-3" />
                  <span>אין פנים</span>
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {points[hoveredIndex].timeLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
