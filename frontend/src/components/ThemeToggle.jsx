import { Classic } from "@theme-toggles/react";
import "@theme-toggles/react/css/Classic.css";
import styles from './ThemeToggle.module.css';

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';

  const handleClick = (e) => {
    if (onToggle) {
      onToggle(e);
    }
  };

  const tooltipText = `Switch to ${isDark ? 'light' : 'dark'} mode`;

  return (
    <div
      className={styles.toggle}
      onClick={handleClick}
      data-tooltip={tooltipText}
    >
      <Classic
        duration={750}
        toggled={isDark}
        title={null}
        aria-label={tooltipText}
      />
    </div>
  );
}
