import { SelectorSyntaxError } from './custom-types'

export function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`
  }
  if (!value.includes('"')) {
    return `"${value}"`
  }
  const parts = value.split("'")
  const concatArgs: string[] = []
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') {
      concatArgs.push(`'${parts[i]}'`)
    }
    if (i < parts.length - 1) {
      concatArgs.push(`"'"`)
    }
  }
  return `concat(${concatArgs.join(', ')})`
}

export function unescapeCssValue(raw: string): string {
  let str = raw.trim()
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1)
  }
  return str
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/\\(.)/g, '$1')
}

export function splitCssSelectors(selector: string): string[] {
  const results: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let bracketDepth = 0
  let parenDepth = 0

  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '\\' && i + 1 < selector.length) {
      current += ch + selector[i + 1]
      i++
      continue
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      current += ch
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      current += ch
      continue
    }
    if (!inSingle && !inDouble) {
      if (ch === '[') bracketDepth++
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
      else if (ch === '(') parenDepth++
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1)
      else if (ch === ',' && bracketDepth === 0 && parenDepth === 0) {
        const trimmed = current.trim()
        if (!trimmed) {
          throw new SelectorSyntaxError(`Invalid CSS selector '${selector}': empty group`)
        }
        results.push(trimmed)
        current = ''
        continue
      }
    }
    current += ch
  }

  if (inSingle || inDouble || bracketDepth !== 0 || parenDepth !== 0) {
    throw new SelectorSyntaxError(`Invalid CSS selector '${selector}': unclosed token`)
  }
  const trimmed = current.trim()
  if (!trimmed) {
    throw new SelectorSyntaxError(`Invalid CSS selector '${selector}': empty selector`)
  }
  results.push(trimmed)
  return results
}

interface CompoundStep {
  combinator: '' | ' ' | '>' | '+' | '~'
  raw: string
}

function tokenizeSingleSelector(selector: string): {
  steps: CompoundStep[]
  textNode: boolean
  attribute: string | null
} {
  let remaining = selector.trim()
  if (!remaining) {
    throw new SelectorSyntaxError(`Invalid CSS selector '${selector}'`)
  }

  let textNode = false
  let attribute: string | null = null

  const pseudoElemMatch = remaining.match(/::([a-zA-Z_-]+)(?:\(([^)]*)\))?\s*$/)
  if (pseudoElemMatch) {
    const name = pseudoElemMatch[1].toLowerCase()
    const arg = pseudoElemMatch[2]
    remaining = remaining.slice(0, pseudoElemMatch.index).trim()
    if (!remaining) {
      remaining = '*'
    }
    if (name === 'text' && arg === undefined) {
      textNode = true
    } else if (name === 'attr' && arg !== undefined) {
      const cleanedArg = unescapeCssValue(arg.trim())
      if (!cleanedArg || !/^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/.test(cleanedArg)) {
        throw new SelectorSyntaxError(
          `Invalid CSS selector '${selector}': invalid ::attr(${arg})`,
        )
      }
      attribute = cleanedArg
    } else {
      throw new SelectorSyntaxError(
        `Invalid CSS selector '${selector}': unknown pseudo-element ::${name}`,
      )
    }
  }

  const steps: CompoundStep[] = []
  let current = ''
  let pendingCombinator: '' | ' ' | '>' | '+' | '~' = ''
  let inSingle = false
  let inDouble = false
  let bracketDepth = 0
  let parenDepth = 0

  for (let i = 0; i < remaining.length; i++) {
    const ch = remaining[i]
    if (ch === '\\' && i + 1 < remaining.length) {
      current += ch + remaining[i + 1]
      i++
      continue
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      current += ch
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      current += ch
      continue
    }
    if (!inSingle && !inDouble) {
      if (ch === '[') {
        bracketDepth++
        current += ch
        continue
      }
      if (ch === ']') {
        bracketDepth--
        current += ch
        continue
      }
      if (ch === '(') {
        parenDepth++
        current += ch
        continue
      }
      if (ch === ')') {
        parenDepth--
        current += ch
        continue
      }
      if (bracketDepth === 0 && parenDepth === 0) {
        if (ch === '>' || ch === '+' || ch === '~') {
          if (!current.trim() && steps.length === 0) {
            throw new SelectorSyntaxError(
              `Invalid CSS selector '${selector}': unexpected combinator '${ch}'`,
            )
          }
          if (current.trim()) {
            steps.push({ combinator: pendingCombinator, raw: current.trim() })
            current = ''
          }
          pendingCombinator = ch
          continue
        }
        if (/\s/.test(ch)) {
          if (current.trim()) {
            steps.push({ combinator: pendingCombinator, raw: current.trim() })
            current = ''
            pendingCombinator = ' '
          }
          continue
        }
      }
    }
    current += ch
  }

  if (current.trim()) {
    steps.push({ combinator: pendingCombinator, raw: current.trim() })
  } else if (pendingCombinator !== '') {
    throw new SelectorSyntaxError(
      `Invalid CSS selector '${selector}': trailing combinator '${pendingCombinator}'`,
    )
  }

  return { steps, textNode, attribute }
}

function parseNthExpression(
  expr: string,
  axis: 'preceding-sibling' | 'following-sibling',
  nodeTest: string,
): string {
  const cleaned = expr.trim().toLowerCase().replace(/\s+/g, '')
  const countExpr = `count(${axis}::${nodeTest})`
  if (cleaned === 'odd') {
    return `((${countExpr} + 1) mod 2 = 1)`
  }
  if (cleaned === 'even') {
    return `((${countExpr} + 1) mod 2 = 0)`
  }
  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10)
    return `${countExpr} = ${n - 1}`
  }
  const match = cleaned.match(/^([+-]?\d*)?n([+-]\d+)?$/)
  if (!match) {
    throw new SelectorSyntaxError(`Invalid nth expression: '${expr}'`)
  }
  const aRaw = match[1]
  const a = aRaw === '' || aRaw === '+' || aRaw === undefined ? 1 : aRaw === '-' ? -1 : parseInt(aRaw, 10)
  const b = match[2] ? parseInt(match[2], 10) : 0
  const pos = `(${countExpr} + 1)`
  if (a === 0) {
    return `${pos} = ${b}`
  }
  if (a > 0) {
    return `${pos} >= ${b} and (${pos} - (${b})) mod ${a} = 0`
  }
  return `${pos} <= ${b} and (${b} - ${pos}) mod ${Math.abs(a)} = 0`
}

function parseCompoundSelector(
  raw: string,
  fullSelector: string,
): { tag: string; conditions: string[] } {
  let i = 0
  const n = raw.length
  let tag = '*'
  const conditions: string[] = []

  if (i < n && raw[i] === '*') {
    tag = '*'
    i++
  } else if (i < n && /[a-zA-Z_]/.test(raw[i])) {
    const start = i
    while (i < n && /[a-zA-Z0-9_-]/.test(raw[i])) {
      i++
    }
    tag = raw.slice(start, i).toLowerCase()
  } else if (i < n && !['#', '.', '[', ':'].includes(raw[i])) {
    throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': unexpected '${raw[i]}'`)
  }

  while (i < n) {
    const ch = raw[i]
    if (ch === '#') {
      i++
      const start = i
      while (i < n && (/[a-zA-Z0-9_-]/.test(raw[i]) || raw[i] === '\\')) {
        if (raw[i] === '\\') i += 2
        else i++
      }
      const idVal = unescapeCssValue(raw.slice(start, i))
      if (!idVal) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': empty id`)
      }
      conditions.push(`@id = ${xpathLiteral(idVal)}`)
    } else if (ch === '.') {
      i++
      const start = i
      while (i < n && (/[a-zA-Z0-9_-]/.test(raw[i]) || raw[i] === '\\')) {
        if (raw[i] === '\\') i += 2
        else i++
      }
      const clsVal = unescapeCssValue(raw.slice(start, i))
      if (!clsVal) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': empty class`)
      }
      conditions.push(
        `contains(concat(' ', normalize-space(@class), ' '), ${xpathLiteral(` ${clsVal} `)})`,
      )
    } else if (ch === '[') {
      i++
      const start = i
      let inSingle = false
      let inDouble = false
      while (i < n) {
        if (raw[i] === '\\' && i + 1 < n) {
          i += 2
          continue
        }
        if (raw[i] === "'" && !inDouble) inSingle = !inSingle
        else if (raw[i] === '"' && !inSingle) inDouble = !inDouble
        else if (raw[i] === ']' && !inSingle && !inDouble) break
        i++
      }
      if (i >= n || raw[i] !== ']') {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': unclosed '['`)
      }
      const attrExpr = raw.slice(start, i).trim()
      i++
      conditions.push(parseAttributeCondition(attrExpr, fullSelector))
    } else if (ch === ':') {
      i++
      if (i < n && raw[i] === ':') {
        throw new SelectorSyntaxError(
          `Invalid CSS selector '${fullSelector}': unexpected pseudo-element in middle of selector`,
        )
      }
      const nameStart = i
      while (i < n && /[a-zA-Z0-9_-]/.test(raw[i])) {
        i++
      }
      const pseudoName = raw.slice(nameStart, i).toLowerCase()
      if (!pseudoName) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': empty pseudo-class`)
      }
      let pseudoArg: string | null = null
      if (i < n && raw[i] === '(') {
        i++
        const argStart = i
        let depth = 1
        let inSingle = false
        let inDouble = false
        while (i < n && depth > 0) {
          if (raw[i] === '\\' && i + 1 < n) {
            i += 2
            continue
          }
          if (raw[i] === "'" && !inDouble) inSingle = !inSingle
          else if (raw[i] === '"' && !inSingle) inDouble = !inDouble
          else if (!inSingle && !inDouble) {
            if (raw[i] === '(') depth++
            else if (raw[i] === ')') depth--
          }
          if (depth > 0) i++
        }
        if (depth !== 0) {
          throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': unclosed '('`)
        }
        pseudoArg = raw.slice(argStart, i)
        i++
      }
      conditions.push(parsePseudoCondition(pseudoName, pseudoArg, tag, fullSelector))
    } else {
      throw new SelectorSyntaxError(
        `Invalid CSS selector '${fullSelector}': unexpected token '${ch}'`,
      )
    }
  }

  return { tag, conditions }
}

