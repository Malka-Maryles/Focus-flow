import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { contentService } from '../services/contentService';
import { ContentItem, ContentType } from '../types';
import { getYouTubeEmbedUrl, extractYouTubeId } from '../utils/youtube';
import {
  BookOpen, Plus, Video, FileText, Play, Eye, Trash2,
  X, AlertCircle, Loader2, Calendar, ExternalLink
} from 'lucide-react';

export const LibraryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ContentType>('text');
  const [newText, setNewText] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [viewingItem, setViewingItem] = useState<ContentItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ContentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchContent = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await contentService.list();
      setItems(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'שגיאה בטעינת חומרי הלמידה.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchContent(); }, []);

  const handleOpenAddModal = () => {
    setNewTitle(''); setNewType('text'); setNewText(''); setNewUrl('');
    setModalError(null); setIsAddModalOpen(true);
  };

  const handleCreateContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const titleClean = newTitle.trim();
    if (!titleClean || titleClean.length < 2) { setModalError('נא להזין כותרת באורך של לפחות 2 תווים.'); return; }
    if (newType === 'text' && !newText.trim()) { setModalError('נא להזין את תוכן הטקסט.'); return; }
    if (newType === 'youtube') {
      if (!newUrl.trim()) { setModalError('נא להזין קישור YouTube.'); return; }
      if (!extractYouTubeId(newUrl)) { setModalError('קישור YouTube לא תקין.'); return; }
    }
    setIsSaving(true);
    try {
      const created = await contentService.create({
        title: titleClean, content_type: newType,
        text: newType === 'text' ? newText.trim() : undefined,
        url: newType === 'youtube' ? newUrl.trim() : undefined,
      });
      setItems([created, ...items]);
      setIsAddModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'שגיאה בשמירת חומר הלמידה.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      await contentService.delete(deletingItem.id);
      setItems(items.filter((i) => i.id !== deletingItem.id));
      setDeletingItem(null);
      if (viewingItem?.id === deletingItem.id) setViewingItem(null);
    } catch (err: any) {
      alert(err.message || 'שגיאה במחיקת הפריט.');
    } finally {
      setIsDeleting(false);
    }
  };

  const startSessionWithContent = (contentId: string) => navigate(`/session?contentId=${contentId}`);

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('he-IL', { year: 'numeric', month: 'numeric', day: 'numeric' }); }
    catch { return ''; }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
      {/* Background blobs */}
      <div className="fixed top-40 right-10 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-40 left-10 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-fade-in-up">
        <div>
          <div className="flex items-center gap-2 text-violet-600 mb-1">
            <BookOpen className="w-5 h-5" />
            <span className="text-xs font-semibold tracking-wide uppercase">ספריית תכנים</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
            חומרי הלמידה של <span className="gradient-text">{user?.display_name || 'הסטודנט'}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">שמרו טקסטים לקריאה וסרטוני YouTube, והפעילו עליהם סשן מעקב קשב חי</p>
        </div>
        <button
          onClick={handleOpenAddModal} type="button"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/30 transition-all duration-300 hover:scale-105 text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>הוסף חומר למידה חדש</span>
        </button>
      </div>

      {/* Error */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-red-700 text-sm animate-fade-in-up">
          <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5 shrink-0" /><span>{errorMessage}</span></div>
          <button onClick={fetchContent} className="text-xs font-semibold text-red-300 underline">נסה שוב</button>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400 mb-3" />
          <p className="text-sm font-medium">טוען...</p>
        </div>
      ) : items.length === 0 ? (
        /* Empty state */
        <div className="py-16 px-4 glass rounded-2xl text-center max-w-xl mx-auto animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-200 text-violet-600 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">אין עדיין חומרי למידה בספרייה</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">הוסיפו טקסט לימודי או קישור לסרטון YouTube כדי להתחיל.</p>
          <button
            onClick={handleOpenAddModal} type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/30 transition-all duration-300 hover:scale-105 text-sm"
          >
            <Plus className="w-4 h-4" /><span>הוסף חומר ראשון</span>
          </button>
        </div>
      ) : (
        /* Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, idx) => {
            const isVideo = item.content_type === 'youtube';
            const ytId = isVideo && item.url ? extractYouTubeId(item.url) : null;
            return (
              <div
                key={item.id}
                className="glass glass-hover rounded-2xl flex flex-col overflow-hidden group animate-fade-in-up"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="relative aspect-video bg-white/5 flex items-center justify-center overflow-hidden border-b border-white/10">
                  {isVideo && ytId ? (
                    <>
                      <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                      <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-red-600/90 text-white text-xs font-semibold rounded-md backdrop-blur-sm flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5" /><span>YouTube</span>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-violet-600/10 to-indigo-600/10">
                      <span className="px-2.5 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-md border border-violet-200 self-start flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /><span>טקסט</span>
                      </span>
                      <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{item.text || 'תוכן טקסטואלי...'}</p>
                    </div>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base mb-2 line-clamp-2 group-hover:text-violet-600 transition-colors duration-200">{item.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                      <Calendar className="w-3.5 h-3.5" /><span>{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => startSessionWithContent(item.id)} type="button"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-xs transition-all duration-200 hover:scale-[1.03]"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /><span>התחל סשן קשב</span>
                    </button>
                    <button onClick={() => setViewingItem(item)} type="button" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="צפה בתוכן">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeletingItem(item)} type="button" className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="מחק">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="glass-strong rounded-2xl max-w-lg w-full p-6 animate-fade-in-up border border-white/20">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
                <Plus className="w-5 h-5 text-violet-600" /><span>הוספת חומר למידה</span>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /><span>{modalError}</span>
              </div>
            )}
            <form onSubmit={handleCreateContent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">כותרת</label>
                <input type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="לדוגמה: מבוא לבינה מלאכותית"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 shadow-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">סוג תוכן</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['text', 'youtube'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setNewType(t)}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all duration-200 ${newType === t ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 hover:bg-slate-50 text-slate-500'}`}>
                      {t === 'text' ? <><FileText className="w-4 h-4" /><span>טקסט</span></> : <><Video className="w-4 h-4" /><span>YouTube</span></>}
                    </button>
                  ))}
                </div>
              </div>
              {newType === 'text' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-600">תוכן הטקסט</label>
                    <span className="text-[11px] text-slate-400">{newText.length} תווים</span>
                  </div>
                  <textarea rows={6} required value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="הדביקו כאן את הטקסט לקריאה..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none shadow-sm" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">קישור YouTube</label>
                  <input type="url" required value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." dir="ltr"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 shadow-sm" />
                  <p className="text-[11px] text-slate-400 mt-1">תומך בקישורי youtube.com/watch או youtu.be</p>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">ביטול</button>
                <button type="submit" disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-violet-500/30 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100">
                  {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>שומר...</span></> : <span>שמור בספרייה</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {viewingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="glass-strong rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-white/20 animate-fade-in-up">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-violet-100 text-violet-600">
                  {viewingItem.content_type === 'youtube' ? <Video className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{viewingItem.title}</h2>
                  <span className="text-xs text-slate-400">{viewingItem.content_type === 'youtube' ? 'YouTube' : 'טקסט'} • {formatDate(viewingItem.created_at)}</span>
                </div>
              </div>
              <button onClick={() => setViewingItem(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              {viewingItem.content_type === 'youtube' && viewingItem.url ? (
                <div className="space-y-4">
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                    <iframe src={getYouTubeEmbedUrl(viewingItem.url) || ''} title={viewingItem.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full border-0" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span dir="ltr" className="truncate">{viewingItem.url}</span>
                    <a href={viewingItem.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-500 shrink-0">
                      <span>פתח ב-YouTube</span><ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">{viewingItem.text}</div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex items-center justify-between">
              <button onClick={() => setViewingItem(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">סגור</button>
              <button
                onClick={() => { const id = viewingItem.id; setViewingItem(null); startSessionWithContent(id); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-violet-500/30 transition-all hover:scale-105"
              >
                <Play className="w-4 h-4 fill-current" /><span>התחל סשן</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="glass-strong rounded-2xl max-w-sm w-full p-6 border border-white/20 text-center animate-fade-in-up">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 border border-red-200 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">מחיקת חומר למידה</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              האם למחוק את <strong className="text-slate-800">"{deletingItem.title}"</strong>? פעולה זו בלתי הפיכה.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingItem(null)} disabled={isDeleting} className="flex-1 py-2 px-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">ביטול</button>
              <button onClick={handleDeleteConfirm} disabled={isDeleting} className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                {isDeleting ? 'מוחק...' : 'מחק'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
