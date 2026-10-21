import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sessionService } from '../services/sessionService';
import { Session, Reading } from '../types';
import { AttentionTimelineChart } from '../components/AttentionTimelineChart';
import {
  History,
  Clock,
  BookOpen,
  Calendar,
  ChevronLeft,
  X,
  Play,
  BarChart3,
  TrendingUp,
  AlertCircle,
  Loader2,
  CheckCircle,
  UserX,
  ChevronDown
} from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selected session for detailed timeline & chart view
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<Session | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchSessions = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await sessionService.list();
      setSessions(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'שגיאה בטעינת היסטוריית הסשנים.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const openSessionDetail = async (sessionId: string) => {
    setIsLoadingDetail(true);
    try {
      const detail = await sessionService.get(sessionId);
      setSelectedSessionDetail(detail);
    } catch (err: any) {
      alert(err.message || 'שגיאה בשליפת פרטי הסשן.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins === 0) return `${secs} שניות`;
    return `${mins} דק' ו-${secs} שנ'`;
  };

  // Calculate overall stats
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const validAvgs = completedSessions
    .map((s) => s.average_attention)
    .filter((a): a is number => a !== null);
  const overallAvg = validAvgs.length > 0
    ? Math.round((validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length) * 100)
    : null;
  const totalMinutes = Math.round(
    completedSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / 60
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <History className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">מעקב התקדמות</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            היסטוריית סשנים וסטטיסטיקות
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            צפו בביצועי הקשב שלכם לאורך זמן ובניתוח גרפי מפורט של כל סשן
          </p>
        </div>

        <Link
          to="/session"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>התחל סשן חדש</span>
        </Link>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">סה״כ סשנים שהושלמו</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{completedSessions.length}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">סשנים שמורים במערכת</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">ממוצע קשב כולל</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overallAvg !== null ? `${overallAvg}%` : 'טרם חושב'}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">מחושב מדגימות פנים תקפות בלבד</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">זמן למידה מצטבר</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalMinutes} דקות</div>
          <span className="text-[11px] text-slate-400 mt-1 block">זמן למידה ממוקד ומתועד</span>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Historical Trend Graph across Completed Sessions */}
      {!isLoading && completedSessions.length > 0 && (
        <div className="mb-8">
          <AttentionTimelineChart
            readings={completedSessions.slice().reverse().map((s) => ({
              timestamp: s.started_at,
              score: s.average_attention,
              faceDetected: s.average_attention !== null,
            }))}
            title="מגמת קשב לאורך זמן (היסטוריית סשנים שהושלמו)"
            height={200}
            showThreshold={true}
            threshold={0.45}
          />
        </div>
      )}

      {/* Sessions Table / Cards */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-sm font-medium">טוען את היסטוריית הסשנים שלך...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="py-16 px-4 bg-white border border-slate-200 rounded-2xl text-center max-w-xl mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <History className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">אין עדיין סשנים בהיסטוריה</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            השלם את סשן הלמידה הראשון שלך כדי לצפות בסטטיסטיקות קשב מפורטות ובגרף התקדמות בזמן אמת.
          </p>
          <Link
            to="/session"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-xs transition-colors text-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>התחל סשן ראשון עכשיו</span>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">כל הסשנים ({sessions.length})</h2>
            <span className="text-xs text-slate-500">לחצו על שורת סשן כדי לצפות בגרף המדידות</span>
          </div>

          <div className="divide-y divide-slate-100">
            {sessions.map((session) => {
              const avgPercent = session.average_attention !== null
                ? Math.round(session.average_attention * 100)
                : null;

              return (
                <div
                  key={session.id}
                  onClick={() => openSessionDetail(session.id)}
                  className="p-4 sm:p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 cursor-pointer group"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 text-slate-600 transition-colors">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition-colors">
                        {session.content_title || 'חומר למידה'}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(session.started_at)}</span>
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatDuration(session.duration_seconds)}</span>
                        </span>
                        <span className="text-slate-400">
                          ({session.valid_readings_count} דגימות תקפות)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    {/* Attention Badge */}
                    <div className="text-left sm:text-right">
                      <span className="text-xs text-slate-400 block mb-0.5">ממוצע קשב</span>
                      {avgPercent !== null ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-base font-extrabold ${
                              avgPercent >= 70
                                ? 'text-emerald-600'
                                : avgPercent >= 45
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {avgPercent}%
                          </span>
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              avgPercent >= 70
                                ? 'bg-emerald-500'
                                : avgPercent >= 45
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">אין קריאות תקפות</span>
                      )}
                    </div>

                    <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 group-hover:-translate-x-1 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- SESSION DETAIL & GRAPH MODAL --- */}
      {selectedSessionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  ניתוח סשן: {selectedSessionDetail.content_title}
                </h3>
                <span className="text-xs text-slate-500">
                  התקיים ב-{formatDate(selectedSessionDetail.started_at)} • משך:{' '}
                  {formatDuration(selectedSessionDetail.duration_seconds)}
                </span>
              </div>
              <button
                onClick={() => setSelectedSessionDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Summary Badges */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-xs text-slate-500 block mb-1">ממוצע קשב</span>
                  <span className="text-xl font-bold text-indigo-600">
                    {selectedSessionDetail.average_attention !== null
                      ? `${Math.round(selectedSessionDetail.average_attention * 100)}%`
                      : 'אין נתונים'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-xs text-slate-500 block mb-1">דגימות פנים תקינות</span>
                  <span className="text-xl font-bold text-slate-800">
                    {selectedSessionDetail.valid_readings_count}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-xs text-slate-500 block mb-1">סה״כ דגימות</span>
                  <span className="text-xl font-bold text-slate-800">
                    {selectedSessionDetail.total_readings_count}
                  </span>
                </div>
              </div>

              {/* Chart / Readings Timeline */}
              <div>
                {selectedSessionDetail.readings && selectedSessionDetail.readings.length > 0 ? (
                  <AttentionTimelineChart
                    readings={selectedSessionDetail.readings}
                    title={`ציר זמן קשב וריכוז: ${selectedSessionDetail.content_title || 'סשן למידה'}`}
                    height={250}
                    showThreshold={true}
                    threshold={0.45}
                    sourceBadge={
                      selectedSessionDetail.readings[0]?.prediction_source?.includes('simulation')
                        ? 'סימולציה מודרכת'
                        : 'מצלמה חיה'
                    }
                  />
                ) : (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 text-xs">
                    לא נרשמו דגימות בודדות עבור סשן זה.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedSessionDetail(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-xl shadow-xs"
              >
                סגור פירוט
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
