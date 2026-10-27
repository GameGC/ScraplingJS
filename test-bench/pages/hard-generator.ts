
export type HardMutationKind =
  | 'structural'
  | 'text-drift'
  | 'semantic'
  | 'extreme'
  | 'decoy-heavy'
  | 'tag-swap'

export interface HardGenOptions {
  kind?: HardMutationKind
  seed?: string
  textDrift?: number
  decoyCount?: number
  linkifyButtons?: boolean
  sidebar?: boolean
}

const SEEDS = [
  'a7f1e', '9d4x1', '2c8m4', '1a8f9', '3b7k2', '5p0q8', '8r2t6', '4m1n9',
]

function hash(seed: string, i: number): string {
  const s = `${seed}_${i}`
  let h = 0
  for (let c = 0; c < s.length; c++) h = (Math.imul(31, h) + s.charCodeAt(c)) | 0
  return 'x' + (Math.abs(h) % 1e7).toString(36)
}

export function generateHardPage(opts: HardGenOptions = {}): string {
  const kind = opts.kind || 'structural'
  const seed = opts.seed || SEEDS[Math.floor(Math.random() * SEEDS.length)]
  const drift = opts.textDrift ?? (kind === 'text-drift' || kind === 'extreme' ? 0.8 : 0.2)
  const decoys = opts.decoyCount ?? (kind === 'decoy-heavy' || kind === 'text-drift' ? 3 : 1)
  const linkify = opts.linkifyButtons ?? kind === 'semantic'
  const sidebar = opts.sidebar ?? kind === 'extreme'

  const cls = (i: number) => `_${hash(seed, i)}`

  const findJobs =
    drift > 0.6 ? (kind === 'extreme' ? 'Search' : 'Search jobs') : 'Find jobs'
  const applyText =
    drift > 0.7 ? (kind === 'extreme' ? 'Apply' : '1-click apply') :
    drift > 0.4 ? 'Apply now' : 'Easily apply'
  const salaryText =
    drift > 0.5 ? '$140k–$185k / year' : '$140,000 - $185,000 a year'
  const nextText =
    drift > 0.7 ? 'Load more results' :
    drift > 0.4 ? 'Next page' : 'Next >'
  const whatPh =
    drift > 0.5 ? 'Title, skill, or company' : 'Job title, keywords, or company'
  const wherePh =
    drift > 0.5 ? 'Location or remote' : 'City, state, zip code, or "remote"'

  const jobCards: string[] = []

  const applyEl = linkify
    ? `<a href="/apply/unity-01" role="button" class="${cls(20)}">${applyText}</a>`
    : `<button type="button" class="${cls(20)}">${applyText}</button>`

  jobCards.push(`
    <article class="${cls(10)}" data-jk="unity-01">
      <h2 class="${cls(11)}"><a href="/viewjob?jk=unity-01" class="${cls(12)}">Unity Developer</a></h2>
      <div class="${cls(13)}">Unity Technologies</div>
      <div class="${cls(14)}">Remote in San Francisco, CA</div>
      <div class="${cls(15)}">${salaryText}</div>
      <p class="${cls(16)}">Build cross-platform game features and real-time graphics pipelines using C# and Unity Engine.</p>
      <div class="${cls(17)}">${applyEl}</div>
    </article>
  `)

  const decoyData = [
    { title: 'Unity UI Designer', co: 'PixelForge Studios', sal: '$95,000 - $120,000 a year', apply: 'Apply now' },
    { title: 'Unity Developer (Contract)', co: 'GameLab Inc', sal: '$70 - $95 / hour', apply: 'Easily apply' },
    { title: 'Lead Unity Developer', co: 'Unity Technologies', sal: '$180,000 - $230,000 a year', apply: 'Easily apply' },
    { title: 'Senior Unity Engineer', co: 'Epic Games', sal: '$160,000 - $210,000 a year', apply: 'Apply' },
    { title: 'Unity Tools Engineer', co: 'Riot Games', sal: '$150,000 - $190,000 a year', apply: '1-click apply' },
  ]
  for (let i = 0; i < Math.min(decoys, decoyData.length); i++) {
    const d = decoyData[i]
    const dApply = linkify
      ? `<a href="/apply/d${i}" role="button" class="${cls(30 + i)}">${d.apply}</a>`
      : `<button type="button" class="${cls(30 + i)}">${d.apply}</button>`
    jobCards.push(`
      <article class="${cls(10)}" data-jk="decoy-${i}">
        <h2 class="${cls(11)}"><a href="/viewjob?jk=decoy-${i}" class="${cls(12)}">${d.title}</a></h2>
        <div class="${cls(13)}">${d.co}</div>
        <div class="${cls(14)}">Remote</div>
        <div class="${cls(15)}">${d.sal}</div>
        <p class="${cls(16)}">Similar-looking listing used as a decoy.</p>
        <div class="${cls(17)}">${dApply}</div>
      </article>
    `)
  }

  if (sidebar) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hard gen · ${kind} · ${seed}</title>
  <meta name="mutation" content="${kind}">
  <style>
    body{margin:0;font-family:system-ui;background:#0f1115;color:#e8eaed;display:flex;min-height:100vh}
    aside{width:300px;background:#1a1d24;padding:16px;display:flex;flex-direction:column;gap:12px}
    aside input{background:#0f1115;border:1px solid #3c4043;border-radius:8px;padding:10px;color:#e8eaed}
    aside button{background:#8ab4f8;color:#0f1115;border:none;border-radius:8px;padding:12px;font-weight:700;cursor:pointer}
    .main{flex:1;padding:24px}
    .card{background:#1a1d24;border:1px solid #2a2e38;border-radius:12px;padding:16px;margin-bottom:12px}
    .card a{color:#8ab4f8;font-weight:700;text-decoration:none}
  </style>
</head>
<body>
  <aside>
    <strong>indeed</strong>
    <input name="q" placeholder="${whatPh}" value="Unity Developer" class="${cls(1)}">
    <input name="l" placeholder="${wherePh}" value="Remote" class="${cls(2)}">
    <button type="submit" class="${cls(3)}">${findJobs}</button>
    <button type="button" class="${cls(4)} on">Remote</button>
  </aside>
  <div class="main">
    ${jobCards.join('\n')}
    <button type="button" class="${cls(50)}">${nextText}</button>
  </div>
</body>
</html>`
  }

  const formTag = kind === 'semantic' ? 'search' : 'section'
  const filterRemote = kind === 'semantic'
    ? `<li role="option" aria-selected="true" class="${cls(5)}">Remote</li>`
    : `<button type="button" class="${cls(5)} active" aria-pressed="true">Remote</button>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hard gen · ${kind} · ${seed}</title>
  <meta name="mutation" content="${kind}">
  <style>
    body{font-family:system-ui;background:#f3f2f1;margin:0;color:#2d2d2d}
    .shell{max-width:960px;margin:0 auto;padding:20px 16px}
    .search{background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap}
    .search input{flex:1;border:1px solid #d4d2d0;border-radius:8px;padding:12px;font-size:15px}
    .search button,.search [role=button]{background:#2557a7;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-weight:700;cursor:pointer}
    .filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;list-style:none;padding:0}
    .filters button,.filters [role=option]{background:#fff;border:1px solid #d4d2d0;border-radius:20px;padding:8px 14px;font-weight:600;cursor:pointer}
    .filters .active,.filters [aria-selected=true]{background:#e8f0fe;border-color:#2557a7;color:#2557a7}
    article{background:#fff;border:1px solid #e4e2e0;border-radius:12px;padding:18px;margin-bottom:12px}
    article a{color:#2557a7;font-weight:700;text-decoration:none}
    .pay{display:inline-block;background:#e8f5e9;color:#1b5e20;padding:2px 8px;border-radius:4px;font-size:13px;font-weight:700;margin:6px 0}
  </style>
</head>
<body>
  <div class="shell">
    <${formTag} class="search" role="search">
      <input name="q" class="${cls(1)}" placeholder="${whatPh}" value="Unity Developer">
      <input name="l" class="${cls(2)}" placeholder="${wherePh}" value="Remote">
      <button type="submit" class="${cls(3)}">${findJobs}</button>
    </${formTag}>
    <${kind === 'semantic' ? 'ul' : 'div'} class="filters" ${kind === 'semantic' ? 'role="listbox"' : ''}>
      ${filterRemote}
      <${kind === 'semantic' ? 'li role="option"' : 'button type="button"'} class="${cls(6)}">Date posted</${kind === 'semantic' ? 'li' : 'button'}>
    </${kind === 'semantic' ? 'ul' : 'div'}>
    ${jobCards.join('\n')}
    <button type="button" class="${cls(50)}">${nextText}</button>
  </div>
</body>
</html>`
}
