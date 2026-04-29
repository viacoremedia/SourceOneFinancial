import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Global buffer for console logs.
 * Intercepts console.log, console.warn, and console.error to buffer the last
 * 50 entries with timestamps and type labels for inclusion in bug reports.
 */
const MAX_LOGS = 50;
const logBuffer: string[] = [];

// Store original console methods
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

/**
 * Intercepts console methods to buffer logs
 */
const interceptLogs = () => {
    const formatLog = (type: string, args: any[]) => {
        const timestamp = new Date().toISOString();
        const content = args.map(arg => {
            if (typeof arg === 'string') return arg;
            try {
                const s = JSON.stringify(arg);
                return s && s.length > 500 ? s.slice(0, 500) + '…' : s;
            } catch {
                return String(arg);
            }
        }).join(' ');
        return `[${timestamp}] [${type}] ${content}`;
    };

    console.log = (...args) => {
        logBuffer.push(formatLog('LOG', args));
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        originalLog.apply(console, args);
    };

    console.error = (...args) => {
        logBuffer.push(formatLog('ERROR', args));
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        originalError.apply(console, args);
    };

    console.warn = (...args) => {
        logBuffer.push(formatLog('WARN', args));
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        originalWarn.apply(console, args);
    };
};

/**
 * Get a snapshot of the buffered console logs for bug reports.
 */
export const getBufferedLogs = () => [...logBuffer];

/**
 * RouteTracker handles tracking the previous path and buffering console logs.
 * Mount this component once inside a Router context — it renders nothing visible.
 */
export const RouteTracker = () => {
    const location = useLocation();
    const prevPathRef = useRef<string | null>(null);

    useEffect(() => {
        // Guard against React StrictMode double-mount patching console twice
        if (!(console.log as any).__routeTrackerPatched) {
            interceptLogs();
            (console.log as any).__routeTrackerPatched = true;
        }

        return () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
            (console.log as any).__routeTrackerPatched = false;
        };
    }, []);

    useEffect(() => {
        // Track previous path for bug report context
        if (prevPathRef.current) {
            sessionStorage.setItem('prev_path', prevPathRef.current);
        }
        prevPathRef.current = location.pathname + location.search;
    }, [location]);

    return null;
};
