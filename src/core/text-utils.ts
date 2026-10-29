const CONSECUTIVE_SPACES_REGEX = / +/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  deg: '°',
  plusmn: '±',
  para: '¶',
  middot: '·',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  hellip: '…',
}

function isValidCodePoint(code: number): boolean {
  return !Number.isNaN(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
}

const decodedEntityCache = new Map<string, string>()
// Bounded: hostile pages can carry unbounded numbers of unique entity-like
// tokens, and every decoded hit used to live in this Map forever.
const DECODED_ENTITY_CACHE_LIMIT = 1024
let entityDecoder: HTMLTextAreaElement | null = null

/** Test-only: exposes the internal entity cache size for assertions. */
export function __decodedEntityCacheSizeForTests(): number {
  return decodedEntityCache.size
}

export function replaceEntities(input: string): string {
  if (!input || !input.includes('&')) {
    return input
  }
  return input.replace(/&(#(?:x[0-9a-fA-F]+|\d+)|[a-zA-Z0-9]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16)
      return isValidCodePoint(code) ? String.fromCodePoint(code) : full
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10)
      return isValidCodePoint(code) ? String.fromCodePoint(code) : full
    }
    const lower = entity.toLowerCase()
    if (lower in NAMED_ENTITIES) {
      return NAMED_ENTITIES[lower]
    }
    const cached = decodedEntityCache.get(full)
    if (cached !== undefined) {
      return cached
    }
    if (typeof document !== 'undefined') {
      if (!entityDecoder) {
        entityDecoder = document.createElement('textarea')
      }
      entityDecoder.innerHTML = full
      const value = entityDecoder.value
      if (decodedEntityCache.size >= DECODED_ENTITY_CACHE_LIMIT) {
        const oldestKey = decodedEntityCache.keys().next().value
        if (oldestKey !== undefined) {
          decodedEntityCache.delete(oldestKey)
        }
      }
      decodedEntityCache.set(full, value)
      return value
    }
    return full
  })
}

export function cleanSpaces(input: string): string {
  if (!input) {
    return ''
  }
  const translated = input.replace(/\t/g, ' ').replace(/[\r\n]/g, '')
  return translated.replace(CONSECUTIVE_SPACES_REGEX, ' ')
}

export function cleanText(input: string, removeEntities = false): string {
  if (!input) {
    return ''
  }
  let data = input.replace(/[\t\r\n]/g, ' ')
  if (removeEntities) {
    data = replaceEntities(data)
  }
  return data.replace(CONSECUTIVE_SPACES_REGEX, ' ').trim()
}

export function flatten<T>(lists: Iterable<Iterable<T>>): T[] {
  const result: T[] = []
  for (const list of lists) {
    for (const item of list) {
      result.push(item)
    }
  }
  return result
}

export function escapeRegExpChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\A ')
    .replace(/\r/g, '\\D ')
    .replace(/\f/g, '\\C ')
}

const MULTI_PART_TLDS = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'com.br',
  'com.cn',
  'com.mx',
  'co.in',
  'co.nz',
  'co.za',
  'com.sg',
  'com.hk',
  'com.tw',
  'com.tr',
  'com.ua',
  'com.ar',
])

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return true
  }
  const parts = hostname.split('.')
  if (parts.length !== 4) {
    return false
  }
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function extractBaseDomain(url?: string | null, defaultValue = 'default'): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return defaultValue
  }
  const normalized = url.trim().toLowerCase()
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//.test(normalized) ? normalized : `http://${normalized}`
  try {
    const parsed = new URL(withProtocol)
    let hostname = parsed.hostname
    if (!hostname) {
      return defaultValue
    }
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4)
    }
    const hostWithPort = parsed.port ? `${hostname}:${parsed.port}` : hostname
    if (
      isIpLiteral(hostname) ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost')
    ) {
      return hostWithPort
    }
    const parts = hostname.split('.').filter(Boolean)
    if (parts.length <= 1) {
      return hostWithPort
    }
    if (parts.length >= 3) {
      const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
      if (MULTI_PART_TLDS.has(lastTwo)) {
        return `${parts[parts.length - 3]}.${lastTwo}`
      }
    }
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  } catch {
    return defaultValue
  }
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n))
}

export function sha256Bytes(bytes: Uint8Array): string {
  const l = bytes.length
  const bitLenHi = Math.floor((l * 8) / 0x100000000)
  const bitLenLo = (l * 8) >>> 0
  const paddedLen = ((l + 9 + 63) >> 6) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[l] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLen - 8, bitLenHi, false)
  view.setUint32(paddedLen - 4, bitLenLo, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3)
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('')
}

export function getIdentifierHash(identifier: string): string {
  const normalized = identifier.toLowerCase().trim()
  const encoded = new TextEncoder().encode(normalized)
  const hex = sha256Bytes(encoded)
  return `${hex}_${encoded.length}`
}
