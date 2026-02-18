import { parentPort, workerData } from 'worker_threads'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

interface TsProjectInput {
  projectRoot: string
}

interface TsProjectOutput {
  projectRoot: string
  compilerOptions: Record<string, unknown>
  files: { path: string; content: string }[]
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', '__pycache__', '.venv'])
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const MAX_FILES = 2000
const MAX_FILE_SIZE = 1024 * 1024

function parseTsConfig(configPath: string, projectRoot: string, depth = 0): Record<string, unknown> {
  if (depth > 5) return {}
  try {
    if (!existsSync(configPath)) return {}
    const raw = readFileSync(configPath, 'utf-8')
    const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const parsed = JSON.parse(stripped)

    let result: Record<string, unknown> = {}
    if (parsed.extends) {
      const extendsPath = parsed.extends.startsWith('.')
        ? join(configPath, '..', parsed.extends)
        : join(projectRoot, 'node_modules', parsed.extends)
      const resolvedExtends = existsSync(extendsPath) ? extendsPath :
        existsSync(`${extendsPath}.json`) ? `${extendsPath}.json` : extendsPath
      result = parseTsConfig(resolvedExtends, projectRoot, depth + 1)
    }

    if (parsed.compilerOptions) {
      result = { ...result, ...parsed.compilerOptions }
    }
    return result
  } catch {
    return {}
  }
}

function getProjectContext(input: TsProjectInput): TsProjectOutput {
  const { projectRoot } = input

  // Try root tsconfig first
  let compilerOptions: Record<string, unknown> = parseTsConfig(join(projectRoot, 'tsconfig.json'), projectRoot)

  // For monorepos
  if (Object.keys(compilerOptions).length === 0) {
    const subProjectDirs: string[] = []
    try {
      const entries = readdirSync(projectRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const subTsconfigPath = join(projectRoot, entry.name, 'tsconfig.json')
        if (existsSync(subTsconfigPath)) {
          const subOpts = parseTsConfig(subTsconfigPath, projectRoot)
          if (Object.keys(compilerOptions).length === 0) {
            compilerOptions = { ...subOpts }
          }
          if (!subOpts.baseUrl || subOpts.baseUrl === '.' || subOpts.baseUrl === './') {
            subProjectDirs.push(entry.name)
          }
        }
      }
    } catch {
      // Ignore read errors
    }

    if (subProjectDirs.length > 0) {
      compilerOptions.baseUrl = '.'
      compilerOptions.paths = { '*': subProjectDirs.map(d => `${d}/*`) }
    }
  }

  // Collect project files
  const files: { path: string; content: string }[] = []
  const walkDir = (dir: string) => {
    if (files.length >= MAX_FILES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walkDir(fullPath)
      } else {
        const ext = entry.name.substring(entry.name.lastIndexOf('.'))
        if (!TS_EXTENSIONS.has(ext)) continue
        try {
          const stats = statSync(fullPath)
          if (stats.size > MAX_FILE_SIZE) continue
          const content = readFileSync(fullPath, 'utf-8')
          const relativePath = fullPath.replace(`${projectRoot}/`, '')
          files.push({ path: relativePath, content })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walkDir(projectRoot)

  return { projectRoot, compilerOptions, files }
}

const input = workerData as TsProjectInput
try {
  const result = getProjectContext(input)
  parentPort?.postMessage({ type: 'result', data: result })
} catch (error) {
  parentPort?.postMessage({ type: 'error', error: String(error) })
}
