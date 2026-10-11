/**
 * AIRLOG X — Application Logic & Dashboard Controller
 * Orchestrates sensor metrics, Chart.js telemetry, CSV import/export,
 * Web Crypto SHA-256 verification, and Block Inspector UI.
 */

class AirLogApp {
  constructor() {
    this.records = [];
    this.sourceMode = 'SIMULATED'; // 'SIMULATED' | 'IMPORTED'
    this.activeFilename = 'benchmark_flight_dataset.csv';
    this.verificationReport = null;
    this.structuralReport = null;
    this.charts = {
      air: null,
      temp: null,
      pres: null
    };

    this.init();
  }

  async init() {
    this.bindEvents();
    this.initCharts();
    this.loadDemoData();
  }

  /**
   * Bind DOM event listeners
   */
  bindEvents() {
    // CSV Import
    const btnImport = document.getElementById('btnImportCsv');
    const fileInput = document.getElementById('csvFileInput');
    if (btnImport && fileInput) {
      btnImport.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    // Demo Data Button
    const btnDemo = document.getElementById('btnDemoData');
    if (btnDemo) {
      btnDemo.addEventListener('click', () => this.loadDemoData());
    }

    // Simulate Tamper Button
    const btnTamper = document.getElementById('btnSimulateTamper');
    if (btnTamper) {
      btnTamper.addEventListener('click', () => this.simulateTampering());
    }

    // Verify Log Button
    const btnVerify = document.getElementById('btnVerifyLog');
    if (btnVerify) {
      btnVerify.addEventListener('click', () => this.runVerification());
    }

    // Export CSV
    const btnExport = document.getElementById('btnExportCsv');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.exportCurrentData());
    }

    // Download Sample Files
    const btnDlClean = document.getElementById('btnDlSampleClean');
    if (btnDlClean) {
      btnDlClean.addEventListener('click', () => this.downloadStaticSample(false));
    }
    const btnDlTampered = document.getElementById('btnDlSampleTampered');
    if (btnDlTampered) {
      btnDlTampered.addEventListener('click', () => this.downloadStaticSample(true));
    }

