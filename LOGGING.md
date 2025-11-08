# Logging System

## Overview
The application includes a comprehensive logging system that captures all console output to timestamped files.

## Usage

### Run with Logging Enabled

**Development mode with auto-restart and logging:**
```bash
npm run dev:log
```

**Production mode with logging:**
```bash
npm run start:log
```

**Normal mode without logging:**
```bash
npm run dev      # Development
npm run start    # Production
```

## Log Files

### Location
All logs are saved to the `logs/` directory in the project root.

### File Format
- **Filename pattern**: `scraper-log-YYYY-MM-DDTHH-MM-SS-mmmZ.txt`
- **Example**: `scraper-log-2025-11-07T13-45-30-123Z.txt`

### Log Entry Format
```
[2025-11-07T13:45:30.123Z] [LOG] Your log message here
[2025-11-07T13:45:31.456Z] [ERROR] Error message
[2025-11-07T13:45:32.789Z] [WARN] Warning message
```

## Viewing Logs

### View Latest Log
```bash
npm run view-log
# or
npm run logs
```

This will display:
- Latest log filename
- Modification timestamp
- Full log contents
- Statistics (lines, file size)

### Manual Access
Log files are plain text and can be opened with any text editor:
```bash
notepad logs\scraper-log-2025-11-07T13-45-30-123Z.txt
```

## Features

### Automatic Capture
The logger intercepts all console methods:
- `console.log()`
- `console.error()`
- `console.warn()`
- `console.info()`
- `console.debug()`

### Graceful Shutdown
- Logs are properly closed on process exit
- `Ctrl+C` (SIGINT) is handled gracefully
- Uncaught exceptions are logged before exit

### Timestamps
Every log entry includes:
- ISO 8601 timestamp
- Log level (LOG, ERROR, WARN, INFO, DEBUG)
- Message content

## Example Workflow

1. **Start scraper with logging:**
   ```bash
   npm run dev:log
   ```

2. **Let it run for a full scrape cycle** (wait for "DATA COLLECTION COMPLETE" message)

3. **Stop the server** (Ctrl+C)

4. **View the log:**
   ```bash
   npm run logs
   ```

5. **Share the log file:**
   - Find the file in `logs/` directory
   - The latest file will have the most recent timestamp
   - Attach this file for analysis

## Debug Information Captured

The logs will include:
- 🔍 API URL patterns before/after clicking "En Vivo"
- 📡 Intercepted API endpoints
- ✅ Successful API detections
- ⚠️ Timeout warnings
- 📊 Event counts per sport
- 🧠 Memory usage statistics
- 📤 Progressive update broadcasts

## Troubleshooting

### No logs directory
The directory is created automatically on first run with logging enabled.

### Can't find latest log
Run `npm run logs` to display the most recent log file.

### Log file too large
Logs can grow large during full scrape cycles. Consider:
- Viewing only specific sections with a text editor
- Using `grep` or PowerShell `Select-String` to filter
- Example: `Select-String "API DEBUG" logs\scraper-log-*.txt`

## Git Ignore
Log files are automatically ignored by git (added to `.gitignore`).
