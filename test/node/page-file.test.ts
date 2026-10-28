import { describe, expect, it } from 'vitest'
import { resolvePageFile } from '../../test-bench/lib/page-file'

const BENCH_DIR = '/srv/scrapling/test-bench'

describe('resolvePageFile', () => {
  it('resolves pages that live inside the pages directory', () => {
    expect(resolvePageFile(BENCH_DIR, '1-indeed-react-emotion.html')).toBe(
      '/srv/scrapling/test-bench/pages/1-indeed-react-emotion.html',
    )
    expect(resolvePageFile(BENCH_DIR, './nested/page.html')).toBe(
      '/srv/scrapling/test-bench/pages/nested/page.html',
    )
    expect(resolvePageFile('/srv/scrapling/test-bench/', 'page.html')).toBe(
      '/srv/scrapling/test-bench/pages/page.html',
    )
  })

  it('rejects traversal, absolute paths, directories and null bytes', () => {
    expect(resolvePageFile(BENCH_DIR, '../server/app.ts')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, 'nested/../../server/app.ts')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, '..\\server\\app.ts')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, '/etc/passwd')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, 'C:\\Windows\\win.ini')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, '..')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, '.')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, 'page\0.html')).toBeNull()
    expect(resolvePageFile(BENCH_DIR, '')).toBeNull()
  })
})
