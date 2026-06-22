import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import ChatWidget from './pages/ChatWidget.jsx';
import Dashboard from './pages/Dashboard.jsx';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[#0B0E14] text-[#F0F2F5] flex flex-col">
        {/* Navigation Bar */}
        <header className="bg-[#151B26] border-b border-[#243042] py-4 px-6 sticky top-0 z-50 shadow-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-[#5B3FE0] tracking-wider">ShopTalk</span>
              <span className="text-xs px-2 py-0.5 bg-[#5B3FE0]/15 text-[#5B3FE0] rounded-full border border-[#5B3FE0]/30 font-semibold uppercase">AI Agent</span>
            </div>
            
            <nav className="flex items-center gap-4">
              <Link 
                to="/chat" 
                className="text-sm font-medium hover:text-[#5B3FE0] transition-all px-4 py-2 rounded-lg hover:bg-[#243042]/50 flex items-center gap-2"
              >
                💬 Chat Widget
              </Link>
              <Link 
                to="/dashboard" 
                className="text-sm font-medium hover:text-[#5B3FE0] transition-all px-4 py-2 rounded-lg hover:bg-[#243042]/50 flex items-center gap-2"
              >
                📊 Seller Dashboard
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col">
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
