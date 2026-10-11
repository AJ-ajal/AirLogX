/**
 * AIRLOG X - CSV Parser & Serializer
 * Robust client-side RFC-4180 compliant CSV parser and exporter.
 */

class CSVHandler {
  /**
   * Parse CSV string into an array of structured record objects
   * @param {string} csvText
   * @returns {{ records: Array<Object>, errors: Array<string>, meta: Object }}
   */
  static parse(csvText) {
    const result = {
      records: [],
      errors: [],
      meta: {
        rawRowCount: 0,
        parsedCount: 0,
        headers: []
      }
    };

    if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
      result.errors.push("Provided CSV file is empty.");
      return result;
    }

    // Split rows handling CRLF and LF
    const rawLines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0);

    result.meta.rawRowCount = lines.length;

    if (lines.length < 2) {
      result.errors.push("CSV must contain at least a header row and one data record.");
      return result;
    }

    // Parse header
    const headerLine = lines[0];
    const rawHeaders = this.splitCsvRow(headerLine).map(h => h.trim().toLowerCase());
    result.meta.headers = rawHeaders;

    // Map column aliases to canonical keys
    const columnMap = this.mapHeaders(rawHeaders);

    const missingKeys = [];
    if (columnMap.index === undefined) missingKeys.push("index (#)");
    if (columnMap.date === undefined) missingKeys.push("date");
    if (columnMap.time === undefined) missingKeys.push("time");
    if (columnMap.air_quality === undefined) missingKeys.push("air_quality (ppm)");
    if (columnMap.temperature === undefined) missingKeys.push("temperature (°C)");
    if (columnMap.pressure === undefined) missingKeys.push("pressure (hPa)");
    if (columnMap.prev_hash === undefined) missingKeys.push("prev_hash");
    if (columnMap.curr_hash === undefined) missingKeys.push("curr_hash");

    if (missingKeys.length > 0) {
      result.errors.push(`Missing required CSV columns: ${missingKeys.join(", ")}`);
      return result;
    }

    // Parse records
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = this.splitCsvRow(line);

      if (cols.length < rawHeaders.length) {
        // Skip incomplete lines or record error
        result.errors.push(`Row ${i + 1} has insufficient columns (${cols.length}/${rawHeaders.length}).`);
        continue;
      }

      const rec = {
        index: parseInt(cols[columnMap.index].trim(), 10) || i,
        date: cols[columnMap.date].trim(),
        time: cols[columnMap.time].trim(),
        air_quality: parseFloat(cols[columnMap.air_quality].trim()) || 0,
        temperature: parseFloat(cols[columnMap.temperature].trim()) || 0,
        pressure: parseFloat(cols[columnMap.pressure].trim()) || 0,
        prev_hash: cols[columnMap.prev_hash].trim(),
        curr_hash: cols[columnMap.curr_hash].trim()
      };

      result.records.push(rec);
    }

    result.meta.parsedCount = result.records.length;
    return result;
  }

  /**
   * Robust CSV row splitter accounting for double quotes
   * @param {string} line
   * @returns {Array<string>}
   */
  static splitCsvRow(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  /**
   * Map header aliases to canonical keys
   * @param {Array<string>} headers
   * @returns {Object}
   */
  static mapHeaders(headers) {
    const map = {};

    headers.forEach((h, idx) => {
      const clean = h.replace(/[^a-z0-9_]/g, '');

      if (['index', 'id', 'record', 'idx', 'no', 'num'].includes(clean)) {
        map.index = idx;
      } else if (['date', 'log_date', 'timestamp_date'].includes(clean)) {
        map.date = idx;
      } else if (['time', 'log_time', 'timestamp_time'].includes(clean)) {
        map.time = idx;
      } else if (['air_quality', 'airquality', 'air', 'ppm', 'mq135', 'aqi', 'airval'].includes(clean)) {
        map.air_quality = idx;
      } else if (['temperature', 'temp', 'celsius', 'bmp280_temp'].includes(clean)) {
        map.temperature = idx;
      } else if (['pressure', 'press', 'hpa', 'baro', 'bmp280_press'].includes(clean)) {
        map.pressure = idx;
      } else if (['prev_hash', 'prevhash', 'previous_hash', 'previoushash'].includes(clean)) {
        map.prev_hash = idx;
      } else if (['curr_hash', 'currhash', 'currenthash', 'current_hash', 'hash', 'block_hash'].includes(clean)) {
        map.curr_hash = idx;
      }
    });

    return map;
  }

  /**
   * Serialize record list to CSV string
   * @param {Array<Object>} records
   * @returns {string}
   */
  static serialize(records) {
    const headers = ["index", "date", "time", "air_quality", "temperature", "pressure", "prev_hash", "curr_hash"];
    const rows = [headers.join(",")];

    for (const r of records) {
      const row = [
        r.index,
        r.date,
        r.time,
        typeof r.air_quality === 'number' ? r.air_quality.toFixed(1) : r.air_quality,
        typeof r.temperature === 'number' ? r.temperature.toFixed(1) : r.temperature,
        typeof r.pressure === 'number' ? r.pressure.toFixed(1) : r.pressure,
        r.prev_hash,
        r.curr_hash
      ];
      rows.push(row.join(","));
    }

    return rows.join("\n");
  }

  /**
   * Trigger browser file download for a given text content
   * @param {string} content
   * @param {string} filename
   * @param {string} mimeType
   */
  static downloadFile(content, filename, mimeType = "text/csv;charset=utf-8;") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CSVHandler };
}
