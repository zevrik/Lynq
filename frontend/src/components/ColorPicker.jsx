import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pipette } from 'lucide-react';
import styles from './ColorPicker.module.css';

const POPOVER_WIDTH = 200;
const POPOVER_HEIGHT = 198;

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function toHexByte(n) {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

function hsvToRgb(h, s, v) {
  const hn = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;

  const c = vn * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = vn - c;

  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hn < 60) { rn = c; gn = x; }
  else if (hn < 120) { rn = x; gn = c; }
  else if (hn < 180) { gn = c; bn = x; }
  else if (hn < 240) { gn = x; bn = c; }
  else if (hn < 300) { rn = x; bn = c; }
  else { rn = c; bn = x; }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

function parseColor(input) {
  if (!input || typeof input !== 'string') {
    return { h: 239, s: 59, v: 95, a: 1 };
  }

  const str = input.trim().toLowerCase();
  if (str === 'transparent') {
    return { h: 0, s: 0, v: 100, a: 0 };
  }

  // Hex formats (#rgb, #rrggbb, #rrggbbaa)
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((ch) => ch + ch).join('');
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return { ...rgbToHsv(r, g, b), a: clamp(a, 0, 1) };
      }
    }
  }

  // rgb() / rgba()
  const rgbaMatch = str.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
  );
  if (rgbaMatch) {
    const r = clamp(Number(rgbaMatch[1]), 0, 255);
    const g = clamp(Number(rgbaMatch[2]), 0, 255);
    const b = clamp(Number(rgbaMatch[3]), 0, 255);
    let a = 1;
    if (rgbaMatch[4] !== undefined) {
      a = rgbaMatch[4].endsWith('%')
        ? parseFloat(rgbaMatch[4]) / 100
        : parseFloat(rgbaMatch[4]);
    }
    return { ...rgbToHsv(r, g, b), a: clamp(Number.isNaN(a) ? 1 : a, 0, 1) };
  }

  return { h: 239, s: 59, v: 95, a: 1 };
}

