import path from 'node:path'

/**
 * Resolves a requested benchmark page inside `<root>/pages`.
 *
 * Returns `undefined` when the name is empty, contains a NUL byte, or escapes
 * the pages directory (for example `../server/app.ts`).
 */
export function resolvePageFile(root: string, filename: string): string | undefined {
  if (!filename || filename.includes('\0')) {
    return undefined
  }

  const pagesDir = path.resolve(root, 'pages')
  const resolved = path.resolve(pagesDir, filename)
  const relative = path.relative(pagesDir, resolved)

  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined
  }

  return resolved
}
