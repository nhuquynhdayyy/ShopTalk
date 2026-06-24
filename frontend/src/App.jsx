import React from 'react';
import { BrowserRouter as Router, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import ChatWidget from './pages/ChatWidget.jsx';
import Dashboard from './pages/Dashboard.jsx';

const navItems = [
  { to: '/chat', label: 'Chat Widget' },
  { to: '/dashboard', label: 'Dashboard' }
];

function App() {
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
                <p className="text-base font-semibold leading-none text-slate-950">ShopTalk</p>
                <p className="mt-1 text-xs font-medium text-slate-500">AI Sales Agent + Solana Pay</p>
              </div>
            </div>

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
    </Router>
  );
}

export default App;
