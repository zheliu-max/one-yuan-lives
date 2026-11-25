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

// v3：每个月都有决策；事件池按状态筛选；插画齐全
check('月度决策：五类去向齐全', ['money', 'skill', 'memory', 'relation', 'freedom'].every((k) => js.includes(`key: '${k}'`)))
const poolCount = (js.match(/months: \[/g) || []).length
check('事件池事件数 ≥ 18', poolCount >= 18, `实际 ${poolCount}`)
const sceneBlock = (js.match(/var SCENES = \{([\s\S]*?)\n  \};/) || [])[1] || ''
const sceneKeys = [...sceneBlock.matchAll(/'([a-z0-9-]+)':\s*'<svg/g)].map((m) => m[1])
const sceneRefs = [...new Set([...js.matchAll(/scene: '([a-z0-9-]+)'/g)].map((m) => m[1]))]
const missingScenes = sceneRefs.filter((k) => !sceneKeys.includes(k))
check('每个事件的插画都存在', missingScenes.length === 0, missingScenes.join(', '))
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

// v3.1：回放
check('回放屏存在', html.includes('data-screen="replay"'))
check('回放条目容器', html.includes('id="recapFeed"'))
check('回放可跳过', html.includes('id="recapSkip"') && js.includes('function skipRecap'))
check('回放有播放逻辑', js.includes('function playRecap') && js.includes('function buildRecapItems'))
check('回放结束进入反转', js.includes("go('reveal')"))

// v3.2：事件生成器
check('有歌手池（含抢票热度）', js.includes('var ARTISTS') && js.includes('hot:'))
check('有朋友列表（含生日）', js.includes('var FRIENDS') && js.includes('birthday:'))
check('有旅行目的地池', js.includes('var TRAVEL_POOL'))
check('有同行者选项', js.includes('var COMPANIONS'))
check('有事件生成器', js.includes('function buildEvent') && js.includes('function eventFor'))
check('有事件缓存（回放确定性）', js.includes('eventCache'))
check('演唱会有抢票结果与黄牛', js.includes('scalper') && js.includes('win:'))
check('旅行可遇见人', js.includes('romance'))
check('朋友生日影响关系值', js.includes('addRelation'))

// v3.3：生活建档
check('有生活建档屏', html.includes('data-screen="archive"'))
check('有五道建档题', js.includes('ARCHIVE_QUESTIONS') && js.includes("key: 'breakfast'") && js.includes("key: 'social'"))
check('固定支出按档案计算', js.includes('function profileFixed') && js.includes('profileFixed()'))
check('每月有 ±8% 波动', js.includes('0.16') && js.includes('wave'))
check('账本里有生活档案', html.includes('id="profileSection"'))
check('不再用预算系数兜底做主路径', js.includes("state.budget * 0.55"))

// v3.4：换挡
check('有换挡提示卡', html.includes('id="gearCard"'))
check('换挡有基准（第一月）', js.includes('baseline'))
check('降档只影响下一个月', js.includes('set[m + 1] = true'))
check('超过 3 次不再回调', js.includes('count > 3'))
check('降档会降低固定支出', js.includes('profileFixedDowngraded'))
check('规则对玩家可见', js.includes('降档只影响下一个月'))
check('决策合并不覆盖换挡选择', js.includes('别把这个月已经做过的换挡/事件选择冲掉'))

// v3.5：意外系统（按场景触发 + 第二幕卡）
check('封面有意外概率图', html.includes('prob-chart') && html.includes('class="prob-row"'))
check('封面有意外说明', html.includes('这一路会有意外'))
check('机器屏有意外卡', html.includes('id="accidentCard"'))
check('意外按场景触发', js.includes('function accidentFor') && js.includes('ACCIDENT_RATE'))
check('意外不再是每年掷一次', !js.includes('accTotal'))
check('意外有拒绝/硬扛选项', js.includes("'borrow'") && js.includes("'endure'") && js.includes("'delay'"))
check('意外花费计入当月闲钱', js.includes('accidentCostFor'))
check('意外单次概率按年化反推', js.includes('0.035') && js.includes('0.015') && js.includes('0.007'))

// v3.6：意外余波
check('有意外余波系统', js.includes('function followupFor'))
check('三种余波（手机/身体/挂科）', js.includes("'fu-phone'") && js.includes("'fu-weak'") && js.includes("'fu-delay'"))
check('余波按延迟月份触发', js.includes('accidentChoiceAt(') && js.includes('monthIndex - 6') && js.includes('monthIndex - 8'))
check('硬扛生病后更容易再病', js.includes('before.weak') && js.includes('rate *= 2'))
check('进入月份前的状态快照', js.includes('flagsAtMonth'))
check('余波插画齐全', js.includes("'fu-phone':") && js.includes("'fu-weak':") && js.includes("'fu-delay':"))

// v4：状态层 + 事件池 + 三维选项
check('有状态层（学业/社交/经历/身体）', js.includes('var STAT_KEYS') && js.includes("study: '学业'") && js.includes("body: '身体'"))
check('状态按月快照（保证回放确定）', js.includes('statsAtMonth'))
check('选项分省钱/投资/关系', js.includes("save: '省钱'") && js.includes("invest: '投资'") && js.includes("relate: '关系'"))
check('事件按状态筛选', js.includes('function candsFor') && js.includes('def.when'))
check('有优先级分层', js.includes('tryBuildGroup') && js.includes('candsFor(mo, stats, m, year, 3, 99)'))
check('大事件优先于生日', js.includes('// 3. 没有大事件，才轮到生日'))
check('期末按学业分化', js.includes("s.study <= 3") && js.includes("s.study >= 7") && js.includes('奖学金'))
check('社交低会触发宿舍事件', js.includes("s.social <= 3"))
check('恋爱会触发约会事件', js.includes("key: 'dating'"))
check('有跨年回调事件', js.includes('neverHomeFor3Years') && js.includes("key: 'callback-home'"))
check('囤货会降低后续固定支出', js.includes('stockpileDiscount'))
check('状态条 UI', html.includes('id="statStrip"') && css.includes('.stat-chip'))
check('选项分类样式', css.includes('.opt-kind.save') && css.includes('.opt-kind.invest') && css.includes('.opt-kind.relate'))

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
