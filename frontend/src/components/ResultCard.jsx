import { useState, useEffect } from 'react';
import { checkStatus } from '../services/api.js';
import styles from './ResultCard.module.css';

export default function ResultCard({ result, onCopy }) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(null); // null = checking, object = result

  // Silently check destination status after result loads
  useEffect(() => {
    if (!result?.shortCode) return;
    let cancelled = false;

    checkStatus(result.shortCode)
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch(() => { if (!cancelled) setStatus({ isAlive: null }); }); // null = couldn't check

    return () => { cancelled = true; };
  }, [result?.shortCode]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.shortUrl);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = result.shortUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openLink = () => window.open(result.shortUrl, '_blank', 'noopener,noreferrer');

  return (
    <div className={styles.card}>
      {result.isExisting && (
        <div className={styles.existingBadge}>
          <span>⚠️</span> Already created
        </div>
      )}

      {/* Broken destination warning */}
      {status && status.isAlive === false && (
        <div className={styles.brokenAlert}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            Destination URL appears broken
            {status.statusCode ? ` (${status.statusCode})` : ' (unreachable)'}.
            Visitors may encounter errors.
          </span>
        </div>
      )}

      <div className={styles.label}>Your short link</div>

      <div className={styles.urlRow}>
        <a
          href={result.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.shortUrl}
          data-tooltip={`Open ${result.shortUrl}`}
        >
          {result.shortUrl}
        </a>

        <div className={styles.actions}>
          <button
            id="copy-btn"
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
            aria-label={copied ? 'Copied!' : 'Copy short URL'}
            data-tooltip={copied ? 'Short link copied to clipboard!' : 'Copy short link to clipboard'}
          >
            {copied ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </>
            )}
          </button>

          <button
            className={styles.openBtn}
            onClick={openLink}
            aria-label="Open short URL"
            data-tooltip="Open short link in a new tab"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.originalUrl}>
        <span className={styles.originalLabel}>Original:</span>
        <span className={styles.originalText} data-tooltip={result.originalUrl}>
          {result.originalUrl?.length > 60
            ? result.originalUrl.slice(0, 60) + '…'
            : result.originalUrl}
        </span>
      </div>

    </div>
  );
}
