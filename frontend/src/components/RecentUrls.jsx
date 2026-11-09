import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { checkStatus } from '../services/api.js';
import { createUrlSearchIndex } from '../utils/urlSearch.js';
import styles from './RecentUrls.module.css';

const MAX_VISIBLE_LINKS = 6;

/**
 * RecentUrls — shows shortened URLs with inverted-index search across all user links.
 */
export default function RecentUrls({ items = [], onSelect, onClear, onDelete, onEdit, isSignedIn = false }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [showAll, setShowAll] = useState(false);
  const [statusMap, setStatusMap] = useState({}); // shortCode → { isAlive }

  useEffect(() => {
    setSearchQuery('');
    setShowAll(false);
    setEditingId(null);
  }, [isSignedIn]);

  // 1. Build inverted n-gram + exact alias search index once per `items` update
  const searchIndex = useMemo(() => createUrlSearchIndex(items), [items]);

  // 2. Execute indexed multi-token search with relevance ranking
  const filteredItems = useMemo(
    () => searchIndex.search(deferredSearchQuery),
    [searchIndex, deferredSearchQuery]
  );

  const isSearching = deferredSearchQuery.trim() !== '';
  const displayItems = isSearching
    ? filteredItems
    : (showAll ? items : items.slice(0, MAX_VISIBLE_LINKS));

  // Check status for displayed items in bounded batches (prevents rate-limit burst on broad queries)
  useEffect(() => {
    if (!displayItems || displayItems.length === 0) return;
    let cancelled = false;

    const uncached = displayItems
      .filter((item) => !(item.shortCode in statusMap))
      .slice(0, 12);
    if (uncached.length === 0) return;

    Promise.allSettled(
      uncached.map(async (item) => {
        try {
          const result = await checkStatus(item.shortCode);
          if (!cancelled && result) {
            setStatusMap((prev) => ({ ...prev, [item.shortCode]: result.isAlive }));
          }
        } catch {
          // silently skip if check fails
        }
      })
    );

    return () => { cancelled = true; };
  }, [displayItems.map(i => i.shortCode).join(',')]); // eslint-disable-line

  if (!items || items.length === 0) return null;

  const startEditing = (item) => {
    setEditingId(item.shortCode);
    setEditValue(item.originalUrl);
  };

  const handleSave = async (item) => {
    if (!editValue || editValue === item.originalUrl) {
      setEditingId(null);
      return;
    }
    
    // onEdit returns true if successful
    const success = await onEdit(item.shortCode, editValue, item.editToken);
    if (success) {
      setEditingId(null);
    }
  };

  const handleKeyDown = (e, item) => {
    if (e.key === 'Enter') {
      handleSave(item);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span>{isSignedIn ? 'Your Links' : 'Recent Links'}</span>
          <span 
            className={styles.countBadge}
            data-tooltip={isSearching ? `${filteredItems.length} matching of ${items.length} total links` : `Total links created: ${items.length}`}
          >
            {isSearching ? `${filteredItems.length}/${items.length}` : items.length}
          </span>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchWrapper}>
            <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              className={styles.searchInput} 
              placeholder={isSignedIn ? 'Search all your links...' : 'Search recent links...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchQuery('');
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClearBtn}
                onClick={() => setSearchQuery('')}
                data-tooltip="Clear search"
                aria-label="Clear search"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
          <button
            className={styles.clearBtn}
            onClick={onClear}
            aria-label={isSignedIn ? 'Delete all links' : 'Clear recent URLs'}
            data-tooltip={isSignedIn ? 'Delete all links permanently' : 'Clear recent links from this browser'}
          >
            {isSignedIn ? 'Delete all' : 'Clear all'}
          </button>
        </div>
      </div>

      <ul className={`${styles.list} ${(isSearching || showAll) ? styles.listScrollable : ''}`}>
        {displayItems.length === 0 ? (
          <li className={styles.emptyState}>No links found matching "{deferredSearchQuery}"</li>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {displayItems.map((item) => {
              const isEditing = editingId === item.shortCode;
              const hasTags = item.tags && item.tags.trim().length > 0;
              const tagArray = hasTags ? item.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

              return (
                <motion.li
                  key={item.shortCode}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className={styles.item}
                >
              <div className={styles.itemWrapper}>
                
                {isEditing ? (
                  <div className={styles.editWrapper}>
                    <input
                      type="url"
                      autoFocus
                      className={styles.editInput}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, item)}
                    />
                    <button
                      className={styles.saveBtn}
                      onClick={() => handleSave(item)}
                      aria-label="Save destination URL"
                      data-tooltip="Save updated destination URL"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel editing"
                      data-tooltip="Cancel editing"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className={styles.itemBtn}
                      onClick={() => onSelect(item)}
                      data-tooltip={`Inspect link & analytics · ${item.originalUrl}`}
                    >
                      <div className={styles.itemInfo}>
                        <div className={styles.itemPrimary}>
                          {/* Status dot */}
                          {item.shortCode in statusMap ? (
                            <span
                              className={statusMap[item.shortCode] ? styles.statusDotOk : styles.statusDotBad}
                              data-tooltip={statusMap[item.shortCode] ? 'Destination active' : 'Destination broken'}
                            />
                          ) : (
                            <span className={styles.dot} />
                          )}
                          <span className={styles.shortCode}>/{item.shortCode}</span>
                          <span className={styles.mainTitle}>
                            {item.title 
                              ? (item.title.length > 30 ? item.title.slice(0, 30) + '…' : item.title)
                              : (item.originalUrl.length > 42 ? item.originalUrl.slice(0, 42) + '…' : item.originalUrl)
                            }
                          </span>
                        </div>
                        {(item.title || hasTags) && (
                          <div className={styles.itemSecondary}>
                            {item.title && (
                              <span className={styles.originalUrlSmall}>
                                {item.originalUrl.length > 35 ? item.originalUrl.slice(0, 35) + '…' : item.originalUrl}
                              </span>
                            )}
                            {hasTags && (
                              <div className={styles.tagsContainer}>
                                {tagArray.map((tag, idx) => (
                                  <span key={idx} className={styles.tagBadge}>{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>

                    <div className={styles.actions}>
                      <Link
                        to={`/stats/${item.shortCode}`}
                        className={styles.statsActionBtn}
                        aria-label="View 3D globe & full statistics"
                        data-tooltip="View 3D globe & full statistics"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      </Link>

                      {(item.editToken || isSignedIn) && (
                        <button
                          className={styles.editActionBtn}
                          onClick={() => startEditing(item)}
                          aria-label="Edit destination"
                          data-tooltip="Edit destination URL"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                          </svg>
                        </button>
                      )}
                      
                      <button
                        className={styles.deleteBtn}
                        onClick={() => onDelete(item.shortCode)}
                        aria-label={isSignedIn ? 'Delete link permanently' : 'Remove link'}
                        data-tooltip={isSignedIn ? 'Delete link permanently' : 'Remove link from recent list'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </>
                )}

              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    )}
  </ul>
      {!isSearching && items.length > MAX_VISIBLE_LINKS && (
        <div className={styles.moreFooter}>
          <span>
            {showAll
              ? `Showing all ${items.length} links`
              : `Showing latest ${MAX_VISIBLE_LINKS} of ${items.length} links`}
          </span>
          <button
            type="button"
            className={styles.showAllBtn}
            onClick={() => setShowAll((prev) => !prev)}
            data-tooltip={showAll ? 'Collapse to latest links' : `Expand to view all ${items.length} saved links`}
          >
            {showAll ? 'Show less' : `Show all (${items.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
