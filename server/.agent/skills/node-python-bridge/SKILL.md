---
name: Node-Python Bridge Patterns
description: Patterns for Node.js to spawn, manage, and consume output from Python scripts — child_process integration, JSON parsing, multi-platform failover
---

# Node ↔ Python Bridge Skill

Patterns for the integration layer where Node.js orchestrates Python scripts
for data acquisition and processing.

## Spawning Python Scripts

### Basic Pattern
```javascript
const { spawn } = require('child_process');
const path = require('path');

function runPythonScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const pythonPath = path.join(__dirname, '../../server-py');
    const proc = spawn('python', [
      path.join(pythonPath, scriptName),
      ...args
    ], {
      cwd: pythonPath,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script ${scriptName} failed (code ${code}):`, stderr);
      }

      // CRITICAL: Always try to parse stdout, even on non-zero exit
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (parseError) {
        console.error(`Failed to parse Python output for ${scriptName}:`);
        console.error('Raw stdout:', stdout.substring(0, 500));
        console.error('Stderr:', stderr.substring(0, 500));
        reject(new Error(`Python output parse error: ${parseError.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });
  });
}
```

### With Timeout
```javascript
function runPythonScriptWithTimeout(scriptName, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Python script ${scriptName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const proc = spawn('python', [scriptName, ...args]);
    // ... same as above, but clear timeout on close
    proc.on('close', () => {
      clearTimeout(timeout);
      // ... parse output
    });
  });
}
```

## Multi-Platform Failover

When collecting data from multiple platforms (Google, Meta, Bing), use a
failover strategy that continues on individual platform failure:

```javascript
async function collectMultiPlatformData(companyId, dateRange) {
  const platforms = [
    { name: 'google', script: 'custom_timeframe_google.py', required: true },
    { name: 'meta', script: 'fb_custom.py', required: false },
    { name: 'bing', script: 'bing_custom.py', required: false },
  ];

  const results = {};
  const errors = [];

  for (const platform of platforms) {
    try {
      results[platform.name] = await runPythonScript(platform.script, [
        '--customer-id', companyId,
        '--start', dateRange.start,
        '--end', dateRange.end,
      ]);
    } catch (error) {
      const errorInfo = {
        platform: platform.name,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      errors.push(errorInfo);

      if (platform.required) {
        // Primary platform failure — abort entire report
        throw new Error(`Required platform ${platform.name} failed: ${error.message}`);
      }
      // Secondary platform — log and continue
      console.warn(`Non-critical platform ${platform.name} failed:`, error.message);
    }
  }

  return {
    data: results,
    errors,
    partial: errors.length > 0 && Object.keys(results).length > 0,
  };
}
```

## Defensive JSON Parsing

Python scripts output JSON to stdout. This can fail for many reasons:
- Python print statements contaminating stdout
- Encoding issues
- Python stacktrace mixed into stdout
- Partial output from killed process

### Always: Try/Catch + Log Raw Output
```javascript
try {
  const result = JSON.parse(stdout);
  return result;
} catch (parseError) {
  // Log the raw output for debugging — this is critical
  console.error('=== PYTHON OUTPUT PARSE FAILURE ===');
  console.error('Script:', scriptName);
  console.error('Raw stdout (first 1000 chars):', stdout.substring(0, 1000));
  console.error('Stderr:', stderr.substring(0, 500));
  console.error('Parse error:', parseError.message);
  throw parseError;
}
```

## Job Status Integration

When Python scripts are part of automated jobs (cron, manual triggers),
integrate with the job status tracking system:

```javascript
async function processReport(job) {
  try {
    // Update job status
    job.status = 'processing';
    job.startedAt = new Date();
    await job.save();

    // Run Python scripts
    const data = await collectMultiPlatformData(job.companyId, job.dateRange);

    // Save results
    await Report.create({ ...data, jobId: job._id });

    // Mark complete
    job.status = 'completed';
    job.completedAt = new Date();
    if (data.partial) {
      job.errorReason = `Partial: ${data.errors.map(e => e.platform).join(', ')} failed`;
    }
    await job.save();

  } catch (error) {
    job.status = 'failed';
    job.errorReason = error.message.substring(0, 500); // Truncate
    job.completedAt = new Date();
    await job.save();
  }
}
```

## Key Conventions

1. **Never trust Python stdout** — always defensive JSON.parse
2. **Log raw output on parse failure** — this is the #1 debugging tool
3. **Continue on secondary platform failure** — partial data > no data
4. **Timeout Python scripts** — don't let a hung API call block the server
5. **Track job status** — pending → processing → completed/failed
6. **Truncate error messages** — don't store full stack traces in the DB
