export interface CompilerMutationOptions {
  framework?: 'react-emotion' | 'nextjs-cssmodules' | 'vue-tailwind' | 'svelte-scoped' | 'nodejs-bem'
  hashSeed?: string
  tagVariation?: 'semantic' | 'div-soup' | 'classic'
  classPrefix?: string
}

export function generateMutatedPage(options: CompilerMutationOptions = {}): string {
  const seed = options.hashSeed || Math.random().toString(36).substring(2, 7)
  const prefix = options.classPrefix || `cmp_${seed}`
  const tagH = options.tagVariation === 'semantic' ? 'h2' : options.tagVariation === 'classic' ? 'h3' : 'div'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unity Developer Jobs, Employment | Indeed (Compiled seed: ${seed})</title>
  <meta name="framework" content="${options.framework || 'dynamic-compiled'}">
  <meta name="compiler-seed" content="${seed}">
  <style>
    body { font-family: sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
    .${prefix}-searchbox { display: flex; max-width: 900px; margin: 0 auto 20px auto; background: #fff; border: 1px solid #ccc; border-radius: 18px; padding: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
    .${prefix}-input { flex: 1; border: none; outline: none; font-size: 16px; padding: 12px; }
    .${prefix}-btn { background: #004fcb; color: white; border: none; border-radius: 12px; padding: 12px 24px; font-weight: bold; cursor: pointer; }
    .${prefix}-pills { display: flex; gap: 8px; max-width: 900px; margin: 0 auto 20px auto; }
    .${prefix}-pill { background: #fff; border: 1px solid #ccc; border-radius: 20px; padding: 8px 16px; font-size: 14px; font-weight: 600; }
    .${prefix}-pill.active { background: #e6f0ff; border-color: #004fcb; color: #004fcb; }
    .${prefix}-card { background: #fff; border: 1px solid #ddd; border-radius: 16px; padding: 20px; max-width: 700px; margin: 0 auto 16px auto; }
    .${prefix}-title { font-size: 20px; font-weight: bold; color: #004fcb; text-decoration: none; margin-bottom: 6px; display: block; }
    .${prefix}-company { font-weight: 600; margin-bottom: 4px; }
    .${prefix}-salary { display: inline-block; background: #e6f4ff; color: #004fcb; padding: 4px 8px; border-radius: 6px; font-size: 13px; font-weight: bold; margin-bottom: 12px; }
    .${prefix}-apply { background: #004fcb; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <div class="${prefix}-searchbox">
    <input class="${prefix}-input" name="q" placeholder="Job title, keywords, or company" value="Unity Developer">
    <div style="width:1px;background:#eee;margin:0 8px;"></div>
    <input class="${prefix}-input" name="l" placeholder="City, state, zip code, or &quot;remote&quot;" value="Remote">
    <button type="submit" class="${prefix}-btn">Find jobs</button>
  </div>

  <div class="${prefix}-pills">
    <button class="${prefix}-pill active">Remote</button>
    <button class="${prefix}-pill">Date posted</button>
    <button class="${prefix}-pill">Pay: $120,000+ a year</button>
  </div>

  <div class="${prefix}-card">
    <${tagH} class="${prefix}-heading">
      <a href="/job/unity-01" class="${prefix}-title">Unity Developer</a>
    </${tagH}>
    <div class="${prefix}-company">Unity Technologies</div>
    <div style="color:#666;font-size:14px;margin-bottom:8px;">Remote in San Francisco, CA</div>
    <span class="${prefix}-salary">$140,000 - $185,000 a year</span>
    <p style="color:#444;font-size:14px;line-height:1.4;">Build cross-platform game features and real-time graphics pipelines using C# and Unity Engine.</p>
    <button class="${prefix}-apply">Easily apply</button>
  </div>
</body>
</html>`
}
