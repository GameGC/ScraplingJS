export function searchSnapshot(snapshot: string, pattern: string | RegExp): string {
  if (!snapshot) {
    return ''
  }
  const cleanFlags = (typeof pattern === 'string' ? '' : pattern.flags).replace(/[gy]/g, '')
  const regex =
    typeof pattern === 'string'
      ? new RegExp(pattern)
      : new RegExp(pattern.source, cleanFlags)
  const lines = snapshot.split('\n')
  const matches: number[] = []

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matches.push(i)
    }
  }
  if (matches.length === 0) {
    return ''
  }

  const retained = new Set<number>()
  for (const index of matches) {
    const start = Math.max(0, index - 3)
    const end = Math.min(lines.length, index + 4)
    for (let nearby = start; nearby < end; nearby++) {
      retained.add(nearby)
    }
  }

  const ancestors: Array<[number, number]> = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim()) {
      continue
    }
    const indent = line.length - line.trimStart().length
    while (ancestors.length > 0 && ancestors[ancestors.length - 1][0] >= indent) {
      ancestors.pop()
    }
    if (retained.has(index)) {
      for (const [, parentIndex] of ancestors) {
        retained.add(parentIndex)
      }
    }
    ancestors.push([indent, index])
  }

  const sortedIndices = Array.from(retained).sort((a, b) => a - b)
  const output: string[] = []
  let previous = -1

  for (const index of sortedIndices) {
    if (index > previous + 1) {
      output.push('...')
    }
    output.push(lines[index])
    previous = index
  }
  if (previous < lines.length - 1) {
    output.push('...')
  }
  return output.join('\n')
}
