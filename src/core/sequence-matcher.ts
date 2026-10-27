export class SequenceMatcher<T = string> {
  private readonly a: ArrayLike<T>
  private readonly b: ArrayLike<T>
  private readonly b2j: Map<T, number[]>

  constructor(_isJunk: ((item: T) => boolean) | null, a: ArrayLike<T>, b: ArrayLike<T>) {
    this.a = a
    this.b = b
    this.b2j = new Map<T, number[]>()
    for (let i = 0; i < b.length; i++) {
      const elt = b[i]
      let indices = this.b2j.get(elt)
      if (!indices) {
        indices = []
        this.b2j.set(elt, indices)
      }
      indices.push(i)
    }
  }

  findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
    let besti = alo
    let bestj = blo
    let bestsize = 0
    let j2len = new Map<number, number>()

    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>()
      const indices = this.b2j.get(this.a[i])
      if (indices) {
        for (let idx = 0; idx < indices.length; idx++) {
          const j = indices[idx]
          if (j < blo) continue
          if (j >= bhi) break
          const k = (j2len.get(j - 1) ?? 0) + 1
          newj2len.set(j, k)
          if (k > bestsize) {
            besti = i - k + 1
            bestj = j - k + 1
            bestsize = k
          }
        }
      }
      j2len = newj2len
    }

    while (
      besti > alo &&
      bestj > blo &&
      this.a[besti - 1] === this.b[bestj - 1]
    ) {
      besti--
      bestj--
      bestsize++
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      this.a[besti + bestsize] === this.b[bestj + bestsize]
    ) {
      bestsize++
    }

    return [besti, bestj, bestsize]
  }

  getMatchingBlocks(): Array<[number, number, number]> {
    const la = this.a.length
    const lb = this.b.length
    const queue: Array<[number, number, number, number]> = [[0, la, 0, lb]]
    const matchingBlocks: Array<[number, number, number]> = []

    while (queue.length > 0) {
      const [alo, ahi, blo, bhi] = queue.pop()!
      const [i, j, k] = this.findLongestMatch(alo, ahi, blo, bhi)
      if (k > 0) {
        matchingBlocks.push([i, j, k])
        if (alo < i && blo < j) {
          queue.push([alo, i, blo, j])
        }
        if (i + k < ahi && j + k < bhi) {
          queue.push([i + k, ahi, j + k, bhi])
        }
      }
    }

    matchingBlocks.sort((x, y) => x[0] - y[0] || x[1] - y[1])

    const nonAdjacent: Array<[number, number, number]> = []
    let i1 = 0
    let j1 = 0
    let k1 = 0
    for (const [i2, j2, k2] of matchingBlocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2
      } else {
        if (k1 > 0) {
          nonAdjacent.push([i1, j1, k1])
        }
        i1 = i2
        j1 = j2
        k1 = k2
      }
    }
    if (k1 > 0) {
      nonAdjacent.push([i1, j1, k1])
    }
    nonAdjacent.push([la, lb, 0])
    return nonAdjacent
  }

  ratio(): number {
    const total = this.a.length + this.b.length
    if (total === 0) {
      return 1.0
    }
    if (this.a.length === 0 || this.b.length === 0) {
      return 0.0
    }
    let matches = 0
    for (const block of this.getMatchingBlocks()) {
      matches += block[2]
    }
    return (2.0 * matches) / total
  }
}

export function sequenceRatio<T = string>(a: ArrayLike<T>, b: ArrayLike<T>): number {
  return new SequenceMatcher<T>(null, a, b).ratio()
}

export function calculateDictDiff(
  dict1: Record<string, string>,
  dict2: Record<string, string>,
): number {
  const keys1 = Object.keys(dict1)
  const keys2 = Object.keys(dict2)
  const vals1 = Object.values(dict1)
  const vals2 = Object.values(dict2)
  const keyScore = sequenceRatio(keys1, keys2) * 0.5
  const valScore = sequenceRatio(vals1, vals2) * 0.5
  return keyScore + valScore
}