    // Search input for Table
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.renderTable(e.target.value));
    }

    // Modal Close
    const modalClose = document.getElementById('modalCloseBtn');
    const modalOverlay = document.getElementById('blockModal');
    if (modalClose && modalOverlay) {
      modalClose.addEventListener('click', () => modalOverlay.classList.remove('active'));
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('active');
      });
    }

    // Global ESC key to close modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay) {
        modalOverlay.classList.remove('active');
      }
    });

    // Window resize and fullscreen change listeners to keep charts responsive
    window.addEventListener('resize', () => this.resizeAllCharts());
    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => this.resizeAllCharts(), 100);
    });
  }

  /**
   * Recalculates canvas dimensions and triggers responsive layout update for all charts
   */
  resizeAllCharts() {
    if (!this.charts) return;
    Object.values(this.charts).forEach(c => {
      if (c && typeof c.resize === 'function') {
        c.resize();
      }
    });
  }

  /**
   * Load clean benchmark demo dataset
   */
  loadDemoData() {
    if (typeof SAMPLE_AIRLOG_RECORDS !== 'undefined' && Array.isArray(SAMPLE_AIRLOG_RECORDS)) {
      // Clone records deeply so modifications don't mutate base
      this.records = JSON.parse(JSON.stringify(SAMPLE_AIRLOG_RECORDS));
    } else {
      this.records = [];
    }

    this.sourceMode = 'SIMULATED';
    this.activeFilename = 'benchmark_flight_dataset.csv';
    this.verificationReport = null;
    this.structuralReport = null;

    this.updateSourceBadge();
    this.updateKpis();
    this.updateCharts();
    this.renderTable();
    this.resetVerificationUI();

    this.showToast("Benchmark demo dataset loaded (25 cryptographically chained records).", "info");
  }

  /**
   * Update header badges for Data Source and Hardware Link
   */
  updateSourceBadge() {
    const badge = document.getElementById('sourceModeBadge');
    if (!badge) return;

    if (this.sourceMode === 'SIMULATED') {
      badge.className = 'badge-hud badge-mode-simulated';
      badge.innerHTML = `<span class="beacon-dot beacon-amber"></span> Mode: Simulated Benchmark Data (25 Records)`;
      badge.title = "Running on pre-computed realistic sensor simulation records.";
    } else {
      badge.className = 'badge-hud badge-mode-imported';
      badge.innerHTML = `<span class="beacon-dot beacon-emerald"></span> Mode: Imported Device Log (${this.records.length} Records)`;
      badge.title = `Imported local file: ${this.activeFilename}`;
    }
  }

  /**
   * Handle CSV file upload from local browser storage
   */
  handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = CSVHandler.parse(text);

      if (parsed.errors.length > 0 && parsed.records.length === 0) {
        this.showToast(`CSV Parse Error: ${parsed.errors[0]}`, "error");
        return;
      }

      this.records = parsed.records;
      this.sourceMode = 'IMPORTED';
      this.activeFilename = file.name;
      this.verificationReport = null;
      this.structuralReport = null;

      this.updateSourceBadge();
      this.updateKpis();
      this.updateCharts();
      this.renderTable();
      this.resetVerificationUI();

      this.showToast(`Successfully imported ${this.records.length} records from ${file.name}.`, "success");
      
      // Auto run verification check after import for instant feedback
      this.runVerification();
    };

    reader.onerror = () => {
      this.showToast("Failed to read CSV file.", "error");
    };

    reader.readAsText(file);
    // Reset file input value so re-selecting same file triggers change
    e.target.value = '';
  }

  /**
   * Update the 4 Sensor KPI Cards
   */
  updateKpis() {
    if (!this.records || this.records.length === 0) return;

    const latest = this.records[this.records.length - 1];
    const prev = this.records.length > 1 ? this.records[this.records.length - 2] : latest;

    // 1. Air Quality (MQ-135)
    const airVal = parseFloat(latest.air_quality) || 0;
    const airEl = document.getElementById('kpiAirVal');
    const airPill = document.getElementById('kpiAirStatusPill');
    const airRange = document.getElementById('kpiAirRange');

    if (airEl) airEl.textContent = airVal.toFixed(1);

    if (airPill) {
      if (airVal < 70) {
        airPill.className = 'sensor-status-pill pill-good';
        airPill.innerHTML = `● Clean / Normal`;
      } else if (airVal < 120) {
        airPill.className = 'sensor-status-pill pill-mod';
        airPill.innerHTML = `● Moderate Air`;
      } else {
        airPill.className = 'sensor-status-pill pill-alert';
        airPill.innerHTML = `● Elevated Smoke/Gas`;
      }
    }

    if (airRange) {
      const airVals = this.records.map(r => parseFloat(r.air_quality)).filter(v => !isNaN(v));
      const minA = Math.min(...airVals).toFixed(1);
      const maxA = Math.max(...airVals).toFixed(1);
      const avgA = (airVals.reduce((a, b) => a + b, 0) / airVals.length).toFixed(1);
      airRange.innerHTML = `Min: <strong>${minA}</strong> | Max: <strong>${maxA}</strong> | Avg: <strong>${avgA}</strong>`;
    }

    // 2. Temperature (BMP280)
    const tempVal = parseFloat(latest.temperature) || 0;
    const tempEl = document.getElementById('kpiTempVal');
    const tempFEl = document.getElementById('kpiTempF');
    const tempRange = document.getElementById('kpiTempRange');

    if (tempEl) tempEl.textContent = tempVal.toFixed(1);
    if (tempFEl) {
      const fahrenheit = (tempVal * 9 / 5 + 32).toFixed(1);
      tempFEl.textContent = `${fahrenheit} °F`;
    }

    if (tempRange) {
      const tempVals = this.records.map(r => parseFloat(r.temperature)).filter(v => !isNaN(v));
      const minT = Math.min(...tempVals).toFixed(1);
      const maxT = Math.max(...tempVals).toFixed(1);
      tempRange.innerHTML = `Range: <strong>${minT}°C</strong> — <strong>${maxT}°C</strong>`;
    }

    // 3. Pressure (BMP280)
    const presVal = parseFloat(latest.pressure) || 0;
    const presEl = document.getElementById('kpiPresVal');
    const presAlt = document.getElementById('kpiPresAlt');
    const presRange = document.getElementById('kpiPresRange');

    if (presEl) presEl.textContent = presVal.toFixed(1);
    if (presAlt) {
      // Hypsometric formula for barometric altitude estimation
      const altM = Math.round(44330 * (1 - Math.pow(presVal / 1013.25, 0.1903)));
      presAlt.textContent = `Est. Altitude: ~${altM} m`;
    }

    if (presRange) {
      const presVals = this.records.map(r => parseFloat(r.pressure)).filter(v => !isNaN(v));
      const minP = Math.min(...presVals).toFixed(1);
      const maxP = Math.max(...presVals).toFixed(1);
      presRange.innerHTML = `Min: <strong>${minP}</strong> | Max: <strong>${maxP} hPa</strong>`;
    }

    // 4. Timestamp (DS3231 RTC)
    const timeEl = document.getElementById('kpiTimeVal');
    const dateEl = document.getElementById('kpiDateVal');
    const intervalEl = document.getElementById('kpiIntervalVal');

    if (timeEl) timeEl.textContent = latest.time || '--:--:--';
    if (dateEl) dateEl.textContent = latest.date || '----/--/--';
    if (intervalEl) {
      intervalEl.innerHTML = `Total Log Blocks: <strong>#${this.records.length}</strong>`;
    }

    // Update charts latest badges
    const cAirBadge = document.getElementById('chartAirLatest');
    if (cAirBadge) cAirBadge.textContent = `${airVal.toFixed(1)} PPM`;
    const cTempBadge = document.getElementById('chartTempLatest');
    if (cTempBadge) cTempBadge.textContent = `${tempVal.toFixed(1)} °C`;
    const cPresBadge = document.getElementById('chartPresLatest');
    if (cPresBadge) cPresBadge.textContent = `${presVal.toFixed(1)} hPa`;
  }

  /**
   * Initialize Chart.js telemetry charts
   */
  initCharts() {
    if (typeof Chart === 'undefined') {
      console.warn("Chart.js is not loaded yet.");
      return;
    }

    // Global Chart.js styling for Cyber-Dark theme
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'JetBrains Mono', Consolas, monospace";
    Chart.defaults.font.size = 11;

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 50,
      animation: { duration: 600, easing: 'easeOutQuart' },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(11, 17, 30, 0.95)',
          titleColor: '#00f2fe',
          bodyColor: '#f1f5f9',
          borderColor: 'rgba(56, 189, 248, 0.4)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items) => `Record #${items[0].label}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { maxTicksLimit: 8 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        }
      }
    };

    // 1. Air Quality Chart
    const ctxAir = document.getElementById('chartAirQuality');
    if (ctxAir) {
      const ctx = ctxAir.getContext('2d');
      const gradCyan = ctx.createLinearGradient(0, 0, 0, 200);
      gradCyan.addColorStop(0, 'rgba(0, 242, 254, 0.35)');
      gradCyan.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

      this.charts.air = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'MQ-135 Air Quality (PPM)',
            data: [],
            borderColor: '#00f2fe',
            backgroundColor: gradCyan,
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#00f2fe',
            pointRadius: 2,
            pointHoverRadius: 5
          }]
        },
        options: {
          ...commonOptions,
          scales: {
            ...commonOptions.scales,
            y: {
              ...commonOptions.scales.y,
              title: { display: true, text: 'PPM', color: '#64748b' }
            }
          }
        }
      });
    }

    // 2. Temperature Chart
    const ctxTemp = document.getElementById('chartTemperature');
    if (ctxTemp) {
      const ctx = ctxTemp.getContext('2d');
      const gradAmber = ctx.createLinearGradient(0, 0, 0, 200);
      gradAmber.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
      gradAmber.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

      this.charts.temp = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'BMP280 Temperature (°C)',
            data: [],
            borderColor: '#f59e0b',
            backgroundColor: gradAmber,
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#f59e0b',
            pointRadius: 2,
            pointHoverRadius: 5
          }]
        },
        options: {
          ...commonOptions,
          scales: {
            ...commonOptions.scales,
            y: {
              ...commonOptions.scales.y,
              title: { display: true, text: '°C', color: '#64748b' }
            }
          }
        }
      });
    }

    // 3. Pressure Chart
    const ctxPres = document.getElementById('chartPressure');
    if (ctxPres) {
      const ctx = ctxPres.getContext('2d');
      const gradBlue = ctx.createLinearGradient(0, 0, 0, 200);
      gradBlue.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      gradBlue.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

      this.charts.pres = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'BMP280 Pressure (hPa)',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: gradBlue,
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#38bdf8',
            pointRadius: 2,
            pointHoverRadius: 5
          }]
        },
        options: {
          ...commonOptions,
          scales: {
            ...commonOptions.scales,
            y: {
              ...commonOptions.scales.y,
              title: { display: true, text: 'hPa', color: '#64748b' }
            }
          }
        }
      });
    }
  }

  /**
   * Update charts dataset with current records
   */
  updateCharts() {
    if (!this.records) return;

    const labels = this.records.map(r => `${r.index} (${r.time})`);
    const airData = this.records.map(r => parseFloat(r.air_quality) || 0);
    const tempData = this.records.map(r => parseFloat(r.temperature) || 0);
    const presData = this.records.map(r => parseFloat(r.pressure) || 0);

    if (this.charts.air) {
      this.charts.air.data.labels = labels;
      this.charts.air.data.datasets[0].data = airData;
      this.charts.air.update();
    }

    if (this.charts.temp) {
      this.charts.temp.data.labels = labels;
      this.charts.temp.data.datasets[0].data = tempData;
      this.charts.temp.update();
    }

    if (this.charts.pres) {
      this.charts.pres.data.labels = labels;
      this.charts.pres.data.datasets[0].data = presData;
      this.charts.pres.update();
    }
  }

  /**
   * Render environmental log ledger table
   * @param {string} [filterKeyword]
   */
  renderTable(filterKeyword = '') {
    const tbody = document.getElementById('ledgerTableBody');
    const countEl = document.getElementById('tableRowCountBadge');
    if (!tbody) return;

    tbody.innerHTML = '';
    const kw = (filterKeyword || '').toLowerCase().trim();

    let displayRecords = this.records;
    if (kw) {
      displayRecords = this.records.filter(r => {
        return String(r.index).includes(kw) ||
               String(r.date).toLowerCase().includes(kw) ||
               String(r.time).toLowerCase().includes(kw) ||
               String(r.air_quality).includes(kw) ||
               String(r.temperature).includes(kw) ||
               String(r.pressure).includes(kw) ||
               String(r.curr_hash).toLowerCase().includes(kw);
      });
    }

    if (countEl) {
      countEl.textContent = `Showing ${displayRecords.length} of ${this.records.length} records`;
    }

    if (displayRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-dim);">No matching log entries found.</td></tr>`;
      return;
    }

    displayRecords.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.index = r.index;

      // Check if this row is marked as tampered in verification report
      let isTampered = false;
      let statusHtml = `<span class="sensor-status-pill pill-neutral">#${r.index} Unverified</span>`;

      if (this.verificationReport && this.verificationReport.details) {
        const detail = this.verificationReport.details.find(d => d.index === r.index);
        if (detail) {
          if (detail.isAuthentic) {
            statusHtml = `<span class="sensor-status-pill pill-good">✓ Valid</span>`;
          } else {
            isTampered = true;
            statusHtml = `<span class="sensor-status-pill pill-alert">⚠ Tampered</span>`;
          }
        }
      } else if (r.index === 1) {
        statusHtml = `<span class="sensor-status-pill pill-neutral">Genesis</span>`;
      }

      if (isTampered) {
        tr.className = 'tampered-row';
      }

      const airVal = parseFloat(r.air_quality) || 0;
      let airBadgeClass = 'pill-good';
      if (airVal >= 70 && airVal < 120) airBadgeClass = 'pill-mod';
      else if (airVal >= 120) airBadgeClass = 'pill-alert';

      // Truncated hash
      const prevTrunc = this.truncateHash(r.prev_hash);
      const currTrunc = this.truncateHash(r.curr_hash);

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan);">#${r.index}</td>
        <td style="font-family: var(--font-mono);">${r.date}</td>
        <td style="font-family: var(--font-mono);">${r.time}</td>
        <td><span class="sensor-status-pill ${airBadgeClass}">${airVal.toFixed(1)} PPM</span></td>
        <td style="font-family: var(--font-mono);">${parseFloat(r.temperature).toFixed(1)} °C</td>
        <td style="font-family: var(--font-mono);">${parseFloat(r.pressure).toFixed(1)} hPa</td>
        <td>
          <div class="hash-cell">
            <span class="hash-badge" title="${r.prev_hash}">${prevTrunc}</span>
            <button class="hash-copy-btn" title="Copy full hash" onclick="window.airLogApp.copyHash('${r.prev_hash}', event)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </td>
        <td>
          <div class="hash-cell">
            <span class="hash-badge" title="${r.curr_hash}">${currTrunc}</span>
            <button class="hash-copy-btn" title="Copy full hash" onclick="window.airLogApp.copyHash('${r.curr_hash}', event)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </td>
        <td>${statusHtml}</td>
      `;

      // Click row to open Inspector Modal
      tr.addEventListener('click', (e) => {
        // Prevent opening if copy button clicked
        if (e.target.closest('.hash-copy-btn')) return;
        this.openBlockInspector(r);
      });

      tbody.appendChild(tr);
    });
  }

  /**
   * Truncate 64-char hash for table view
   */
  truncateHash(hash) {
    if (!hash) return '--';
    const h = String(hash);
    if (h.length <= 12) return h;
    return `${h.substring(0, 6)}...${h.substring(h.length - 6)}`;
  }

  /**
   * Copy hash to clipboard with user toast
   */
  copyHash(text, event) {
    if (event) event.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`SHA-256 Hash copied to clipboard: ${this.truncateHash(text)}`, "info");
    }).catch(() => {
      this.showToast("Failed to copy hash to clipboard.", "error");
    });
  }

  /**
   * Run full verification process (Structural check + Genuine Cryptographic SHA-256)
   */
  async runVerification() {
    if (!this.records || this.records.length === 0) {
      this.showToast("No records available to verify.", "error");
      return;
    }

    const btn = document.getElementById('btnVerifyLog');
    const progressWrapper = document.getElementById('verifyProgressWrapper');
    const progressBar = document.getElementById('verifyProgressBarFill');
    const progressLabel = document.getElementById('verifyProgressLabel');
    const alertBanner = document.getElementById('tamperAlertBanner');

    if (btn) btn.disabled = true;
    if (progressWrapper) progressWrapper.classList.add('active');
    if (alertBanner) alertBanner.classList.remove('active');

    // 1. Structural Check (Instant schema & continuity pointer check)
    this.structuralReport = CryptoVerifier.performStructuralCheck(this.records);

    // Update Structural Check UI card
    const structBadge = document.getElementById('structuralStatusBadge');
    const structDesc = document.getElementById('structuralCheckDesc');
    if (structBadge) {
      if (this.structuralReport.passed) {
        structBadge.className = 'check-status-badge status-ok';
        structBadge.innerHTML = `✓ PASSED (${this.structuralReport.validRecords}/${this.structuralReport.totalRecords})`;
      } else {
        structBadge.className = 'check-status-badge status-fail';
        structBadge.innerHTML = `⚠ FAILED (${this.structuralReport.errors.length} errors)`;
      }
    }
    if (structDesc) {
      structDesc.textContent = this.structuralReport.passed
        ? "Schema structure, non-null values, 64-char hex format, and chain pointers verified."
        : `Structural anomalies detected: ${this.structuralReport.errors[0]}`;
    }

    // 2. Genuine Cryptographic SHA-256 Verification (Async with progress reporting)
    this.verificationReport = await CryptoVerifier.performCryptographicVerification(
      this.records,
      (current, total) => {
        const pct = Math.round((current / total) * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressLabel) progressLabel.textContent = `Recalculating SHA-256 digests: ${current} / ${total} (${pct}%)`;
      }
    );

    // Complete progress UI
    setTimeout(() => {
      if (progressWrapper) progressWrapper.classList.remove('active');
      if (btn) btn.disabled = false;

      this.updateVerificationUI();
      this.renderTable();
    }, 250);
  }

  /**
   * Update Integrity HUD with verification outcome
   */
  updateVerificationUI() {
    const rep = this.verificationReport;
    if (!rep) return;

    const totalEl = document.getElementById('statTotalRecords');
    const verifiedEl = document.getElementById('statVerifiedRecords');
    const timeEl = document.getElementById('statVerifyTime');
    const algoEl = document.getElementById('statCryptoAlgo');
    const shieldIcon = document.getElementById('integrityShieldIcon');
    const cryptoBadge = document.getElementById('cryptoStatusBadge');
    const cryptoDesc = document.getElementById('cryptoCheckDesc');
    const alertBanner = document.getElementById('tamperAlertBanner');
    const alertMsg = document.getElementById('tamperAlertMessage');

    if (totalEl) totalEl.textContent = rep.totalRecords;
    if (verifiedEl) verifiedEl.textContent = `${rep.verifiedCount} / ${rep.totalRecords}`;
    if (timeEl) timeEl.textContent = `${rep.elapsedMs} ms`;
    if (algoEl) algoEl.textContent = "SHA-256 (Web Crypto)";

    if (rep.passed) {
      if (shieldIcon) {
        shieldIcon.className = 'integrity-shield-icon';
        shieldIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>`;
      }
      if (cryptoBadge) {
        cryptoBadge.className = 'check-status-badge status-ok';
        cryptoBadge.innerHTML = `✓ VERIFIED (100% Cryptographic Match)`;
      }
      if (cryptoDesc) {
        cryptoDesc.textContent = `All ${rep.totalRecords} blocks cryptographically match their recalculate SHA-256 digests. Hash chain is unbroken.`;
      }
      if (alertBanner) alertBanner.classList.remove('active');

      this.showToast(`Log verification complete: All ${rep.totalRecords} records authentic (${rep.elapsedMs}ms).`, "success");
    } else {
      if (shieldIcon) {
        shieldIcon.className = 'integrity-shield-icon tampered';
        shieldIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      }
      if (cryptoBadge) {
        cryptoBadge.className = 'check-status-badge status-fail';
        cryptoBadge.innerHTML = `⚠ TAMPER DETECTED (${rep.mismatchCount} mismatches)`;
      }
      if (cryptoDesc) {
        cryptoDesc.textContent = `Hash mismatch detected at Block #${rep.firstTamperedIndex}. Data has been altered without a valid cryptographic signature!`;
      }

      if (alertBanner) {
        alertBanner.classList.add('active');
        if (alertMsg) {
          alertMsg.innerHTML = `<strong>Tamper Alert:</strong> Cryptographic integrity failure detected at <strong>Block #${rep.firstTamperedIndex}</strong>! The stored hash does not equal SHA-256(payload). Downstream chain is invalidated.`;
        }
      }

      this.showToast(`Integrity breach detected at Block #${rep.firstTamperedIndex}!`, "error");
    }
  }

  /**
   * Reset verification panel to standby/unverified state
   */
  resetVerificationUI() {
    const totalEl = document.getElementById('statTotalRecords');
    const verifiedEl = document.getElementById('statVerifiedRecords');
    const timeEl = document.getElementById('statVerifyTime');
    const shieldIcon = document.getElementById('integrityShieldIcon');
    const structBadge = document.getElementById('structuralStatusBadge');
    const structDesc = document.getElementById('structuralCheckDesc');
    const cryptoBadge = document.getElementById('cryptoStatusBadge');
    const cryptoDesc = document.getElementById('cryptoCheckDesc');
    const alertBanner = document.getElementById('tamperAlertBanner');

    if (totalEl) totalEl.textContent = this.records.length;
    if (verifiedEl) verifiedEl.textContent = `-- / ${this.records.length}`;
    if (timeEl) timeEl.textContent = `-- ms`;

    if (shieldIcon) {
      shieldIcon.className = 'integrity-shield-icon';
      shieldIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
    }

    if (structBadge) {
      structBadge.className = 'check-status-badge status-pending';
      structBadge.innerHTML = `● Ready`;
    }
    if (structDesc) {
      structDesc.textContent = "Validates CSV headers, data types, timestamp sequence, and pointer chain.";
    }

    if (cryptoBadge) {
      cryptoBadge.className = 'check-status-badge status-pending';
      cryptoBadge.innerHTML = `● Ready`;
    }
    if (cryptoDesc) {
      cryptoDesc.textContent = "Recalculates bit-exact SHA-256 for each row using the Web Crypto API.";
    }

    if (alertBanner) alertBanner.classList.remove('active');
  }

  /**
   * Simulate unauthorized data tampering (for college demonstration)
   */
  simulateTampering() {
    if (!this.records || this.records.length < 14) {
      this.showToast("Need at least 14 records to simulate tampering.", "error");
      return;
    }

    // Find block #14 or middle row
    const targetIdx = 13; // index 14
    const originalAir = this.records[targetIdx].air_quality;
    const alteredAir = (parseFloat(originalAir) === 350.0) ? 96.3 : 350.0;

    this.records[targetIdx].air_quality = alteredAir;

    this.updateKpis();
    this.updateCharts();
    this.renderTable();
    this.resetVerificationUI();

    this.showToast(`Simulated alteration injected into Block #${targetIdx + 1} (Air changed to ${alteredAir} PPM). Click "Verify Log" to test tamper detection!`, "info");
  }

  /**
   * Open Block Inspector Modal
   */
  async openBlockInspector(record) {
    const modal = document.getElementById('blockModal');
    const modalTitle = document.getElementById('modalBlockTitle');
    const modalPreimage = document.getElementById('modalPreimage');
    const modalPrevHash = document.getElementById('modalPrevHash');
    const modalRecorded = document.getElementById('modalRecordedHash');
    const modalComputed = document.getElementById('modalComputedHash');
    const modalVerdict = document.getElementById('modalVerdict');

    if (!modal) return;

    modalTitle.textContent = `Block #${record.index} Cryptographic Inspector`;
    const preimage = CryptoVerifier.getPreimage(record);
    modalPreimage.textContent = preimage;
    modalPrevHash.textContent = record.prev_hash;
    modalRecorded.textContent = record.curr_hash;

    const computed = await CryptoVerifier.computeSHA256(preimage);
    modalComputed.textContent = computed;

    const matches = (computed.toLowerCase() === String(record.curr_hash).toLowerCase());

    if (matches) {
      modalComputed.className = 'hash-val-text match';
      modalVerdict.innerHTML = `<span class="sensor-status-pill pill-good">✓ Cryptographic Match (Authentic Block)</span>`;
    } else {
      modalComputed.className = 'hash-val-text mismatch';
      modalVerdict.innerHTML = `<span class="sensor-status-pill pill-alert">⚠ Cryptographic Mismatch (Block Tampered!)</span>`;
    }

    modal.classList.add('active');
  }

  /**
   * Export current dataset to CSV
   */
  exportCurrentData() {
    if (!this.records || this.records.length === 0) {
      this.showToast("No records to export.", "error");
      return;
    }
    const csvContent = CSVHandler.serialize(this.records);
    const fname = `AIRLOG_EXPORT_${new Date().toISOString().slice(0, 10)}.csv`;
    CSVHandler.downloadFile(csvContent, fname);
    this.showToast(`Exported ${this.records.length} records to ${fname}`, "success");
  }

  /**
   * Download sample CSV files
   */
  downloadStaticSample(isTampered = false) {
    const fname = isTampered ? 'tampered_airlog_sample.csv' : 'sample_airlog_data.csv';
    const link = document.createElement('a');
    link.href = fname;
    link.download = fname;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast(`Downloading ${fname}`, "info");
  }

  /**
   * Toast notification display
   */
  showToast(message, type = "info") {
    let toast = document.getElementById('hudToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hudToast';
      toast.className = 'toast-hud';
      document.body.appendChild(toast);
    }

    toast.className = `toast-hud ${type === 'error' ? 'toast-error' : (type === 'success' ? 'toast-success' : '')}`;
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'error' ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>' : '<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>'}
      </svg>
      <span>${message}</span>
    `;

    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3800);
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.airLogApp = new AirLogApp();
});
