import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SignInButton } from '@clerk/clerk-react';
import { useLynqAuth } from '../context/AuthContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import styles from './AppHeader.module.css';

/**
 * Universal AppHeader Component
 * Shared across Home, Stats, Preview, Unlock, and 404 pages.
 * Guarantees pixel-perfect matching width (1120px) and controls everywhere.
 */
export default function AppHeader({ theme, onToggleTheme, hideSearch = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn, hasClerk } = useLynqAuth();
  const isUnlockPage = location.pathname.startsWith('/unlock');
  const showSearch = isSignedIn && !hideSearch && !isUnlockPage;

  const handleLogoClick = () => {
    navigate('/');
  };

  const handleToggleCmd = () => {
    window.dispatchEvent(new CustomEvent('lynq-toggle-cmd'));
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        {/* Brand Logo & Name */}
        <div className={styles.logo} onClick={handleLogoClick} title="Lynq Dashboard">
          <div className={styles.logoMark}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#appHeaderLogoGrad)"/>
              <g transform="translate(6.4, 6.4) scale(0.8)" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </g>
              <defs>
                <linearGradient id="appHeaderLogoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1"/>
                  <stop offset="1" stopColor="#8b5cf6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className={styles.logoText}>Lynq</span>
        </div>

        {/* Right Actions: Clerk Sign-In (guest only), Search Shortcut, Theme Toggle */}
        <div className={styles.headerRight}>
          {hasClerk && !isSignedIn && (
            <SignInButton mode="modal" oauthFlow="popup">
              <button type="button" className={styles.signInBtn}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>Sign In</span>
              </button>
            </SignInButton>
          )}

          {showSearch && (
            <button
              type="button"
              className={styles.cmdPaletteBtn}
              onClick={handleToggleCmd}
              title="Search links or commands (Cmd+K / Ctrl+K)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className={styles.cmdPaletteBtnText}>Search</span>
              <kbd className={styles.cmdKbd}>
                {typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC') ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </button>
          )}

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
