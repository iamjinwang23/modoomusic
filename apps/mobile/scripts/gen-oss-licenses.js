// 오픈소스 라이선스 목록 생성 — 모바일 앱 프로덕션 의존성 클로저를 훑어
// src/data/oss-licenses.json 을 갱신한다. 의존성 추가/변경 시 재실행:
//   node apps/mobile/scripts/gen-oss-licenses.js
// 루트 호이스팅 + 로컬 node_modules 둘 다 탐색, transitive prod deps 포함. 전문은 링크로 대체.
const fs = require('fs')
const path = require('path')

const MOBILE = path.resolve(__dirname, '..')
const ROOT = path.resolve(MOBILE, '../..')
const SEARCH = [path.join(ROOT, 'node_modules'), path.join(MOBILE, 'node_modules')]

function resolvePkgDir(name) {
  for (const base of SEARCH) {
    const dir = path.join(base, name)
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
  }
  return null
}
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
function normRepo(repo) {
  if (!repo) return null
  const u = typeof repo === 'string' ? repo : repo.url
  if (!u) return null
  return u.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/')
}
function authorStr(a) {
  if (!a) return null
  if (typeof a === 'string') return a.replace(/\s*<[^>]*>/g, '').replace(/\s*\([^)]*\)/g, '').trim() || null
  return a.name || null
}

const mobilePkg = readJSON(path.join(MOBILE, 'package.json'))
const seen = new Set()
const out = new Map()
const queue = Object.keys(mobilePkg.dependencies || {})

while (queue.length) {
  const name = queue.shift()
  if (seen.has(name)) continue
  seen.add(name)
  if (name.startsWith('@mono/')) continue
  const dir = resolvePkgDir(name)
  if (!dir) continue
  const pj = readJSON(path.join(dir, 'package.json'))
  if (!pj) continue
  const license = pj.license || (pj.licenses && pj.licenses[0] && (pj.licenses[0].type || pj.licenses[0])) || 'UNKNOWN'
  out.set(name, {
    name,
    version: pj.version || '',
    license: typeof license === 'string' ? license : JSON.stringify(license),
    repository: normRepo(pj.repository),
    author: authorStr(pj.author),
  })
  for (const dep of Object.keys(pj.dependencies || {})) if (!seen.has(dep)) queue.push(dep)
}

// 순수 빌드 툴(런타임 미탑재) 제외 — @babel/runtime(헬퍼)은 탑재되므로 유지.
const EXCLUDE = [
  /^@babel\/(?!runtime)/, /^@types\//, /^babel-/, /-loader$/, /^metro/, /^@expo\/metro/,
  /^@react-native\/(babel|metro|codegen|dev|eslint|debugger|community-cli)/,
  /eslint/, /^jest/, /^@jest\//, /^typescript$/, /prettier/,
]
const list = [...out.values()]
  .filter((e) => !EXCLUDE.some((re) => re.test(e.name)))
  .sort((a, b) => a.name.localeCompare(b.name))

const dest = path.join(MOBILE, 'src/data/oss-licenses.json')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, JSON.stringify(list))
console.log(`oss-licenses.json: ${list.length} packages, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`)