function parseAttributeCondition(attrExpr: string, fullSelector: string): string {
  if (!attrExpr) {
    throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': empty attribute`)
  }
  const match = attrExpr.match(
    /^([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*(?:([~|^$*!]?=)\s*([\s\S]*))?$/,
  )
  if (!match) {
    throw new SelectorSyntaxError(
      `Invalid CSS selector '${fullSelector}': invalid attribute '[${attrExpr}]'`,
    )
  }
  const attrName = match[1]
  const op = match[2]
  const rawVal = match[3]
  if (!op) {
    return `@${attrName}`
  }
  const val = unescapeCssValue(rawVal ?? '')
  const lit = xpathLiteral(val)

  switch (op) {
    case '=':
      return `@${attrName} = ${lit}`
    case '!=':
      return `not(@${attrName}) or @${attrName} != ${lit}`
    case '~=':
      if (!val || /\s/.test(val)) {
        return 'false()'
      }
      return `contains(concat(' ', normalize-space(@${attrName}), ' '), ${xpathLiteral(` ${val} `)})`
    case '|=':
      return `@${attrName} = ${lit} or starts-with(@${attrName}, ${xpathLiteral(`${val}-`)})`
    case '^=':
      if (!val) return 'false()'
      return `starts-with(@${attrName}, ${lit})`
    case '$=':
      if (!val) return 'false()'
      return `substring(@${attrName}, string-length(@${attrName}) - ${val.length} + 1) = ${lit}`
    case '*=':
      if (!val) return 'false()'
      return `contains(@${attrName}, ${lit})`
    default:
      throw new SelectorSyntaxError(`Invalid attribute operator '${op}' in '${fullSelector}'`)
  }
}

function parsePseudoCondition(
  name: string,
  arg: string | null,
  tag: string,
  fullSelector: string,
): string {
  const nodeTest = tag === '*' ? '*' : tag
  switch (name) {
    case 'first-child':
      return 'count(preceding-sibling::*) = 0'
    case 'last-child':
      return 'count(following-sibling::*) = 0'
    case 'only-child':
      return 'count(preceding-sibling::*) = 0 and count(following-sibling::*) = 0'
    case 'first-of-type':
      return `count(preceding-sibling::${nodeTest}) = 0`
    case 'last-of-type':
      return `count(following-sibling::${nodeTest}) = 0`
    case 'only-of-type':
      return `count(preceding-sibling::${nodeTest}) = 0 and count(following-sibling::${nodeTest}) = 0`
    case 'nth-child':
      if (arg === null) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': :nth-child() requires argument`)
      }
      return parseNthExpression(arg, 'preceding-sibling', '*')
    case 'nth-last-child':
      if (arg === null) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': :nth-last-child() requires argument`)
      }
      return parseNthExpression(arg, 'following-sibling', '*')
    case 'nth-of-type':
      if (arg === null) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': :nth-of-type() requires argument`)
      }
      return parseNthExpression(arg, 'preceding-sibling', nodeTest)
    case 'nth-last-of-type':
      if (arg === null) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': :nth-last-of-type() requires argument`)
      }
      return parseNthExpression(arg, 'following-sibling', nodeTest)
    case 'empty':
      return 'not(*) and not(string-length())'
    case 'checked':
      return '@checked'
    case 'disabled':
      return '@disabled'
    case 'enabled':
      return 'not(@disabled)'
    case 'root':
      return 'not(parent::*)'
    case 'contains': {
      if (arg === null) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': :contains() requires argument`)
      }
      const textVal = unescapeCssValue(arg)
      return `contains(string(.), ${xpathLiteral(textVal)})`
    }
    case 'not': {
      if (!arg || !arg.trim()) {
        throw new SelectorSyntaxError(`Invalid CSS selector '${fullSelector}': :not() requires argument`)
      }
      const inner = parseCompoundSelector(arg.trim(), fullSelector)
      const parts: string[] = []
      if (inner.tag !== '*') {
        parts.push(`self::${inner.tag}`)
      }
      parts.push(...inner.conditions)
      if (parts.length === 0) {
        return 'false()'
      }
      return `not(${parts.join(' and ')})`
    }
    default:
      throw new SelectorSyntaxError(
        `Invalid CSS selector '${fullSelector}': unknown pseudo-class :${name}`,
      )
  }
}

