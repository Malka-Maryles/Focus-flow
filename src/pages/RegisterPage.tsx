import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Mail, Lock, User as UserIcon, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPasswordValid = password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleanName = displayName.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !cleanEmail || !password) { setErrorMessage('נא למלא את כל שדות החובה.'); return; }
    if (cleanName.length < 2) { setErrorMessage('שם התצוגה חייב להכיל לפחות 2 תווים.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setErrorMessage('כתובת האימייל שהוזנה אינה תקינה.'); return; }
    if (!isPasswordValid) { setErrorMessage('הסיסמה חייבת לכלול לפחות 8 תווים.'); return; }
    setIsSubmitting(true);
    try {
      await register(cleanEmail, password, cleanName);
      navigate('/library', { replace: true });
    } catch (err: any) {
      setErrorMessage(err.message || 'שגיאה ביצירת החשבון. אנא נסה שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-10 left-10 w-80 h-80 bg-violet-300/25 rounded-full blur-3xl float pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-blue-300/20 rounded-full blur-3xl float pointer-events-none" style={{animationDelay:'2s'}} />

      <div className="w-full max-w-md glass rounded-2xl p-8 animate-fade-in-up relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 items-center justify-center mb-4 glow-purple">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">הרשמה לחשבון חדש</h1>
          <p className="text-sm text-slate-500">הצטרפו ל-FocusFlow למעקב חכם אחר ריכוז בלמידה</p>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">שם מלא / תצוגה</label>
            <div className="relative">
              <input
                type="text" required value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ישראל ישראלי"
                className="w-full pl-3 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 transition-all text-sm shadow-sm"
              />
              <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">כתובת אימייל</label>
            <div className="relative">
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com" dir="ltr"
                className="w-full pl-3 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 transition-all text-sm shadow-sm"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">סיסמה (לפחות 8 תווים)</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'} required value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" dir="ltr"
                className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 transition-all text-sm shadow-sm"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-3.5 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              {isPasswordValid
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                : <div className="w-2 h-2 rounded-full bg-slate-300" />}
              <span className={isPasswordValid ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                מינימום 8 תווים ({password.length}/8)
              </span>
            </div>
          </div>

          <button
            type="submit" disabled={isSubmitting}
            className="w-full mt-3 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/30 transition-all duration-300 hover:scale-[1.02] flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:hover:scale-100"
          >
            {isSubmitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /><span>יוצר חשבון...</span></>
              : <span>יצירת חשבון והתחלת שימוש</span>}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-500">
            כבר יש לך חשבון?{' '}
            <Link to="/login" className="font-semibold text-violet-600 hover:text-violet-500 transition-colors">התחבר כאן</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
