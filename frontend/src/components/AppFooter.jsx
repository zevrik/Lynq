import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AppFooter.module.css';

/**
 * Universal AppFooter Component
 * Reusable footer identical to the one on the Statistics page.
 * Features brand info, status indicator, product links, and platform references.
 */
export default function AppFooter() {
  const navigate = useNavigate();

  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const healthUrl = `${apiBase.replace(/\/+$/, '')}/health`;

  const handleLogoClick = () => {
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className={styles.siteFooter}>
      <div className={styles.footerGrid}>
        {/* Brand Column */}
        <div className={styles.footerColBrand}>
          <div className={styles.footerLogo} onClick={handleLogoClick} title="Lynq Dashboard">
            <div className={styles.footerLogoMark}>
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="url(#appFooterLogoGrad)" />
                <g transform="translate(6.4, 6.4) scale(0.8)" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </g>
                <defs>
                  <linearGradient id="appFooterLogoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className={styles.footerLogoText}>Lynq</span>
          </div>
          <p className={styles.footerDesc}>
            The open-source, enterprise-grade link intelligence platform. Built with PostgreSQL, Redis Cloud, Clerk, and Google Gemini.
          </p>
          <div className={styles.footerStatus}>
            <span className={styles.statusDot} />
            <span>All Systems Operational (99.99%)</span>
          </div>
        </div>

        {/* Product Column */}
        <div className={styles.footerCol}>
          <h4>Product</h4>
          <a href="/#shorten-input-container">Link Shortener</a>
          <a href="/#features">Features &amp; 3D Telemetry</a>
          <a href="/#showcase">Live Showcase</a>
          <a href="/#tiers">Free Tiers &amp; Limits</a>
          <a href="/#shorten-input-container">QR Code Studio</a>
        </div>

        {/* Platform Column */}
        <div className={styles.footerCol}>
          <h4>Platform</h4>
          <a href={healthUrl} target="_blank" rel="noreferrer">PostgreSQL Database</a>
          <a href={healthUrl} target="_blank" rel="noreferrer">Redis In-Memory</a>
          <a href="/#showcase">Server-Sent Events</a>
          <a href="https://clerk.com" target="_blank" rel="noreferrer">Clerk Authentication</a>
          <a href="https://ai.google.dev" target="_blank" rel="noreferrer">Google Gemini AI</a>
        </div>

        {/* Resources Column */}
        <div className={styles.footerCol}>
          <h4>Resources</h4>
          <a href={healthUrl} target="_blank" rel="noreferrer">API Health Status</a>
          <a href="https://github.com/zevrik/Lynq" target="_blank" rel="noreferrer">GitHub Repository</a>
          <a href="/#showcase">Live Pulse Stream</a>
          <a href="https://github.com/zevrik/Lynq/blob/main/README.md" target="_blank" rel="noreferrer">Documentation</a>
        </div>
      </div>

      {/* Footer Bottom Row */}
      <div className={styles.footerBottom}>
        <div>© {new Date().getFullYear()} Lynq Technologies Inc. All rights reserved.</div>
        <div className={styles.footerLinks}>
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
          <span>Cookie Preferences</span>
        </div>
      </div>
    </footer>
  );
}
