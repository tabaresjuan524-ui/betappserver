/**
 * Logger utility to capture console output to file
 * This intercepts console.log, console.error, etc. and writes to both console and file
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Generate timestamp-based filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFileName = `scraper-log-${timestamp}.txt`;
const logFilePath = path.join(logsDir, logFileName);

// Create write stream
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Store original console methods
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
};

// Helper to format log entry with timestamp
function formatLogEntry(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    
    return `[${timestamp}] [${level}] ${message}\n`;
}

// Override console methods
console.log = function(...args) {
    const logEntry = formatLogEntry('LOG', args);
    logStream.write(logEntry);
    originalConsole.log.apply(console, args);
};

console.error = function(...args) {
    const logEntry = formatLogEntry('ERROR', args);
    logStream.write(logEntry);
    originalConsole.error.apply(console, args);
};

console.warn = function(...args) {
    const logEntry = formatLogEntry('WARN', args);
    logStream.write(logEntry);
    originalConsole.warn.apply(console, args);
};

console.info = function(...args) {
    const logEntry = formatLogEntry('INFO', args);
    logStream.write(logEntry);
    originalConsole.info.apply(console, args);
};

console.debug = function(...args) {
    const logEntry = formatLogEntry('DEBUG', args);
    logStream.write(logEntry);
    originalConsole.debug.apply(console, args);
};

// Log startup message
console.log(`📝 Logging enabled - saving to: ${logFilePath}`);
console.log(`📁 Log file: ${logFileName}`);
console.log('━'.repeat(80));

// Handle process exit to close stream gracefully
process.on('exit', () => {
    console.log('━'.repeat(80));
    console.log(`📝 Log saved to: ${logFilePath}`);
    logStream.end();
});

process.on('SIGINT', () => {
    console.log('\n📝 Saving logs before exit...');
    logStream.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    const logEntry = formatLogEntry('FATAL', ['Uncaught Exception:', err.stack || err]);
    logStream.write(logEntry);
    originalConsole.error('Uncaught Exception:', err);
    logStream.end();
    process.exit(1);
});

module.exports = {
    logFilePath,
    logFileName
};
