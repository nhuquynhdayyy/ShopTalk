import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ChatWidget from './pages/ChatWidget.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import { CallStatusProvider, useCallStatus } from './contexts/CallStatusContext.jsx';
import "flag-icons/css/flag-icons.min.css";

function AppContent() {
  const { t, i18n } = useTranslation();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState(null);
  const dropdownRef = useRef(null);
  const { isInCall, joinChannelRef, leaveChannelRef } = useCallStatus();

  const navItems = [
    { to: '/chat', label: t('app.nav_chat') },
    { to: '/dashboard', label: t('app.nav_dashboard') }
  ];

  const currentLang = i18n.language?.startsWith('vi') ? 'vi' : 'en';

  const languages = [
    { code: 'vi', label: 'Tiếng Việt', flag: 'fi fi-vn' },
    { code: 'en', label: 'English', flag: 'fi fi-gb' }
  ];

  const activeLang = languages.find(l => l.code === currentLang) || languages[0];

  const applyLanguageChange = (lng) => {
    i18n.changeLanguage(lng);
    sessionStorage.setItem('shoptalk_language', lng);
    setIsLangMenuOpen(false);
    setPendingLanguage(null);
  };

  const handleLanguageChange = (lng) => {
    if (lng === currentLang) {
      setIsLangMenuOpen(false);
      return;
    }

    if (isInCall) {
      setPendingLanguage(lng);
      setIsLangMenuOpen(false);
      return;
    }

    applyLanguageChange(lng);
  };

  const handleConfirmLanguageSwitch = async () => {
    if (!pendingLanguage) return;

    try {
      if (leaveChannelRef.current) {
        await leaveChannelRef.current();
      }
      applyLanguageChange(pendingLanguage);
      if (joinChannelRef.current) {
        await joinChannelRef.current(pendingLanguage);
      }
    } catch (error) {
      console.error('[App] Language switch during call failed:', error.message);
      applyLanguageChange(pendingLanguage);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-slate-100 text-slate-950">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
                ST
              </div>
              <div>
                <p className="text-base font-semibold leading-none text-slate-950">{t('app.title')}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t('app.subtitle')}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <nav className="flex w-full gap-2 rounded-lg bg-slate-100 p-1 lg:w-auto">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => (
                      `flex-1 rounded-md px-4 py-2 text-center text-sm font-semibold transition lg:flex-none ${
                        isActive
                          ? 'bg-white text-teal-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-950'
                      }`
                    )}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                  className="flex items-center gap-2 min-w-[130px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <span className={`${activeLang.flag} text-lg rounded-sm`}></span>
                  <span className="flex-1 text-left">{activeLang.label}</span>
                  <svg className={`h-4 w-4 text-slate-400 transition-transform ${isLangMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isLangMenuOpen && (
                  <div className="absolute right-0 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                          currentLang === lang.code ? 'bg-slate-50 text-teal-700 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        <span className={`${lang.flag} text-lg rounded-sm`}></span>
                        {lang.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">
          <Routes>
            <Route path="/chat" element={<ChatWidget />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </main>
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingLanguage)}
        title={t('app.lang_switch.title', 'Đổi ngôn ngữ trong cuộc gọi?')}
        message={t('app.lang_switch.message', 'Cuộc gọi voice hiện tại sẽ kết thúc và bắt đầu lại bằng ngôn ngữ mới. Bạn có muốn tiếp tục?')}
        confirmLabel={t('app.lang_switch.confirm', 'Xác nhận')}
        cancelLabel={t('app.lang_switch.cancel', 'Huỷ')}
        onConfirm={handleConfirmLanguageSwitch}
        onCancel={() => setPendingLanguage(null)}
      />
    </Router>
  );
}

function App() {
  return (
    <CallStatusProvider>
      <AppContent />
    </CallStatusProvider>
  );
}

export default App;
