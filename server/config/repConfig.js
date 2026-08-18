/**
 * Rep Configuration — Single Source of Truth
 * 
 * Centralizes all sales rep handle mappings, display names, and status flags.
 * Every service and route that needs rep identity should import from here
 * instead of maintaining inline copies.
 * 
 * Status values:
 *   - 'active'   — Current sales rep, appears in dashboards and scorecards
 *   - 'inactive' — No longer employed, filtered from current views
 *   - 'excluded' — Not a sales role (e.g. dealer services, corporate accounts)
 * 
 * Type values (for active reps):
 *   - 'field'  — Outside field sales rep
 *   - 'inside' — Inside sales rep
 * 
 * @module config/repConfig
 */

const REPS = {
    // ── Active Field Reps ─────────────────────────────────────────────
    'George Ott':         { handles: ['gott', 'george'], status: 'active', type: 'field' },
    'Janet Harrington':   { handles: ['jharrington1', 'jharrington', 'janet'], status: 'active', type: 'field' },
    'Jeff Smith':         { handles: ['jsmith'], status: 'active', type: 'field' },
    'Jeff Weller':        { handles: ['jweller', 'jeff'], status: 'active', type: 'field' },
    'Ward Stoutimore':    { handles: ['wstoutimore', 'ward'], status: 'active', type: 'field' },
    'Pam Carter':         { handles: ['pcarter', 'pam'], status: 'active', type: 'field' },
    'Larry Jablonoski':   { handles: ['ljablonoski', 'larryj'], status: 'active', type: 'field' },
    'John Rubi':          { handles: ['jrubi', 'john'], status: 'active', type: 'field' },

    // ── Active Inside Reps ────────────────────────────────────────────
    'Ericka Dominguez':   { handles: ['edominguez', 'ericka'], status: 'active', type: 'inside' },
    'Genevieve Coulombe': { handles: ['gcoulombe', 'genevieve'], status: 'active', type: 'inside' },
    'Dan Zilberchtein':   { handles: ['dzilberchtein', 'daniilz', 'danillz'], status: 'active', type: 'inside' },

    // ── Inactive (No Longer Employed) ─────────────────────────────────
    'Bruce Sweere':   { handles: ['bsweere', 'bruce'], status: 'inactive', reason: 'No longer employed' },
    'Tony DeRouin':   { handles: ['tderouin', 'tony'], status: 'inactive', reason: 'No longer employed' },
    'Steve Kimble':   { handles: ['skimble', 'steve'], status: 'inactive', reason: 'No longer employed' },
    'N Boly':         { handles: ['nboly'], status: 'inactive', reason: 'No longer employed' },

    // ── Corporate House Portfolio ──────────────────────────────────────
    'S1 House':       { handles: ['s1house', 'house'], status: 'active', type: 'house' },

    // ── Excluded (Not Sales) ──────────────────────────────────────────
    'Mandi Schultz':  { handles: ['mschultz1', 'mschultz', 'mandi', 'mandy'], status: 'excluded', reason: 'Dealer services — no sales' },
};

// ──────────────────────────────────────────────────────────────────────
// Derived lookups (computed once at module load)
// ──────────────────────────────────────────────────────────────────────

/** handle (lowercase) → full display name */
const _handleToName = {};

/** handle (lowercase) → rep config object */
const _handleToConfig = {};