function translateSingleCssSelector(selector: string, prefix = 'descendant-or-self::'): string {
  const { steps, textNode, attribute } = tokenizeSingleSelector(selector)
  let xpath = ''

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const { tag, conditions } = parseCompoundSelector(step.raw, selector)
    const condSuffix = conditions.length > 0 ? `[${conditions.map((c) => `(${c})`).join(' and ')}]` : ''

    if (i === 0) {
      xpath = `${prefix}${tag}${condSuffix}`
    } else {
      switch (step.combinator) {
        case ' ':
          xpath += `/descendant-or-self::*/${tag}${condSuffix}`
          break
        case '>':
          xpath += `/${tag}${condSuffix}`
          break
        case '+': {
          const tagCond = tag === '*' ? '' : `[self::${tag}]`
          xpath += `/following-sibling::*[1]${tagCond}${condSuffix}`
          break
        }
        case '~':
          xpath += `/following-sibling::${tag}${condSuffix}`
          break
      }
    }
  }

  if (textNode) {
    xpath += '/text()'
  }
  if (attribute !== null) {
    xpath += `/@${attribute}`
  }

  return xpath
}

const cssCache = new Map<string, string>()

export function cssToXpath(query: string, prefix = 'descendant-or-self::'): string {
  const cacheKey = `${prefix}:::${query}`
  const cached = cssCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }
  const parts = splitCssSelectors(query)
  const translated = parts.map((part) => translateSingleCssSelector(part, prefix)).join(' | ')
  if (cssCache.size >= 256) {
    const firstKey = cssCache.keys().next().value
    if (firstKey !== undefined) {
      cssCache.delete(firstKey)
    }
  }
  cssCache.set(cacheKey, translated)
  return translated
}

export const css_to_xpath = cssToXpath
