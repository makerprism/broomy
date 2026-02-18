/**
 * Validates that all worker_threads files are properly configured:
 * 1. Every *.worker.ts in src/main/workers/ is listed as a build entry in electron.vite.config.ts
 * 2. Every worker path referenced in source code has a corresponding .ts source file
 * 3. Worker paths use the correct relative path (no ../)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const WORKERS_DIR = path.join(ROOT, 'src/main/workers')
const VITE_CONFIG = path.join(ROOT, 'electron.vite.config.ts')
const HANDLERS_DIR = path.join(ROOT, 'src/main')

let errors = 0

// 1. Find all worker source files
const workerFiles = fs.existsSync(WORKERS_DIR)
  ? fs.readdirSync(WORKERS_DIR).filter(f => f.endsWith('.worker.ts'))
  : []

// 2. Read vite config and extract the rollup input entry keys
const viteConfig = fs.readFileSync(VITE_CONFIG, 'utf-8')
const entryPattern = /['"]workers\/([^'"]+)['"]\s*:/g
const configuredEntries = new Set()
let m
while ((m = entryPattern.exec(viteConfig)) !== null) {
  configuredEntries.add(m[1])
}

for (const workerFile of workerFiles) {
  const workerName = workerFile.replace('.ts', '')
  if (!configuredEntries.has(workerName)) {
    console.error(`ERROR: ${workerFile} is not listed as a build entry in electron.vite.config.ts`)
    console.error(`  Add to main.build.rollupOptions.input: 'workers/${workerName}': resolve('src/main/workers/${workerFile}')`)
    errors++
  }
}

// 3. Find all worker path references in source code and verify the .ts source exists
const WORKER_REF_PATTERN = /['"](?:\.\.\/)?workers\/([^'"]+\.worker\.js)['"]/g

function scanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'workers') continue
      scanDir(path.join(dir, entry.name))
      continue
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue

    const filePath = path.join(dir, entry.name)
    const relPath = path.relative(ROOT, filePath)
    const content = fs.readFileSync(filePath, 'utf-8')
    let match
    while ((match = WORKER_REF_PATTERN.exec(content)) !== null) {
      const jsName = match[1]
      const tsName = jsName.replace('.js', '.ts')
      const tsPath = path.join(WORKERS_DIR, tsName)
      if (!fs.existsSync(tsPath)) {
        console.error(`ERROR: ${relPath} references workers/${jsName} but ${tsName} does not exist`)
        errors++
      }

      // Check the path doesn't use ../ (wrong relative path for bundled output)
      if (match[0].includes('../workers/')) {
        console.error(`ERROR: ${relPath} uses '../workers/${jsName}' — should be 'workers/${jsName}' (no ../)`)
        console.error(`  After bundling, __dirname is the same directory as the worker output`)
        errors++
      }
    }
  }
}

scanDir(HANDLERS_DIR)

if (errors > 0) {
  console.error(`\n${errors} worker configuration error(s) found`)
  process.exit(1)
} else {
  console.log(`OK: ${workerFiles.length} worker(s) verified`)
}
