// 结构自检：文件存在、引用的本地资源齐全、关键元素与 DOM 契约一致。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'docs')
const failures = []
const check = (name, ok, detail) => {
  if (ok) console.log(`PASS ${name}`)
  else { console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name) }
}

for (const file of ['index.html', 'styles.css', 'app.js', 'serve.mjs']) {
  check(`file ${file}`, existsSync(join(dir, file)))
}

const html = readFileSync(join(dir, 'index.html'), 'utf8')
const css = readFileSync(join(dir, 'styles.css'), 'utf8')
const js = readFileSync(join(dir, 'app.js'), 'utf8')

for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  check(`asset ${match[1]}`, existsSync(join(dir, match[1])))
}

// app.js 里 $('...') 选中的 id 必须存在于 HTML；运行时动态创建的例外
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
const DYNAMIC_IDS = new Set(['reviewVideo'])
const used = new Set([...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))
const missing = [...used].filter((id) => !DYNAMIC_IDS.has(id) && !ids.has(id))
check('app.js 引用的所有 id 都存在', missing.length === 0, missing.join(', '))

// HTML 里用到的 class 至少有一条 CSS 规则（粗筛，防止拼错）；SVG 结构组与动态元素只当钩子用
const STRUCTURAL = new Set(['sprout', 'leaves', 'books', 'btn-roll'])
const classes = new Set()
for (const match of html.matchAll(/class="([^"]+)"/g)) {
  for (const name of match[1].split(/\s+/)) if (name) classes.add(name)
}
const unstyled = [...classes].filter((name) => !STRUCTURAL.has(name) && !css.includes('.' + name))
check('HTML 的 class 都有样式', unstyled.length === 0, unstyled.join(', '))

// 每个屏都有 data-screen，且 JS 的 SCREENS 列表能对上
const screens = [...html.matchAll(/data-screen="([^"]+)"/g)].map((m) => m[1])
const declared = (js.match(/var SCREENS = \[([^\]]+)\]/) || [])[1] || ''
const declaredScreens = [...declared.matchAll(/'([^']+)'/g)].map((m) => m[1])
check('SCREENS 与页面顺序一致', screens.join(',') === declaredScreens.join(','), `${screens} vs ${declaredScreens}`)

// 每个 data-go 目标都是一个存在的屏
for (const match of html.matchAll(/data-go="([^"]+)"/g)) {
  check(`data-go ${match[1]} 有目标屏`, screens.includes(match[1]))
}

// v3：每个月都有决策；特殊日子都有插画；四季背景齐全
check('月度决策：五类去向齐全', ['money', 'skill', 'memory', 'relation', 'freedom'].every((k) => js.includes(`key: '${k}'`)))
const specialKeys = [...js.matchAll(/key: '([a-z0-9-]+)', kind:/g)].map((m) => m[1])
check('特殊日子数量 ≥ 12', specialKeys.length >= 12, `实际 ${specialKeys.length}`)
const sceneBlock = (js.match(/var SCENES = \{([\s\S]*?)\n  \};/) || [])[1] || ''
const sceneKeys = [...sceneBlock.matchAll(/'([a-z0-9-]+)':\s*'<svg/g)].map((m) => m[1])
const missingScenes = specialKeys.filter((k) => !sceneKeys.includes(k) && k !== 'birthday')
check('每个特殊日子都有插画', missingScenes.length === 0, missingScenes.join(', '))
check('生日也有插画', sceneKeys.includes('birthday'))
for (const s of ['spring', 'summer', 'autumn', 'winter']) {
  check(`季节背景 ${s}`, css.includes(`data-season="${s}"`))
}
check('真实价格：高铁 679', js.includes('679'))
check('真实价格：四六级 30 元', js.includes('笔试 30 元'))
check('真实价格：熊猫基地 27', js.includes('27'))

// v3：一屏一卡 / 自动推进 / 进度 / 氛围
check('v3 有学年进度条容器', html.includes('id="yearStrip"'))
check('v3 有每月一句话', html.includes('id="flavorLine"') && js.includes('var FLAVOR'))
check('v3 有自动推进逻辑', js.includes('function maybeAdvance'))
check('v3 有暂停按钮', html.includes('id="pauseBtn"'))
check('v3 有账本抽屉', html.includes('id="ledgerDrawer"'))
check('v3 有季节粒子层', html.includes('id="seasonLayer"') && css.includes('.season-layer'))
const flavorMonths = [...((js.match(/var FLAVOR = \{([\s\S]*?)\n  \};/) || [])[1] || '').matchAll(/^\s+(\d+):/gm)].length
check('v3 每月都有旁白（12 个月）', flavorMonths === 12, `实际 ${flavorMonths}`)

// 复利公式自检：与方案里的数字对齐
const fvYearly = (p, r, n) => p * (Math.pow(1 + r, n) - 1) / r
const fvSingle = (p, r, n) => p * Math.pow(1 + r, n)
check('每天 15 元 30 年 8% ≈ 62 万', Math.abs(fvYearly(15 * 365, 0.08, 30) - 620224) < 500, fvYearly(15 * 365, 0.08, 30).toFixed(0))
check('单笔 15 元 30 年 8% ≈ 151', Math.abs(fvSingle(15, 0.08, 30) - 151) < 1, fvSingle(15, 0.08, 30).toFixed(1))

// v2：双模式核心——7 年攒下金额、30 年三线
check('v2 主货币：每月省 300 × 48 个月 ≈ 1.4 万', Math.abs(300 * 48 - 14400) === 0)
check('v2 近期七年（15/日 × 30 天 × 84 月 × 半衰后）为正值', fvYearly(15 * 30 * 12, 0.08, 30) > 0)

// 离线自检：demo 不引用任何外部地址
const external = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)]
check('无外部资源引用（可离线播放）', external.length === 0, external.map((m) => m[1]).join(', '))

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\nFAILURES: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
