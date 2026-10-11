/**
 * AIRLOG X - Cryptographic Verification Engine
 * Implements genuine SHA-256 hashing via browser Web Crypto API (crypto.subtle)
 * and structural schema validation for tamper-evident IoT log chains.
 */

class CryptoVerifier {
  /**
   * Compute standard SHA-256 hash using native browser Web Crypto API
   * @param {string} message
   * @returns {Promise<string>} 64-character lowercase hex string
   */
  static async computeSHA256(message) {
    if (window.crypto && window.crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (err) {
        console.warn("crypto.subtle failed, falling back to JS implementation:", err);
      }
    }
    return this.sha256PureJs(message);
  }

  /**
   * Pure JS RFC-6234 SHA-256 implementation as a fallback for offline / file:// contexts
   * @param {string} ascii
   * @returns {string}
   */
  static sha256PureJs(ascii) {
    const rightRotate = (v, amt) => (v >>> amt) | (v << (32 - amt));
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    const utf8 = unescape(encodeURIComponent(ascii));
    const utf8BitLength = utf8.length * 8;
    const words = [];

    for (let i = 0; i < utf8.length; i++) {
      words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << ((3 - (i % 4)) * 8);
    }

    words[utf8BitLength >> 5] |= 0x80 << (24 - (utf8BitLength % 32));
    words[(((utf8BitLength + 64) >> 9) << 4) + 15] = utf8BitLength;

    const w = new Array(64);
    for (let i = 0; i < words.length; i += 16) {
      let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
      let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

      for (let j = 0; j < 64; j++) {
        if (j < 16) {
          w[j] = words[i + j] | 0;
        } else {
          const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
        }

        const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & f) ^ ((~e) & g);
        const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
        const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + maj) | 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) | 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) | 0;
      }

      hash[0] = (hash[0] + a) | 0;
      hash[1] = (hash[1] + b) | 0;
      hash[2] = (hash[2] + c) | 0;
      hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0;
      hash[5] = (hash[5] + f) | 0;
      hash[6] = (hash[6] + g) | 0;
      hash[7] = (hash[7] + h) | 0;
    }

    let result = '';
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j >= 0; j--) {
        const byte = (hash[i] >> (8 * j)) & 255;
        result += (byte < 16 ? '0' : '') + byte.toString(16);
      }
    }
    return result;
  }

  /**
   * Constructs canonical preimage string used for hashing a record
   * Format: index,date,time,air_quality,temperature,pressure,prev_hash
   * @param {Object} record
   * @returns {string}
   */
  static getPreimage(record) {
    const idx = String(record.index).trim();
    const date = String(record.date).trim();
    const time = String(record.time).trim();
    const air = String(record.air_quality).trim();
    const temp = String(record.temperature).trim();
    const pres = String(record.pressure).trim();
    const prev = String(record.prev_hash).trim();
    return `${idx},${date},${time},${air},${temp},${pres},${prev}`;
  }

  /**
   * Perform structural validation (schema, types, continuity pointers)
   * This is a STRUCTURAL CHECK only, distinct from cryptographic verification.
   * @param {Array<Object>} records
   * @returns {Object} Structural validation result
   */
  static performStructuralCheck(records) {
    const report = {
      type: "STRUCTURAL_CHECK",
      passed: true,
      totalRecords: records.length,
      validRecords: 0,
      errors: [],
      chainContinuityPassed: true
    };

    if (!records || records.length === 0) {
      report.passed = false;
      report.errors.push("Dataset is empty. No records to validate.");
      return report;
    }

    const sha256Regex = /^[0-9a-fA-F]{64}$/;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const rowNum = i + 1;
      const rowErrors = [];

      // Check required fields
      const required = ['index', 'date', 'time', 'air_quality', 'temperature', 'pressure', 'prev_hash', 'curr_hash'];
      for (const field of required) {
        if (r[field] === undefined || r[field] === null || String(r[field]).trim() === "") {
          rowErrors.push(`Row ${rowNum}: Missing mandatory field '${field}'.`);
        }
      }

      // Check numbers
      if (isNaN(Number(r.air_quality))) {
        rowErrors.push(`Row ${rowNum}: Invalid air_quality value (${r.air_quality}). Must be numeric.`);
      }
      if (isNaN(Number(r.temperature))) {
        rowErrors.push(`Row ${rowNum}: Invalid temperature value (${r.temperature}). Must be numeric.`);
      }
      if (isNaN(Number(r.pressure))) {
        rowErrors.push(`Row ${rowNum}: Invalid pressure value (${r.pressure}). Must be numeric.`);
      }

      // Check Hash format (64-char hex)
      if (r.prev_hash && !sha256Regex.test(String(r.prev_hash).trim())) {
        rowErrors.push(`Row ${rowNum}: prev_hash is not a valid 64-character hexadecimal SHA-256 string.`);
      }
      if (r.curr_hash && !sha256Regex.test(String(r.curr_hash).trim())) {
        rowErrors.push(`Row ${rowNum}: curr_hash is not a valid 64-character hexadecimal SHA-256 string.`);
      }

      // Check Chain Pointer Continuity (prev_hash[i] must equal curr_hash[i-1])
      if (i > 0) {
        const prevRec = records[i - 1];
        if (String(r.prev_hash).trim().toLowerCase() !== String(prevRec.curr_hash).trim().toLowerCase()) {
          report.chainContinuityPassed = false;
          rowErrors.push(`Row ${rowNum}: Pointer broken! prev_hash does not match Row ${rowNum - 1}'s curr_hash.`);
        }
      }

      if (rowErrors.length > 0) {
        report.passed = false;
        report.errors.push(...rowErrors);
      } else {
        report.validRecords++;
      }
    }

    return report;
  }

  /**
   * Perform genuine cryptographic SHA-256 verification of the entire log chain.
   * Recalculates hash for each block using Web Crypto API.
   * @param {Array<Object>} records
   * @param {Function} [onProgress] Optional callback (index, total, currentResult)
   * @returns {Promise<Object>} Cryptographic verification report
   */
  static async performCryptographicVerification(records, onProgress = null) {
    const startTime = performance.now();
    const report = {
      type: "GENUINE_CRYPTOGRAPHIC_SHA256",
      passed: true,
      totalRecords: records.length,
      verifiedCount: 0,
      mismatchCount: 0,
      brokenChainCount: 0,
      firstTamperedIndex: null,
      details: [],
      elapsedMs: 0
    };

    if (!records || records.length === 0) {
      report.passed = false;
      return report;
    }

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const preimage = this.getPreimage(r);
      const computedHash = await this.computeSHA256(preimage);
      const recordedHash = String(r.curr_hash || "").trim().toLowerCase();

      const hashMatches = (computedHash === recordedHash);
      let pointerIntact = true;

      if (i > 0) {
        const prevRecorded = String(records[i - 1].curr_hash || "").trim().toLowerCase();
        const prevPointer = String(r.prev_hash || "").trim().toLowerCase();
        pointerIntact = (prevPointer === prevRecorded);
      }

      const isGenesis = (i === 0);
      const isAuthentic = hashMatches && (isGenesis || pointerIntact);

      const recordResult = {
        index: r.index,
        rowNum: i + 1,
        preimage,
        recordedHash,
        computedHash,
        hashMatches,
        pointerIntact,
        isGenesis,
        isAuthentic
      };

      report.details.push(recordResult);

      if (isAuthentic) {
        report.verifiedCount++;
      } else {
        report.passed = false;
        if (!hashMatches) report.mismatchCount++;
        if (!pointerIntact) report.brokenChainCount++;

        if (report.firstTamperedIndex === null) {
          report.firstTamperedIndex = r.index;
        }
      }

      if (typeof onProgress === 'function') {
        onProgress(i + 1, records.length, recordResult);
      }
    }

    report.elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;
    return report;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CryptoVerifier };
}
