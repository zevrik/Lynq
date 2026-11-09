import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader.jsx';
import AppFooter from '../components/AppFooter.jsx';
import styles from './NotFound.module.css';

export default function NotFound({ theme, onToggleTheme }) {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <AppHeader theme={theme} onToggleTheme={onToggleTheme} />
      {/* Ambient background glowing orbs */}
      <div className={styles.orb1}></div>
      <div className={styles.orb2}></div>

      <main className={styles.content}>
        <h1 className={styles.errorCode}>404</h1>
        <h2 className={styles.title}>Lost in the Void</h2>
        <p className={styles.description}>
          Oops! The link you clicked might be broken, expired, or never existed in the first place. Let's get you back to familiar territory.
        </p>

        <button
          className={styles.homeButton}
          onClick={() => navigate('/')}
          data-tooltip="Return to the Lynq home page"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Home
        </button>
      </main>
      <AppFooter />
    </div>
  );
}