for (const [displayName, config] of Object.entries(REPS)) {
    for (const handle of config.handles) {
        const key = handle.toLowerCase();
        _handleToName[key] = displayName;
        _handleToConfig[key] = { ...config, displayName };
    }
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the REP_ALIAS_MAP used by analytics routes and services.
 * Maps display key → array of handles.
 * Only includes active reps by default.
 * 
 * @param {{ includeInactive?: boolean, includeExcluded?: boolean }} options
 * @returns {Object} e.g. { 'george': ['gott', 'george'], ... }
 */
function getRepAliasMap(options = {}) {
    const { includeInactive = false, includeExcluded = false } = options;
    const map = {};
    for (const [displayName, config] of Object.entries(REPS)) {
        if (config.status === 'inactive' && !includeInactive) continue;
        if (config.status === 'excluded' && !includeExcluded) continue;
        // Key is first handle (primary identifier)
        const key = config.handles[0];
        map[key] = [...config.handles];
    }
    return map;
}

/**
 * Get handle → display name map for resolving raw handles to readable names.
 * Includes ALL reps (active, inactive, excluded) so historical data resolves correctly.
 * 
 * @returns {Object} e.g. { 'gott': 'George Ott', 'edominguez': 'Ericka Dominguez', ... }
 */
function getRepDisplayMap() {
    return { ..._handleToName };
}

/**
 * Resolve a raw handle/email to a display name.
 * Handles email addresses (strips @domain), trailing numbers, etc.
 * Returns the original string capitalized if no match found.
 * 
 * @param {string} rawStr - Raw handle, email, or name
 * @returns {string|null} Display name
 */
function resolveRepName(rawStr) {
    if (!rawStr) return null;
    let str = rawStr.trim().toLowerCase();
    // Strip email domain
    if (str.includes('@')) {
        str = str.split('@')[0].trim();
    }
    // Try exact match first
    if (_handleToName[str]) return _handleToName[str];
    // Try without trailing digits (e.g. 'jharrington1' → 'jharrington')
    const strNoNum = str.replace(/[0-9]/g, '');
    if (_handleToName[strNoNum]) return _handleToName[strNoNum];
    // Fallback: capitalize first letter
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get all handles for a rep by display key or display name.
 * 
 * @param {string} repInput - Display key (e.g. 'george') or name filter
 * @returns {string[]} Array of handles, or [repInput] if not found
 */
function getRepHandles(repInput) {
    if (!repInput) return [];
    const inputClean = repInput.trim().toLowerCase();

    // 1. Direct display name lookup in REPS
    for (const [displayName, config] of Object.entries(REPS)) {
        if (displayName.toLowerCase() === inputClean) {
            return [...config.handles];
        }
    }

    // 2. Try alias map lookup (by primary handle)
    const aliasMap = getRepAliasMap();
    if (aliasMap[inputClean]) return aliasMap[inputClean];

    // 3. Try full map (including inactive / excluded)
    const fullMap = getRepAliasMap({ includeInactive: true, includeExcluded: true });
    if (fullMap[inputClean]) return fullMap[inputClean];

    return [repInput.trim()];
}

function isExcludedRep(rawStr) {
    if (!rawStr) return false;
    let str = rawStr.trim().toLowerCase();
    if (str.includes('@')) str = str.split('@')[0].trim();
    for (const [name, config] of Object.entries(REPS)) {
        if (name.toLowerCase() === str || config.handles.map(h => h.toLowerCase()).includes(str)) {
            return config.status === 'excluded';
        }
    }
    const config = _handleToConfig[str];
    return config ? config.status === 'excluded' : false;
}

function isInactiveRep(rawStr) {
    if (!rawStr) return false;
    let str = rawStr.trim().toLowerCase();
    if (str.includes('@')) str = str.split('@')[0].trim();
    for (const [name, config] of Object.entries(REPS)) {
        if (name.toLowerCase() === str || config.handles.map(h => h.toLowerCase()).includes(str)) {
            return config.status === 'inactive';
        }
    }
    const config = _handleToConfig[str];
    return config ? config.status === 'inactive' : false;
}

/**
 * Get list of active rep display names for UI dropdowns.
 * 
 * @returns {string[]} Sorted array of active rep display names
 */
function getActiveRepNames() {
    return Object.entries(REPS)
        .filter(([, config]) => config.status === 'active')
        .map(([name]) => name)
        .sort();
}

/**
 * Get the full REPS config (for admin/diagnostic views).
 * 
 * @returns {Object}
 */
function getAllReps() {
    return { ...REPS };
}

module.exports = {
    REPS,
    getRepAliasMap,
    getRepDisplayMap,
    resolveRepName,
    getRepHandles,
    isExcludedRep,
    isInactiveRep,
    getActiveRepNames,
    getAllReps
};
