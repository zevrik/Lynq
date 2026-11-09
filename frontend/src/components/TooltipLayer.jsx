import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './TooltipLayer.module.css';

const HOVER_OPEN_DELAY = 160;
const WARM_WINDOW_MS = 220;
const VIEWPORT_PAD = 10;
const TARGET_GAP = 9;

function getTooltipText(el) {
  if (!el) return '';
  return (el.getAttribute('data-tooltip') || '').trim();
}

function findEnabledTarget(node) {
  if (!(node instanceof Element)) return null;
  const matched = node.closest('[data-tooltip]');
  return getTooltipText(matched) ? matched : null;
}

function findDisabledTargetAtPoint(clientX, clientY) {
  const disabledButtons = document.querySelectorAll('button[data-tooltip]:disabled');
  for (let i = 0; i < disabledButtons.length; i += 1) {
    const btn = disabledButtons[i];
    if (!getTooltipText(btn)) continue;
    if (typeof btn.checkVisibility === 'function') {
      if (!btn.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        continue;
      }
    }
    const rect = btn.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return btn;
    }
  }
  return null;
}

/**
 * TooltipLayer — Single unified, theme-aware tooltip overlay for all controls across Lynq.
 * Uses [data-tooltip="..."] attributes and portals to document.body to prevent clipping
 * inside glassmorphic / overflow-hidden cards.
 */
