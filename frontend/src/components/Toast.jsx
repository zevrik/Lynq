import { useEffect, useRef } from 'react';
import styles from './Toast.module.css';

const ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

function ToastItem({ toast, onRemove }) {
  const barRef = useRef(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Animate progress bar to 0 width
    bar.style.transition = 'width 3.5s linear';
    requestAnimationFrame(() => { bar.style.width = '0%'; });
  }, []);

  return (
    <div
      className={`${styles.toast} ${styles[toast.type]}`}
      role="alert"
      aria-live="polite"
    >
      <span className={styles.icon}>{ICONS[toast.type] || 'ℹ'}</span>
      <p className={styles.message}>{toast.message}</p>
      <button
        className={styles.close}
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss"
        data-tooltip="Dismiss notification"
      >
        ×
      </button>
      <div className={styles.progress} ref={barRef} />
    </div>
  );
}

export default function Toast({ toasts, onRemove }) {
  return (
    <div className={styles.container} aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}
