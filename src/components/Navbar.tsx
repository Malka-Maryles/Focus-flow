import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Sparkles, 
  BookOpen, 
  Camera, 
  History, 
  LogOut, 
  User as UserIcon, 
  Menu, 
  X 
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-violet-100 text-violet-700 font-semibold border border-violet-200'
        : 'text-slate-600 hover:text-violet-700 hover:bg-violet-50'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-indigo-200/60 shadow-sm" style={{background: 'rgba(238,242,255,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)'}}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <NavLink to="/library" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white glow-purple group-hover:scale-110 transition-transform duration-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg gradient-text tracking-tight leading-none">FocusFlow</span>
                <span className="text-[11px] text-slate-500 font-medium">מעקב קשב ולמידה</span>
              </div>
            </NavLink>
          </div>

          {/* Desktop Navigation */}
          {user && (
            <nav className="hidden md:flex items-center gap-1.5">
              <NavLink to="/library" className={navLinkClasses}>
                <BookOpen className="w-4 h-4" />
                <span>הספרייה שלי</span>
              </NavLink>
              <NavLink to="/session" className={navLinkClasses}>
                <Camera className="w-4 h-4" />
                <span>סשן למידה</span>
              </NavLink>
              <NavLink to="/history" className={navLinkClasses}>
                <History className="w-4 h-4" />
                <span>היסטוריה וגרפים</span>
              </NavLink>
            </nav>
          )}

          {/* Desktop User profile & Logout */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 py-1.5 px-3 bg-violet-50 rounded-full border border-violet-200">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-violet-500 to-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                    {user.display_name ? user.display_name.charAt(0) : <UserIcon className="w-3.5 h-3.5" />}
                  </div>
                  <span className="text-sm font-medium text-slate-700">{user.display_name}</span>
                </div>
                <button
                  onClick={handleLogout}
                  type="button"
                  aria-label="התנתק מהמערכת"
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span>התנתקות</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <NavLink
                  to="/login"
                  className="text-sm font-medium text-slate-600 hover:text-violet-700 px-3 py-1.5 transition-colors"
                >
                  התחברות
                </NavLink>
                <NavLink
                  to="/register"
                  className="text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg shadow-lg shadow-violet-500/25 transition-all duration-200 hover:scale-105"
                >
                  הרשמה חינם
                </NavLink>
              </div>
            )}
          </div>

          {/* Mobile hamburger button */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              aria-label="פתח תפריט ניווט"
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-violet-100 bg-white/95 px-4 pt-2 pb-4 space-y-2">
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 rounded-lg mb-2 border border-violet-100">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-indigo-500 text-white flex items-center justify-center font-bold text-sm">
                  {user.display_name ? user.display_name.charAt(0) : 'U'}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-800">{user.display_name}</span>
                  <span className="text-xs text-slate-500">{user.email}</span>
                </div>
              </div>
              <NavLink to="/library" onClick={() => setMobileMenuOpen(false)} className={navLinkClasses}>
                <BookOpen className="w-4 h-4" />
                <span>הספרייה שלי</span>
              </NavLink>
              <NavLink to="/session" onClick={() => setMobileMenuOpen(false)} className={navLinkClasses}>
                <Camera className="w-4 h-4" />
                <span>סשן למידה</span>
              </NavLink>
              <NavLink to="/history" onClick={() => setMobileMenuOpen(false)} className={navLinkClasses}>
                <History className="w-4 h-4" />
                <span>היסטוריה וגרפים</span>
              </NavLink>
              <button
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                type="button"
                className="w-full flex items-center justify-center gap-2 text-sm text-rose-600 bg-rose-50 hover:bg-rose-100 p-2.5 rounded-lg font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>התנתקות</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <NavLink
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2 text-slate-700 border border-slate-300 rounded-lg font-medium"
              >
                התחברות
              </NavLink>
              <NavLink
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2 bg-indigo-600 text-white rounded-lg font-medium"
              >
                הרשמה חינם
              </NavLink>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
