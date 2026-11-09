import React, { useMemo } from 'react';
import QRCode from 'qrcode';

function splitColorAlpha(input, fallback = '#000000') {
  if (!input || typeof input !== 'string') {
    return { color: fallback, alpha: 1 };
  }

  const str = input.trim();
  if (str.toLowerCase() === 'transparent') {
    return { color: 'none', alpha: 0 };
  }

  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 8) {
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return {
        color: `#${hex.slice(0, 6)}`,
        alpha: Number.isNaN(a) ? 1 : Math.min(1, Math.max(0, a)),
      };
    }
    return { color: str, alpha: 1 };
  }

  const rgbaMatch = str.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
  );
  if (rgbaMatch) {
    const r = Math.min(255, Math.max(0, Math.round(Number(rgbaMatch[1]))));
    const g = Math.min(255, Math.max(0, Math.round(Number(rgbaMatch[2]))));
    const b = Math.min(255, Math.max(0, Math.round(Number(rgbaMatch[3]))));
    let alpha = 1;
    if (rgbaMatch[4] !== undefined) {
      alpha = rgbaMatch[4].endsWith('%')
        ? parseFloat(rgbaMatch[4]) / 100
        : parseFloat(rgbaMatch[4]);
    }
    const clampedAlpha = Number.isNaN(alpha) ? 1 : Math.min(1, Math.max(0, alpha));
    return { color: `rgb(${r}, ${g}, ${b})`, alpha: clampedAlpha };
  }

  return { color: str, alpha: 1 };
}

export default function CustomQRCode({ value, fgColor, bgColor, qrStyle, logoImage, size, id }) {
  const qr = useMemo(() => {
    try {
      return QRCode.create(value, { errorCorrectionLevel: 'H' });
    } catch (e) {
      return null;
    }
  }, [value]);

  if (!qr) return null;

  const { color: fgOpaque, alpha: fgAlpha } = splitColorAlpha(fgColor, '#6366f1');
  const { color: bgOpaque, alpha: bgAlpha } = splitColorAlpha(bgColor, 'transparent');

  const moduleCount = qr.modules.size;
  const data = qr.modules.data;
  
  // Dedicate ~25-30% of the center for the logo
  const logoAreaSize = logoImage ? Math.floor(moduleCount * 0.28) : 0;
  const logoStart = Math.floor((moduleCount - logoAreaSize) / 2);
  const logoEnd = logoStart + logoAreaSize - 1;

  const isFinder = (x, y) => {
    return (x < 7 && y < 7) || 
           (x > moduleCount - 8 && y < 7) || 
           (x < 7 && y > moduleCount - 8);
  };

  const isLogoArea = (x, y) => {
    if (!logoImage) return false;
    return x >= logoStart && x <= logoEnd && y >= logoStart && y <= logoEnd;
  };

  const dots = [];
  for (let y = 0; y < moduleCount; y++) {
    for (let x = 0; x < moduleCount; x++) {
      if (isFinder(x, y) || isLogoArea(x, y)) continue;
      
      const isDark = data[y * moduleCount + x];
      if (isDark) {
        dots.push(
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={1.02} // slight overlap to prevent anti-aliasing gaps
            height={1.02}
            fill={fgOpaque}
            rx={qrStyle === 'dots' ? 0.51 : 0}
            ry={qrStyle === 'dots' ? 0.51 : 0}
            style={{ transition: 'rx 0.3s ease, ry 0.3s ease' }}
          />
        );
      }
    }
  }

  const Finder = ({ x, y }) => (
    <g>
      <path 
        d={`M${x},${y} h7 v7 h-7 Z M${x+1},${y+1} v5 h5 v-5 Z`} 
        fill={fgOpaque} 
        fillRule="evenodd" 
      />
      <rect x={x+2} y={y+2} width={3} height={3} fill={fgOpaque} />
    </g>
  );

  return (
    <svg 
      id={id}
      width={size} 
      height={size} 
      viewBox={`-2 -2 ${moduleCount + 4} ${moduleCount + 4}`} 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background rect for transparent or translucent exports */}
      <rect
        x="-2"
        y="-2"
        width={moduleCount + 4}
        height={moduleCount + 4}
        fill={bgAlpha === 0 ? 'none' : bgOpaque}
        fillOpacity={bgAlpha > 0 && bgAlpha < 1 ? bgAlpha : undefined}
      />
      
      {/* Group foreground modules so partial opacity applies uniformly without overlap seams */}
      <g opacity={fgAlpha < 1 ? fgAlpha : undefined}>
        <Finder x={0} y={0} />
        <Finder x={moduleCount - 7} y={0} />
        <Finder x={0} y={moduleCount - 7} />

        {dots}
      </g>

      {logoImage && (
        <image
          href={logoImage}
          x={logoStart + 0.5}
          y={logoStart + 0.5}
          width={logoAreaSize - 1}
          height={logoAreaSize - 1}
          preserveAspectRatio="xMidYMid slice"
        />
      )}
    </svg>
  );
}
