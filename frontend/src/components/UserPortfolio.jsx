import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserLinks, getUserAnalyticsSummary, editUrl, deleteUrl } from '../services/api.js';
import { createUrlSearchIndex } from '../utils/urlSearch.js';
import styles from './UserPortfolio.module.css';

export default function UserPortfolio({ isOpen, onClose, onSelectLink, addToast }) {
  const navigate = useNavigate();
  const [links, setLinks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [editingCode, setEditingCode] = useState(null);
  const [editNewUrl, setEditNewUrl] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, summaryRes] = await Promise.all([
        getUserLinks(),
        getUserAnalyticsSummary(),
      ]);
      if (linksRes.success) setLinks(linksRes.links || []);
      if (summaryRes.success) setSummary(summaryRes.summary || null);
    } catch (err) {
      console.error('Failed to load user portfolio:', err);
      addToast('Failed to load your cloud links.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleCopy = (shortUrl) => {
    navigator.clipboard.writeText(shortUrl);
    addToast('✓ Short link copied to clipboard!', 'success', 2000);
  };

  const handleStartEdit = (link) => {
    setEditingCode(link.shortCode);
    setEditNewUrl(link.originalUrl);
  };

  const handleSaveEdit = async (link) => {
    if (!editNewUrl.trim() || editNewUrl.trim() === link.originalUrl) {
      setEditingCode(null);
      return;
    }
    setSavingEdit(true);
    try {
      await editUrl(link.shortCode, editNewUrl.trim(), link.editToken);
      setLinks((prev) =>
        prev.map((l) => (l.shortCode === link.shortCode ? { ...l, originalUrl: editNewUrl.trim() } : l))
      );
      setEditingCode(null);
      addToast('Link updated successfully!', 'success');
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to update link.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (link) => {
    if (!window.confirm(`Are you sure you want to delete ${link.shortCode}?`)) return;
    try {
      await deleteUrl(link.shortCode, link.editToken);
      setLinks((prev) => prev.filter((l) => l.shortCode !== link.shortCode));
      if (summary) {
        setSummary((prev) => ({
          ...prev,
          totalLinks: Math.max(0, prev.totalLinks - 1),
          totalClicks: Math.max(0, prev.totalClicks - (link.clicks || 0)),
        }));
      }
      addToast('Link deleted permanently.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to delete link.', 'error');
    }
  };

  const searchIndex = useMemo(() => createUrlSearchIndex(links), [links]);
  const filteredLinks = useMemo(
    () => searchIndex.search(deferredSearch),
    [searchIndex, deferredSearch]
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBadge}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <h2 className={styles.title}>My Cloud Links & Portfolio</h2>
              <p className={styles.subtitle}>Synced across all your devices with permanent ownership</p>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
            data-tooltip="Close portfolio modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className={styles.body}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Fetching your cloud portfolio...</p>
            </div>
          ) : (
            <>
              {/* Summary Metrics */}
              {summary && (
                <div className={styles.summaryGrid}>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Account Clicks</div>
                    <div className={styles.statValue}>
                      {summary.totalClicks.toLocaleString()}
                    </div>
                    <div className={styles.statSub}>Real-time verified</div>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Links</div>
                    <div className={styles.statValue}>{summary.totalLinks}</div>
                    <div className={styles.statSub}>Permanent in cloud</div>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Active Links</div>
                    <div className={styles.statValue}>{summary.activeLinks}</div>
                    <div className={styles.statSub}>Ready for traffic</div>
                  </div>
                </div>
              )}

              {/* Top 3 Performing Showcase */}
              {summary?.topLinks && summary.topLinks.length > 0 && (
                <div className={styles.topSection}>
                  <h3 className={styles.sectionHeading}>🏆 Top Performing Links</h3>
                  <div className={styles.topGrid}>
                    {summary.topLinks.map((top, idx) => (
                      <div key={top.shortCode} className={styles.topCard}>
                        <div className={styles.topRank}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} #{idx + 1}
                        </div>
                        <div className={styles.topCode}>{top.shortCode}</div>
                        <div className={styles.topClicks}>{top.clicks.toLocaleString()} clicks</div>
                        <div className={styles.topDest} data-tooltip={top.originalUrl}>
                          {top.title || top.originalUrl}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Links List Toolbar */}
              <div className={styles.listToolbar}>
                <div className={styles.searchWrapper}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search your links..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                  {search && (
                    <button
                      className={styles.clearSearch}
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                      data-tooltip="Clear search filter"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  className={styles.refreshBtn}
                  onClick={fetchData}
                  data-tooltip="Reload cloud links and analytics summary"
                >
                  ↻ Refresh
                </button>
              </div>

              {/* Links Table/List */}
              {filteredLinks.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🔗</div>
                  <h4>No links found</h4>
                  <p>
                    {links.length === 0
                      ? 'You have not created any cloud links yet. Create one now to sync across devices!'
                      : 'No links match your current search query.'}
                  </p>
                </div>
              ) : (
                <div className={styles.linksList}>
                  {filteredLinks.map((link) => (
                    <div key={link.shortCode} className={styles.linkRow}>
                      <div className={styles.rowMain}>
                        <div className={styles.rowHeader}>
                          <a
                            href={link.shortUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.shortLink}
                          >
                            {link.shortUrl}
                          </a>
                          <span className={styles.clickBadge}>
                            {link.clicks.toLocaleString()} {link.clicks === 1 ? 'click' : 'clicks'}
                          </span>
                        </div>

                        {editingCode === link.shortCode ? (
                          <div className={styles.editRow}>
                            <input
                              type="url"
                              value={editNewUrl}
                              onChange={(e) => setEditNewUrl(e.target.value)}
                              className={styles.editInput}
                              placeholder="https://example.com"
                              autoFocus
                            />
                            <button
                              className={styles.saveEditBtn}
                              onClick={() => handleSaveEdit(link)}
                              disabled={savingEdit}
                              data-tooltip="Save updated destination URL"
                            >
                              {savingEdit ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              className={styles.cancelEditBtn}
                              onClick={() => setEditingCode(null)}
                              data-tooltip="Cancel editing"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className={styles.destUrl} data-tooltip={link.originalUrl}>
                            {link.title && <strong className={styles.linkTitle}>{link.title} — </strong>}
                            <span>{link.originalUrl}</span>
                          </div>
                        )}

                        <div className={styles.rowMeta}>
                          <span>Created {new Date(link.createdAt).toLocaleDateString()}</span>
                          {link.expiresAt && (
                            <span> · Expires {new Date(link.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>

                      <div className={styles.rowActions}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleCopy(link.shortUrl)}
                          aria-label="Copy short link"
                          data-tooltip="Copy short link to clipboard"
                        >
                          📋
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => {
                            onSelectLink(link);
                            onClose();
                          }}
                          aria-label="Open Analytics & Live Stream"
                          data-tooltip="Open Analytics & Live Stream"
                        >
                          📊
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => {
                            onClose();
                            navigate(`/stats/${link.shortCode}`);
                          }}
                          aria-label="Open 3D Globe & Full Stats Page"
                          data-tooltip="Open 3D Globe & Full Stats Page"
                        >
                          🌐
                        </button>
                        {link.editToken && (
                          <>
                            <button
                              className={styles.actionBtn}
                              onClick={() => handleStartEdit(link)}
                              aria-label="Edit destination URL"
                              data-tooltip="Edit destination URL"
                            >
                              ✏️
                            </button>
                            <button
                              className={`${styles.actionBtn} ${styles.deleteBtn}`}
                              onClick={() => handleDelete(link)}
                              aria-label="Delete link"
                              data-tooltip="Delete link permanently"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
