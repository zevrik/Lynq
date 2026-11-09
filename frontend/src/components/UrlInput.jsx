import { useState, useRef, useEffect } from 'react';
import { suggestAi, checkAlias, suggestAliasAlternatives } from '../services/api.js';
import styles from './UrlInput.module.css';

/**
 * UrlInput — A form-like UI for entering long URL, custom alias, password, expiry, and max clicks.
 */
export default function UrlInput({ onShorten, isLoading, isSignedIn = false, isHero = false, rateLimits = null }) {
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [maxClicks, setMaxClicks] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState({}); // Stores validation errors per field
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aliasStatus, setAliasStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [aliasSuggestions, setAliasSuggestions] = useState([]);
  const [isSuggestingAliases, setIsSuggestingAliases] = useState(false);
  const inputRef = useRef(null);

  const maxExpiryDays = isSignedIn
    ? (rateLimits?.limits?.maxExpiryDays || 365)
    : (rateLimits?.limits?.maxExpiryDays || 7);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setShowAdvanced(false);
      setExpiresInDays((prev) => {
        const num = parseInt(prev, 10);
        if (!isNaN(num) && num > maxExpiryDays) {
          return String(maxExpiryDays);
        }
        return prev;
      });
    }
  }, [isSignedIn, maxExpiryDays]);

  const validateForm = () => {
    const newErrors = {};
    let isValid = true;

    if (!url.trim()) {
      newErrors.url = 'Please enter a Destination URL.';
      isValid = false;
    } else {
      try {
        const p = new URL(url.trim());
        if (p.protocol !== 'http:' && p.protocol !== 'https:') {
          newErrors.url = 'Only HTTP and HTTPS URLs are accepted.';
          isValid = false;
        }
      } catch {
        newErrors.url = 'That doesn\'t look like a valid URL.';
        isValid = false;
      }
    }

    if (!title.trim()) {
      newErrors.title = 'Please enter a Title.';
      isValid = false;
    }

    const expNum = parseInt(expiresInDays, 10);
    if (!expiresInDays || isNaN(expNum) || expNum < 1 || expNum > maxExpiryDays) {
      newErrors.expiresInDays = isSignedIn
        ? `Please enter an expiry time (1-${maxExpiryDays}).`
        : `Guest links support 1-${maxExpiryDays} days expiry. Sign in for up to 365 days.`;
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleAiSuggest = async () => {
    if (!isSignedIn) return;
    // For AI, we only care that the URL is valid
    if (!url.trim()) {
      setErrors((prev) => ({ ...prev, url: 'Please enter a URL first.' }));
      inputRef.current?.focus();
      return;
    }
    try {
      new URL(url.trim());
    } catch {
      setErrors((prev) => ({ ...prev, url: 'Please enter a valid URL for AI.' }));
      inputRef.current?.focus();
      return;
    }
    
    setIsAiLoading(true);
    setErrors((prev) => ({ ...prev, url: null })); // clear URL error
    
    try {
      const suggestions = await suggestAi(url.trim());
      if (suggestions.title) setTitle(suggestions.title);
      if (suggestions.customAlias) setAlias(suggestions.customAlias);
      if (suggestions.tags && Array.isArray(suggestions.tags)) {
        setTags(suggestions.tags.join(', '));
      }
      setShowAdvanced(true);
    } catch (err) {
      setErrors((prev) => ({ ...prev, url: 'AI suggestion failed. Try again.' }));
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    
    if (!validateForm()) {
      if (!url.trim()) inputRef.current?.focus();
      return;
    }

    const success = await onShorten(
      url.trim(),
      isSignedIn ? alias.trim() || null : null,
      isSignedIn ? password.trim() || null : null,
      expiresInDays || null,
      isSignedIn ? maxClicks || null : null,
      title.trim() || null,
      isSignedIn ? tags.trim() || null : null
    );

    if (success) {
      setUrl('');
      setAlias('');
      setPassword('');
      setExpiresInDays('7');
      setMaxClicks('');
      setTitle('');
      setTags('');
      setShowAdvanced(false);
    }
  };

  const handleAliasChange = (e) => {
    setAlias(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''));
    setAliasStatus(null); // reset status when alias changes
    setAliasSuggestions([]);
  };

  const handleCheckAlias = async () => {
    const trimmed = alias.trim();
    if (!trimmed) return;
    if (!/^[a-zA-Z0-9-]{3,30}$/.test(trimmed)) {
      setAliasStatus('invalid');
      return;
    }
    setAliasStatus('checking');
    try {
      const res = await checkAlias(trimmed);
      setAliasStatus(res.available ? 'available' : 'taken');
    } catch {
      setAliasStatus(null);
    }
  };

  const handleSuggestAlternatives = async () => {
    const trimmed = alias.trim();
    if (!trimmed) return;
    setIsSuggestingAliases(true);
    try {
      const suggestions = await suggestAliasAlternatives(url.trim(), trimmed);
      setAliasSuggestions(suggestions || []);
    } catch (err) {
      console.error('Failed to suggest alias alternatives:', err);
    } finally {
      setIsSuggestingAliases(false);
    }
  };

  const handleChange = (e) => {
    setUrl(e.target.value);
    if (errors.url) setErrors((prev) => ({ ...prev, url: null }));
  };

  const handlePaste = (e) => {
    setTimeout(() => {
      setUrl(e.target.value);
      if (errors.url) setErrors((prev) => ({ ...prev, url: null }));
    }, 0);
  };

  return (
    <form className={`${styles.formCard} ${isHero ? styles.heroFormCard : ''}`} onSubmit={handleSubmit} noValidate>
      
      {/* 1. Destination URL */}
      <div className={styles.fieldGroup}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <label htmlFor="url-input" className={styles.label}>
            Destination URL <span className={styles.req}>*</span>
          </label>
          {isSignedIn && url.trim() && !errors.url && (
            <button
              type="button"
              className={styles.aiBtn}
              onClick={handleAiSuggest}
              disabled={isAiLoading || isLoading}
            >
              {isAiLoading ? <span className="spinner" style={{width: 14, height: 14, borderWidth: 2}} /> : '✨ Auto-Fill with AI'}
            </button>
          )}
        </div>
        <div className={`${styles.inputWrapper} ${errors.url ? styles.hasError : ''}`}>
          <span className={styles.icon}>🔗</span>
          <input
            ref={inputRef}
            id="url-input"
            type="url"
            className={styles.input}
            placeholder="https://example.com/very/long/path"
            value={url}
            onChange={handleChange}
            onPaste={handlePaste}
            disabled={isLoading || isAiLoading}
            autoComplete="off"
            spellCheck="false"
            required
          />
        </div>
        {errors.url && <p className={styles.errorText}>⚠ {errors.url}</p>}
      </div>

      {/* Title (Required) */}
      <div className={styles.fieldGroup}>
        <label htmlFor="title-input" className={styles.label}>
          Title <span className={styles.req}>*</span>
        </label>
        <div className={`${styles.inputWrapper} ${errors.title ? styles.hasError : ''}`}>
          <span className={styles.icon}>📝</span>
          <input
            id="title-input"
            type="text"
            className={styles.input}
            placeholder="e.g. My Portfolio"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors((prev) => ({ ...prev, title: null }));
            }}
            disabled={isLoading}
            maxLength={100}
            required
          />
        </div>
        {errors.title && <p className={styles.errorText}>⚠ {errors.title}</p>}
      </div>

      {/* 2. Expiry in Days */}
      <div className={styles.fieldGroup}>
        <label htmlFor="expiry-input" className={styles.label}>
          Expiry in Days <span className={styles.req}>*</span>
          {!isSignedIn && <span className={styles.opt}>(Max {maxExpiryDays} days · Sign in for 365)</span>}
        </label>
        <div className={`${styles.inputWrapper} ${errors.expiresInDays ? styles.hasError : ''}`}>
          <span className={styles.icon}>⏳</span>
          <input
            id="expiry-input"
            type="number"
            min="1"
            max={maxExpiryDays}
            className={styles.input}
            placeholder="e.g. 7"
            value={expiresInDays}
            onChange={(e) => {
              let val = parseInt(e.target.value, 10);
              if (val > maxExpiryDays) val = maxExpiryDays;
              if (val < 1) val = 1;
              setExpiresInDays(isNaN(val) ? '' : val.toString());
              if (errors.expiresInDays) setErrors((prev) => ({ ...prev, expiresInDays: null }));
            }}
            disabled={isLoading}
            required
          />
        </div>
        {errors.expiresInDays && <p className={styles.errorText}>⚠ {errors.expiresInDays}</p>}
      </div>

      {/* Advanced Toggle & Options (Signed-in Users Only) */}
      {isSignedIn && (
        <>
          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Advanced options
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

      <div className={`${styles.advancedSection} ${showAdvanced ? styles.advancedSectionOpen : ''}`}>
        <div className={styles.gridRow}>
          {/* Tags */}
          <div className={styles.fieldGroup}>
            <label htmlFor="tags-input" className={styles.label}>
              Tags <span className={styles.opt}>(Comma separated)</span>
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.icon}>🏷️</span>
              <input
                id="tags-input"
                type="text"
                className={styles.input}
                placeholder="e.g. work, resume"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                disabled={isLoading}
                maxLength={100}
              />
            </div>
          </div>
        </div>

        {/* Custom Alias */}
        <div className={styles.fieldGroup}>
          <label htmlFor="alias-input" className={styles.label}>
            Custom Alias <span className={styles.opt}>(Optional)</span>
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className={styles.inputWrapper} style={{ flex: 1 }}>
              <span className={styles.prefix}>lynq.app /</span>
              <input
                id="alias-input"
                type="text"
                className={styles.input}
                placeholder="my-custom-link"
                value={alias}
                onChange={handleAliasChange}
                maxLength={30}
                disabled={isLoading}
              />
            </div>
            {alias.trim().length >= 3 && (
              <button
                type="button"
                onClick={handleCheckAlias}
                disabled={aliasStatus === 'checking' || isLoading}
                className={styles.checkAliasBtn}
              >
                {aliasStatus === 'checking'
                  ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
                  : 'Check'}
              </button>
            )}
          </div>
          {/* Status badge shown below input */}
          {aliasStatus === 'available' && (
            <p className={styles.aliasAvailable}>✅ Available — this alias is free to use!</p>
          )}
          {aliasStatus === 'taken' && (
            <div className={styles.takenContainer}>
              <div className={styles.takenHeader}>
                <p className={styles.aliasTaken}>❌ Already taken — try a different alias.</p>
                {isSignedIn && (
                  <button
                    type="button"
                    className={styles.suggestAltBtn}
                    onClick={handleSuggestAlternatives}
                    disabled={isSuggestingAliases || isLoading}
                  >
                    {isSuggestingAliases ? (
                      <>
                        <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                        <span>Thinking…</span>
                      </>
                    ) : (
                      '✨ Suggest available alternatives'
                    )}
                  </button>
                )}
              </div>

              {aliasSuggestions.length > 0 && (
                <div className={styles.suggestionsBox}>
                  <span className={styles.suggestionsTitle}>Available Alternatives (1-click to select):</span>
                  <div className={styles.suggestionPills}>
                    {aliasSuggestions.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        className={styles.suggestionPill}
                        onClick={() => {
                          setAlias(alt);
                          setAliasStatus('available');
                          setAliasSuggestions([]);
                        }}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {aliasStatus === 'invalid' && (
            <p className={styles.aliasTaken}>⚠ Must be 3–30 characters, letters, numbers or hyphens only.</p>
          )}
        </div>

        <div className={styles.gridRow}>
          {/* Password */}
          <div className={styles.fieldGroup}>
            <label htmlFor="password-input" className={styles.label}>
              Password <span className={styles.opt}>(Optional)</span>
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.icon}>🔒</span>
              <input
                id="password-input"
                type="password"
                className={styles.input}
                placeholder="Secret password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          
          {/* Max Clicks */}
          <div className={styles.fieldGroup}>
            <label htmlFor="clicks-input" className={styles.label}>
              Max Clicks (Self-Destruct) <span className={styles.opt}>(Optional)</span>
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.icon}>💥</span>
              <input
                id="clicks-input"
                type="number"
                min="1"
                className={styles.input}
                placeholder="e.g. 50"
                value={maxClicks}
                onChange={(e) => {
                  let val = parseInt(e.target.value, 10);
                  if (val < 1) val = 1;
                  setMaxClicks(isNaN(val) ? '' : val.toString());
                }}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        className={styles.submitBtn}
        disabled={isLoading || !url.trim()}
      >
        {isLoading ? <span className="spinner" /> : (
          <>
            <span>Shorten Link</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </>
        )}
      </button>
      
      <div className={styles.footerHint}>
        <span className={styles.shortcut}>
          Press <kbd>Enter</kbd> to shorten
        </span>
        {!isSignedIn && (
          <div className={styles.guestLimitNote}>
            Guest limits: <strong>{rateLimits?.remaining?.perHour ?? 5}/{rateLimits?.limits?.perHour ?? 5}</strong>/hr
            {' · '}
            <strong>{rateLimits?.remaining?.perDay ?? 10}/{rateLimits?.limits?.perDay ?? 10}</strong>/day
            {' · '}
            Max <strong>{rateLimits?.limits?.maxActiveLinks ?? 10}</strong> saved · Sign in for 100/hr &amp; Pro tools
          </div>
        )}
      </div>
    </form>
  );
}
