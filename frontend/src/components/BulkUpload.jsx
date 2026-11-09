import { useState, useRef, useCallback } from 'react';
import { bulkShortenUrls, IS_TESTING_MODE } from '../services/api.js';
import { parseCsv, downloadCsv } from '../utils/csv.js';
import styles from './BulkUpload.module.css';

const MAX_ROWS = IS_TESTING_MODE ? 5000 : 100;

const SAMPLE_CSV = [
  ['url', 'title', 'alias (Optional)'],
  ['https://example.com/very-long-path/page-1', 'My First Link', 'my-first-link'],
  ['https://github.com/some-repo/something-long', 'GitHub Repository', 'github-repo'],
  ['https://docs.example.com/another-long-page', 'Docs Page', ''],
].map(row => row.join(',')).join('\n');

export default function BulkUpload({ onAdded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]); // preview rows
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('upload'); // 'upload' | 'preview'
  const fileInputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCsv(e.target.result);
      if (rows.length === 0) {
        setError('CSV is empty or has no valid rows.');
        return;
      }
      if (rows.length > MAX_ROWS) {
        setError(`Too many rows (${rows.length}). Maximum is ${MAX_ROWS}.`);
        return;
      }
      // Check that url column exists
      const hasUrlCol = Object.keys(rows[0]).some(k => ['url', 'link'].includes(k.toLowerCase()));
      if (!hasUrlCol) {
        setError('CSV must have a "url" or "link" column header.');
        return;
      }
      setParsedRows(rows);
      setStep('preview');
    };
    reader.readAsText(file);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const onFileChange = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = null;
  };

  const handleProcess = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await bulkShortenUrls(parsedRows);
      
      if (onAdded) {
        const successful = data.results.filter(r => !r.error);
        if (successful.length > 0) {
          onAdded(successful);
        }
      }
      
      // Reset immediately to empty state after success
      handleReset();
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setParsedRows([]);
    setError('');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span>Bulk CSV Upload</span>
        </div>
        <button
          className={styles.sampleLink}
          onClick={() => downloadCsv(SAMPLE_CSV, 'lynq-sample.csv')}
          data-tooltip="Download a sample CSV template with required columns"
        >
          ↓ Download sample CSV
        </button>
      </div>

      {/* ── Step 1: Upload ──────────────────────────────── */}
      {step === 'upload' && (
        <div
          className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={onFileChange}
          />
          <div className={styles.dropzoneIcon}>📄</div>
          <p className={styles.dropzoneText}>
            {isDragging ? 'Drop it here!' : 'Drag & drop your CSV file here'}
          </p>
          <p className={styles.dropzoneSub}>or click to browse · Max {MAX_ROWS} rows</p>
          <p className={styles.dropzoneFormat}>Required: <code>url</code>, <code>title</code> · Optional: <code>alias</code></p>
        </div>
      )}

      {/* ── Step 2: Preview ─────────────────────────────── */}
      {step === 'preview' && (
        <div className={styles.preview}>
          <div className={styles.previewHeader}>
            <div className={styles.fileInfo}>
              <span className={styles.fileIcon}>📄</span>
              <span className={styles.fileName}>{fileName}</span>
              <span className={styles.rowCount}>{parsedRows.length} rows</span>
            </div>
            <button
              className={styles.resetBtn}
              onClick={handleReset}
              data-tooltip="Clear selected CSV file and upload another"
            >
              ✕ Remove
            </button>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {Object.keys(parsedRows[0] || {}).map(col => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} data-tooltip={val && val.length > 40 ? val : undefined}>
                        {val.length > 40 ? val.slice(0, 40) + '…' : val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedRows.length > 5 && (
              <p className={styles.moreRows}>…and {parsedRows.length - 5} more rows</p>
            )}
          </div>

          <button
            className={styles.processBtn}
            onClick={handleProcess}
            disabled={isLoading}
            data-tooltip={`Batch shorten all ${parsedRows.length} links into your cloud dashboard`}
          >
            {isLoading ? (
              <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Processing…</>
            ) : (
              <><span>⚡ Shorten All {parsedRows.length} Links</span></>
            )}
          </button>
        </div>
      )}

      {error && <p className={styles.errorMsg}>⚠ {error}</p>}
    </div>
  );
}
