/**
 * CSV Parser Service
 * 
 * Generic, reusable CSV parser that handles edge cases (quoted fields with commas,
 * empty values, BOM characters) and validates headers against registered schemas.
 * 
 * Uses a registry pattern so future CSV formats can be added without touching
 * existing code — just call registerParser() with the new format's expected headers.
 * 
 * @module services/csvParserService
 */

/**
 * Registry of known CSV formats.
 * Key = parser name, Value = { expectedHeaders: string[], description: string }
 * @type {Map<string, { expectedHeaders: string[], description: string }>}
 */
const parserRegistry = new Map();

/**
 * Parse a CSV string into structured rows.
 * 
 * Handles:
 * - Quoted fields containing commas (e.g. "Family Boating & Marine Centers of FLA, Inc.")
 * - Empty values → null
 * - BOM characters at the start of the file
 * - Trailing whitespace and carriage returns
 * 
 * @param {string} csvString - Raw CSV content
 * @param {string[]} [expectedHeaders] - Optional list of expected column headers for validation
 * @returns {{ headers: string[], rows: Object[] }} Parsed headers and row objects keyed by header name
 * @throws {Error} If CSV is empty, has no headers, or headers don't match expected
 */
function parseCSV(csvString, expectedHeaders = null) {
    if (!csvString || typeof csvString !== 'string') {
        throw new Error('CSV content is empty or not a string');
    }

    // Strip BOM character if present
    let cleaned = csvString.replace(/^\uFEFF/, '');

    // Split into lines, trim trailing whitespace/CR, filter empty lines
    const lines = cleaned
        .split('\n')
        .map(line => line.replace(/\r$/, '').trimEnd())
        .filter(line => line.length > 0);

    if (lines.length === 0) {
        throw new Error('CSV content has no lines');
    }

    // Parse header row
    const headers = parseCsvLine(lines[0]);

    if (headers.length === 0) {
        throw new Error('CSV header row is empty');
    }

    // Validate against expected headers if provided
    if (expectedHeaders) {
        const missing = expectedHeaders.filter(h => !headers.includes(h));
        if (missing.length > 0) {
            throw new Error(
                `CSV is missing expected headers: ${missing.join(', ')}. ` +
                `Found headers: ${headers.join(', ')}`
            );
        }
    }

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);

        // Skip rows that don't match header count (malformed)
        if (values.length !== headers.length) {
            console.warn(
                `CSV row ${i + 1}: expected ${headers.length} columns but got ${values.length}, skipping`
            );
            continue;
        }

        const row = {};
        for (let j = 0; j < headers.length; j++) {
            // Convert empty strings to null
            row[headers[j]] = values[j] === '' ? null : values[j];
        }
        rows.push(row);
    }

    return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted fields with embedded commas.
 * 
 * @param {string} line - A single CSV line
 * @returns {string[]} Array of field values
 */
function parseCsvLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Escaped quote inside quoted field
                current += '"';
                i++; // Skip next quote
            } else if (char === '"') {
                // End of quoted field
                inQuotes = false;
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                // Start of quoted field
                inQuotes = true;
            } else if (char === ',') {
                // Field separator
                fields.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }

    // Push the last field
    fields.push(current.trim());

    return fields;
}

/**
 * Register a known CSV format in the parser registry.
 * 
 * @param {string} name - Unique parser name (e.g. 'dealer_metrics')
 * @param {{ expectedHeaders: string[], description: string }} config - Parser config
 */
function registerParser(name, config) {
    if (!config.expectedHeaders || !Array.isArray(config.expectedHeaders)) {
        throw new Error(`Parser "${name}" must have an expectedHeaders array`);
    }
    parserRegistry.set(name, config);
}

/**
 * Detect which registered parser matches the given CSV headers.
 * 
 * @param {string[]} headers - The CSV header row values
 * @returns {string|null} Name of the matching parser, or null if no match
 */
function detectParser(headers) {
    for (const [name, config] of parserRegistry) {
        const allPresent = config.expectedHeaders.every(h => headers.includes(h));
        if (allPresent) {
            return name;
        }
    }
    return null;
}

/**
 * Get a registered parser's config by name.
 * 
 * @param {string} name - Parser name
 * @returns {{ expectedHeaders: string[], description: string }|null}
 */
function getParser(name) {
    return parserRegistry.get(name) || null;
}

// ==========================================
// Pre-register known CSV formats
// ==========================================

registerParser('dealer_metrics', {
    description: 'Daily dealer application/approval/booking metrics from Source One',
    expectedHeaders: [
        'DEALER ID',
        'DEALER NAME',
        'LAST APPLICATION DATE',
        'PRIOR APPLICATION DATE',
        'DAYS SINCE LAST APPLICATION',
        'LAST APPROVAL DATE',
        'DAYS SINCE LAST APPROVAL',
        'LAST BOOKED DATE',
        'DAYS SINCE LAST BOOKING',
        'APPLICATION ACTIVITY STATUS',
        'LATEST COMMUNICATION DATETIME',
        'REACTIVATED AFTER SALES VISIT FLAG',
        'DAYS FROM VISIT TO NEXT APPLICATION'
    ]
});

module.exports = {
    parseCSV,
    registerParser,
    detectParser,
    getParser
};
