import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { contentService } from '../services/contentService';
import { sessionService } from '../services/sessionService';
import { ContentItem, Session } from '../types';
import { AttentionPipeline, Landmark3D, PipelineInferenceResult } from '../services/attentionPipeline';
import { MODEL_MISSING_MESSAGE } from '../ml/modelLoader';
import { WebcamLandmarkDetector } from '../components/WebcamLandmarkDetector';
import { AttentionGauge } from '../components/AttentionGauge';
import { AttentionTimelineChart } from '../components/AttentionTimelineChart';
import { getYouTubeEmbedUrl } from '../utils/youtube';
import {
  Camera,
  Play,
  Square,
  AlertTriangle,
  Clock,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  Video,
  FileText,
  MonitorPlay,
  ScrollText,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// How long (ms) after session start before showing "video not playing" warning
const VIDEO_IDLE_THRESHOLD_MS = 20_000;
// How long (ms) without scrolling before showing scroll warning (text content)
const SCROLL_IDLE_THRESHOLD_MS = 45_000;

export const SessionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedContentId = searchParams.get('contentId');

  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(true);

  // Session state
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  // Attention & Pipeline state
  const pipelineRef = useRef<AttentionPipeline>(new AttentionPipeline());
  const lastSavedReadingTime = useRef<number>(0);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [faceDetected, setFaceDetected] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [bufferCount, setBufferCount] = useState<number>(0);
  const [lowAttentionAlert, setLowAttentionAlert] = useState<boolean>(false);
  const [threshold] = useState<number>(0.45);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [liveReadings, setLiveReadings] = useState<{ timestamp: string; score: number | null; faceDetected: boolean }[]>([]);

  // Model error state
  const [modelError, setModelError] = useState<string | null>(null);

  // Content engagement warnings
  const [videoNotPlayingAlert, setVideoNotPlayingAlert] = useState(false);
  const [scrollIdleAlert, setScrollIdleAlert] = useState(false);
  const lastScrollTime = useRef<number>(0);
  // track whether user has clicked within the video iframe area
  const videoAreaRef = useRef<HTMLDivElement | null>(null);
  const videoInteracted = useRef<boolean>(false);
  const textContentRef = useRef<HTMLDivElement | null>(null);

  // Fullscreen content mode
  const [isContentFullscreen, setIsContentFullscreen] = useState(false);

  // Summary modal
  const [completedSession, setCompletedSession] = useState<Session | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);

  const [isSimulatedSession, setIsSimulatedSession] = useState<boolean>(false);

  // ── Load content ──────────────────────────────────────────────
  useEffect(() => {
    async function loadContent() {
      setIsLoadingContent(true);
      try {
        const items = await contentService.list();
        setContentList(items);
        if (preselectedContentId) {
          const match = items.find((i) => i.id === preselectedContentId);
          if (match) setSelectedContent(match);
        } else if (items.length > 0) {
          setSelectedContent(items[0]);
        }
      } catch (err) {
        console.error('Failed to load content for session', err);
      } finally {
        setIsLoadingContent(false);
      }
    }
    loadContent();
  }, [preselectedContentId]);

  // ── Session timer ─────────────────────────────────────────────
  useEffect(() => {
    let timer: any = null;
    if (isSessionActive) {
      timer = setInterval(() => setDurationSeconds((p) => p + 1), 1000);
    } else {
      setDurationSeconds(0);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isSessionActive]);

  // ── Engagement tracking: reset on session start/stop ─────────
  useEffect(() => {
    if (isSessionActive) {
      lastScrollTime.current = Date.now();
      videoInteracted.current = false;
      setVideoNotPlayingAlert(false);
      setScrollIdleAlert(false);
    } else {
      setVideoNotPlayingAlert(false);
      setScrollIdleAlert(false);
    }
  }, [isSessionActive]);

  // ── Video not-started warning ─────────────────────────────────
  // Fix: we track clicks specifically on the video area div, not window-wide,
  // so starting the session doesn't immediately dismiss the warning.
  useEffect(() => {
    if (!isSessionActive || selectedContent?.content_type !== 'youtube') return;

    videoInteracted.current = false;

    const handleVideoAreaClick = () => {
      videoInteracted.current = true;
      setVideoNotPlayingAlert(false);
    };

    const el = videoAreaRef.current;
    if (el) el.addEventListener('click', handleVideoAreaClick);

    // Show warning after threshold if user never clicked inside the video area
    const timeout = setTimeout(() => {
      if (!videoInteracted.current) {
        setVideoNotPlayingAlert(true);
      }
    }, VIDEO_IDLE_THRESHOLD_MS);

    return () => {
      clearTimeout(timeout);
      if (el) el.removeEventListener('click', handleVideoAreaClick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionActive, selectedContent?.content_type]);

  // ── Scroll idle warning for text content ─────────────────────
  useEffect(() => {
    if (!isSessionActive || selectedContent?.content_type !== 'text') return;

    lastScrollTime.current = Date.now();

    const handleScroll = () => {
      lastScrollTime.current = Date.now();
      setScrollIdleAlert(false);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    const el = textContentRef.current;
    if (el) el.addEventListener('scroll', handleScroll, { passive: true });

    const interval = setInterval(() => {
      if (Date.now() - lastScrollTime.current > SCROLL_IDLE_THRESHOLD_MS) {
        setScrollIdleAlert(true);
      }
    }, 5_000);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (el) el.removeEventListener('scroll', handleScroll);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionActive, selectedContent?.content_type]);

  // ── Frame callback ────────────────────────────────────────────
  const handleFrameProcessed = (
    hasFace: boolean,
    landmarks: Landmark3D[] | null,
    isSimulation = false
  ) => {
    setIsSimulatedSession(isSimulation);
    if (!isSessionActive || !activeSession) return;

    const result: PipelineInferenceResult = pipelineRef.current.addFrame(hasFace, landmarks, isSimulation);

    setFaceDetected(result.faceDetected);
    setBufferCount(result.frameCount);
    setIsBuffering(!result.isReady);
    setDiagnostics(result.diagnostics);

    if (result.faceDetected && result.attentionScore !== null) {
      setCurrentScore(result.attentionScore);
      setLowAttentionAlert(result.attentionScore < threshold);
    } else if (!result.faceDetected) {
      setCurrentScore(null);
      setLowAttentionAlert(false);
    }

    const now = Date.now();
    if (now - lastSavedReadingTime.current >= 950) {
      lastSavedReadingTime.current = now;
      const readingObj = {
        timestamp: new Date().toISOString(),
        score: result.faceDetected ? result.attentionScore : null,
        faceDetected: result.faceDetected,
        prediction_source: result.predictionSource,
      };
      setLiveReadings((prev) => [...prev.slice(-60), readingObj]);
      sessionService.addReading(activeSession.id, {
        timestamp: readingObj.timestamp,
        attention_score: readingObj.score,
        face_detected: result.faceDetected,
        prediction_source: result.predictionSource,
      }).catch((e) => console.error('Error adding reading', e));
    }
  };

  // ── Session controls ──────────────────────────────────────────
  const handleStartSession = async () => {
    if (!selectedContent) return;
    try {
      await pipelineRef.current.init();
    } catch (err: any) {
      setModelError(err?.message ?? String(err));
      return;
    }
    try {
      const newSession = await sessionService.create(selectedContent.id);
      setActiveSession(newSession);
      pipelineRef.current.reset();
      lastSavedReadingTime.current = 0;
      setLiveReadings([]);
      setIsBuffering(true);
      setBufferCount(0);
      setCurrentScore(null);
      setLowAttentionAlert(false);
      setIsSessionActive(true);
    } catch (err: any) {
      alert(err.message || 'שגיאה בפתיחת סשן למידה.');
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    setIsEndingSession(true);
    setIsContentFullscreen(false);
    try {
      const finished = await sessionService.end(activeSession.id);
      setCompletedSession(finished);
      setIsSessionActive(false);
      setActiveSession(null);
      pipelineRef.current.reset();
    } catch (err: any) {
      alert(err.message || 'שגיאה בסיום הסשן.');
    } finally {
      setIsEndingSession(false);
    }
  };

  const formatTimer = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Shared alert banners ──────────────────────────────────────
  const AlertBanners = () => (
    <>
      {isSessionActive && lowAttentionAlert && faceDetected && (
        <div className="mb-4 p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-center justify-between text-rose-800 text-sm shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-200 rounded-xl"><AlertTriangle className="w-5 h-5" /></div>
            <div>
              <h4 className="font-bold text-rose-900">התראת ירידה ברמת הריכוז</h4>
              <p className="text-xs text-rose-700 mt-0.5">ציון הקשב שלך ירד מתחת לסף ה-45%.</p>
            </div>
          </div>
          <span className="text-xs font-bold bg-rose-200 text-rose-800 px-3 py-1.5 rounded-lg shrink-0">מתחת לסף</span>
        </div>
      )}

      {isSessionActive && videoNotPlayingAlert && selectedContent?.content_type === 'youtube' && (
        <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-center justify-between text-amber-800 text-sm shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-200 rounded-xl"><MonitorPlay className="w-5 h-5" /></div>
            <div>
              <h4 className="font-bold text-amber-900">האם הסרטון מופעל?</h4>
              <p className="text-xs text-amber-700 mt-0.5">
                עברו {Math.round(VIDEO_IDLE_THRESHOLD_MS / 1000)} שניות — לחץ על הסרטון כדי להפעיל אותו.
              </p>
            </div>
          </div>
          <button
            onClick={() => { videoInteracted.current = true; setVideoNotPlayingAlert(false); }}
            className="text-xs font-bold bg-amber-200 hover:bg-amber-300 text-amber-800 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            הסרטון רץ ✓
          </button>
        </div>
      )}

      {isSessionActive && scrollIdleAlert && selectedContent?.content_type === 'text' && (
        <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-2xl flex items-center justify-between text-blue-800 text-sm shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-200 rounded-xl"><ScrollText className="w-5 h-5" /></div>
            <div>
              <h4 className="font-bold text-blue-900">אין גלילה — עדיין קורא?</h4>
              <p className="text-xs text-blue-700 mt-0.5">
                לא זוהתה גלילה ב-{Math.round(SCROLL_IDLE_THRESHOLD_MS / 1000)} שניות האחרונות.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setScrollIdleAlert(false); lastScrollTime.current = Date.now(); }}
            className="text-xs font-bold bg-blue-200 hover:bg-blue-300 text-blue-800 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            ממשיך לקרוא ✓
          </button>
        </div>
      )}

      {modelError && (
        <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-300 rounded-xl text-red-800 text-sm">
          <strong>שגיאה:</strong> {modelError}
        </div>
      )}
    </>
  );

  // ── Content view (shared between normal and fullscreen) ───────
  const ContentView = () => (
    selectedContent?.content_type === 'youtube' && selectedContent.url ? (
      <div ref={videoAreaRef} className="relative w-full h-full rounded-xl overflow-hidden bg-black shadow-md">
        <iframe
          src={getYouTubeEmbedUrl(selectedContent.url) || ''}
          title={selectedContent.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    ) : (
      <div
        ref={textContentRef}
        className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-sans whitespace-pre-wrap text-base p-2 overflow-y-auto h-full"
      >
        {selectedContent?.text}
      </div>
    )
  );

  // ── FULLSCREEN MODE ───────────────────────────────────────────
  if (isContentFullscreen && isSessionActive) {
    return (
      <div className="fixed inset-0 z-40 bg-slate-950 flex flex-col">
        {/* Slim top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-white">{selectedContent?.title}</span>
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg font-mono text-xs text-indigo-300 font-bold">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTimer(durationSeconds)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsContentFullscreen(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>צא ממסך מלא</span>
            </button>
            <button
              onClick={handleEndSession}
              disabled={isEndingSession}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>סיים סשן</span>
            </button>
          </div>
        </div>

        {/* Alert banners in fullscreen */}
        <div className="px-4 pt-3 shrink-0">
          <AlertBanners />
        </div>

        {/* Content fills the rest */}
        <div className="flex-1 overflow-hidden p-4">
          {selectedContent?.content_type === 'youtube' ? (
            <div ref={videoAreaRef} className="w-full h-full rounded-xl overflow-hidden bg-black">
              <iframe
                src={getYouTubeEmbedUrl(selectedContent.url ?? '') || ''}
                title={selectedContent.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          ) : (
            <div
              ref={textContentRef}
              className="h-full overflow-y-auto bg-white rounded-xl p-8 prose prose-slate max-w-3xl mx-auto text-slate-800 leading-relaxed whitespace-pre-wrap text-base"
            >
              {selectedContent?.text}
            </div>
          )}
        </div>

        {/* Hidden webcam still runs in background */}
        <div className="hidden">
          <WebcamLandmarkDetector isActive={isSessionActive} onFrameProcessed={handleFrameProcessed} />
        </div>
      </div>
    );
  }

  // ── NORMAL LAYOUT ─────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-800">

      {/* Session Top Bar */}
      <div className="mb-6 pb-4 border-b border-indigo-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <Camera className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-600">סשן למידה ומעקב קשב</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">
              {isSessionActive && selectedContent
                ? <span>סשן פעיל: {selectedContent.title}</span>
                : <span>הפעלת סשן למידה חדש</span>}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isSessionActive ? (
              <>
                <label htmlFor="content-select" className="text-xs font-semibold text-slate-600 shrink-0">בחר תוכן:</label>
                <select
                  id="content-select"
                  aria-label="בחר חומר למידה לסשן"
                  value={selectedContent?.id || ''}
                  onChange={(e) => {
                    const match = contentList.find((c) => c.id === e.target.value);
                    if (match) setSelectedContent(match);
                  }}
                  disabled={isLoadingContent || contentList.length === 0}
                  className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 min-w-0"
                >
                  {contentList.length === 0 && <option value="">אין תכנים בספרייה</option>}
                  {contentList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.content_type === 'youtube' ? '🎥 ' : '📄 '}{c.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleStartSession}
                  disabled={!selectedContent || !!modelError}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>התחל סשן</span>
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 bg-slate-100 text-slate-800 px-3 py-1.5 rounded-xl font-mono text-sm font-bold shadow-xs shrink-0">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{formatTimer(durationSeconds)}</span>
                </div>
                <button
                  onClick={() => setIsContentFullscreen(true)}
                  title="מסך מלא"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-xl transition-colors shrink-0"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>מסך מלא</span>
                </button>
                <button
                  onClick={handleEndSession}
                  disabled={isEndingSession}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>{isEndingSession ? 'מסיים...' : 'סיים סשן'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alert banners */}
      <AlertBanners />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Content column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-indigo-100 p-6 shadow-sm min-h-[500px] flex flex-col">
            {selectedContent ? (
              <>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    {selectedContent.content_type === 'youtube' ? (
                      <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-md flex items-center gap-1">
                        <Video className="w-3.5 h-3.5" /><span>YouTube</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-md flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /><span>טקסט</span>
                      </span>
                    )}
                    <h2 className="text-lg font-bold text-slate-900">{selectedContent.title}</h2>
                  </div>
                  {isSessionActive && (
                    <button
                      onClick={() => setIsContentFullscreen(true)}
                      title="מסך מלא"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex-1">
                  {selectedContent.content_type === 'youtube' && selectedContent.url ? (
                    <div ref={videoAreaRef} className="relative aspect-video rounded-xl overflow-hidden bg-black shadow-md">
                      <iframe
                        src={getYouTubeEmbedUrl(selectedContent.url) || ''}
                        title={selectedContent.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    </div>
                  ) : (
                    <div ref={textContentRef} className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-sans whitespace-pre-wrap text-base p-2 overflow-y-auto">
                      {selectedContent.text}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-8">
                <BookOpen className="w-12 h-12 mb-3 text-slate-300" />
                <h3 className="text-base font-bold text-slate-700">לא נבחר חומר למידה</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">בחר חומר למידה מהספרייה כדי להתחיל.</p>
                <Link to="/library" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
                  <span>מעבר לספרייה</span><ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>

          <AttentionTimelineChart
            readings={liveReadings}
            title={isSessionActive ? 'ציר זמן קשב וריכוז בזמן אמת' : 'ציר זמן קשב וריכוז בסשן'}
            height={220}
            showThreshold={true}
            threshold={threshold}
            sourceBadge={isSimulatedSession ? 'סימולציית AI' : 'מצלמה חיה'}
          />
        </div>

        {/* Right column: webcam + gauge */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">זיהוי פנים (MediaPipe 3D)</span>
              {isSessionActive && (
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>מעקב פעיל</span>
                </span>
              )}
            </div>
            <WebcamLandmarkDetector isActive={isSessionActive} onFrameProcessed={handleFrameProcessed} />
          </div>
          <AttentionGauge
            score={currentScore}
            faceDetected={faceDetected}
            isBuffering={isBuffering}
            bufferCount={bufferCount}
            bufferRequired={100}
            threshold={threshold}
            isSimulated={isSimulatedSession}
            diagnostics={diagnostics}
          />
        </div>
      </div>

      {/* Session completed modal */}
      {completedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">סשן הלמידה הסתיים בהצלחה!</h2>
            <p className="text-xs text-slate-500 mb-6">נתוני הקשב שלך נשמרו וזמינים בדף ההיסטוריה.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">משך זמן</span>
                <span className="text-lg font-bold text-slate-900 font-mono">{formatTimer(completedSession.duration_seconds)}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">ממוצע קשב</span>
                <span className="text-lg font-bold text-indigo-600">
                  {completedSession.average_attention !== null
                    ? `${Math.round(completedSession.average_attention * 100)}%`
                    : 'אין דגימות'}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">דגימות תקינות</span>
                <span className="text-base font-bold text-slate-800">{completedSession.valid_readings_count}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">סה״כ דגימות</span>
                <span className="text-base font-bold text-slate-800">{completedSession.total_readings_count}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setCompletedSession(null)} className="flex-1 py-2.5 px-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">סגור</button>
              <button onClick={() => navigate('/history')} className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs">צפה בהיסטוריה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
