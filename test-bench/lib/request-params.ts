import { BENCH_FRAMEWORK_IDS, type BenchmarkFrameworkId } from '../pages/generator'

/** A seed is interpolated into class names and attributes, so keep it narrow. */
export const SEED_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

const FRAMEWORK_IDS = new Set<string>(BENCH_FRAMEWORK_IDS)

export interface DynamicParamsInput {
  seed?: string
  framework?: string
}

export type DynamicParamsResult =
  | { ok: true; seed: string; framework?: BenchmarkFrameworkId }
  | { ok: false; error: 'Invalid seed parameter' | 'Unknown framework parameter' }

function generateSeed(): string {
  const seed = Math.random().toString(36).slice(2, 12)
  return SEED_PATTERN.test(seed) ? seed : `seed${seed}`.slice(0, 12)
}

/**
 * Accepts only seeds that cannot escape a class name or an attribute, and only
 * framework ids from the benchmark's allowlist.
 */
export function resolveDynamicParams(input: DynamicParamsInput = {}): DynamicParamsResult {
  const rawSeed = input.seed
  const seed = rawSeed === undefined || rawSeed === '' ? generateSeed() : rawSeed

  if (!SEED_PATTERN.test(seed)) {
    return { ok: false, error: 'Invalid seed parameter' }
  }

  const framework = input.framework
  if (framework !== undefined) {
    if (!FRAMEWORK_IDS.has(framework)) {
      return { ok: false, error: 'Unknown framework parameter' }
    }
    return { ok: true, seed, framework: framework as BenchmarkFrameworkId }
  }

  return { ok: true, seed }
}