export default function TooltipLayer({ theme }) {
  const [tipState, setTipState] = useState({
    targetEl: null,
    text: '',
    visible: false,
  });
  const [coords, setCoords] = useState({
    top: -9999,
    left: -9999,
    placement: 'bottom',
    arrowLeft: 20,
  });

  const tooltipRef = useRef(null);
  const activeTargetRef = useRef(null);
  const openTimerRef = useRef(null);
  const lastClosedAtRef = useRef(0);
  const isVisibleRef = useRef(false);

  isVisibleRef.current = tipState.visible;

  useEffect(() => {
    const clearOpenTimer = () => {
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
    };

    const hideTooltip = () => {
      clearOpenTimer();
      if (activeTargetRef.current || isVisibleRef.current) {
        if (isVisibleRef.current) {
          lastClosedAtRef.current = Date.now();
        }
        activeTargetRef.current = null;
        setTipState((prev) =>
          prev.visible || prev.targetEl
            ? { targetEl: null, text: '', visible: false }
            : prev
        );
      }
    };

    const showTooltipFor = (el, immediate = false) => {
      const text = getTooltipText(el);
      if (!text) {
        hideTooltip();
        return;
      }

      if (activeTargetRef.current === el && isVisibleRef.current) {
        setTipState((prev) => (prev.text === text ? prev : { ...prev, text }));
        return;
      }

      clearOpenTimer();
      const wasRecentlyOpen =
        isVisibleRef.current || Date.now() - lastClosedAtRef.current < WARM_WINDOW_MS;
      activeTargetRef.current = el;

      if (immediate || wasRecentlyOpen) {
        setTipState({ targetEl: el, text, visible: true });
      } else {
        openTimerRef.current = setTimeout(() => {
          openTimerRef.current = null;
          const liveText = getTooltipText(el);
          if (activeTargetRef.current === el && el.isConnected && liveText) {
            setTipState({ targetEl: el, text: liveText, visible: true });
          }
        }, HOVER_OPEN_DELAY);
      }
    };

    const handlePointerOver = (e) => {
      if (e.pointerType === 'touch') return;
      const targetEl = findEnabledTarget(e.target);
      if (targetEl) {
        showTooltipFor(targetEl, false);
      }
    };

    const handlePointerOut = (e) => {
      const current = activeTargetRef.current;
      if (!current) return;
      if (current.disabled) return;
      const related = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (related && current.contains(related)) return;

      const nextTarget = related ? findEnabledTarget(related) : null;
      if (nextTarget) {
        showTooltipFor(nextTarget, true);
      } else {
        hideTooltip();
      }
    };

    const handlePointerMove = (e) => {
      if (e.pointerType === 'touch') return;
      const current = activeTargetRef.current;

      if (current && !current.isConnected) {
        hideTooltip();
        return;
      }

      // If currently tracking a disabled button, check bounds for clean exit
      if (current && current.disabled) {
        const rect = current.getBoundingClientRect();
        const stillInside =
          rect.width > 0 &&
          rect.height > 0 &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (stillInside) return;
        hideTooltip();
      }

      // If an enabled tooltip target already owns the hover, let pointerover/out manage it
      if (current && !current.disabled) return;

      // Otherwise check if cursor sits over a disabled button with data-tooltip
      if (!findEnabledTarget(e.target)) {
        const disabledTarget = findDisabledTargetAtPoint(e.clientX, e.clientY);
        if (disabledTarget) {
          showTooltipFor(disabledTarget, false);
        }
      }
    };

    const handleFocusIn = (e) => {
      const el = findEnabledTarget(e.target);
      if (!el) return;
      try {
        if (el.matches(':focus-visible') || e.target.matches(':focus-visible')) {
          showTooltipFor(el, true);
        }
      } catch {
        // Ignore selector failures on non-matching nodes
      }
    };

    const handleFocusOut = (e) => {
      const current = activeTargetRef.current;
      if (!current) return;
      const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (next && current.contains(next)) return;
      hideTooltip();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        hideTooltip();
      }
    };

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerdown', hideTooltip, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
    window.addEventListener('blur', hideTooltip);

    return () => {
      clearOpenTimer();
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerdown', hideTooltip, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('resize', hideTooltip);
      window.removeEventListener('blur', hideTooltip);
    };
  }, []);

  // Watch the active target in case it unmounts or updates data-tooltip live
  useEffect(() => {
    const el = tipState.targetEl;
    if (!tipState.visible || !el) return;

    const attrObserver = new MutationObserver(() => {
      if (!el.isConnected) {
        activeTargetRef.current = null;
        setTipState({ targetEl: null, text: '', visible: false });
        return;
      }
      const nextText = getTooltipText(el);
      if (!nextText) {
        activeTargetRef.current = null;
        setTipState({ targetEl: null, text: '', visible: false });
      } else {
        setTipState((prev) => (prev.text === nextText ? prev : { ...prev, text: nextText }));
      }
    });

    attrObserver.observe(el, { attributes: true, attributeFilter: ['data-tooltip', 'disabled'] });

    const parentRoot = el.parentElement;
    let treeObserver = null;
    if (parentRoot) {
      treeObserver = new MutationObserver(() => {
        if (!el.isConnected) {
          activeTargetRef.current = null;
          setTipState({ targetEl: null, text: '', visible: false });
        }
      });
      treeObserver.observe(parentRoot, { childList: true });
    }

    return () => {
      attrObserver.disconnect();
      treeObserver?.disconnect();
    };
  }, [tipState.visible, tipState.targetEl]);

  useLayoutEffect(() => {
    if (!tipState.visible || !tipState.targetEl || !tooltipRef.current) return;

    const el = tipState.targetEl;
    if (!el.isConnected) return;

    const targetRect = el.getBoundingClientRect();
    const tipEl = tooltipRef.current;
    const tipW = tipEl.offsetWidth;
    const tipH = tipEl.offsetHeight;

    const preferred = el.getAttribute('data-tooltip-pos');
    const spaceBelow = window.innerHeight - targetRect.bottom - VIEWPORT_PAD;
    const spaceAbove = targetRect.top - VIEWPORT_PAD;

    let placement = 'bottom';
    if (preferred === 'top') {
      placement = spaceAbove >= tipH + TARGET_GAP || spaceAbove >= spaceBelow ? 'top' : 'bottom';
    } else if (spaceBelow < tipH + TARGET_GAP && spaceAbove > spaceBelow) {
      placement = 'top';
    }

    const top =
      placement === 'bottom'
        ? Math.min(window.innerHeight - tipH - VIEWPORT_PAD, targetRect.bottom + TARGET_GAP)
        : Math.max(VIEWPORT_PAD, targetRect.top - tipH - TARGET_GAP);

    const targetCenterX = targetRect.left + targetRect.width / 2;
    const maxLeft = Math.max(VIEWPORT_PAD, window.innerWidth - tipW - VIEWPORT_PAD);
    const left = Math.min(Math.max(VIEWPORT_PAD, targetCenterX - tipW / 2), maxLeft);
    const arrowLeft = Math.min(Math.max(14, targetCenterX - left), Math.max(14, tipW - 14));

    setCoords({ top, left, placement, arrowLeft });
  }, [tipState.visible, tipState.targetEl, tipState.text]);

  if (typeof document === 'undefined' || !tipState.visible || !tipState.text) {
    return null;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      data-placement={coords.placement}
      className={`${styles.tooltip} ${theme === 'light' ? styles.tooltipLight : ''}`}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        '--tooltip-arrow-left': `${coords.arrowLeft}px`,
      }}
    >
      <span className={styles.arrow} aria-hidden="true" />
      <span className={styles.text}>{tipState.text}</span>
    </div>,
    document.body
  );
}
