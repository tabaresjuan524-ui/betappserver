/**
 * View Latest Log - Quick utility to display the most recent log file
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logsDir)) {
    console.error('❌ No logs directory found');
    process.exit(1);
}

const logFiles = fs.readdirSync(logsDir)
    .filter(file => file.startsWith('scraper-log-') && file.endsWith('.txt'))
    .map(file => ({
        name: file,
        path: path.join(logsDir, file),
        mtime: fs.statSync(path.join(logsDir, file)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

if (logFiles.length === 0) {
    console.error('❌ No log files found');
    process.exit(1);
}

const latestLog = logFiles[0];
console.log(`📄 Latest log file: ${latestLog.name}`);
console.log(`📅 Modified: ${latestLog.mtime.toISOString()}`);
console.log(`📁 Path: ${latestLog.path}`);
console.log('━'.repeat(80));

const content = fs.readFileSync(latestLog.path, 'utf8');
console.log(content);

console.log('━'.repeat(80));
console.log(`📊 Total lines: ${content.split('\n').length}`);
console.log(`📏 Size: ${(fs.statSync(latestLog.path).size / 1024).toFixed(2)} KB`);
