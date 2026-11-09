import { useState, useRef } from 'react';
import CustomQRCode from './CustomQRCode.jsx';
import ColorPicker from './ColorPicker.jsx';
import styles from './QRCodeCard.module.css';

export default function QRCodeCard({ url }) {
  const [fgColor, setFgColor] = useState('#6366f1');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [isTransparentBg, setIsTransparentBg] = useState(true);
  const [qrStyle, setQrStyle] = useState('squares'); // 'squares' | 'dots'
  const [logoUrl, setLogoUrl] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  const fileInputRef = useRef(null);

  if (!url) return null;

  const handleDownload = () => {
    const svgElement = document.getElementById('lynq-qr-svg');
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Export at 4x resolution for high quality
      const baseSize = 1024;
      canvas.width = baseSize;
      canvas.height = baseSize;
      ctx.drawImage(img, 0, 0, baseSize, baseSize);
      
      const link = document.createElement('a');
      link.download = 'lynq-qrcode.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setLogoUrl(event.target.result);
    reader.readAsDataURL(file);
    e.target.value = null; // reset
  };

  const clearLogo = () => {
    setLogoUrl('');
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </span>
        <span className={styles.title}>QR Code</span>
        
        <button 
          className={`${styles.settingsToggle} ${showSettings ? styles.settingsActive : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Customize QR"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>

      <div className={styles.qrWrapper}>
        <div className={styles.qrBg}>
          <CustomQRCode
            id="lynq-qr-svg"
            value={url}
            size={180}
            fgColor={fgColor}
            bgColor={isTransparentBg ? 'transparent' : bgColor}
            qrStyle={qrStyle}
            logoImage={logoUrl}
          />
        </div>
      </div>

      <div className={`${styles.settingsPanel} ${showSettings ? styles.settingsOpen : ''}`}>
        <div className={styles.settingGroup}>
          <label>Foreground</label>
          <ColorPicker
            label="Choose QR foreground color"
            value={fgColor}
            onChange={setFgColor}
          />
        </div>
        <div className={styles.settingGroup}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Background
            <label className={styles.transparencyToggle}>
              <input 
                type="checkbox" 
                checked={isTransparentBg} 
                onChange={(e) => setIsTransparentBg(e.target.checked)}
              />
              <span className={styles.transparencyText}>Transparent</span>
            </label>
          </label>
          <ColorPicker
            label="Choose QR background color"
            value={bgColor}
            dimmed={isTransparentBg}
            onChange={(nextColor) => {
              setBgColor(nextColor);
              setIsTransparentBg(false);
            }}
          />
        </div>
        
        <div className={styles.settingGroup}>
          <label>Shape</label>
          <div className={`${styles.shapeToggle} ${qrStyle === 'dots' ? styles.shapeToggleRight : ''}`}>
            <div className={styles.shapeSlider} />
            <button 
              className={`${styles.shapeBtn} ${qrStyle === 'squares' ? styles.activeShape : ''}`} 
              onClick={() => setQrStyle('squares')}
            >
              Square
            </button>
            <button 
              className={`${styles.shapeBtn} ${qrStyle === 'dots' ? styles.activeShape : ''}`} 
              onClick={() => setQrStyle('dots')}
            >
              Round
            </button>
          </div>
        </div>

        <div className={styles.settingGroup}>
          <label>Logo</label>
          <div className={styles.logoActions}>
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleLogoUpload}
            />
            <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
              Choose Image
            </button>
            {logoUrl && (
              <button className={styles.clearLogoBtn} onClick={clearLogo} title="Remove Logo">
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <button
        id="download-qr-btn"
        className={styles.downloadBtn}
        onClick={handleDownload}
        aria-label="Download QR Code"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download PNG
      </button>
    </div>
  );
}
