import React from 'react';

/**
 * CountryFlag Component
 * Renders real national flag mini-images via FlagCDN.
 * Solves the Windows OS limitation where Unicode emoji flags are rendered as text letters (e.g. "IN").
 */
export default function CountryFlag({ 
  countryCode, 
  size = 'md', 
  className = '', 
  style = {} 
}) {
  if (!countryCode || countryCode === 'Unknown' || countryCode === 'Local' || countryCode.length !== 2) {
    return <span style={{ fontSize: size === 'lg' ? '24px' : '14px', lineHeight: 1, ...style }}>🌐</span>;
  }

  const code = countryCode.toLowerCase();
  
  // Dimensions
  const dims = size === 'lg' 
    ? { width: 28, height: 21, radius: 4 }
    : size === 'sm'
    ? { width: 16, height: 12, radius: 2 }
    : { width: 20, height: 15, radius: 3 };

  return (
    <img
      src={`https://flagcdn.com/24x18/${code}.png`}
      srcSet={`https://flagcdn.com/48x36/${code}.png 2x`}
      width={dims.width}
      height={dims.height}
      alt={countryCode}
      loading="lazy"
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: `${dims.radius}px`,
        objectFit: 'cover',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
        flexShrink: 0,
        ...style,
      }}
      onError={(e) => {
        // Fallback to text code if CDN is unreachable
        e.target.style.display = 'none';
      }}
    />
  );
}

/**
 * Returns HTML string for mini flag image, for use inside Globe.gl tooltips
 */
export function getCountryFlagImgHtml(countryCode) {
  if (!countryCode || countryCode.length !== 2 || countryCode === '-99') {
    return '<span style="font-size: 16px;">🌐</span>';
  }
  const code = countryCode.toLowerCase();
  return `<img src="https://flagcdn.com/24x18/${code}.png" width="20" height="15" alt="${countryCode}" style="border-radius: 3px; vertical-align: middle; box-shadow: 0 1px 4px rgba(0,0,0,0.5); display: inline-block; margin-right: 6px;" />`;
}
