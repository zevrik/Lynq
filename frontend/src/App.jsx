import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from './hooks/useTheme.js';
import { useToast } from './hooks/useToast.js';
import { AuthProvider, useLynqAuth } from './context/AuthContext.jsx';
import { downloadAnalyticsCsv } from './services/api.js';
import Home from './pages/Home.jsx';
import Stats from './pages/Stats.jsx';
import Unlock from './pages/Unlock.jsx';
import Preview from './pages/Preview.jsx';
import RedirectHandler from './pages/RedirectHandler.jsx';
import NotFound from './pages/NotFound.jsx';
import Toast from './components/Toast.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import TooltipLayer from './components/TooltipLayer.jsx';

function AppContent({ theme, toggleTheme, toasts, addToast, removeToast }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn, userLinks, refreshUserLinks } = useLynqAuth();
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [activeCode, setActiveCode] = useState(null);

  const isUnlockPage = location.pathname.startsWith('/unlock');

  // Ensure CommandPalette closes immediately if user signs out or visits /unlock/:shortCode
  useEffect(() => {
    if (!isSignedIn || isUnlockPage) {
      setIsCmdOpen(false);
    }
  }, [isSignedIn, isUnlockPage]);

  // Global keydown listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isSignedIn || isUnlockPage) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdOpen((prev) => {
          const next = !prev;
          if (next) refreshUserLinks();
          return next;
        });
      }
    };

    const handleToggleCmd = () => {
      if (!isSignedIn || isUnlockPage) return;
      setIsCmdOpen((prev) => {
        const next = !prev;
        if (next) refreshUserLinks();
        return next;
      });
    };

    const handleActiveCode = (e) => {
      if (e.detail) setActiveCode(e.detail);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('lynq-toggle-cmd', handleToggleCmd);
    window.addEventListener('lynq-active-code', handleActiveCode);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('lynq-toggle-cmd', handleToggleCmd);
      window.removeEventListener('lynq-active-code', handleActiveCode);
    };
  }, [isSignedIn, isUnlockPage, refreshUserLinks]);

  // Handlers for Command Palette actions
  const handleSelectLink = (link) => {
    if (window.location.pathname === '/') {
      window.dispatchEvent(new CustomEvent('lynq-select-link', { detail: link }));
    } else {
      navigate(`/?code=${encodeURIComponent(link.shortCode)}`);
    }
  };

  const handleFocusNewLink = () => {
    if (window.location.pathname !== '/') {
      navigate('/');
    }
    setTimeout(() => {
      document.getElementById('url-input')?.focus();
      document.getElementById('url-input')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleOpenPortfolio = () => {
    if (window.location.pathname !== '/') {
      navigate('/?tab=links');
    } else {
      window.dispatchEvent(new CustomEvent('lynq-open-links'));
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('lynq-open-portfolio'));
    }, 150);
  };

  const handleOpenSettings = () => {
    if (window.location.pathname !== '/') {
      navigate('/?tab=settings');
    } else {
      window.dispatchEvent(new CustomEvent('lynq-open-settings'));
    }
  };

  const handleOpenLinks = () => {
    if (window.location.pathname !== '/') {
      navigate('/?tab=links');
    } else {
      window.dispatchEvent(new CustomEvent('lynq-open-links'));
    }
  };

  return (
    <div className="app" data-theme={theme}>
      <Routes>
        <Route 
          path="/" 
          element={<Home theme={theme} onToggleTheme={toggleTheme} addToast={addToast} />} 
        />
        <Route 
          path="/unlock/:shortCode" 
          element={<Unlock theme={theme} onToggleTheme={toggleTheme} addToast={addToast} />} 
        />
        <Route 
          path="/preview/:shortCode" 
          element={<Preview theme={theme} onToggleTheme={toggleTheme} />} 
        />
        <Route 
          path="/stats/:shortCode" 
          element={<Stats theme={theme} onToggleTheme={toggleTheme} addToast={addToast} />} 
        />
        <Route 
          path="/404" 
          element={<NotFound theme={theme} onToggleTheme={toggleTheme} />} 
        />
        <Route 
          path="/:shortCode" 
          element={<RedirectHandler />} 
        />
        <Route 
          path="*" 
          element={<NotFound theme={theme} onToggleTheme={toggleTheme} />} 
        />
      </Routes>
      <ConnectionStatus />
      <Toast toasts={toasts} onRemove={removeToast} />
      <TooltipLayer theme={theme} />
      {isSignedIn && !isUnlockPage && (
        <CommandPalette
          isOpen={isCmdOpen}
          onClose={() => setIsCmdOpen(false)}
          recentLinks={userLinks}
          onSelectLink={handleSelectLink}
          onToggleTheme={toggleTheme}
          currentTheme={theme}
          onFocusNewLink={handleFocusNewLink}
          onOpenPortfolio={handleOpenPortfolio}
          onOpenSettings={handleOpenSettings}
          onOpenLinks={handleOpenLinks}
          currentActiveCode={activeCode}
          onExportCsv={downloadAnalyticsCsv}
          addToast={addToast}
        />
      )}
    </div>
  );
}

export default function App({ theme: propTheme, onToggleTheme: propToggleTheme }) {
  const themeHook = useTheme();
  const theme = propTheme || themeHook.theme;
  const toggleTheme = propToggleTheme || themeHook.toggleTheme;
  const { toasts, addToast, removeToast } = useToast();

  return (
    <BrowserRouter>
      <AuthProvider
        onClaimSuccess={(count) =>
          addToast(
            `🎉 Shifted ${count} guest ${count === 1 ? 'link' : 'links'} to your dashboard!`,
            'success'
          )
        }
      >
        <AppContent
          theme={theme}
          toggleTheme={toggleTheme}
          toasts={toasts}
          addToast={addToast}
          removeToast={removeToast}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
