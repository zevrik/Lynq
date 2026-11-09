import { useState, useEffect, useRef, useMemo } from 'react';
import styles from './CommandPalette.module.css';

/**
 * CommandPalette — Global Cmd+K / Ctrl+K modal for fuzzy search, quick actions, and navigation.
 */
export default function CommandPalette({
  isOpen,
  onClose,
  recentLinks = [],
  onSelectLink,
  onToggleTheme,
  currentTheme = 'dark',
  onFocusNewLink,
  onOpenPortfolio,
  onOpenSettings,
  onOpenLinks,
  currentActiveCode,
  onExportCsv,
  addToast,
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Global keyboard listener for Esc and navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-scroll keyboard-highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const selectedEl = listRef.current.querySelector('[data-selected="true"]');
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isOpen, query]);

  // System commands available in palette
  const systemCommands = useMemo(() => {
    const list = [
      {
        id: 'cmd-theme',
        type: 'command',
        title: `Toggle Theme (${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode)`,
        icon: currentTheme === 'dark' ? '☀️' : '🌙',
        shortcut: 'T',
        action: () => {
          onToggleTheme?.();
          addToast?.(`Switched to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`, 'info');
          onClose();
        },
      },
      {
        id: 'cmd-new',
        type: 'command',
        title: 'Shorten New Link',
        icon: '🔗',
        shortcut: 'N',
        action: () => {
          onFocusNewLink?.();
          onClose();
        },
      },
      {
        id: 'cmd-portfolio',
        type: 'command',
        title: 'View My Cloud Links Portfolio',
        icon: '💼',
        shortcut: 'P',
        action: () => {
          onOpenPortfolio?.();
          onClose();
        },
      },
      {
        id: 'cmd-user-setting',
        type: 'command',
        title: 'Open User Setting',
        icon: '⚙️',
        shortcut: 'U',
        action: () => {
          onOpenSettings?.();
          onClose();
        },
      },
      {
        id: 'cmd-your-links',
        type: 'command',
        title: 'Go to Your Links',
        icon: '🔗',
        shortcut: 'L',
        action: () => {
          onOpenLinks?.();
          onClose();
        },
      },
    ];

    if (currentActiveCode && onExportCsv) {
      list.push({
        id: 'cmd-export',
        type: 'command',
        title: `Export Analytics CSV (${currentActiveCode})`,
        icon: '📥',
        shortcut: 'E',
        action: () => {
          onExportCsv?.(currentActiveCode);
          addToast?.(`Exporting CSV for ${currentActiveCode}`, 'success');
          onClose();
        },
      });
    }

    return list;
  }, [currentTheme, onToggleTheme, onFocusNewLink, onOpenPortfolio, onOpenSettings, onOpenLinks, currentActiveCode, onExportCsv, addToast, onClose]);

  // Filtered results (commands + all user-generated links with multi-token relevance ranking)
  const { filteredCommands, filteredLinks, allItems } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    const matchedCommands = systemCommands.filter((cmd) => {
      if (tokens.length === 0) return true;
      const lowerTitle = cmd.title.toLowerCase();
      return tokens.every((tok) => lowerTitle.includes(tok));
    });

    let matchedLinks;
    if (tokens.length === 0) {
      matchedLinks = recentLinks;
    } else {
      const scored = [];
      for (const link of recentLinks) {
        const title = (link.title || '').toLowerCase();
        const code = (link.shortCode || '').toLowerCase();
        const shortUrl = (link.shortUrl || '').toLowerCase();
        const original = (link.originalUrl || '').toLowerCase();
        const tags = (link.tags || '').toLowerCase();
        const corpus = `${code} ${title} ${tags} ${original} ${shortUrl}`;

        let score = 0;
        let matchesAll = true;
        for (const tok of tokens) {
          if (!corpus.includes(tok)) {
            matchesAll = false;
            break;
          }
          if (code === tok) score += 100;
          else if (code.startsWith(tok)) score += 65;
          else if (code.includes(tok)) score += 45;
          if (title.includes(tok)) score += title.startsWith(tok) ? 35 : 20;
          if (tags.includes(tok)) score += 30;
          if (original.includes(tok) || shortUrl.includes(tok)) score += 10;
        }
        if (matchesAll) {
          scored.push({ link, score });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      matchedLinks = scored.map((entry) => entry.link);
    }

    const combined = [
      ...matchedCommands,
      ...matchedLinks.map((link) => ({ ...link, type: 'link', id: `link-${link.shortCode}` })),
    ];

    return {
      filteredCommands: matchedCommands,
      filteredLinks: matchedLinks,
      allItems: combined,
    };
  }, [query, systemCommands, recentLinks]);

  // Keyboard navigation up / down / enter
  const handleInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev + 1) % allItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        allItems.length ? (prev - 1 + allItems.length) % allItems.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems.length > 0 && selectedIndex < allItems.length) {
        handleSelectItem(allItems[selectedIndex]);
      }
    }
  };

  const handleSelectItem = (item) => {
    if (!item) return;
    if (item.type === 'command') {
      item.action?.();
    } else {
      onSelectLink?.(item);
      onClose();
    }
  };

  const handleCopyLink = (e, link) => {
    e.stopPropagation();
    if (!link.shortUrl) return;
    navigator.clipboard.writeText(link.shortUrl);
    addToast?.(`✓ Copied ${link.shortUrl} to clipboard!`, 'success');
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        {/* Search header */}
        <div className={styles.searchRow}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search links, jump to analytics, or type a command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            autoComplete="off"
            spellCheck="false"
          />
          {query && (
            <button
              type="button"
              className={styles.clearQueryBtn}
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              title="Clear search"
            >
              ×
            </button>
          )}
          <kbd className={styles.escBadge} onClick={onClose}>ESC</kbd>
        </div>

        {/* Results list */}
        <div className={styles.list} ref={listRef}>
          {allItems.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <p>No matching links or commands found for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <>
              {/* Commands section */}
              {filteredCommands.length > 0 && (
                <div className={styles.group}>
                  <div className={styles.groupLabel}>Commands & Navigation</div>
                  {filteredCommands.map((cmd) => {
                    const itemIndex = allItems.findIndex((it) => it.id === cmd.id);
                    const isSelected = itemIndex === selectedIndex;
                    return (
                      <div
                        key={cmd.id}
                        data-selected={isSelected ? 'true' : 'false'}
                        className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                        onClick={() => handleSelectItem(cmd)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                      >
                        <span className={styles.itemIcon}>{cmd.icon}</span>
                        <div className={styles.itemText}>
                          <span className={styles.itemTitle}>{cmd.title}</span>
                        </div>
                        {cmd.shortcut && (
                          <span className={styles.cmdShortcut}>{cmd.shortcut}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* User Links section */}
              {filteredLinks.length > 0 && (
                <div className={styles.group}>
                  <div className={styles.groupLabel}>
                    {query.trim()
                      ? `Matching Links (${filteredLinks.length}/${recentLinks.length})`
                      : `Your Links (${filteredLinks.length})`}
                  </div>
                  {filteredLinks.map((link) => {
                    const itemIndex = allItems.findIndex((it) => it.id === `link-${link.shortCode}`);
                    const isSelected = itemIndex === selectedIndex;
                    return (
                      <div
                        key={link.shortCode}
                        data-selected={isSelected ? 'true' : 'false'}
                        className={`${styles.item} ${styles.linkItem} ${isSelected ? styles.itemSelected : ''}`}
                        onClick={() => handleSelectItem({ ...link, type: 'link' })}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                      >
                        <span className={styles.itemIcon}>🔗</span>
                        <div className={styles.itemText}>
                          <div className={styles.linkHeader}>
                            <span className={styles.itemTitle}>{link.title || link.shortCode}</span>
                            <span className={styles.linkCode}>/{link.shortCode}</span>
                          </div>
                          <span className={styles.linkDest}>
                            {link.originalUrl?.replace(/^https?:\/\//, '').slice(0, 55)}
                            {link.originalUrl?.length > 55 ? '…' : ''}
                          </span>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className={styles.linkActions}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={(e) => handleCopyLink(e, link)}
                            title="Copy Short Link"
                          >
                            📋
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(link.originalUrl, '_blank', 'noopener,noreferrer');
                            }}
                            title="Open Destination"
                          >
                            ↗️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className={styles.footer}>
          <div className={styles.hints}>
            <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to select</span>
            <span><kbd>ESC</kbd> to close</span>
          </div>
          <span className={styles.lynqBrand}>Lynq Intelligence</span>
        </div>
      </div>
    </div>
  );
}