function formatColor({ h, s, v, a }) {
  const { r, g, b } = hsvToRgb(h, s, v);
  const alpha = Math.round(clamp(a, 0, 1) * 100) / 100;
  if (alpha >= 1) {
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ColorPicker({
  value = '#6366f1',
  onChange,
  label = 'Choose color',
  dimmed = false,
  placement = 'right',
  anchorContainerRef = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hsv, setHsv] = useState(() => parseColor(value));
  const [coords, setCoords] = useState({ top: 0, left: 0, origin: 'top left' });

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const svBoxRef = useRef(null);
  const hueTrackRef = useRef(null);
  const alphaTrackRef = useRef(null);
  const lastEmittedRef = useRef(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // Sync incoming value when changed externally
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    setHsv(parseColor(value));
  }, [value]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const containerRect = anchorContainerRef?.current?.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const popW = popoverRef.current?.offsetWidth || POPOVER_WIDTH;
    const popH = popoverRef.current?.offsetHeight || POPOVER_HEIGHT;
    const margin = 8;
    const maxTop = Math.max(margin, viewportHeight - popH - margin);

    if (placement === 'right') {
      const anchorRight = containerRect ? containerRect.right + 8 : rect.right + 8;
      const availableRightOfTrigger = viewportWidth - margin - rect.right;

      if (availableRightOfTrigger >= 88) {
        const maxLeft = Math.max(margin, viewportWidth - popW - margin);
        const left = Math.min(anchorRight, maxLeft);
        const top = clamp(rect.bottom, margin, maxTop);
        setCoords({ top, left, origin: 'top left' });
        return;
      }
    }

    const spaceBelow = viewportHeight - rect.bottom;
    let top = rect.bottom + 10;
    if (spaceBelow < popH + margin && rect.top > popH + margin) {
      top = rect.top - popH - 10;
    } else {
      top = Math.min(top, maxTop);
    }

    let left = rect.right - popW;
    if (left < margin && rect.left + popW + margin <= viewportWidth) {
      left = rect.left;
    }
    left = clamp(left, margin, Math.max(margin, viewportWidth - popW - margin));
    setCoords({ top, left, origin: 'top left' });
  }, [placement, anchorContainerRef]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handlePointerDown = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        popoverRef.current?.contains(e.target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  const commitHsv = useCallback((nextHsv) => {
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    const formatted = formatColor(nextHsv);
    lastEmittedRef.current = formatted;
    onChange?.(formatted);
  }, [onChange]);

  const startDrag = useCallback((e, computeUpdate) => {
    e.preventDefault();
    computeUpdate(e.clientX, e.clientY);

    const handleMove = (moveEvent) => {
      computeUpdate(moveEvent.clientX, moveEvent.clientY);
    };

    const stopDrag = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      window.removeEventListener('blur', stopDrag);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    window.addEventListener('blur', stopDrag);
  }, []);

  const handleSvPointerDown = (e) => {
    startDrag(e, (clientX, clientY) => {
      const box = svBoxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const s = clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
      const v = (1 - clamp((clientY - rect.top) / rect.height, 0, 1)) * 100;
      commitHsv({ ...hsvRef.current, s, v });
    });
  };

  const handleHuePointerDown = (e) => {
    startDrag(e, (clientX) => {
      const track = hueTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const h = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
      commitHsv({ ...hsvRef.current, h });
    });
  };

  const handleAlphaPointerDown = (e) => {
    startDrag(e, (clientX) => {
      const track = alphaTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const a = clamp((clientX - rect.left) / rect.width, 0, 1);
      commitHsv({ ...hsvRef.current, a });
    });
  };

  const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  const handleEyeDropper = async () => {
    if (!supportsEyeDropper) return;
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        const parsed = parseColor(result.sRGBHex);
        commitHsv({ ...parsed, a: 1 });
      }
    } catch {
      // User cancelled eyedropper
    }
  };

  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const pureHueColor = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;
  const huePercent = clamp((hsv.h / 360) * 100, 0, 100);
  const alphaPercent = clamp(hsv.a * 100, 0, 100);
  const showSwatchChecker = dimmed || hsv.a < 1;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.swatchBtn} ${isOpen ? styles.swatchBtnActive : ''} ${dimmed ? styles.swatchBtnDimmed : ''}`}
        onClick={() => {
          if (!isOpen) updatePosition();
          setIsOpen((prev) => !prev);
        }}
        aria-label={label}
        aria-expanded={isOpen}
        data-tooltip={label}
      >
        {showSwatchChecker && <span className={styles.swatchChecker} aria-hidden="true" />}
        <span
          className={styles.swatchFill}
          style={{ background: dimmed ? 'transparent' : value }}
          aria-hidden="true"
        />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={popoverRef}
              className={styles.popover}
              style={{
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                transformOrigin: coords.origin || 'top left',
              }}
              initial={{
                opacity: 0,
                scale: 0.2,
              }}
              animate={{
                opacity: 1,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.2,
              }}
              transition={{
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
              role="dialog"
              aria-label={label}
            >
              {/* 2D Saturation / Brightness Box */}
              <div
                ref={svBoxRef}
                className={styles.svArea}
                style={{ backgroundColor: pureHueColor }}
                onPointerDown={handleSvPointerDown}
              >
                <div
                  className={styles.svThumb}
                  style={{
                    left: `clamp(9px, ${hsv.s}%, calc(100% - 9px))`,
                    top: `clamp(9px, ${100 - hsv.v}%, calc(100% - 9px))`,
                  }}
                />
              </div>

              {/* Bottom Controls Bar */}
              <div className={styles.controlsBar}>
                <button
                  type="button"
                  className={styles.eyedropperBtn}
                  onClick={handleEyeDropper}
                  disabled={!supportsEyeDropper}
                  data-tooltip={supportsEyeDropper ? 'Pick color from screen' : 'Eyedropper unavailable in this browser'}
                  aria-label="Pick color from screen"
                >
                  <Pipette size={18} strokeWidth={2} />
                </button>

                <div className={styles.slidersStack}>
                  {/* Hue Slider */}
                  <div
                    ref={hueTrackRef}
                    className={`${styles.sliderTrack} ${styles.hueTrack}`}
                    onPointerDown={handleHuePointerDown}
                    role="slider"
                    aria-label="Hue"
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={Math.round(hsv.h)}
                  >
                    <div
                      className={styles.sliderThumb}
                      style={{ left: `clamp(9px, ${huePercent}%, calc(100% - 9px))` }}
                    />
                  </div>

                  {/* Opacity / Alpha Slider */}
                  <div
                    ref={alphaTrackRef}
                    className={`${styles.sliderTrack} ${styles.alphaTrack}`}
                    onPointerDown={handleAlphaPointerDown}
                    role="slider"
                    aria-label="Opacity"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(alphaPercent)}
                  >
                    <div
                      className={styles.alphaGradient}
                      style={{
                        background: `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0) 0%, rgb(${r}, ${g}, ${b}) 100%)`,
                      }}
                    />
                    <div
                      className={styles.sliderThumb}
                      style={{ left: `clamp(9px, ${alphaPercent}%, calc(100% - 9px))` }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
