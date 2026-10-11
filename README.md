# AIRLOG X — Secure Air Quality Monitoring & Tamper-Evident Data Logging System

A high-assurance, dark-themed IoT environmental monitoring dashboard and cryptographic ledger verification system developed for college project demonstration.

![AIRLOG X Dashboard](index.html)

---

## 🛡️ System Overview

**AIRLOG X** pairs embedded environmental telemetry with blockchain-inspired cryptographic hash-chaining to create an immutable, tamper-evident audit trail for air quality and atmospheric readings.

### Hardware Architecture

| Component | Part Number | Interface | Function & Specification |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | STM32F411CEU6 "BlackPill" | Core System | ARM Cortex-M4F @ 100MHz, 512KB Flash, 128KB SRAM |
| **Air Quality** | MQ-135 Sensor | ADC Ch 0 (Analog) | Detects NH₃, NOx, Alcohol, Benzene, Smoke, CO₂ (PPM) |
| **Barometric Pressure** | Bosch BMP280 | I2C (Address `0x76`) | 300–1100 hPa Barometric Pressure |
| **Temperature** | Bosch BMP280 | I2C (Address `0x76`) | -40°C to +85°C Ambient Temperature (±0.5°C) |
| **Real-Time Clock** | Maxim DS3231 | I2C (Address `0x68`) | TCXO Quartz (±2 ppm accuracy) with CR2032 backup |
| **Secure Storage** | MicroSD Card Module | SPI Bus | FAT32 append-only cryptographic ledger (`AIRLOG.CSV`) |
| **Telemetry Channel** | USB CDC Virtual COM | Full-Speed USB | 12 Mbps virtual serial port (Standby for physical link) |

---

## ⚡ How to Launch the Dashboard

### Method 1: One-Click Launch (Recommended)
Double-click `start_dashboard.bat` or run the following command in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File start_dashboard.ps1
```

This launches a zero-dependency local web server at `http://localhost:8080/` and opens your default web browser automatically.

### Method 2: Direct File Open
You can also open `index.html` directly:
```powershell
Start-Process index.html
```

---

## 🔒 Cryptographic Tamper-Evidence Model

Each telemetry record constitutes an immutable block linked to its predecessor via SHA-256 hash chaining:

$$H_i = \text{SHA-256}(\text{Index}_i \parallel \text{Date}_i \parallel \text{Time}_i \parallel \text{Air}_i \parallel \text{Temp}_i \parallel \text{Pressure}_i \parallel H_{i-1})$$

- **Genesis Block ($i = 1$)**: Linked to a 64-zero root hash: `0000000000000000000000000000000000000000000000000000000000000000`
- **Subsequent Blocks ($i > 1$)**: Contains `prev_hash` equal to the `curr_hash` of block $i-1$.

### Structural Check vs. Genuine Cryptographic SHA-256 Verification

The dashboard clearly differentiates between two distinct verification tiers:

1. **Structural Format Check**:
   - Validates CSV schema headers, presence of mandatory fields, and non-empty rows.
   - Asserts numeric types for sensor readings and 64-character hexadecimal regex for hashes.
   - Checks pointer continuity (`prev_hash[i] === curr_hash[i-1]`).
   - *Note*: An attacker who modifies sensor values without breaking schema will **pass** this check.

2. **Genuine Cryptographic Verification (SHA-256)**:
   - Uses the browser's native **Web Crypto API** (`crypto.subtle.digest`) to recalculate the bit-for-bit SHA-256 digest of `index,date,time,air,temp,pres,prev_hash`.
   - Compares the recalculated hash with the stored `curr_hash`.
   - **Immediately exposes unauthorized data modifications**, pinpoints the exact tampered row, and flags subsequent blocks as untrusted.

---

## 🧪 Demonstration & Testing Guide

Two ready-to-use CSV files are included in the repository for review:

1. **`sample_airlog_data.csv`**
   - 25 authentic sensor telemetry entries with mathematically verified SHA-256 hash chains.
   - When verified: **100% Cryptographic Match** (Green status, zero errors).

2. **`tampered_airlog_sample.csv`**
   - Identical structure, but **Block #14 has an altered Air Quality reading** (350.0 PPM instead of 96.3 PPM) without recalculating the hash.
   - Structural Check: **PASSED** (all formats, types, and pointers look valid).
   - Cryptographic Check: **TAMPER DETECTED at Block #14!**
   - Click **Verify Log Chain** to see the scanner locate the tampered block in real-time.

3. **Live "Simulate Tamper" Button**:
   - Click the red **Simulate Tamper** button in the dashboard header to inject simulated corruption on the fly and test the verification engine during viva / demonstration.

---

## 📁 Repository Structure

```
AirLogX/
├── index.html                   # Master Dashboard UI
├── css/
│   └── style.css                # Futuristic Cyber-Dark theme & responsive layout
├── js/
│   ├── app.js                   # Application state, charts, and event coordination
│   ├── crypto-verifier.js       # Web Crypto SHA-256 & Structural validation engine
│   ├── csv-parser.js            # Client-side RFC-4180 CSV parser and serializer
│   └── sample-data.js           # Pre-computed 25-block benchmark dataset
├── vendor/
│   └── chart.umd.min.js         # Offline-bundled Chart.js 4.4 library
├── sample_airlog_data.csv       # Verified authentic sample CSV
├── tampered_airlog_sample.csv   # Tampered test CSV (Block #14 corrupted)
├── start_dashboard.ps1          # Zero-dependency PowerShell HTTP server
├── start_dashboard.bat          # Double-click Windows launcher
└── README.md                    # Project documentation
```

---

## 🚀 Future Roadmap: STM32 Hardware Integration

The planned workflow for hardware deployment:
1. **STM32 Firmware**: Reads sensors (MQ-135 via ADC, BMP280 and DS3231 via I2C), writes append-only records to MicroSD via SPI.
2. **USB Communication**: The STM32 exposes a USB CDC Virtual COM port.
3. **Dashboard Link**: The dashboard will connect directly to the USB COM port via the browser **Web Serial API** (`navigator.serial.requestPort()`) to stream live logs from the hardware into the cryptographic verification engine.
