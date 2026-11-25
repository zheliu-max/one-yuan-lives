/* 一块钱的两万种人生 —— 互动叙事 demo v2
 * 纯静态脚本，无依赖、无网络请求，断网也能完整演完。
 *
 * 结构：
 *   cover → identity（身份定制）→ setup（第一笔钱+习惯）→ fork（三路）
 *   → machine（双模式：近期七年账本 / 长期三十年三线）→ reveal（星图）
 *   → ending（三线对照）→ report（纪念海报 + AI 回顾视频预留）
 */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var SCREENS = ['cover', 'identity', 'archive', 'setup', 'machine', 'replay', 'reveal', 'ending', 'report'];
  var INFLATION = 0.03;
  var NEAR_YEARS = 7;        // 近期：七年
  var NEAR_MONTHS = 84;      // 七年 × 12
  var FAR_YEARS = 30;        // 长期：三十年
  var DAYS_FAR = 10950;      // 30 年天数（星图用）
  var POCKETS = ['money', 'skill', 'memory', 'relation', 'freedom'];

  var state = {
    grade: null,
    school: null,
    major: null,
    budget: 1800,
    amount: 15,
    habit: 5,
    birthday: null,           // 生日月份 1-12
    profile: null,            // 生活建档：早餐/午餐/晚餐/交通/社交
    pace: 'monthly',          // 'monthly' 逐月 | 'yearly' 学年方案
    autoPaused: false,        // 自动推进是否暂停
    timelineMode: 'near',     // 'near' | 'far'
    slider: 0,                // 近期按月(0-84)，长期按年(0-30)
    rate: 0.08,
    inflation: false,
    near: {                   // 近期账本（五口袋累计）
      money: 0, skill: 0, memory: 0, relation: 0, freedom: 0,
      cash: 0,               // 手上现金（生活费结余）
      done84: false,         // 是否已推进满 84 个月（结算完整标记）
      events: [],            // 已发生事件（含意外）摘要
      decisions: {},         // 月份索引 -> { plan, specialChoice, auto }
      plans: {},             // 学年索引 -> 方案 split
      eventCache: {},        // 月份索引 -> 生成的事件（确定性）
      relations: {},         // 朋友名字 -> 关系值
      flags: {},             // 意外留下的状态标记
      stats: { study: 3, social: 3, exp: 3, body: 5 },   // 学业/社交/经历/身体
      statsAtMonth: [],      // 进入每月之前的状态快照
      memories: [],          // 值得回看的记忆
      romance: null,         // 恋爱状态
      gearSet: {},           // 月份索引 -> 该月是否降档
      baseline: null,        // 第一个月存下的钱（换挡基准）
      monthLog: []           // 逐月流水，用于回看
    },
    far: {                    // 长期三线
      actual: 0, ideal: 0, zero: 0,
      years: 0,
      series: { actual: [], ideal: [], zero: [] } // 按年序列，画曲线
    }
  };

  /* ---------- 身份 ---------- */

  var SCHOOLS = {
    seu: { label: '东南大学', city: '南京', type: '双一流' },
    nj: { label: '南京其他高校', city: '南京', type: '高校' },
    other: { label: '其他城市', city: '外地', type: '高校' }
  };

  var GRADES = {
    freshman: { label: '大一', yearsLeft: 7, msg: '七年账本，从头算起。' },
    sophomore: { label: '大二', yearsLeft: 6, msg: '你还有六年可以走。' },
    junior: { label: '大三', yearsLeft: 5, msg: '还剩五年，窗口期开始收窄。' },
    senior: { label: '大四', yearsLeft: 4, msg: '最后一年在校，接下来是人生切换。' },
    grad: { label: '研究生', yearsLeft: 3, msg: '研究生三年，收入结构会变。' }
  };

  /* ---------- 数字 ---------- */

  // 账本从九月开学起算：第 0 个月 = 第一年 9 月
  var START_MONTH = 9;

  /** 把月份索引换算成真实学年：第几年、几月。 */
  function monthParts(monthIndex) {
    var abs = monthIndex + START_MONTH - 1;
    return {
      year: Math.floor(abs / 12) + 1,
      month: (abs % 12) + 1
    };
  }

  function fvSingle(p, r, n) {
    return p * Math.pow(1 + r, n);
  }

  function fvYearly(p, r, n) {
    if (n <= 0) return 0;
    if (r === 0) return p * n;
    return p * (Math.pow(1 + r, n) - 1) / r;
  }

  function fmtMoney(v) {
    if (!isFinite(v)) return '—';
    if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 亿';
    if (v >= 1e4) return (v / 1e4).toFixed(1) + ' 万';
    return Math.round(v).toLocaleString('zh-CN') + ' 元';
  }

  function readoutParts(v) {
    if (v >= 1e8) return { num: (v / 1e8).toFixed(2), unit: '亿' };
    if (v >= 1e4) return { num: (v / 1e4).toFixed(1), unit: '万' };
    return { num: Math.round(v).toLocaleString('zh-CN'), unit: '元' };
  }

  function realValue(v, n) {
    return v / Math.pow(1 + INFLATION, n);
  }

  function rateLabel() {
    return Math.round(state.rate * 100) + '%';
  }

  /* ---------- 近期账本（按月） ---------- */

  // 生活费流入（随年级/身份变化）
  function monthlyAllowance() {
    // 研究生有补贴
    if (state.grade === 'grad') return state.budget + 800;
    return state.budget;
  }

  // 每月固定支出：按生活档案算；降档月用最省的一档；并允许真实波动（±8%）
  function monthlyBase(monthIndex) {
    var downgraded = typeof monthIndex === 'number' && state.near.gearSet && state.near.gearSet[monthIndex];
    var base = state.profile
      ? (downgraded ? profileFixedDowngraded() : profileFixed())
      : Math.round(state.budget * 0.55);
    if (typeof monthIndex !== 'number' || !state.profile) return base;
    base = base - stockpileDiscount(monthIndex);
    if (base < 300) base = 300;
    var rnd = monthRng(monthIndex);
    var wave = 1 + (rnd() - 0.5) * 0.16;   // 0.92 ~ 1.08
    return Math.round(base * wave / 10) * 10;
  }

  /* ---------- 状态层：钱之外的四个维度 ---------- */

  var STAT_KEYS = ['study', 'social', 'exp', 'body'];
  var STAT_NAMES = { study: '学业', social: '社交', exp: '经历', body: '身体' };
  var STAT_ICONS = { study: '📖', social: '🤝', exp: '🌍', body: '💪' };

  function clampStat(v) { return Math.max(0, Math.min(10, Math.round(v * 10) / 10)); }

  function blankStats() { return { study: 3, social: 3, exp: 3, body: 5 }; }

  /** 进入某个月之前的状态快照（保证事件生成与回放确定）。 */
  function statsBefore(monthIndex) {
    var n = state.near;
    if (n.statsAtMonth && n.statsAtMonth[monthIndex]) return n.statsAtMonth[monthIndex];
    return n.stats || blankStats();
  }

  function addStats(delta) {
    if (!delta) return;
    var n = state.near;
    STAT_KEYS.forEach(function (k) {
      if (typeof delta[k] === 'number') n.stats[k] = clampStat(n.stats[k] + delta[k]);
    });
  }

  /** 去年"囤货"带来的固定支出减免（连续 4 个月）。 */
  function stockpileDiscount(monthIndex) {
    var total = 0;
    for (var k = 1; k <= 4; k++) {
      var d = state.near.decisions[monthIndex - k];
      if (d && d.eventChoice === 'stockpile') total += 60;
    }
    return Math.min(total, 240);
  }

  /* ---------- 事件池 ---------- */

  /** 选项分三类：省钱 / 投资 / 关系。用于标签展示。 */
  var OPT_TAGS = { save: '省钱', invest: '投资', relate: '关系' };

  // 学年方案：定一次，之后每月自动按它分配闲钱
  var PLANS = [
    { key: 'frugal', name: '省吃俭用', icon: '🪙', desc: '一半存起来，剩下的紧着花', split: { money: 0.5, skill: 0.2, memory: 0.1, relation: 0.1, freedom: 0.1 } },
    { key: 'balanced', name: '平衡', icon: '⚖️', desc: '存一些，也留一点给生活', split: { money: 0.3, skill: 0.2, memory: 0.25, relation: 0.15, freedom: 0.1 } },
    { key: 'experience', name: '活在当下', icon: '🎒', desc: '多去一些地方，少存一点', split: { money: 0.1, skill: 0.1, memory: 0.45, relation: 0.25, freedom: 0.1 } },
    { key: 'growth', name: '自我投资', icon: '📚', desc: '把钱花在能力和证书上', split: { money: 0.2, skill: 0.45, memory: 0.15, relation: 0.1, freedom: 0.1 } }
  ];

  // 每月决策选项：玩家把一个月的闲钱分配到这里
  var DECISIONS = [
    { key: 'money', label: '存起来', icon: '💰', note: '放进钱袋，等复利', pocket: 'money' },
    { key: 'skill', label: '买书 / 报课', icon: '📚', note: '考级、考研资料、技能课', pocket: 'skill' },
    { key: 'memory', label: '攒旅行基金', icon: '🎒', note: '为一次出发攒钱', pocket: 'memory' },
    { key: 'relation', label: '请客 / 顾家', icon: '🍲', note: '室友聚会、给家里买点', pocket: 'relation' },
    { key: 'freedom', label: '留作应急', icon: '🛟', note: '应付突然的一天', pocket: 'freedom' }
  ];

  /* ---------- 事件数据 ---------- */

  // 演唱会歌手池：热度决定抢票成功率，票价分档
  var ARTISTS = [
    { name: '周杰伦', hot: 0.86, tiers: [{ zone: '内场', price: 2000 }, { zone: '看台', price: 1000 }, { zone: '山顶', price: 600 }] },
    { name: '陈奕迅', hot: 0.82, tiers: [{ zone: '内场', price: 1580 }, { zone: '看台', price: 780 }, { zone: '山顶', price: 480 }] },
    { name: '五月天', hot: 0.72, tiers: [{ zone: '内场', price: 1280 }, { zone: '看台', price: 680 }, { zone: '山顶', price: 380 }] },
    { name: '薛之谦', hot: 0.66, tiers: [{ zone: '内场', price: 1180 }, { zone: '看台', price: 580 }, { zone: '山顶', price: 320 }] },
    { name: '南京本地乐队', hot: 0.22, tiers: [{ zone: 'Livehouse', price: 150 }] },
    { name: '校园十佳歌手', hot: 0.05, tiers: [{ zone: '学校礼堂', price: 0 }] }
  ];

  // 朋友：有名字、生日、关系值
  var FRIENDS = [
    { name: '小林', role: '室友', birthday: 3, base: 2 },
    { name: '阿哲', role: '室友', birthday: 10, base: 2 },
    { name: '张姐', role: '社团', birthday: 12, base: 1 },
    { name: '老周', role: '高中同学', birthday: 5, base: 1 }
  ];

  // 旅行目的地池（南京出发，真实价格）
  var TRAVEL_POOL = [
    { key: 'yangzhou', name: '扬州', cost: 400, desc: '高铁 70×2 + 青旅 60 + 瘦西湖学生票 50 + 吃 120' },
    { key: 'huangshan', name: '黄山', cost: 800, desc: '高铁 260×2 + 青旅 2 晚 120 + 学生票 95 + 吃 200' },
    { key: 'qingdao', name: '青岛', cost: 1200, desc: '高铁 600×2 + 青旅 3 晚 200 + 吃 250 + 市内' },
    { key: 'xian', name: '西安', cost: 1600, desc: '高铁 550×2 + 青旅 3 晚 180 + 兵马俑学生票 60 + 吃 240' },
    { key: 'chengdu', name: '成都', cost: 1900, desc: '高铁 679×2 + 青旅 3 晚 180 + 熊猫基地学生票 27 + 吃 280' },
    { key: 'sanya', name: '三亚', cost: 2400, desc: '机票往返 1,500 + 青旅 4 晚 280 + 玩海 150 + 吃 400' },
    { key: 'home', name: '哪也不去', cost: 0, desc: '钱留着，暑假在家' }
  ];

  // 同行者：影响花费与相遇概率
  var COMPANIONS = [
    { key: 'solo', name: '一个人', factor: 1.0, desc: '自由，也孤单', romance: 0.16 },
    { key: 'roommate', name: '和室友', factor: 0.85, desc: '住宿 AA，可能吵架', romance: 0.05 },
    { key: 'club', name: '和社团朋友', factor: 0.92, desc: '热闹，行程更满', romance: 0.08 }
  ];

  // 特殊日子：真实校历 + 真实价格（2026-11 校准）
  // kind: 'ask' = 花/不花；'gain' = 自动进账；'info' = 只提示
  var SPECIAL_DAYS = [
    { month: 1, key: 'winter-home', kind: 'ask', tag: '寒假', date: '1 月中下旬', title: '回家过年', text: '南京南到家里的高铁。学生票一年只有 4 次，且限家—校区间。', cost: 400, pocket: 'relation' },
    { month: 2, key: 'lucky-money', kind: 'gain', tag: '春节', date: '2 月中旬', title: '压岁钱', text: '长辈给的压岁钱。这笔钱是你一年里最大的一笔“横财”。', amount: 2000 },
    { month: 3, key: 'newterm', kind: 'ask', tag: '春季开学', date: '3 月初', title: '开学采购', text: '教材、打印、日用品。一学期 300 元起步。', cost: 300, pocket: 'skill' },
    { month: 4, key: 'qingming', kind: 'ask', tag: '清明', date: '4 月 4–6 日', title: '踏青', text: '南京的春天只有几周。去一趟栖霞山或玄武湖，100 元。', cost: 100, pocket: 'memory' },
    { month: 5, key: 'labour', kind: 'ask', tag: '五一', date: '5 月 1–5 日', title: '五一假期', text: '去扬州：高铁往返 140 + 青旅 60 + 瘦西湖学生票 50 + 吃 120 ≈ 370 元。', cost: 370, pocket: 'memory' },
    { month: 6, key: 'final', kind: 'info', tag: '期末', date: '6 月下旬', title: '期末周', text: '打印店排队，通宵，外卖涨到 25 一顿。这个月存不下什么。' },
    { month: 6, key: 'cet', kind: 'ask', tag: '四六级', date: '6 月中旬', title: '四六级报名', text: '江苏笔试 30 元/人。考不过，下次再来。', cost: 30, pocket: 'skill' },
    { month: 6, key: 'graduation', kind: 'ask', tag: '毕业季', major: true, date: '6 月下旬', title: '毕业旅行 / 送别饭', text: '大四的六月，很多人会花掉一大笔。1,200 元。', cost: 1200, pocket: 'memory' },
    { month: 8, key: 'intern', kind: 'gain', tag: '实习', date: '8 月', title: '实习工资', text: '这个暑假你实习了，拿到一笔钱。', amount: 3000 },
    { month: 9, key: 'newterm2', kind: 'ask', tag: '秋季开学', date: '9 月初', title: '开学采购', text: '教材、被套、新的耳机。300 元。', cost: 300, pocket: 'skill' },
    { month: 10, key: 'autumn', kind: 'ask', tag: '国庆·秋游', date: '10 月 1–7 日', title: '栖霞山看红叶', text: '旺季门票 50 元，学生半价 25。南京的秋天只有几周。', cost: 25, pocket: 'memory' },
    { month: 11, key: 'double11', kind: 'ask', tag: '双十一', date: '11 月 11 日', title: '双十一', text: '购物车里躺了很久的东西，今晚打折。500 元。', cost: 500, pocket: 'relation' },
    { month: 12, key: 'kaoyan', kind: 'ask', tag: '考研', date: '12 月下旬', title: '考研报名 / 冲刺班', text: '江苏报名费 120 元。冲刺班另算，看你要不要赌这一把。', cost: 120, pocket: 'skill' },
    { month: 12, key: 'newyear', kind: 'ask', tag: '跨年', date: '12 月 31 日', title: '跨年', text: '朋友约你跨年，人均 300 元。', cost: 300, pocket: 'memory' }
  ];


  /* ---------- 每个日子的插画（内联 SVG，离线可用） ---------- */
  var SCENES = {
    'winter-home': '<svg viewBox="0 0 200 120"><rect x="0" y="84" width="200" height="36" fill="#eef2f4"/><path d="M0 88c30-8 62 5 92-1s60-8 108 3v30H0z" fill="#f7fafb"/><rect x="120" y="58" width="46" height="28" fill="#cfd8dd"/><path d="M114 58l29-18 29 18z" fill="#a9b8c0"/><rect x="137" y="68" width="12" height="18" fill="#f2c96b"/><rect x="22" y="52" width="72" height="18" rx="4" fill="#8fa6b3"/><rect x="28" y="56" width="10" height="10" fill="#fdf6ea"/><rect x="44" y="56" width="10" height="10" fill="#fdf6ea"/><rect x="60" y="56" width="10" height="10" fill="#fdf6ea"/><circle cx="20" cy="22" r="2" fill="#dbe6ea"/><circle cx="54" cy="14" r="1.6" fill="#dbe6ea"/><circle cx="90" cy="30" r="1.8" fill="#dbe6ea"/><circle cx="152" cy="18" r="2" fill="#dbe6ea"/></svg>',

    'lucky-money': '<svg viewBox="0 0 200 120"><rect x="62" y="26" width="76" height="74" rx="6" fill="#c0452f"/><rect x="62" y="54" width="76" height="14" fill="#e8b24a"/><circle cx="100" cy="61" r="9" fill="#f2d08a"/><path d="M96 61h8M100 57v8" stroke="#b8862b" stroke-width="2" stroke-linecap="round"/><path d="M22 18v26M22 26h10l-10 12h10" stroke="#e8b24a" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="27" cy="52" rx="7" ry="9" fill="#c0452f" opacity=".85"/><rect x="176" y="20" width="12" height="30" rx="3" fill="#e8b24a" opacity=".8"/></svg>',

    'birthday': '<svg viewBox="0 0 200 120"><rect x="58" y="76" width="84" height="26" rx="4" fill="#e9c9a3"/><rect x="56" y="56" width="88" height="22" rx="4" fill="#d9a06a"/><path d="M64 78c0-8 6-14 12-14s12 6 12 14M100 78c0-8 6-14 12-14s12 6 12 14" fill="none" stroke="#b07a3f" stroke-width="2"/><rect x="80" y="38" width="4" height="18" fill="#c0452f"/><rect x="98" y="34" width="4" height="22" fill="#3f6f66"/><rect x="116" y="38" width="4" height="18" fill="#d79a3f"/><ellipse cx="82" cy="34" rx="3.5" ry="6" fill="#f2b04a"/><ellipse cx="100" cy="30" rx="3.5" ry="6" fill="#f2b04a"/><ellipse cx="118" cy="34" rx="3.5" ry="6" fill="#f2b04a"/><circle cx="40" cy="26" r="2" fill="#d98a6a"/><circle cx="162" cy="34" r="2.4" fill="#7fa8a0"/><circle cx="150" cy="18" r="1.6" fill="#d79a3f"/></svg>',

    'cet': '<svg viewBox="0 0 200 120"><rect x="44" y="20" width="86" height="76" rx="4" fill="#fdfaf3" stroke="#cbb497" stroke-width="2"/><path d="M56 34h62M56 44h62M56 54h48M56 64h56" stroke="#cbb497" stroke-width="2" stroke-linecap="round"/><circle cx="150" cy="72" r="18" fill="#fdf6ea" stroke="#8aa39c" stroke-width="2.5"/><path d="M150 62v10l7 5" stroke="#3f6f66" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M132 30l12-8" stroke="#d79a3f" stroke-width="4" stroke-linecap="round"/></svg>',

    'concert': '<svg viewBox="0 0 200 120"><rect x="0" y="86" width="200" height="34" fill="#2b2320"/><path d="M100 12l-26 74h52z" fill="#d79a3f" opacity=".28"/><path d="M56 16l14 70h-28z" fill="#7fa8a0" opacity=".25"/><path d="M144 16l-14 70h28z" fill="#d98a6a" opacity=".25"/><rect x="72" y="30" width="56" height="40" rx="3" fill="#201a17"/><circle cx="100" cy="50" r="7" fill="#f2c96b"/><circle cx="34" cy="96" r="7" fill="#1a1412"/><circle cx="58" cy="100" r="8" fill="#1a1412"/><circle cx="88" cy="98" r="7" fill="#1a1412"/><circle cx="118" cy="101" r="8" fill="#1a1412"/><circle cx="150" cy="97" r="7" fill="#1a1412"/><circle cx="174" cy="102" r="7" fill="#1a1412"/></svg>',

    'qingming': '<svg viewBox="0 0 200 120"><circle cx="156" cy="28" r="16" fill="#f2c96b" opacity=".9"/><path d="M0 92l40-38 30 22 26-28 34 30 30-18v40z" fill="#9fb8a4"/><path d="M0 100c40-10 80 6 120-2s60-6 80 4v18H0z" fill="#7fa890"/><path d="M96 120c-4-14 6-22 12-30" stroke="#fdf6ea" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',

    'labour': '<svg viewBox="0 0 200 120"><circle cx="46" cy="30" r="14" fill="#f2c96b"/><path d="M0 90l46-34 32 24 30-30 44 34 48-20v36H0z" fill="#a8bfae"/><path d="M0 100c44-8 82 8 124 0s52-4 76 6v14H0z" fill="#89ab95"/><rect x="120" y="94" width="34" height="18" rx="2" fill="#e8d5b8"/><path d="M120 94l17-12 17 12z" fill="#d79a3f"/></svg>',

    'final': '<svg viewBox="0 0 200 120"><rect x="20" y="14" width="60" height="44" rx="3" fill="#2b3440"/><circle cx="72" cy="26" r="0" fill="#f2c96b"/><path d="M34 34c4-4 8 4 12 0s8 4 12 0" stroke="#5b6b7a" stroke-width="1.5" fill="none"/><rect x="26" y="66" width="104" height="10" rx="2" fill="#d9c9b3"/><rect x="34" y="44" width="60" height="22" rx="2" fill="#fdf6ea" stroke="#cbb497" stroke-width="2"/><path d="M44 52h40M44 58h28" stroke="#cbb497" stroke-width="1.6" stroke-linecap="round"/><path d="M150 30v46" stroke="#4a4038" stroke-width="3" stroke-linecap="round"/><path d="M150 30l22-8v18l-22 8z" fill="#d79a3f"/><ellipse cx="150" cy="84" rx="16" ry="5" fill="#f2c96b" opacity=".55"/><rect x="138" y="84" width="24" height="6" rx="2" fill="#8a6a4a"/></svg>',

    'graduation': '<svg viewBox="0 0 200 120"><path d="M56 44l44-18 44 18-44 18z" fill="#2f3a46"/><path d="M74 52v20c0 6 12 10 26 10s26-4 26-10V52" fill="none" stroke="#2f3a46" stroke-width="5"/><path d="M144 44v22" stroke="#d79a3f" stroke-width="2.5" stroke-linecap="round"/><circle cx="144" cy="70" r="4" fill="#d79a3f"/><rect x="58" y="92" width="84" height="10" rx="2" fill="#e8d5b8"/><path d="M58 92h84" stroke="#cbb497" stroke-width="2"/></svg>',

    'summer': '<svg viewBox="0 0 200 120"><circle cx="160" cy="26" r="16" fill="#f2c96b"/><rect x="52" y="40" width="62" height="58" rx="6" fill="#d9a06a"/><rect x="52" y="58" width="62" height="8" fill="#b07a3f"/><path d="M76 40V22h14v18" fill="none" stroke="#b07a3f" stroke-width="4"/><rect x="132" y="52" width="44" height="30" rx="3" fill="#fdf6ea" stroke="#cbb497" stroke-width="2"/><path d="M140 62h28M140 70h20" stroke="#cbb497" stroke-width="2" stroke-linecap="round"/><path d="M24 96c18-8 36 4 54-2" stroke="#7fa8a0" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',

    'intern': '<svg viewBox="0 0 200 120"><rect x="46" y="44" width="86" height="52" rx="4" fill="#3b4754"/><rect x="54" y="52" width="70" height="36" rx="2" fill="#8fb3c9"/><rect x="36" y="96" width="106" height="8" rx="3" fill="#2b3440"/><rect x="146" y="36" width="30" height="42" rx="3" fill="#fdf6ea" stroke="#cbb497" stroke-width="2"/><rect x="152" y="44" width="18" height="14" rx="1" fill="#d98a6a"/><path d="M152 66h18M152 72h10" stroke="#cbb497" stroke-width="2" stroke-linecap="round"/></svg>',

    'newterm': '<svg viewBox="0 0 200 120"><rect x="56" y="20" width="88" height="66" rx="3" fill="#e8d5b8"/><path d="M56 20l44-10 44 10" fill="none" stroke="#b07a3f" stroke-width="3"/><rect x="72" y="34" width="16" height="16" rx="1" fill="#c9dbe6"/><rect x="96" y="34" width="16" height="16" rx="1" fill="#c9dbe6"/><rect x="120" y="34" width="16" height="16" rx="1" fill="#c9dbe6"/><rect x="72" y="58" width="16" height="16" rx="1" fill="#c9dbe6"/><rect x="96" y="58" width="16" height="16" rx="1" fill="#c9dbe6"/><rect x="120" y="58" width="16" height="16" rx="1" fill="#c9dbe6"/><rect x="30" y="70" width="30" height="30" rx="6" fill="#3f6f66"/><path d="M38 70v-8a7 7 0 0 1 14 0v8" fill="none" stroke="#3f6f66" stroke-width="3"/></svg>',

    'newterm2': '<svg viewBox="0 0 200 120"><rect x="56" y="20" width="88" height="66" rx="3" fill="#e8d5b8"/><path d="M56 20l44-10 44 10" fill="none" stroke="#b07a3f" stroke-width="3"/><rect x="72" y="34" width="16" height="16" rx="1" fill="#e6cdb2"/><rect x="96" y="34" width="16" height="16" rx="1" fill="#e6cdb2"/><rect x="120" y="34" width="16" height="16" rx="1" fill="#e6cdb2"/><rect x="72" y="58" width="16" height="16" rx="1" fill="#e6cdb2"/><rect x="96" y="58" width="16" height="16" rx="1" fill="#e6cdb2"/><rect x="120" y="58" width="16" height="16" rx="1" fill="#e6cdb2"/><rect x="30" y="70" width="30" height="30" rx="6" fill="#d98a6a"/><path d="M38 70v-8a7 7 0 0 1 14 0v8" fill="none" stroke="#d98a6a" stroke-width="3"/></svg>',

    'autumn': '<svg viewBox="0 0 200 120"><circle cx="152" cy="26" r="14" fill="#f2c96b" opacity=".85"/><path d="M0 92l38-32 30 20 26-26 32 28 28-16 46 26v28H0z" fill="#c98a5a"/><path d="M0 102c40-8 78 6 118-2s56-4 82 6v14H0z" fill="#b06a3c"/><path d="M96 62c-10-6-20-2-24 6 8 6 18 4 24-6z" fill="#bf5a2c"/><path d="M96 62c8-8 18-8 24-2-4 10-14 12-24 2z" fill="#d79a3f"/><path d="M96 62v18" stroke="#8a4a1c" stroke-width="2" stroke-linecap="round"/></svg>',

    'double11': '<svg viewBox="0 0 200 120"><path d="M40 34h14l10 48h66l12-36H60" fill="none" stroke="#4a4038" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="76" cy="94" r="6" fill="#4a4038"/><circle cx="118" cy="94" r="6" fill="#4a4038"/><rect x="112" y="10" width="34" height="54" rx="4" fill="#2f3a46"/><rect x="117" y="16" width="24" height="42" rx="2" fill="#c9dbe6"/><path d="M126 24h6v8h-6z" fill="#d98a6a"/><path d="M120 40h18M120 46h12" stroke="#8fa6b3" stroke-width="1.6" stroke-linecap="round"/><path d="M154 26l10-6M154 34h12M154 42l10 6" stroke="#d79a3f" stroke-width="2.5" stroke-linecap="round"/></svg>',

    'newyear': '<svg viewBox="0 0 200 120"><rect x="0" y="96" width="200" height="24" fill="#2b2320"/><rect x="16" y="70" width="16" height="26" fill="#3b3330"/><rect x="38" y="58" width="20" height="38" fill="#3b3330"/><rect x="64" y="74" width="14" height="22" fill="#3b3330"/><rect x="84" y="50" width="22" height="46" fill="#3b3330"/><rect x="112" y="66" width="18" height="30" fill="#3b3330"/><rect x="136" y="56" width="16" height="40" fill="#3b3330"/><rect x="158" y="72" width="18" height="24" fill="#3b3330"/><g stroke-linecap="round"><path d="M60 18v-8M60 26v8M48 22h-8M72 22h8M52 14l-5-5M68 14l5-5" stroke="#f2c96b" stroke-width="2"/><path d="M136 30v-7M136 38v7M126 34h-7M146 34h7" stroke="#d98a6a" stroke-width="2"/></g><circle cx="60" cy="22" r="3" fill="#fdf6ea"/><circle cx="136" cy="34" r="2.5" fill="#fdf6ea"/></svg>',

    'kaoyan': '<svg viewBox="0 0 200 120"><rect x="46" y="76" width="76" height="14" rx="2" fill="#8a6a4a"/><rect x="52" y="62" width="64" height="14" rx="2" fill="#3f6f66"/><rect x="48" y="48" width="72" height="14" rx="2" fill="#d98a6a"/><path d="M150 24v52" stroke="#4a4038" stroke-width="3" stroke-linecap="round"/><path d="M150 24l18-6v14l-18 6z" fill="#d79a3f"/><ellipse cx="150" cy="82" rx="15" ry="5" fill="#f2c96b" opacity=".5"/><rect x="28" y="30" width="34" height="34" rx="3" fill="#fdf6ea" stroke="#cbb497" stroke-width="2"/><path d="M34 40h22M34 48h22M34 56h14" stroke="#cbb497" stroke-width="2" stroke-linecap="round"/></svg>',

    'fu-phone': '<svg viewBox="0 0 200 120"><rect x="74" y="18" width="52" height="84" rx="8" fill="#2b2320"/><rect x="80" y="26" width="40" height="64" rx="3" fill="#7fa8a0"/><circle cx="100" cy="96" r="3" fill="#f2c96b"/><path d="M132 70c14 0 22 8 22 18" stroke="#d0a97e" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M30 60c8-6 18-6 26 0" stroke="#c9b79b" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',

    'fu-weak': '<svg viewBox="0 0 200 120"><rect x="88" y="22" width="10" height="54" rx="5" fill="#dfe7ea" stroke="#9fb4bc" stroke-width="2"/><rect x="90" y="48" width="6" height="30" rx="3" fill="#d98a6a"/><circle cx="93" cy="84" r="12" fill="#d98a6a"/><circle cx="93" cy="84" r="6" fill="#fdf6ea"/><path d="M118 40h44M118 54h34M118 68h40" stroke="#c9b79b" stroke-width="3" stroke-linecap="round"/><path d="M38 92c6-10 14-10 20 0" stroke="#9fb8a4" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',

    'fu-delay': '<svg viewBox="0 0 200 120"><rect x="46" y="16" width="92" height="88" rx="4" fill="#fdfaf3" stroke="#cbb497" stroke-width="2"/><path d="M60 36h64M60 50h64M60 64h40" stroke="#cbb497" stroke-width="2.5" stroke-linecap="round"/><circle cx="146" cy="86" r="18" fill="#c0452f" opacity=".18"/><circle cx="146" cy="86" r="18" fill="none" stroke="#c0452f" stroke-width="2.5"/><path d="M140 86l5 5 9-10" stroke="#c0452f" stroke-width="3" fill="none" stroke-linecap="round"/></svg>'
  };

  /**
   * 意外事件：不再"每年掷一次抽哪个"，而是挂在具体场景上，
   * 每到该发生的时间点，按真实概率各自判定一次。
   *
   * 单次概率由年化概率反推：p = 1 - (1 - 年化)^(1/机会点)
   *   挂科重修 6.9%/年 · 2 次期末   → 3.5%/次
   *   电信诈骗 5.8%/年 · 4 次开学季 → 1.5%/次
   *   手机被偷 5.0%/年 · 5 次出门   → 1.0%/次
   *   生病住院 2.0%/年 · 3 次换季   → 0.7%/次
   */
  var ACCIDENT_RATE = { fail: 0.035, fraud: 0.015, phone: 0.010, illness: 0.007 };

  var ACCIDENTS = {
    phone: {
      key: 'phone', name: '手机被偷', emoji: '📱',
      text: '散场的人潮把你往外推。你再摸口袋，空了。',
      options: [
        { key: 'new', label: '买台新的', sub: '2,500 元 · 应急金见底', cost: 2500, pocket: 'freedom', memory: '手机被偷，换了新的' },
        { key: 'used', label: '买台二手的', sub: '1,200 元 · 能用就行', cost: 1200, pocket: 'freedom', memory: '手机被偷，买了二手的' },
        { key: 'borrow', label: '借室友旧手机顶着', sub: '0 元 · 关系 −1.5', cost: 0, rel: -1.5, memory: '手机被偷，借手机撑了半年' }
      ]
    },
    fraud: {
      key: 'fraud', name: '电信诈骗', emoji: '⚠️',
      text: '“同学，刷单返利，一天三百。”你垫了 300，对方说再补 1,200 就能连本带利提现。',
      options: [
        { key: 'report', label: '立刻报警、冻结账户', sub: '损失 300 元 · 止住', cost: 300, pocket: 'freedom', memory: '被刷单诈骗 300' },
        { key: 'chase', label: '再投 1,200 想回本', sub: '三成能回本，七成血本无归', cost: 1200, pocket: 'freedom', gamble: 0.3, memory: '被刷单诈骗，越陷越深' },
        { key: 'stop', label: '认栽，当交学费', sub: '损失 300 元 · 不再纠缠', cost: 300, pocket: 'freedom', memory: '被刷单诈骗 300，及时止损' }
      ]
    },
    fail: {
      key: 'fail', name: '挂科重修', emoji: '📉',
      text: '成绩出来了。那门课挂了，补考也没过。教务系统里多了一行“重修”。',
      options: [
        { key: 'retake', label: '交钱重修', sub: '400 元 · 下学期重来', cost: 400, pocket: 'skill', memory: '挂了一门课，交钱重修' },
        { key: 'self', label: '找同学补课，自己啃', sub: '200 元 · 欠个人情', cost: 200, pocket: 'skill', rel: -0.5, memory: '挂科，靠同学补课' },
        { key: 'delay', label: '硬扛，明年再说', sub: '0 元 · 毕业延期风险', cost: 0, flag: 'delay', memory: '挂科没修，一直拖着' }
      ]
    },
    illness: {
      key: 'illness', name: '生病住院', emoji: '🏥',
      text: '换季那阵子，你的扁桃体先投降了。校医院说最好住院观察两天。',
      options: [
        { key: 'hospital', label: '住院两天', sub: '1,200 元 · 医保报销后自付', cost: 1200, pocket: 'freedom', memory: '住院两天' },
        { key: 'clinic', label: '门诊拿药硬顶', sub: '300 元 · 好得慢一点', cost: 300, pocket: 'freedom', memory: '生病，门诊拿药' },
        { key: 'endure', label: '硬扛，多喝热水', sub: '0 元 · 落下病根', cost: 0, flag: 'weak', memory: '生病硬扛，身体差了' }
      ]
    }
  };

  // 习惯衰减：设定"坚持 N 年"，超过后每月投入减半（人性税）
  function habitActive(monthIndex) {
    var habitYears = state.habit === 'forever' ? 999 : Number(state.habit);
    var month = monthIndex + 1;
    var year = Math.ceil(month / 12);
    return year <= habitYears;
  }

  // 近期推进一个月（rnd 为固定种子随机数，保证回看时意外稳定）
  function advanceNearMonth(monthIndex, rnd) {
    var n = state.near;
    // 生活费流入
    var allowance = monthlyAllowance();
    n.cash += allowance;
    // 基础支出
    n.cash -= monthlyBase(monthIndex);
    // 期末周这种月份额外花销
    var ev = eventFor(monthIndex);

    // 习惯投入：默认每天省一笔（amount），投入"钱袋"（存钱）
    var daily = state.amount;
    var invest = daily * 30; // 每月约省 amount×30
    if (!habitActive(monthIndex)) invest = Math.round(invest * 0.5); // 人性税
    if (invest > 0) {
      n.money += invest;
      n.cash -= invest;
    }

    // 收入类始终按静态校历发放（不被同月的其他事件遮蔽）
    var gainSrc = SPECIAL_DAYS.filter(function (x) { return x.month === monthParts(monthIndex).month && x.kind === 'gain'; })[0];
    if (gainSrc) {
      var gParts = monthParts(monthIndex);
      n.cash += gainSrc.amount;
      n.events.push({ t: gainSrc.title, y: gParts.year, m: gParts.month, amt: gainSrc.amount, note: gainSrc.text, special: gainSrc.key });
    }

    // 意外不再在推进时自动结算：改为按场景触发、由玩家在事件第二幕里回应
  }

  /** 取某个月的静态校历事件（不含动态生成的演唱会/旅行/生日）。 */
  function specialFor(monthIndex) {
    var parts = monthParts(monthIndex);
    var list = SPECIAL_DAYS.filter(function (s) { return s.month === parts.month; });
    return list.length ? list[0] : null;
  }

  /** 已经降档过几次。 */
  function gearDowngradeCount() {
    var c = 0;
    for (var m = 0; m < NEAR_MONTHS; m++) {
      var d = state.near.decisions[m];
      if (d && d.gearChoice === 'downgrade') c++;
    }
    return c;
  }

  /**
   * 换挡规则：某个月选了「降档」，只影响紧接着的下一个月；
   * 累计降档超过 3 次后，从第 4 次起不再回调（一直保持降档）。
   * @returns 月份索引 -> 是否降档
   */
  function computeGearSet() {
    var set = {};
    var count = 0;
    for (var m = 0; m < NEAR_MONTHS; m++) {
      var d = state.near.decisions[m];
      if (!d || d.gearChoice !== 'downgrade') continue;
      count++;
      if (count > 3) {
        for (var k = m + 1; k < NEAR_MONTHS; k++) set[k] = true;
        break;
      }
      if (m + 1 < NEAR_MONTHS) set[m + 1] = true;
    }
    return set;
  }

  /**
   * 重放到第 monthIndex 个月：玩家在 state.near.decisions 里的选择会被应用，
   * 没有记录决策的月份按"默认分配"（全部存起来）处理。
   */
  function runNearTo(monthIndex) {
    var n = state.near;
    n.cash = 0; n.money = 0; n.skill = 0; n.memory = 0; n.relation = 0; n.freedom = 0;
    n.events = [];
    n.monthLog = [];
    n.memories = [];
    n.relations = {};
    n.romance = null;
    n.flags = {};
    n.stats = blankStats();
    n.statsAtMonth = [];
    n.gearSet = computeGearSet();
    // 每年意外结果需要稳定：用固定种子重放，保证回看不乱跳
    var rnd = mulberry32(20260901 + (state.birthday || 6));
    n.flagsAtMonth = [];
    for (var m = 0; m <= monthIndex; m++) {
      // 记录"进入这个月之前"的状态标记（意外触发率要用它，且不能被本月结果污染）
      n.flagsAtMonth[m] = {};
      for (var fk in n.flags) { if (n.flags[fk]) n.flagsAtMonth[m][fk] = true; }
      n.statsAtMonth[m] = { study: n.stats.study, social: n.stats.social, exp: n.stats.exp, body: n.stats.body };
      advanceNearMonth(m, rnd);
      var d = n.decisions[m];
      // 顺序很重要：先经历事件（花掉的钱从现金扣），再分配剩下的闲钱
      if (d && d.eventChoice) {
        var ev = eventFor(m);
        if (ev) applyEventChoice(m, ev, d.eventChoice, { companion: d.companion, basePrice: d.basePrice });
      }
      // 第二幕：意外
      if (d && d.accidentChoice) {
        var acc = accidentFor(m);
        if (acc) applyAccidentChoice(m, acc, d.accidentChoice);
      }
      if (d && d.plan) applyPlan(m, d.plan);
    }
    n.done84 = monthIndex >= NEAR_MONTHS - 1;
  }

  /** 把本月闲钱按计划分配到各口袋。 */
  function applyPlan(monthIndex, plan) {
    var n = state.near;
    var free = monthFreeMoney(monthIndex);
    var total = 0;
    Object.keys(plan).forEach(function (k) { total += plan[k] || 0; });
    if (total <= 0) return;
    // 按比例缩放，保证不超过闲钱
    var scale = free > 0 ? Math.min(1, free / total) : 0;
    POCKETS.forEach(function (k) {
      var v = Math.round((plan[k] || 0) * scale);
      if (v > 0) { n[k] += v; n.cash -= v; }
    });
    // 计划里没分完的部分留在现金
  }

  /** 本月静态收入（压岁钱 / 实习工资）。 */
  function monthGain(monthIndex) {
    var mo = monthParts(monthIndex).month;
    var g = SPECIAL_DAYS.filter(function (x) { return x.month === mo && x.kind === 'gain'; })[0];
    return g ? g.amount : 0;
  }

  /** 已选事件实际花掉的钱（用于从本月闲钱里扣除）。 */
  function eventCostFor(monthIndex, decision) {
    if (!decision || !decision.eventChoice) return 0;
    var ev = eventFor(monthIndex);
    if (!ev) return 0;
    var key = decision.eventChoice;

    if (ev.key === 'concert') {
      if (key === 'scalper') {
        return (decision.basePrice || 680) + ((ev.scalper && ev.scalper.extra) || 300);
      }
      var tier = (ev.options || []).filter(function (o) { return o.key === key; })[0];
      if (!tier || tier.win === false) return 0;
      return tier.cost || 0;
    }

    if (ev.key === 'summer') {
      var place = (ev.options || []).filter(function (o) { return o.key === key; })[0];
      if (!place || !place.cost) return 0;
      var comp = null;
      (ev.companions || []).forEach(function (c) { if (c.key === decision.companion) comp = c; });
      if (!comp) comp = (ev.companions || [])[0];
      var factor = comp ? comp.factor : 1;
      return Math.round(place.cost * factor / 10) * 10;
    }

    var opt = (ev.options || []).filter(function (o) { return o.key === key; })[0];
    return opt ? (opt.cost || 0) : 0;
  }

  /** 这个月的事件是否已经处理完（抢票失败还要再选黄牛/放弃）。 */
  function eventResolved(ev, decision) {
    if (!isAskingEvent(ev)) return true;
    if (!decision || !decision.eventChoice) return false;
    if (ev.key === 'concert') {
      var opt = (ev.options || []).filter(function (o) { return o.key === decision.eventChoice; })[0];
      if (opt && opt.win === false) return false;   // 还没选黄牛或放弃
    }
    return true;
  }

  /** 已选意外实际花掉的钱（含赌输了追加的 1,200）。 */
  function accidentCostFor(monthIndex) {
    var d = state.near.decisions[monthIndex];
    if (!d || !d.accidentChoice) return 0;
    var acc = accidentFor(monthIndex);
    if (!acc) return 0;
    var opt = (acc.options || []).filter(function (o) { return o.key === d.accidentChoice; })[0];
    if (!opt) return 0;
    var cost = opt.cost || 0;
    if (typeof opt.gamble === 'number' && accidentRng(monthIndex + 500)() > opt.gamble) cost += 1200;
    return cost;
  }

  /** 本月可自由分配的闲钱（先扣掉事件和意外的花费）。 */
  function monthFreeMoney(monthIndex) {
    var allowance = monthlyAllowance();
    var base = monthlyBase(monthIndex);
    var extra = monthGain(monthIndex);
    var habitCut = state.amount * 30;
    var spent = eventCostFor(monthIndex, state.near.decisions[monthIndex]) + accidentCostFor(monthIndex);
    return Math.max(0, allowance + extra - base - habitCut - spent);
  }

  function nearPocketTotal() {
    return state.near.money + state.near.skill + state.near.memory + state.near.relation + state.near.freedom;
  }

  /* ---------- 长期三线（按年） ---------- */

  function farLineActual() {
    // 实际：把近期七年攒的钱按 8% 复利 30 年（简化：一次性投入）
    var seed = state.near.money; // 七年攒下的"钱袋"
    return fvSingle(seed, state.rate, FAR_YEARS);
  }

  function farLineIdeal() {
    // 理想：假设七年全程每天省 + 之后每月继续存（简化：一次性 + 持续）
    var seed = state.near.money;
    var ideal = fvSingle(seed, state.rate, FAR_YEARS);
    // 之后每年继续投 amount*365 的一半（习惯保持）
    ideal += fvYearly(state.amount * 365 * 0.5, state.rate, FAR_YEARS - NEAR_YEARS);
    return ideal;
  }

  function farLineZero() {
    return 0;
  }

  function buildFarSeries() {
    var series = { actual: [], ideal: [], zero: [] };
    for (var y = 0; y <= FAR_YEARS; y++) {
      var seed = state.near.money;
      var actual = fvSingle(seed, state.rate, y);
      var ideal = fvSingle(seed, state.rate, y) + (y > NEAR_YEARS ? fvYearly(state.amount * 365 * 0.5, state.rate, y - NEAR_YEARS) : 0);
      series.actual.push(actual);
      series.ideal.push(ideal);
      series.zero.push(0);
    }
    return series;
  }

  function drawCurve() {
    var canvas = $('#curveCanvas');
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = canvas.clientWidth || 420;
    var H = canvas.clientHeight || 180;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var series = buildFarSeries();
    var max = Math.max.apply(null, series.ideal) * 1.1;
    if (max <= 0) max = 1;

    var pad = 12;
    var px = function (y) { return pad + (W - pad * 2) * (y / FAR_YEARS); };
    var py = function (v) { return H - pad - (H - pad * 2) * (v / max); };

    var lines = [
      { key: 'actual', color: '#bf5a2c', label: '实际' },
      { key: 'ideal', color: '#d79a3f', label: '理想' },
      { key: 'zero', color: '#b9a48a', label: '从未省' }
    ];
    lines.forEach(function (line) {
      var arr = series[line.key];
      ctx.beginPath();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      arr.forEach(function (v, i) {
        if (i === 0) ctx.moveTo(px(i), py(v));
        else ctx.lineTo(px(i), py(v));
      });
      ctx.stroke();
    });

    // 当前年份标记
    var curY = state.slider; // far 模式下 slider=年
    ctx.fillStyle = 'rgba(36,31,27,.75)';
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillText('第 ' + Math.round(curY) + ' 年', px(curY) - 14, H - 2);
  }

  /* ---------- 界面 ---------- */

  function go(name) {
    $$('.screen').forEach(function (screen) {
      screen.classList.toggle('is-active', screen.getAttribute('data-screen') === name);
    });
    var index = SCREENS.indexOf(name);
    $('#barFill').style.width = (index / (SCREENS.length - 1) * 100) + '%';
    window.scrollTo(0, 0);
    if (name === 'archive') { renderArchive(); }
    if (name === 'archive') { renderArchive(); }
    if (name === 'machine') { prepareMachine(); }
    if (name === 'replay') { playRecap(); }
    if (name === 'reveal') { drawStars(); }
    if (name === 'ending' || name === 'report') { ensureLedger(); }
    if (name === 'ending') { renderEnding(); }
    if (name === 'report') { renderReport(); }
  }

  // 结算前确保近期账本已跑满（深链直达 ending/report 时也能拿到真实数字）
  function ensureLedger() {
    if (!state.near.done84) {
      runNearTo(NEAR_MONTHS);
      state.slider = NEAR_MONTHS;
    }
  }

  /* 身份 */
  function bindIdentity() {
    var required = ['grade', 'school', 'major', 'birthday'];
    function update() {
      var done = required.every(function (k) { return state[k] !== null; });
      $('#identityNext').disabled = !done;
      if (state.grade) {
        $('#setupKicker').textContent = GRADES[state.grade].label + ' · 七年账本';
        $('#setupTitle').innerHTML = '你站在奶茶店门口，<br>手里攥着 <span class="hl">' + state.amount + '</span> 元。' +
          '<br><small class="step-sub">' + GRADES[state.grade].msg + '</small>';
      }
    }
    $('#gradeChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      state.grade = chip.getAttribute('data-grade');
      $$('.chip', this).forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      update();
    });
    $('#schoolChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      state.school = chip.getAttribute('data-school');
      $$('.chip', this).forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      update();
    });
    $('#majorChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      state.major = chip.getAttribute('data-major');
      $$('.chip', this).forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      update();
    });
    $('#birthdayChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      state.birthday = Number(chip.getAttribute('data-birthday'));
      $$('.chip', this).forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      update();
    });
    $('#budgetChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      state.budget = Number(chip.getAttribute('data-budget'));
      $$('.chip', this).forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      update();
    });
    $('#identityNext').addEventListener('click', function () { go('archive'); });
  }

  /* ---------- 生活建档：界面 ---------- */

  function renderArchive() {
    var list = $('#archiveList');
    if (!list) return;
    if (!state.profile) state.profile = {};
    var p = state.profile;
    list.innerHTML = '';

    ARCHIVE_QUESTIONS.forEach(function (q, i) {
      var answered = typeof p[q.key] === 'number';
      var locked = i > 0 && typeof p[ARCHIVE_QUESTIONS[i - 1].key] !== 'number';
      var block = document.createElement('div');
      block.className = 'arch-q' + (locked ? ' is-locked' : '');
      block.setAttribute('data-q', q.key);
      var opts = q.options.map(function (o) {
        var on = answered && p[q.key] === o.v;
        return '<button class="arch-opt' + (on ? ' is-on' : '') + '" data-aq="' + q.key + '" data-av="' + o.v + '">' +
          '<b>' + o.label + '</b><small>' + o.sub + '</small></button>';
      }).join('');
      block.innerHTML = '<p class="arch-scene">' + q.scene + '</p>' +
        '<p class="arch-text">' + q.text + '</p>' +
        '<div class="arch-opts">' + opts + '</div>';
      list.appendChild(block);
    });

    renderArchiveSummary();
    $('#archiveNext').disabled = !profileAnswered();
  }

  function renderArchiveSummary() {
    var box = $('#archiveSummary');
    var body = $('#summaryBody');
    if (!box || !body) return;
    if (!profileAnswered()) { box.hidden = true; return; }
    box.hidden = false;

    var p = state.profile;
    var meal = profileMeal();
    var fixed = profileFixed();
    var left = state.budget - fixed;
    var frugal = profileFixedFrugal();
    var fourYears = Math.max(0, left) * 48;

    var lines = [
      ['餐费（早 ' + p.breakfast + ' / 午 ' + p.lunch + ' / 晚 ' + p.dinner + ' 元）', fmtMoney(meal)],
      ['交通', fmtMoney(p.transport)],
      ['日用 + 通讯', fmtMoney(DAILY_COST + TELECOM_COST)],
      ['社交', fmtMoney(p.social)]
    ];
    var html = lines.map(function (l) {
      return '<div class="sum-line"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>';
    }).join('');
    html += '<div class="sum-line total"><span>每月固定支出</span><b>' + fmtMoney(fixed) + '</b></div>';
    html += '<div class="sum-line"><span>生活费 ' + fmtMoney(state.budget) + ' 扣完还剩</span><b>' + (left >= 0 ? '+' : '−') + fmtMoney(Math.abs(left)) + '</b></div>';

    var note = left >= 0
      ? '按这个过法，四年能攒下约 ' + fmtMoney(fourYears) + '。'
      : '按这个过法，每个月要缺 ' + fmtMoney(-left) + '，得靠兼职或家里补。';
    if (frugal < fixed) {
      note += '<br>如果换成最省的过法（食堂 + 单车），每月能多攒 ' + fmtMoney(fixed - frugal) + '。';
    }
    html += '<p class="sum-note">' + note + '</p>';
    body.innerHTML = html;
  }

  function answerArchive(key, value) {
    if (!state.profile) state.profile = {};
    state.profile[key] = value;
    renderArchive();
    // 自动滚到下一条
    var idx = ARCHIVE_QUESTIONS.findIndex(function (q) { return q.key === key; });
    var next = ARCHIVE_QUESTIONS[idx + 1];
    if (next) {
      var el = document.querySelector('[data-q="' + next.key + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function bindArchive() {
    $('#archiveList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-aq]');
      if (!btn) return;
      answerArchive(btn.getAttribute('data-aq'), Number(btn.getAttribute('data-av')));
    });
    $('#archiveNext').addEventListener('click', function () {
      if (!profileAnswered()) return;
      go('setup');
    });
  }

  /* 输入 */
  function readInputs(commit) {
    var amount = parseInt($('#amount').value, 10);
    if (isFinite(amount)) {
      state.amount = Math.min(500, Math.max(1, amount));
      if (commit) $('#amount').value = state.amount;
    } else if (commit) {
      state.amount = 15;
      $('#amount').value = 15;
    }
    $('#amountEcho').textContent = state.amount;
    var perYear = (state.amount * 365).toLocaleString('zh-CN');
    $('#setupHint').textContent = state.amount === 15
      ? '每天一杯，一年就是 ' + perYear + ' 元。'
      : '每天 ' + state.amount + ' 元，一年就是 ' + perYear + ' 元。';
  }

  /* 习惯 chips */
  function bindHabit() {
    $('#habitChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      state.habit = chip.getAttribute('data-habit') === 'forever' ? 'forever' : Number(chip.getAttribute('data-habit'));
      $$('.chip', this).forEach(function (c) { c.classList.toggle('is-on', c === chip); });
    });
  }

  /* ---------- 时间机器（双模式） ---------- */

  var pendingSlider = null;

  function prepareMachine() {
    if (pendingSlider !== null) { state.slider = pendingSlider; pendingSlider = null; }
    var slider = $('#timeSlider');

    if (state.timelineMode === 'near') {
      slider.min = 0; slider.max = NEAR_MONTHS - 1; slider.step = 1;
      if (state.slider > NEAR_MONTHS - 1) state.slider = 0;
      $('#tlMid').textContent = '3 年半';
      $('#tlEnd').textContent = '7 年';
      $('#nearStage').hidden = false;
      $('#farStage').hidden = true;
      $('#rollBtn').hidden = true;
      $('#paceSeg').hidden = false;
      $('#readoutBox').hidden = true;        // 近期：主卡已表达清楚，读数收进抽屉
      $('#timelineWrap').hidden = false;
      $('#ledgerDrawer').hidden = true;
      $('#ledgerToggle').classList.remove('is-on');
      $('#nextMonthBtn').textContent = state.slider >= NEAR_MONTHS - 1 ? '看结局 →' : '下一个月 →';
      if (document.querySelector('#seasonLayer').childElementCount === 0) buildSeasonParticles();
    } else {
      slider.min = 0; slider.max = FAR_YEARS; slider.step = 1;
      // 长期模式依赖近期账本做种子：切过来时若账本未跑满，先补跑七年
      if (!state.near.done84) {
        runNearTo(NEAR_MONTHS - 1);
      }
      // 把 slider 钳到 0..30（年）。若之前停留在近期月份（0..83），跳到 0。
      if (state.slider > FAR_YEARS) state.slider = 0;
      $('#tlMid').textContent = '15 年';
      $('#tlEnd').textContent = '30 年';
      $('#nearStage').hidden = true;
      $('#farStage').hidden = false;
      $('#rollBtn').hidden = false;
      $('#paceSeg').hidden = true;
      $('#readoutBox').hidden = false;
      $('#timelineWrap').hidden = false;
      $('#nextMonthBtn').textContent = '继续 →';
    }
    slider.value = state.slider;

    $('#rateSeg').hidden = false;
    $('#inflationRow').hidden = false;
    sync();
  }

  function sync() {
    var info = {};

    if (state.timelineMode === 'near') {
      renderNear();

    } else {
      // 长期
      var y = state.slider;
      state.far.years = y;
      var series = buildFarSeries();
      var actual = series.actual[y];
      var ideal = series.ideal[y];
      var zero = series.zero[y];

      var valueNum2 = $('#valueNum');
      var valueUnit2 = $('#valueUnit');
      var readout2 = $('.readout-value');
      readout2.classList.remove('is-text');
      var parts2 = readoutParts(actual);
      valueNum2.textContent = parts2.num;
      valueUnit2.textContent = parts2.unit;
      $('#readoutLabel').textContent = y === 0 ? '现在' : '第 ' + y + ' 年';
      $('#ghostLine').textContent = '理想：' + fmtMoney(ideal) + ' · 实际：' + fmtMoney(actual);

      $('#narration').textContent = narrationFar(y, actual, ideal);

      drawCurve();

      var slider2 = $('#timeSlider');
      slider2.style.setProperty('--p', (y / FAR_YEARS * 100) + '%');
    }

    $('#disclaimer').textContent = disclaimerText();
  }

  var POCKET_NAMES = { money: '钱', skill: '能力', memory: '经历', relation: '关系', freedom: '选择权' };
  var POCKET_COLORS = { money: '#c9a86a', skill: '#7fa8a0', memory: '#d98a6a', relation: '#b58cb0', freedom: '#8fa3c9' };

  /* ---------- 近期：每月决策界面 ---------- */

  /** 本月的决策是否已完成（分配过，或该月无闲钱）。 */
  function monthDecided(monthIndex) {
    var d = state.near.decisions[monthIndex];
    if (d && d.plan) return true;
    return monthFreeMoney(monthIndex) <= 0;
  }

  /** 找到下一个还没决策的月份，没有则返回 NEAR_MONTHS。 */
  function nextUndecided(from) {
    for (var m = Math.max(0, from); m < NEAR_MONTHS; m++) {
      if (!monthDecided(m)) return m;
    }
    return NEAR_MONTHS;
  }

  function renderNear() {
    var month = Math.max(0, Math.min(NEAR_MONTHS - 1, state.slider));
    state.slider = month;
    runNearTo(month);
    syncHeader(month);
    applySeason(month);

    var parts = monthParts(month);
    var label = '第 ' + parts.year + ' 年 · ' + parts.month + ' 月';
    $('#monthBadge').textContent = label;
    $('#monthLeft').textContent = (NEAR_MONTHS - month - 1) + ' 次';
    $('#readoutLabel').textContent = label;
    renderYearStrip();
    renderFlavor(month);

    var free = monthFreeMoney(month);
    var ev = eventFor(month);
    var decided = state.near.decisions[month];

    // 收入摘要（一行），明细点开才看
    var summaryEl = $('#incomeSummaryText');
    if (summaryEl) {
      summaryEl.textContent = free > 0
        ? '这个月能决定 ' + fmtMoney(free)
        : '这个月没有闲钱';
    }

    // 收入卡片
    $('#incAllow').textContent = fmtMoney(monthlyAllowance());
    if (monthGain(month) > 0) {
      $('#incExtraRow').hidden = false;
      $('#incExtraLabel').textContent = '额外收入';
      $('#incExtra').textContent = '+' + fmtMoney(monthGain(month));
    } else {
      $('#incExtraRow').hidden = true;
    }
    $('#incBase').textContent = '−' + fmtMoney(monthlyBase(month));
    $('#incHabit').textContent = '−' + fmtMoney(state.amount * 30);
    $('#incFree').textContent = fmtMoney(free);

    // 事件卡片
    var evBody = $('#specialBody');
    if (ev) {
      $('#specialCard').hidden = false;
      $('#specialTag').textContent = ev.tag + (ev.date ? ' · ' + ev.date : '');
      $('#specialText').textContent = ev.title + '：' + ev.text;
      // 每个日子配一张内联 SVG 插画（离线可用）
      var sceneEl = $('#specialScene');
      sceneEl.innerHTML = SCENES[ev.scene || ev.key] || '';
      evBody.innerHTML = '';

      var chosenOpt = (ev.options || []).filter(function (o) { return o.key === (decided && decided.eventChoice); })[0];

      if (decided && decided.eventChoice) {
        if (ev.key === 'concert' && chosenOpt && chosenOpt.win === false) {
          evBody.innerHTML = '<p class="special-done">3 秒售罄。你守着页面刷了十分钟。</p>' +
            '<button class="mini-btn yes" data-ev="scalper" data-base="' + (chosenOpt.cost || 680) + '">找黄牛（行情 +' + fmtMoney(ev.scalper.extra) + '）</button>' +
            '<button class="mini-btn no" data-ev="giveup">算了</button>';
        } else if (decided.eventChoice === 'scalper') {
          evBody.innerHTML = '<p class="special-done">' +
            (ev.scalper && ev.scalper.fake ? '票是假的。钱退不回来。' : '你从黄牛手里买到了票，贵了 300。') + '</p>';
        } else if (decided.eventChoice === 'giveup') {
          evBody.innerHTML = '<p class="special-done">你放弃了这场演出。</p>';
        } else if (chosenOpt) {
          var costText = chosenOpt.cost ? '（−' + fmtMoney(chosenOpt.cost) + '）' : '';
          evBody.innerHTML = '<p class="special-done">你选择了：' + chosenOpt.label + costText + '</p>';
        }
        // 事件花掉的钱直接从本月闲钱里出，把"还剩多少"摆出来
        if (eventResolved(ev, decided)) {
          var spend = eventCostFor(month, decided);
          if (spend > 0) {
            evBody.innerHTML += '<p class="comp-hint">这件事花掉 ' + fmtMoney(spend) +
              '，这个月还剩 ' + fmtMoney(free) + ' 可以分配。</p>';
          }
        }
      } else if (ev.options && ev.options.length) {
        var html = '';
        if (ev.companions) {
          html += '<div class="comp-row">' + ev.companions.map(function (c) {
            return '<button class="chip comp-chip' + (c.key === 'solo' ? ' is-on' : '') + '" data-comp="' + c.key + '">' + c.name + '</button>';
          }).join('') + '</div>' +
            '<p class="comp-hint">跟谁去，会影响花销，也可能影响遇见谁。</p>';
        }
        html += ev.options.map(function (o) {
          var badge = o.kind ? '<span class="opt-kind ' + o.kind + '">' + (OPT_TAGS[o.kind] || '') + '</span>' : '';
          return '<button class="mini-btn' + (o.key === 'skip' ? ' no' : '') + '" data-ev="' + o.key + '">' +
            '<b>' + badge + o.label + '</b>' + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</button>';
        }).join('');
        html += '<p class="comp-hint">这笔钱从本月闲钱里出，选完再看还剩多少。</p>';
        evBody.innerHTML = html;
      }
    } else {
      $('#specialCard').hidden = true;
    }

    // —— 第二幕：意外卡 ——
    var accCard = $('#accidentCard');
    var acc = accidentFor(month);
    if (acc) {
      accCard.hidden = false;
      $('#accidentEmoji').textContent = acc.emoji;
      $('#accidentTitle').textContent = acc.name;
      $('#accidentText').textContent = acc.text;
      $('#accidentProb').textContent = '这个场景下的触发概率 ' +
        (ACCIDENT_RATE[acc.key] * 100).toFixed(1) + '%（按真实年化概率换算到这个场景）';
      var accBody = $('#accidentBody');
      if (decided && decided.accidentChoice) {
        var aopt = (acc.options || []).filter(function (o) { return o.key === decided.accidentChoice; })[0];
        accBody.innerHTML = '<p class="special-done">你的选择：' + (aopt ? aopt.label : '') + '</p>';
      } else {
        accBody.innerHTML = acc.options.map(function (o) {
          return '<button class="mini-btn' + (o.cost ? '' : ' no') + '" data-acc="' + o.key + '">' +
            '<b>' + o.label + '</b><small>' + o.sub + '</small></button>';
        }).join('');
      }
    } else {
      accCard.hidden = true;
    }

    // —— 换挡提示：这个月比第一个月存得少，就问要不要下个月降档 ——
    var gearCard = $('#gearCard');
    var gearStatus = $('#gearStatus');
    var baseSaved = state.near.baseline;
    var downgradedNow = !!(state.near.gearSet && state.near.gearSet[month]);

    gearCard.hidden = true;
    if (downgradedNow) {
      gearStatus.hidden = false;
      gearStatus.textContent = '这个月降档中：食堂 + 单车 + 少出去，固定支出降到 ' +
        fmtMoney(profileFixedDowngraded()) + '。' +
        (gearDowngradeCount() > 3 ? '（已超过 3 次，不再调回）' : '下个月自动调回原档。');
    } else {
      gearStatus.hidden = true;
    }

    if (state.pace === 'monthly' && month >= 1 && typeof baseSaved === 'number' && canDowngrade() &&
      gearDowngradeCount() <= 3 && eventResolved(ev, decided) && !(decided && decided.gearChoice)) {
      var freeNow = monthFreeMoney(month);
      if (freeNow < baseSaved) {
        gearCard.hidden = false;
        $('#gearText').textContent = '第一个月你能存下 ' + fmtMoney(baseSaved) +
          '，这个月只剩 ' + fmtMoney(freeNow) + '（少了 ' + fmtMoney(baseSaved - freeNow) + '）。';
        $('#gearRule').textContent = '规则：降档只影响下一个月，再下个月自动调回原档；' +
          '累计降档超过 3 次后不再调回。你目前降档 ' + gearDowngradeCount() + ' 次。';
      }
    }

    // —— 节奏相关界面：学年方案 / 学年结算 / 逐月决策 ——
    var grid = $('#decideGrid');
    var planCard = $('#planCard');
    var settleCard = $('#yearSettle');
    var y = yearIndex(month);
    var yearPlan = state.near.plans[y];
    var isYearEnd = (month % 12) === 11;
    var spPending = !eventResolved(ev, decided);

    planCard.hidden = true;
    settleCard.hidden = true;

    if (state.pace === 'yearly' && !yearPlan) {
      // 学年开始（或刚切到学年模式）：先定方案
      planCard.hidden = false;
      setIncomeVisible(false);
      $('#planTitle').textContent = '第 ' + (y + 1) + ' 年，你的钱怎么分？';
      var plist = $('#planList');
      plist.innerHTML = '';
      PLANS.forEach(function (p) {
        var btn = document.createElement('button');
        btn.className = 'plan-item';
        btn.setAttribute('data-plan', p.key);
        btn.innerHTML = '<span class="plan-icon">' + p.icon + '</span>' +
          '<span class="plan-body"><b>' + p.name + '</b><small>' + p.desc + '</small></span>';
        plist.appendChild(btn);
      });
      $('#decideTitle').textContent = '';
      grid.innerHTML = '';
      $('#monthLogWrap').hidden = true;
    } else if (state.pace === 'yearly' && isYearEnd && yearPlan && !spPending) {
      // 学年结束：结算卡
      settleCard.hidden = false;
      setIncomeVisible(false);
      grid.innerHTML = '';
      $('#decideTitle').textContent = '';
      $('#monthLogWrap').hidden = true;
      renderYearSettle(y);
    } else if (state.pace === 'yearly') {
      // 学年模式普通月份：按方案自动安排
      setIncomeVisible(true);
      $('#decideTitle').textContent = spPending ? '这件事得你自己决定。' : '这个月按你的方案自动安排。';
      grid.innerHTML = '';
      if (decided && decided.plan) {
        POCKETS.forEach(function (k) {
          var v = decided.plan[k] || 0;
          if (v <= 0) return;
          var div = document.createElement('div');
          div.className = 'decide-item is-done';
          div.innerHTML = '<span class="d-icon">' + POCKET_ICONS[k] + '</span>' +
            '<span class="d-body"><b>' + POCKET_NAMES[k] + '</b><small>' + fmtMoney(v) + '</small></span>';
          grid.appendChild(div);
        });
      }
    } else if (!eventResolved(ev, decided) || !accidentResolved(month)) {
      // 先经历事件（和它的第二幕），再看这个月能剩多少、怎么存
      setIncomeVisible(true);
      $('#decideTitle').textContent = '先把这件事处理完。';
      grid.innerHTML = '<p class="decide-empty">处理完，才知道这个月还能剩多少。</p>';
    } else if (free <= 0) {
      setIncomeVisible(true);
      $('#decideTitle').textContent = '这个月没有闲钱可以分。';
      grid.innerHTML = '<p class="decide-empty">生活费刚好够用。很多人是这样过的。</p>';
    } else if (decided && decided.plan) {
      setIncomeVisible(true);
      $('#decideTitle').textContent = '你已经安排了这个月。';
      grid.innerHTML = '';
      POCKETS.forEach(function (k) {
        var v = decided.plan[k] || 0;
        if (v <= 0) return;
        var div = document.createElement('div');
        div.className = 'decide-item is-done';
        div.innerHTML = '<span class="d-icon">' + POCKET_ICONS[k] + '</span>' +
          '<span class="d-body"><b>' + POCKET_NAMES[k] + '</b><small>' + fmtMoney(v) + '</small></span>';
        grid.appendChild(div);
      });
    } else {
      setIncomeVisible(true);
      $('#decideTitle').textContent = '这 ' + fmtMoney(free) + ' 闲钱，你想怎么放？';
      grid.innerHTML = '';
      DECISIONS.forEach(function (d) {
        var btn = document.createElement('button');
        btn.className = 'decide-item';
        btn.setAttribute('data-decide', d.key);
        btn.innerHTML = '<span class="d-icon">' + d.icon + '</span>' +
          '<span class="d-body"><b>' + d.label + '</b><small>' + d.note + '</small></span>';
        grid.appendChild(btn);
      });
    }

    // 本月账本
    renderMonthLog(month);

    // 身上现金与五口袋
    var total = nearPocketTotal();
    var readout = $('.readout-value');
    readout.classList.remove('is-text');
    var parts = readoutParts(total);
    $('#valueNum').textContent = parts.num;
    $('#valueUnit').textContent = parts.unit;
    $('#ghostLine').textContent = '五口袋 ' + fmtMoney(total) + ' · 手上现金 ' + fmtMoney(state.near.cash);

    renderPockets();
    renderRelations();
    renderProfile();
    renderStats();
    $('#narration').textContent = narrationNear(month, ev);
    $('#timeSlider').style.setProperty('--p', (month / (NEAR_MONTHS - 1) * 100) + '%');

    // 节奏标签
    $$('.pace-item').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-pace') === state.pace);
    });

    // 按钮文案
    var nextBtn = $('#nextMonthBtn');
    if (state.pace === 'yearly') {
      if (!yearPlan) nextBtn.textContent = '先定一个方案';
      else if (spPending) nextBtn.textContent = '先决定这件事';
      else if (isYearEnd) nextBtn.textContent = month >= NEAR_MONTHS - 1 ? '看结局 →' : '下一年 →';
      else nextBtn.textContent = '继续这一年 →';
    } else {
      nextBtn.textContent = month >= NEAR_MONTHS - 1 ? '看结局 →' : '下一个月 →';
    }
    $('#resetMonthBtn').hidden = !(decided && (decided.plan || decided.eventChoice));
    $('#playBtn').textContent = '▶ 快进（自动按「存起来」走完）';

    // 自动推进状态与翻页动画
    var pauseBtn = $('#pauseBtn');
    if (pauseBtn) {
      pauseBtn.hidden = false;
      pauseBtn.classList.toggle('is-on', state.autoPaused);
      pauseBtn.textContent = state.autoPaused ? '▶' : '⏸';
      pauseBtn.title = state.autoPaused ? '恢复自动推进' : '暂停自动推进';
    }
    var card = $('#monthCard');
    if (card && lastRenderedMonth !== month) {
      lastRenderedMonth = month;
      card.classList.remove('flip-in');
      void card.offsetWidth;          // 重启动画
      card.classList.add('flip-in');
    }
  }

  var lastRenderedMonth = -1;

  /** 学年结算卡：这一年你换了什么。 */
  function renderYearSettle(y) {
    var from = y * 12;
    var to = Math.min(NEAR_MONTHS - 1, from + 11);
    var parts = monthParts(from);
    var auto = 0, manual = 0, touched = 0;
    for (var m = from; m <= to; m++) {
      var d = state.near.decisions[m];
      if (!d || !d.plan) continue;
      touched++;
      if (d.auto) auto++; else manual++;
    }
    // 这一年发生的事
    var events = state.near.events.filter(function (e) { return e.y >= parts.year && e.y < parts.year + 1; });
    var chose = events.filter(function (e) { return e.chosen; });
    var skipped = events.filter(function (e) { return e.chosen === false; });
    var trips = events.filter(function (e) { return e.t && e.t.indexOf('去了') === 0; });

    $('#settleTitle').textContent = '第 ' + (y + 1) + ' 年结束了';
    var body = $('#settleBody');
    var lines = [];
    lines.push('<div class="settle-line"><span>这一年你亲手决定的月份</span><b>' + manual + ' 个</b></div>');
    lines.push('<div class="settle-line"><span>按方案自动跑的月份</span><b>' + auto + ' 个</b></div>');
    if (trips.length) lines.push('<div class="settle-line"><span>去过的地方</span><b>' + trips.map(function (t) { return t.t.replace('去了', ''); }).join('、') + '</b></div>');
    if (chose.length) lines.push('<div class="settle-line"><span>你选择花掉的</span><b>' + chose.length + ' 次</b></div>');
    if (skipped.length) lines.push('<div class="settle-line"><span>你放过的</span><b>' + skipped.length + ' 次</b></div>');
    lines.push('<div class="settle-line"><span>年末五口袋</span><b>' + fmtMoney(nearPocketTotal()) + '</b></div>');
    var quote = auto > manual
      ? '这一年大部分时间，钱是按习惯自己走的。'
      : '这一年你几乎每个月都亲自管了钱。';
    body.innerHTML = lines.join('') + '<p class="settle-quote">' + quote + '</p>';
  }

  /** 顶部三行摘要（身份 / 学校 / 生日）。 */
  function syncHeader() {
    // 目前不需要额外元素，保留钩子便于后续加抬头信息
  }

  /** 按真实月份切换背景季节：春 3–5、夏 6–8、秋 9–11、冬 12–2。 */
  function applySeason(monthIndex) {
    var m = monthParts(monthIndex).month;
    var season = (m >= 3 && m <= 5) ? 'spring'
      : (m >= 6 && m <= 8) ? 'summer'
        : (m >= 9 && m <= 11) ? 'autumn' : 'winter';
    if (document.body.getAttribute('data-season') !== season) {
      document.body.setAttribute('data-season', season);
      buildSeasonParticles();
    }
  }

  /* ---------- 学年模式：定方案 → 自动跑 → 特殊日子打断 ---------- */

  function yearIndex(monthIndex) { return Math.floor(monthIndex / 12); }

  /** 把百分比方案换算成这个月的具体金额。 */
  function scalePlan(split, free) {
    var out = {};
    var used = 0;
    POCKETS.forEach(function (k) {
      var v = Math.round(free * (split[k] || 0));
      out[k] = v;
      used += v;
    });
    // 四舍五入的零头补进钱袋
    out.money = (out.money || 0) + (free - used);
    return out;
  }

  /** 选一个学年方案，然后自动跑这一年。 */
  function choosePlan(key) {
    var plan = null;
    PLANS.forEach(function (p) { if (p.key === key) plan = p; });
    if (!plan) return;
    state.near.plans[yearIndex(state.slider)] = plan.split;
    autoRunYear();
  }

  /** 小学年模式里，小事件按学年方案自动决定。 */
  function autoResolveEvent(m, ev) {
    var d = state.near.decisions[m] || {};
    if (d.eventChoice) return;
    var plan = state.near.plans[yearIndex(m)] || state.near.plans[yearIndex(m) - 1] || {};
    var yes = (ev.options || []).filter(function (o) { return o.key === 'yes' || o.key === 'meal' || o.key === 'gift'; })[0];
    if (!yes) { d.eventChoice = 'skip'; state.near.decisions[m] = d; return; }
    var share = plan[yes.pocket] || 0;
    d.eventChoice = share >= 0.2 ? yes.key : 'skip';
    state.near.decisions[m] = d;
  }

  /**
   * 从当前月开始，按方案自动跑到「本学年结束」或「下一个大日子」。
   * 小事件按方案自动决定，不会停下来打扰玩家。
   */
  function autoRunYear() {
    var start = state.slider;
    var y = yearIndex(start);
    var plan = state.near.plans[y];
    if (!plan) return;
    var end = Math.min(NEAR_MONTHS - 1, y * 12 + 11);

    for (var m = start; m <= end; m++) {
      var d = state.near.decisions[m];
      var ev = eventFor(m);

      // 大日子：还没决定就停下来问
      if (isMajorEvent(ev) && !(d && d.eventChoice)) {
        state.slider = m;
        renderNear();
        return;
      }
      // 小事件：按方案自动决定
      if (isAskingEvent(ev) && !(d && d.eventChoice)) {
        autoResolveEvent(m, ev);
      }
      // 普通月份：按方案自动分配
      if (!(d && d.plan)) {
        var free = monthFreeMoney(m);
        if (free > 0) {
          state.near.decisions[m] = { plan: scalePlan(plan, free), auto: true };
        }
      }
    }
    state.slider = end;
    renderNear();
  }

  /** 进入下一学年。 */
  function nextYear() {
    var next = Math.min(NEAR_MONTHS - 1, (yearIndex(state.slider) + 1) * 12);
    state.slider = next;
    $('#timeSlider').value = state.slider;
    renderNear();
  }

  /** 统计：手动决定 vs 自动跑。 */
  function paceStats() {
    var auto = 0, manual = 0;
    for (var m = 0; m < NEAR_MONTHS; m++) {
      var d = state.near.decisions[m];
      if (!d || !d.plan) continue;
      if (d.auto) auto++; else manual++;
    }
    return { auto: auto, manual: manual };
  }

  /* ---------- 生活建档：首月过一遍日子 ---------- */

  // 固定项（不在建档里问，直接计入）
  var DAILY_COST = 80;    // 洗护、纸巾、杂项
  var TELECOM_COST = 39;  // 校园套餐

  // 五个微场景：每项选出来的数字要么是"每天"，要么是"每月"
  var ARCHIVE_QUESTIONS = [
    {
      key: 'breakfast', unit: 'day', scene: '第 1 天 · 早上',
      text: '闹钟响了三次。你冲出宿舍，食堂已经排上了队。',
      options: [
        { v: 4, label: '食堂吃', sub: '一碗粥 + 一个包子，4 元' },
        { v: 5, label: '路上买', sub: '包子豆浆，5 元' },
        { v: 8, label: '点外卖', sub: '懒得动，8 元' }
      ]
    },
    {
      key: 'lunch', unit: 'day', scene: '第 3 天 · 中午',
      text: '室友都在点外卖。食堂的队从二楼排到了一楼。',
      options: [
        { v: 12, label: '去食堂', sub: '一荤一素，12 元' },
        { v: 18, label: '混着吃', sub: '食堂 + 偶尔外卖，18 元' },
        { v: 25, label: '跟室友点外卖', sub: '25 元' }
      ]
    },
    {
      key: 'dinner', unit: 'day', scene: '第 5 天 · 晚上',
      text: '晚自习结束，食堂快关门了。',
      options: [
        { v: 10, label: '食堂剩什么吃什么', sub: '10 元' },
        { v: 15, label: '校门口小炒', sub: '15 元' },
        { v: 22, label: '夜宵外卖', sub: '22 元' }
      ]
    },
    {
      key: 'transport', unit: 'month', scene: '第 6 天 · 出门',
      text: '从宿舍到教学楼 1.8 公里。',
      options: [
        { v: 15, label: '共享单车月卡', sub: '15 元/月' },
        { v: 60, label: '地铁 + 偶尔公交', sub: '60 元/月' },
        { v: 150, label: '经常打车', sub: '150 元/月' }
      ]
    },
    {
      key: 'social', unit: 'month', scene: '第 7 天 · 周末',
      text: '社团群里说这周末聚餐，AA 65。',
      options: [
        { v: 50, label: '很少出去', sub: '50 元/月' },
        { v: 100, label: '偶尔聚聚', sub: '100 元/月' },
        { v: 200, label: '局挺多', sub: '200 元/月' }
      ]
    }
  ];

  function profileAnswered() {
    var p = state.profile;
    if (!p) return false;
    return ARCHIVE_QUESTIONS.every(function (q) { return typeof p[q.key] === 'number'; });
  }

  function profileMeal() {
    var p = state.profile;
    if (!p) return 0;
    return ((p.breakfast || 0) + (p.lunch || 0) + (p.dinner || 0)) * 30;
  }

  /** 每月固定支出（不含波动）。 */
  function profileFixed() {
    var p = state.profile;
    if (!p) return Math.round(state.budget * 0.55);
    return profileMeal() + (p.transport || 0) + DAILY_COST + TELECOM_COST + (p.social || 0);
  }

  /** 同样的画像换成最省的一档，用来做对照。 */
  function profileFixedFrugal() {
    return (4 + 12 + 10) * 30 + 15 + DAILY_COST + TELECOM_COST + 50;
  }

  /**
   * 降一档：在现有档案基础上每顿各砍一点、交通改单车、社交减半，
   * 但不低于最省的下限。已经是最省的人降不动。
   */
  function profileFixedDowngraded() {
    var p = state.profile;
    if (!p || !profileAnswered()) return profileFixedFrugal();
    var b = Math.max(4, (p.breakfast || 0) - 2);
    var l = Math.max(12, (p.lunch || 0) - 3);
    var d = Math.max(10, (p.dinner || 0) - 2);
    var transport = Math.min(p.transport || 15, 15);
    var social = Math.max(50, Math.round((p.social || 0) / 2));
    return (b + l + d) * 30 + transport + DAILY_COST + TELECOM_COST + social;
  }

  /** 还能不能再降。 */
  function canDowngrade() {
    return profileFixedDowngraded() < profileFixed();
  }

  /* ---------- 事件引擎：按月份确定性生成 ---------- */

  function monthRng(m) {
    return mulberry32(20260901 + m * 7919 + (state.birthday || 6) * 31);
  }

  /** 按月缓存事件，保证回看/回放时结果不变。 */
  function eventFor(monthIndex) {
    var n = state.near;
    if (!n.eventCache) n.eventCache = {};
    if (Object.prototype.hasOwnProperty.call(n.eventCache, monthIndex)) return n.eventCache[monthIndex];
    var ev = null;
    try { ev = buildEvent(monthIndex); } catch (e) { ev = null; }
    n.eventCache[monthIndex] = ev;
    return ev;
  }

  /**
   * 事件池：每个事件声明"哪几个月可能出现"+"在什么状态下可能出现"。
   * 生成时先按状态筛候选，再按优先级 + 月份种子挑一个。
   * 这样同一个月份在不同状态下会遇到不同的事，重复感自然下降。
   *
   * 选项分三类：kind: 'save'（省钱）/ 'invest'（投资）/ 'relate'（关系），
   * 除了钱，还会改变状态层（st）。
   */
  var EVENT_POOL = [
    /* ---------- 学业线 ---------- */
    {
      months: [6, 1], priority: 3,
      when: function (s) { return s.study <= 3; },
      build: function (parts) {
        return {
          key: 'final', tag: '期末', date: parts.month + ' 月下旬', major: true, scene: 'final',
          title: '这学期有点悬',
          text: '两门课点名你都没到，作业拖到最后一天才交。期末周来了。',
          options: [
            { key: 'cram', kind: 'invest', label: '报个冲刺班', sub: '300 元 · 学业 +2', cost: 300, pocket: 'skill', st: { study: 2 }, memory: '期末报了冲刺班' },
            { key: 'self', kind: 'save', label: '自己啃，通宵突击', sub: '0 元 · 学业 +0.5 · 身体 −1', cost: 0, st: { study: 0.5, body: -1 }, memory: '期末通宵突击' },
            { key: 'giveup', kind: 'save', label: '摆烂，能过就过', sub: '0 元 · 学业 −1', cost: 0, st: { study: -1 }, memory: '期末摆烂了' }
          ]
        };
      }
    },
    {
      months: [6, 1], priority: 2,
      when: function (s) { return s.study > 3 && s.study < 7; },
      build: function (parts) {
        return {
          key: 'final', tag: '期末', date: parts.month + ' 月下旬', major: false, scene: 'final',
          title: '期末周',
          text: '该背的都背了，剩下的看状态。图书馆的位置得靠抢。',
          options: [
            { key: 'study', kind: 'invest', label: '泡图书馆两周', sub: '80 元 · 学业 +1.5 · 身体 −1', cost: 80, pocket: 'skill', st: { study: 1.5, body: -1 }, memory: '期末泡了两周图书馆' },
            { key: 'normal', kind: 'save', label: '正常复习', sub: '0 元 · 学业 +0.5', cost: 0, st: { study: 0.5 }, memory: '期末正常复习' },
            { key: 'slack', kind: 'save', label: '看情况，先玩两天', sub: '0 元 · 学业 −0.5 · 经历 +1', cost: 0, st: { study: -0.5, exp: 1 }, memory: '期末先玩了两天' }
          ]
        };
      }
    },
    {
      months: [6, 1], priority: 2,
      when: function (s) { return s.study >= 7; },
      build: function (parts) {
        return {
          key: 'scholar', tag: '奖学金', date: parts.month + ' 月', major: false, scene: 'final', noAccident: true,
          title: '奖学金评选',
          text: '成绩排在前面，辅导员问你要不要申请国家励志奖学金。材料不少。',
          options: [
            { key: 'apply', kind: 'invest', label: '认真准备材料', sub: '0 元 · 学业 +1 · 可能拿到 5,000', cost: 0, st: { study: 1 }, memory: '申请了奖学金', gain: 5000 },
            { key: 'skip', kind: 'save', label: '太麻烦，不申', sub: '0 元', cost: 0 },
            { key: 'share', kind: 'relate', label: '把名额让给室友', sub: '0 元 · 关系 +3', cost: 0, rel: 3, memory: '把奖学金名额让给了室友' }
          ]
        };
      }
    },
    {
      months: [12], priority: 2,
      when: function (s, m, year) { return year >= 3; },
      build: function (parts) {
        return {
          key: 'kaoyan', tag: '考研', date: '12 月下旬', major: true, scene: 'kaoyan',
          title: '考研报名最后一天',
          text: '江苏报名费 120 元。报不报，这是个岔路口。',
          options: [
            { key: 'full', kind: 'invest', label: '报名 + 冲刺班', sub: '620 元 · 学业 +2', cost: 620, pocket: 'skill', st: { study: 2 }, memory: '报名考研，还报了冲刺班' },
            { key: 'signup', kind: 'invest', label: '只报名', sub: '120 元 · 学业 +0.5', cost: 120, pocket: 'skill', st: { study: 0.5 }, memory: '报了考研' },
            { key: 'job', kind: 'save', label: '直接找工作', sub: '0 元 · 经历 +1', cost: 0, st: { exp: 1 }, memory: '没考研，直接找工作' }
          ]
        };
      }
    },
    {
      months: [12], priority: 1,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'cet', tag: '四六级', date: '12 月中旬', major: false, scene: 'cet',
          title: '四六级报名',
          text: '江苏笔试 30 元/人。过了六级，简历上能多写一行。',
          options: [
            { key: 'full', kind: 'invest', label: '报名 + 真题', sub: '80 元 · 学业 +1', cost: 80, pocket: 'skill', st: { study: 1 }, memory: '四六级认真准备了' },
            { key: 'signup', kind: 'save', label: '只报名', sub: '30 元 · 学业 +0.3', cost: 30, pocket: 'skill', st: { study: 0.3 }, memory: '报了四六级' },
            { key: 'skip', kind: 'save', label: '不考了', sub: '0 元 · 学业 −0.5', cost: 0, st: { study: -0.5 }, memory: '放弃四六级' }
          ]
        };
      }
    },

    /* ---------- 钱线 ---------- */
    {
      months: [1], priority: 3,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'winter-home', tag: '寒假', date: '1 月中下旬', major: false, scene: 'winter-home',
          title: '回家过年',
          text: '南京南到家里的高铁。学生票一年只有 4 次，且限家—校区间。',
          options: [
            { key: 'hsr', kind: 'relate', label: '高铁回家', sub: '400 元 · 关系 +2', cost: 400, pocket: 'relation', rel: 2, st: { social: 1 }, memory: '坐高铁回家过年' },
            { key: 'hard', kind: 'save', label: '12 小时硬座', sub: '200 元 · 关系 +1 · 身体 −1', cost: 200, pocket: 'relation', rel: 1, st: { body: -1 }, memory: '坐硬座回家' },
            { key: 'stay', kind: 'save', label: '留校打工', sub: '0 元 · 经历 +1 · 关系 −2', cost: 0, st: { exp: 1, social: -1 }, rel: -2, memory: '寒假留校打工没回家' }
          ]
        };
      }
    },
    {
      months: [2], priority: 3,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'lucky-money', tag: '春节', date: '2 月中旬', major: false, scene: 'lucky-money',
          title: '压岁钱怎么用',
          text: '长辈给的 2,000 元压岁钱到账了。这是你一年里最大的一笔“横财”。',
          options: [
            { key: 'save', kind: 'save', label: '一分不动，全存起来', sub: '0 元 · 全进钱袋', cost: 0, memory: '压岁钱全存了' },
            { key: 'family', kind: 'relate', label: '请家里人吃顿饭', sub: '300 元 · 关系 +3', cost: 300, pocket: 'relation', rel: 3, st: { social: 1 }, memory: '用压岁钱请家人吃饭' },
            { key: 'want', kind: 'save', label: '买一直想要的东西', sub: '800 元 · 经历 +1', cost: 800, pocket: 'memory', st: { exp: 1 }, memory: '用压岁钱买了想要的东西' }
          ]
        };
      }
    },
    {
      months: [3, 9], priority: 2,
      when: function () { return true; },
      build: function (parts) {
        var spring = parts.month === 3;
        return {
          key: spring ? 'newterm' : 'newterm2', tag: spring ? '春季开学' : '秋季开学',
          date: parts.month + ' 月初', major: false, scene: spring ? 'newterm' : 'newterm2',
          title: '开学采购',
          text: '教材、打印、日用品。一学期 300 元起步，但怎么买是你的事。',
          options: [
            { key: 'full', kind: 'invest', label: '全新教材 + 新耳机', sub: '500 元 · 学业 +1', cost: 500, pocket: 'skill', st: { study: 1 }, memory: '开学买了全新教材' },
            { key: 'used', kind: 'save', label: '二手教材', sub: '150 元 · 学业 +0.5', cost: 150, pocket: 'skill', st: { study: 0.5 }, memory: '开学买二手教材' },
            { key: 'min', kind: 'save', label: '只买必须的', sub: '80 元 · 学业 −0.3', cost: 80, pocket: 'skill', st: { study: -0.3 }, memory: '开学只买了必需品' }
          ]
        };
      }
    },
    {
      months: [8], priority: 3,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'intern', tag: '实习', date: '8 月', major: false, scene: 'intern',
          title: '实习工资到手',
          text: '这个暑假你实习了，拿到 3,000 元。第一笔自己挣的钱。',
          options: [
            { key: 'all-save', kind: 'save', label: '全部存起来', sub: '0 元 · 全进钱袋', cost: 0, st: { study: 0.5 }, memory: '实习工资全存了' },
            { key: 'treat', kind: 'relate', label: '请室友吃一顿', sub: '200 元 · 关系 +2', cost: 200, pocket: 'relation', rel: 2, st: { social: 1 }, memory: '用实习工资请了室友' },
            { key: 'gear', kind: 'invest', label: '买个新键盘/显示器', sub: '600 元 · 学业 +1', cost: 600, pocket: 'skill', st: { study: 1 }, memory: '用工资升级了装备' }
          ]
        };
      }
    },
    {
      months: [11], priority: 3,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'double11', tag: '双十一', date: '11 月 11 日', major: false, scene: 'double11',
          title: '双十一',
          text: '购物车里躺了很多东西。今天不打折的东西，明天也不会打折。',
          options: [
            { key: 'stockpile', kind: 'save', label: '囤够一学期日用品', sub: '500 元 · 之后 4 个月固定支出 −60/月', cost: 500, pocket: 'relation', memory: '双十一囤了一学期日用品' },
            { key: 'need', kind: 'save', label: '只买急用的', sub: '150 元', cost: 150, pocket: 'relation', memory: '双十一只买急用的' },
            { key: 'none', kind: 'save', label: '什么都不买', sub: '0 元 · 关系 −1', cost: 0, rel: -1, memory: '双十一什么都没买' }
          ]
        };
      }
    },

    /* ---------- 经历线 ---------- */
    {
      months: [7], priority: 3,
      when: function () { return true; },
      build: function (parts, stats, rnd) {
        var companions = COMPANIONS.map(function (c) {
          return { key: c.key, name: c.name, desc: c.desc, factor: c.factor, romance: rnd() < c.romance };
        });
        var places = TRAVEL_POOL.map(function (p) {
          return {
            key: 'go-' + p.key, label: p.name,
            sub: p.cost ? fmtMoney(p.cost) + ' · ' + p.desc : p.desc,
            cost: p.cost, pocket: 'memory', place: p.name, kind: p.cost ? 'relate' : 'save',
            st: p.cost ? { exp: 2, body: -0.5 } : {},
            memory: p.cost ? '去了' + p.name : '暑假留在家里'
          };
        });
        return {
          key: 'summer', tag: '暑假', date: '7 月', major: true,
          title: '暑假到了',
          text: '你攒了一个学期的旅行基金。跟谁去、去哪，都得自己定。',
          scene: 'summer', companions: companions, options: places
        };
      }
    },
    {
      months: [4, 9, 11], priority: 2,
      when: function () { return true; },
      build: function (parts, stats, rnd) {
        if (rnd() >= 0.45) return null;
        var artist = ARTISTS[Math.floor(rnd() * ARTISTS.length)];
        var tiers = artist.tiers.map(function (t) {
          return {
            key: 'tier-' + t.zone, kind: 'relate',
            label: t.zone + ' ' + (t.price ? fmtMoney(t.price) : '免费'),
            sub: t.price ? '抢票（约 ' + Math.round((1 - artist.hot) * 100) + '% 抢到）' : '学校礼堂，随便进',
            cost: t.price, pocket: 'memory', win: rnd() < (1 - artist.hot),
            st: { exp: 1.5, social: 0.5 },
            memory: '看了' + artist.name
          };
        });
        return {
          key: 'concert', tag: '演唱会', date: parts.month + ' 月周末', major: true,
          title: artist.name + ' 来南京了',
          text: '大麦 10:00 开票。你知道自己抢不过那两万人，但还是在电脑前坐好了。',
          scene: 'concert', artist: artist, tiers: tiers,
          scalper: { extra: 300, fake: rnd() < 0.15 },
          options: tiers.concat([{ key: 'skip', kind: 'save', label: '算了，看直播', sub: '不花钱', cost: 0 }])
        };
      }
    },
    {
      months: [4], priority: 1,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'qingming', tag: '清明', date: '4 月 4–6 日', major: false, scene: 'qingming',
          title: '踏青',
          text: '南京的春天只有几周。栖霞山或玄武湖，出门就是春天。',
          options: [
            { key: 'go', kind: 'relate', label: '去栖霞山', sub: '100 元 · 经历 +1', cost: 100, pocket: 'memory', st: { exp: 1 }, memory: '清明去了栖霞山' },
            { key: 'city', kind: 'save', label: '市内逛逛', sub: '30 元 · 经历 +0.5', cost: 30, pocket: 'memory', st: { exp: 0.5 }, memory: '清明在市区转了转' },
            { key: 'sleep', kind: 'save', label: '在宿舍躺着', sub: '0 元 · 身体 +1', cost: 0, st: { body: 1 }, memory: '清明在宿舍躺了两天' }
          ]
        };
      }
    },
    {
      months: [5], priority: 2,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'labour', tag: '五一', date: '5 月 1–5 日', major: false, scene: 'labour',
          title: '五一去哪',
          text: '五天假。出去玩、兼职、还是补觉，都可以。',
          options: [
            { key: 'trip', kind: 'relate', label: '去扬州两天', sub: '400 元 · 经历 +1.5', cost: 400, pocket: 'memory', st: { exp: 1.5, body: -0.5 }, memory: '五一去了扬州' },
            { key: 'parttime', kind: 'invest', label: '兼职三天', sub: '赚 600 元 · 身体 −1', cost: 0, gain: 600, st: { body: -1, exp: 0.5 }, memory: '五一兼职赚了 600' },
            { key: 'rest', kind: 'save', label: '在学校补觉', sub: '0 元 · 身体 +1', cost: 0, st: { body: 1 }, memory: '五一在学校补觉' }
          ]
        };
      }
    },
    {
      months: [10], priority: 1,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'autumn', tag: '国庆·秋游', date: '10 月 1–7 日', major: false, scene: 'autumn',
          title: '栖霞山看红叶',
          text: '旺季门票 50 元，学生半价 25。南京的秋天只有几周。',
          options: [
            { key: 'go', kind: 'relate', label: '约朋友一起去', sub: '80 元 · 经历 +1 · 关系 +1', cost: 80, pocket: 'memory', st: { exp: 1 }, rel: 1, memory: '国庆和朋友去看了红叶' },
            { key: 'solo', kind: 'save', label: '一个人去', sub: '25 元 · 经历 +0.5', cost: 25, pocket: 'memory', st: { exp: 0.5 }, memory: '国庆一个人去看了红叶' },
            { key: 'skip', kind: 'save', label: '人太多，不去', sub: '0 元', cost: 0, memory: '国庆没出门' }
          ]
        };
      }
    },
    {
      months: [6], priority: 3,
      when: function (s, m, year) { return year >= 4; },
      build: function (parts) {
        return {
          key: 'graduation', tag: '毕业季', date: '6 月下旬', major: true, scene: 'graduation',
          title: '毕业季',
          text: '最后一顿饭、最后一张合照。很多人会在这个月花掉一大笔。',
          options: [
            { key: 'trip', kind: 'relate', label: '毕业旅行', sub: '1,200 元 · 经历 +2 · 关系 +2', cost: 1200, pocket: 'memory', st: { exp: 2, social: 1 }, rel: 2, memory: '毕业旅行' },
            { key: 'dinner', kind: 'relate', label: '送别饭', sub: '300 元 · 关系 +1.5', cost: 300, pocket: 'relation', rel: 1.5, st: { social: 1 }, memory: '请了送别饭' },
            { key: 'save', kind: 'save', label: '不花这笔钱', sub: '0 元 · 关系 −1', cost: 0, rel: -1, memory: '毕业季没花钱' }
          ]
        };
      }
    },

    /* ---------- 社交线 ---------- */
    {
      months: [10], priority: 2,
      when: function (s, m, year) { return year <= 2; },
      build: function (parts) {
        return {
          key: 'club', tag: '社团', date: '10 月', major: false, scene: 'newterm',
          title: '社团招新',
          text: '操场上摆满了摊位。加一个社团，可能会认识一群人。',
          options: [
            { key: 'join', kind: 'relate', label: '加一个，交会费', sub: '100 元 · 社交 +1.5 · 经历 +0.5', cost: 100, pocket: 'relation', st: { social: 1.5, exp: 0.5 }, memory: '加入了社团' },
            { key: 'free', kind: 'save', label: '加个免费的', sub: '0 元 · 社交 +0.5', cost: 0, st: { social: 0.5 }, memory: '加入了免费的社团' },
            { key: 'none', kind: 'save', label: '不感兴趣', sub: '0 元 · 学业 +0.5', cost: 0, st: { study: 0.5 }, memory: '没加社团' }
          ]
        };
      }
    },
    {
      months: [12], priority: 1,
      when: function () { return true; },
      build: function (parts) {
        return {
          key: 'newyear', tag: '跨年', date: '12 月 31 日', major: false, scene: 'newyear',
          title: '跨年',
          text: '朋友约你跨年，人均 300 元。你也可以一个人在宿舍看直播。',
          options: [
            { key: 'party', kind: 'relate', label: '和朋友一起跨年', sub: '300 元 · 社交 +1.5', cost: 300, pocket: 'relation', st: { social: 1.5 }, rel: 1, memory: '和朋友一起跨年' },
            { key: 'home', kind: 'relate', label: '回家陪家人', sub: '200 元 · 关系 +1 · 身体 +0.5', cost: 200, pocket: 'relation', rel: 1, st: { body: 0.5 }, memory: '回家跨年' },
            { key: 'alone', kind: 'save', label: '一个人在宿舍', sub: '0 元 · 经历 −0.5', cost: 0, st: { exp: -0.5 }, memory: '一个人跨年' }
          ]
        };
      }
    },
    {
      months: [3, 4, 9, 10, 11, 12, 1, 2, 5, 6, 7, 8], priority: 1,
      when: function (s) { return s.social <= 3; },
      build: function (parts) {
        return {
          key: 'dorm', tag: '宿舍', date: parts.month + ' 月', major: false, scene: 'birthday',
          title: '宿舍有点冷',
          text: '室友最近不怎么跟你说话。你也说不清是从哪件事开始的。',
          options: [
            { key: 'talk', kind: 'relate', label: '主动坐下来聊聊', sub: '0 元 · 社交 +1.5', cost: 0, rel: 1.5, st: { social: 1.5 }, memory: '主动和解了宿舍关系' },
            { key: 'meal', kind: 'relate', label: '请他们吃顿夜宵', sub: '120 元 · 社交 +2', cost: 120, pocket: 'relation', rel: 2, st: { social: 2 }, memory: '请室友吃夜宵和好' },
            { key: 'ignore', kind: 'save', label: '算了，各过各的', sub: '0 元 · 社交 −1', cost: 0, st: { social: -1 }, memory: '和室友渐行渐远' }
          ]
        };
      }
    },
    {
      months: [3, 4, 5, 9, 10, 11, 12, 1, 2, 6, 7, 8], priority: 2,
      when: function (s) { return !!state.near.romance; },
      build: function (parts) {
        var name = (state.near.romance && state.near.romance.name) || '阿青';
        return {
          key: 'dating', tag: '恋爱', date: parts.month + ' 月', major: false, scene: 'birthday',
          title: '这个月的约会',
          text: name + '问你周末有没有空。',
          options: [
            { key: 'date', kind: 'relate', label: '出去约会', sub: '150 元 · 关系 +1.5', cost: 150, pocket: 'relation', rel: 1.5, st: { exp: 0.5 }, memory: '和' + name + '约会' },
            { key: 'cheap', kind: 'save', label: '在学校走走', sub: '0 元 · 关系 +0.8', cost: 0, rel: 0.8, memory: '和' + name + '在校园里散步' },
            { key: 'busy', kind: 'invest', label: '说忙，要复习', sub: '0 元 · 学业 +1 · 关系 −1.5', cost: 0, st: { study: 1 }, rel: -1.5, memory: '为了复习推掉了约会' }
          ]
        };
      }
    },
    {
      months: [1], priority: 4,
      when: function (s, m) { return neverHomeFor3Years(m); },
      build: function (parts) {
        return {
          key: 'callback-home', tag: '回望', date: '1 月', major: false, scene: 'winter-home',
          title: '家里问你：今年回不回？',
          text: '你已经连着三年寒假没回家了。电话那头沉默了一会儿。',
          options: [
            { key: 'go', kind: 'relate', label: '这次回去', sub: '400 元 · 关系 +4', cost: 400, pocket: 'relation', rel: 4, st: { social: 1 }, memory: '三年后终于回家过年' },
            { key: 'call', kind: 'save', label: '回不去，多打几个电话', sub: '0 元 · 关系 +1', cost: 0, rel: 1, memory: '只给家里打了电话' },
            { key: 'ignore', kind: 'save', label: '继续不回', sub: '0 元 · 关系 −3', cost: 0, rel: -3, memory: '还是没回家' }
          ]
        };
      }
    }
  ];

  /** 连续三年寒假都没回家（留校打工那条路走到底）。 */
  function neverHomeFor3Years(monthIndex) {
    var cnt = 0;
    for (var k = 1; k <= 3; k++) {
      var m = monthIndex - k * 12;
      if (m < 0) return false;
      var d = state.near.decisions[m];
      if (d && d.eventChoice === 'stay') cnt++;
    }
    return cnt >= 3;
  }

  function buildEvent(m) {
    var parts = monthParts(m);
    var rnd = monthRng(m);
    var stats = statsBefore(m);
    var mo = parts.month;
    var year = yearIndex(m) + 1;

    // 1. 余波最高优先
    var fu = followupFor(m);
    if (fu) return fu;

    // 2. 优先级 3 的大事件先挑（暑假 / 寒假 / 春节 / 双十一 / 实习 / 毕业 / 期末）
    var high = tryBuildGroup(candsFor(mo, stats, m, year, 3, 99), parts, stats, rnd, m, year);
    if (high) return high;

    // 3. 没有大事件，才轮到生日
    if (state.birthday && mo === Number(state.birthday)) return birthdayEvent(mo);
    var friend = FRIENDS.filter(function (f) { return f.birthday === mo; })[0];
    if (friend && rnd() < 0.55) return friendBirthdayEvent(friend, mo);

    // 4. 其余普通事件
    return tryBuildGroup(candsFor(mo, stats, m, year, 1, 2), parts, stats, rnd, m, year);
  }

  /** 按月份 + 状态 + 优先级区间筛候选。 */
  function candsFor(mo, stats, m, year, minP, maxP) {
    var out = [];
    EVENT_POOL.forEach(function (def) {
      var pr = def.priority || 1;
      if (pr < minP || pr > maxP) return;
      if (def.months && def.months.indexOf(mo) < 0) return;
      if (def.when && !def.when(stats, m, year)) return;
      out.push(def);
    });
    return out;
  }

  /** 组内按月份种子洗牌后依次尝试构建。 */
  function tryBuildGroup(group, parts, stats, rnd, m, year) {
    for (var i = group.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = group[i]; group[i] = group[j]; group[j] = t;
    }
    for (var k = 0; k < group.length; k++) {
      var ev = typeof group[k].build === 'function'
        ? group[k].build(parts, stats, rnd, m, year)
        : group[k].build;
      if (ev) return ev;
    }
    return null;
  }

  function birthdayEvent(mo) {
    return {
      key: 'birthday', tag: '生日', date: mo + ' 月', major: true, scene: 'birthday',
      title: '你的生日', text: '生日这个月，你可以请朋友吃顿饭，也可以自己过。',
      options: [
        { key: 'yes', kind: 'relate', label: '请大家吃顿饭', sub: '300 元 · 社交 +2', cost: 300, pocket: 'relation', rel: 2, st: { social: 2 }, memory: '生日请了大家' },
        { key: 'small', kind: 'relate', label: '只叫最好的几个', sub: '120 元 · 社交 +1', cost: 120, pocket: 'relation', rel: 1, st: { social: 1 }, memory: '生日只叫了几个朋友' },
        { key: 'skip', kind: 'save', label: '自己过', sub: '0 元 · 省钱，也清静', cost: 0, memory: '生日一个人过' }
      ]
    };
  }

  function friendBirthdayEvent(friend, mo) {
    return {
      key: 'friend-' + friend.name, tag: '生日会', date: mo + ' 月', major: false,
      title: friend.name + ' 过生日',
      text: '你的' + friend.role + friend.name + '要过生日了。去不去、送什么，都算一次表态。',
      scene: 'birthday', friend: friend,
      options: [
        { key: 'meal', kind: 'relate', label: '请他吃顿饭', sub: '200 元 · 关系 +2', cost: 200, pocket: 'relation', rel: 2, st: { social: 1 }, memory: '给' + friend.name + '过生日' },
        { key: 'gift', kind: 'relate', label: '送个礼物', sub: '150 元 · 关系 +1.5', cost: 150, pocket: 'relation', rel: 1.5, st: { social: 0.5 }, memory: '送了' + friend.name + '礼物' },
        { key: 'redpack', kind: 'save', label: '发个红包', sub: '66 元 · 关系 +0.5', cost: 66, pocket: 'relation', rel: 0.5 },
        { key: 'skip', kind: 'save', label: '装作不知道', sub: '0 元 · 关系 −2', cost: 0, rel: -2, st: { social: -1 }, memory: '错过了' + friend.name + '的生日' }
      ]
    };
  }

  function isAskingEvent(ev) {
    return !!ev && Array.isArray(ev.options) && ev.options.length > 0;
  }

  function isMajorEvent(ev) {
    return isAskingEvent(ev) && ev.major === true;
  }

  /* ---------- 意外余波：几个月后才回来找你 ---------- */

  /**
   * 余波在固定的偏移月份触发，读的是当时那张意外卡的选择。
   * 因为选择存在 decisions 里，回放时结果完全一致。
   */
  function accidentChoiceAt(monthIndex, optionKey) {
    if (monthIndex < 0) return false;
    var d = state.near.decisions[monthIndex];
    return !!(d && d.accidentChoice === optionKey);
  }

  function followupFor(monthIndex) {
    // 借室友手机 → 半年后他提起
    if (accidentChoiceAt(monthIndex - 6, 'borrow')) {
      return {
        key: 'fu-phone', tag: '余波', date: '半年后', major: false, scene: 'fu-phone',
        title: '室友提起了那部旧手机',
        text: '他说：“那手机你要用就先用着。”语气很轻，但你知道意思。',
        options: [
          { key: 'meal', label: '请他吃顿饭', sub: '200 元 · 关系 +2', cost: 200, pocket: 'relation', rel: 2, memory: '请室友吃饭，还了手机人情' },
          { key: 'newone', label: '买台新的还他', sub: '1,200 元 · 关系 +4', cost: 1200, pocket: 'relation', rel: 4, memory: '还了室友一台新手机' },
          { key: 'ignore', label: '当没听懂', sub: '0 元 · 关系 −2', cost: 0, rel: -2, memory: '欠了室友的人情没还' }
        ]
      };
    }
    // 生病硬扛 → 三个月后身体报警
    if (accidentChoiceAt(monthIndex - 3, 'endure')) {
      return {
        key: 'fu-weak', tag: '余波', date: '三个月后', major: false, scene: 'fu-weak',
        title: '身体明显不如从前',
        text: '这几个月你总觉得累，换季必感冒。校医院的人说：先别熬夜了。',
        options: [
          { key: 'gym', label: '办张健身卡', sub: '300 元 · 把身体扳回来', cost: 300, pocket: 'freedom', clearFlag: 'weak', memory: '办了健身卡，身体慢慢好了' },
          { key: 'sleep', label: '开始早睡，不花钱', sub: '0 元 · 慢一点恢复', cost: 0, clearFlag: 'weak', memory: '开始早睡，身体缓过来了' },
          { key: 'ignore', label: '年轻，扛得住', sub: '0 元 · 病根留着', cost: 0, flag: 'weak', memory: '身体一直没缓过来' }
        ]
      };
    }
    // 挂科硬扛 → 八个月后教务通知
    if (accidentChoiceAt(monthIndex - 8, 'delay')) {
      return {
        key: 'fu-delay', tag: '余波', date: '八个月后', major: true, scene: 'fu-delay',
        title: '教务通知：还有一门课没过',
        text: '拖了大半年，这门课现在变成毕业前必须解决的事。',
        options: [
          { key: 'cram', label: '报个冲刺班', sub: '500 元 · 一把过', cost: 500, pocket: 'skill', clearFlag: 'delay', memory: '报班把那门课补过了' },
          { key: 'beg', label: '找老师求情', sub: '0 元 · 关系 −2，五成能过', cost: 0, rel: -2, gamblePass: 0.5, memory: '找老师求情，过了' },
          { key: 'giveup', label: '继续拖', sub: '0 元 · 延毕风险真的来了', cost: 0, flag: 'delay', memory: '重修一直拖到毕业' }
        ]
      };
    }
    return null;
  }

  /* ---------- 意外：按场景触发 + 第二幕事件卡 ---------- */

  function accidentRng(m) {
    return mulberry32(90001 + m * 104729 + (state.birthday || 6) * 17);
  }

  /**
   * 这个月有没有触发意外。第一幕（当月事件）没演完就不会有第二幕。
   * 触发点按场景挂：旅行/演唱会/火车站 → 手机；开学季 → 诈骗；
   * 期末 → 挂科；换季 → 住院。
   */
  function accidentFor(monthIndex) {
    var ev = eventFor(monthIndex);
    var d = state.near.decisions[monthIndex];
    if (ev && !eventResolved(ev, d)) return null;
    var dk = d ? d.eventChoice : null;
    var mo = monthParts(monthIndex).month;
    var scene = null;

    if (ev) {
      if (ev.key === 'summer' && dk && dk !== 'go-home') scene = 'phone';
      else if (ev.key === 'concert') {
        if (dk === 'scalper') scene = 'phone';
        else if (dk && dk.indexOf('tier-') === 0) {
          var tier = (ev.options || []).filter(function (o) { return o.key === dk; })[0];
          if (tier && tier.win) scene = 'phone';
        }
      }
      else if (ev.key === 'winter-home' && dk === 'yes') scene = 'phone';
      else if (ev.key === 'final' && !ev.noAccident) scene = 'fail';
      else if (ev.key === 'newterm2' || ev.key === 'intern') scene = 'fraud';
    }
    // 换季：没人安排，但身体会
    if (!scene && [11, 12, 1, 3].indexOf(mo) >= 0) scene = 'illness';
    if (!scene) return null;
    // 余波月不再叠加新意外
    if (ev && ev.key.indexOf('fu-') === 0) return null;

    var rate = ACCIDENT_RATE[scene];
    // 硬扛过生病的人，之后更容易再病
    var before = (state.near.flagsAtMonth && state.near.flagsAtMonth[monthIndex]) || {};
    if (scene === 'illness' && before.weak) rate *= 2;
    if (accidentRng(monthIndex)() >= rate) return null;
    return ACCIDENTS[scene];
  }

  function accidentResolved(monthIndex) {
    if (!accidentFor(monthIndex)) return true;
    var d = state.near.decisions[monthIndex];
    return !!(d && d.accidentChoice);
  }

  /** 应用意外卡的选择（回放时也走这里，结果确定）。 */
  function applyAccidentChoice(monthIndex, acc, key) {
    var opt = (acc.options || []).filter(function (o) { return o.key === key; })[0];
    if (!opt) return;
    var n = state.near;
    var parts = monthParts(monthIndex);
    var cost = opt.cost || 0;
    if (cost > 0) spendCash(cost);
    // 赌一把：输了再亏 1,200
    if (typeof opt.gamble === 'number') {
      if (accidentRng(monthIndex + 500)() > opt.gamble) {
        spendCash(1200);
        cost += 1200;
      }
    }
    if (opt.rel) addRelation('朋友', opt.rel);
    if (opt.flag) {
      n.flags = n.flags || {};
      n.flags[opt.flag] = true;
    }
    if (opt.memory) n.memories.push({ text: opt.memory, y: parts.year, m: parts.month });
    n.events.push({
      t: acc.name, y: parts.year, m: parts.month, amt: -cost,
      note: opt.label, accident: true, chosen: true
    });
  }

  /* ---------- 事件应用 ---------- */

  function addRelation(name, delta) {
    if (!name) return;
    state.near.relations = state.near.relations || {};
    state.near.relations[name] = Math.max(0, Math.round(((state.near.relations[name] || 0) + delta) * 10) / 10);
  }

  function spendFrom(pocket, amount) {
    var n = state.near;
    if (!amount) return;
    if (pocket && n[pocket] >= amount) { n[pocket] -= amount; return; }
    var rest = amount - (pocket ? n[pocket] : 0);
    if (pocket) n[pocket] = 0;
    n.cash -= rest;
  }

  /**
   * 事件花销从"这个月的现金"里出——因为事件发生在分配之前。
   * 现金不够时依次动用手边口袋；仍然不够就记为超支（负现金）。
   */
  function spendCash(amount) {
    var n = state.near;
    if (!amount) return;
    if (n.cash >= amount) { n.cash -= amount; return; }
    var rest = amount - Math.max(0, n.cash);
    n.cash = 0;
    var order = ['freedom', 'memory', 'relation', 'skill', 'money'];
    for (var i = 0; i < order.length && rest > 0; i++) {
      var take = Math.min(n[order[i]], rest);
      n[order[i]] -= take;
      rest -= take;
    }
    if (rest > 0) n.cash -= rest;   // 超支
  }

  /** 应用一次事件选择（回放时也走这里，保证确定性）。 */
  function applyEventChoice(monthIndex, ev, key, extra) {
    var n = state.near;
    var opt = (ev.options || []).filter(function (o) { return o.key === key; })[0];
    if (!opt) return;
    var parts = monthParts(monthIndex);
    var y = parts.year, mo = parts.month;

    // 演唱会：没抢到
    if (ev.key === 'concert' && opt.win === false) {
      n.events.push({ t: '没抢到' + ev.artist.name, y: y, m: mo, amt: 0, note: '3 秒售罄', special: 'concert', chosen: false });
      return;
    }
    // 黄牛
    if (ev.key === 'concert' && key === 'scalper') {
      var fake = ev.scalper && ev.scalper.fake;
      var price = (extra && extra.basePrice ? extra.basePrice : 680) + (ev.scalper ? ev.scalper.extra : 300);
      if (fake) {
        spendCash(price);
        n.events.push({ t: '买到了假票', y: y, m: mo, amt: -price, note: '报警也追不回来', special: 'concert', chosen: true });
      } else {
        spendCash(price);
        n.events.push({ t: '看了' + ev.artist.name, y: y, m: mo, amt: -price, note: '黄牛加价', special: 'concert', chosen: true });
        n.memories.push({ text: '看了' + ev.artist.name, y: y, m: mo });
      }
      return;
    }

    // 旅行
    if (ev.key === 'summer' && opt.place) {
      var comp = null;
      (ev.companions || []).forEach(function (c) { if (c.key === (extra && extra.companion)) comp = c; });
      if (!comp) comp = (ev.companions || [])[0] || { key: 'solo', name: '一个人', factor: 1, romance: false };
      var cost = Math.round(opt.cost * comp.factor / 10) * 10;
      if (cost > 0) spendCash(cost);
      n.events.push({
        t: opt.place === '哪也不去' ? '暑假留在家里' : '去了' + opt.place,
        y: y, m: mo, amt: -cost, note: comp.name, special: 'summer', chosen: cost > 0
      });
      if (cost > 0) n.memories.push({ text: comp.name + '去了' + opt.place, y: y, m: mo });
      if (comp.romance && cost > 0 && !n.romance) {
        n.romance = { name: '阿青', since: monthIndex, month: mo, year: y };
        n.events.push({ t: '在' + opt.place + '遇见了阿青', y: y, m: mo, amt: 0, note: '你们聊到了很晚', special: 'romance', chosen: true });
        n.memories.push({ text: '在' + opt.place + '遇见了阿青', y: y, m: mo, heart: true });
      }
      return;
    }

    // 通用
    var cost2 = opt.cost || 0;
    if (cost2 > 0) spendCash(cost2);
    if (opt.gain) {
      n.cash += opt.gain;
      n.events.push({ t: ev.title + '（收入）', y: y, m: mo, amt: opt.gain, note: '到账', special: ev.key });
    }
    if (opt.rel) addRelation(ev.friend ? ev.friend.name : '朋友', opt.rel);
    if (opt.st) addStats(opt.st);
    // 求情类的赌一把：过了就清掉延期标记
    if (typeof opt.gamblePass === 'number') {
      if (accidentRng(monthIndex + 900)() <= opt.gamblePass) n.flags[opt.clearFlag || 'delay'] = false;
    }
    if (opt.flag) n.flags[opt.flag] = true;
    if (opt.clearFlag) n.flags[opt.clearFlag] = false;
    if (opt.memory && (cost2 > 0 || opt.flag || opt.clearFlag || opt.st)) {
      n.memories.push({ text: opt.memory, y: y, m: mo });
    }
    n.events.push({
      t: opt.key === 'skip' ? ev.title : (opt.memory || ev.title),
      y: y, m: mo, amt: -cost2, note: opt.key === 'skip' ? '你放弃了' : (ev.tag || ''),
      special: ev.key, chosen: opt.key !== 'skip'
    });
  }

  /* ---------- 自动推进 / 进度 / 氛围 ---------- */

  var autoTimer = 0;

  /**
   * 决定做完后自动往下走：逐月模式推进一个月，学年模式继续跑这一年。
   * 如果这个月还有没决定的事（闲钱没分配 / 大日子没回应），就原地等。
   */
  function maybeAdvance() {
    if (state.timelineMode !== 'near' || state.autoPaused) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      if (state.timelineMode !== 'near' || state.autoPaused) return;
      var m = state.slider;
      var ev = eventFor(m);
      var d = state.near.decisions[m];
      // 事件还没处理完（含抢票失败后的黄牛/放弃）：等
      if (!eventResolved(ev, d)) return;
      // 第二幕意外还没回应：等
      if (!accidentResolved(m)) return;

      if (state.pace === 'yearly') {
        var y = yearIndex(m);
        if (!state.near.plans[y]) return;   // 还没定方案：等
        if ((m % 12) === 11) return;        // 学年末：停下看结算
        autoRunYear();
        return;
      }
      // 逐月：闲钱还没分配就等
      if (!monthDecided(m) && monthFreeMoney(m) > 0) return;
      if (m >= NEAR_MONTHS - 1) return;
      nextMonth();
    }, 620);
  }

  /** 取消待执行的自动推进（玩家手动操作时调用）。 */
  function cancelAdvance() {
    clearTimeout(autoTimer);
    autoTimer = 0;
  }

  /** 学年 12 格进度条。 */
  function renderYearStrip() {
    var strip = $('#yearStrip');
    if (!strip) return;
    var y = yearIndex(state.slider);
    strip.innerHTML = '';
    for (var i = 0; i < 12; i++) {
      var m = y * 12 + i;
      var cell = document.createElement('div');
      cell.className = 'year-cell';
      var mp = monthParts(m);
      if (mp.month === 2 || mp.month === 7 || mp.month === 8) cell.classList.add('is-break');
      if (m < state.slider) cell.classList.add('is-done');
      if (m === state.slider) cell.classList.add('is-now');
      cell.title = '第 ' + mp.year + ' 年 ' + mp.month + ' 月';
      strip.appendChild(cell);
    }
  }

  /** 每个月一句生活化的旁白，让月份之间有差别。 */
  var FLAVOR = {
    1: ['寒假在家，被亲戚问了一整周“以后想做什么”。', '南京的冬天湿冷，被窝以外都是远方。'],
    2: ['春节，红包和问题一起到。', '过完年，体重和账单都涨了一点。'],
    3: ['开学第一周，课表比上学期满。', '图书馆的座位又开始难抢。'],
    4: ['樱花开了，鸡鸣寺那条路人挤人。', '春天短得像没来过。'],
    5: ['五一前，全班都在计划去哪。', '天气好得让人不想上课。'],
    6: ['期末周，打印店排队到楼梯口。', '宿舍的灯亮到凌晨三点。'],
    7: ['暑假第一天，你在家睡到中午。', '南京热得像蒸笼，能不出门就不出。'],
    8: ['空调房和实习通勤，构成了这个夏天。', '朋友圈里全是旅行照。'],
    9: ['九月，梧桐还没黄，课已经满了。', '新学期的第一件事是抢洗衣房。'],
    10: ['南京的秋天只有两周，银杏和梧桐一起黄。', '早晚要穿外套了。'],
    11: ['双十一的购物车，加了又删。', '天冷得很快，外卖订单变多了。'],
    12: ['年末了，自习室开始通宵。', '跨年的朋友圈，一年比一年长。']
  };

  function renderFlavor(monthIndex) {
    var el = $('#flavorLine');
    if (!el) return;
    var mp = monthParts(monthIndex);
    var list = FLAVOR[mp.month] || [];
    if (!list.length) { el.textContent = ''; return; }
    var pick = list[(yearIndex(monthIndex) + mp.month) % list.length];
    el.textContent = pick;
  }

  /** 季节飘落物：春樱 / 夏光 / 秋叶 / 冬雪。 */
  function buildSeasonParticles() {
    var layer = $('#seasonLayer');
    if (!layer) return;
    layer.innerHTML = '';
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    for (var i = 0; i < 14; i++) {
      var el = document.createElement('i');
      var size = 3 + Math.random() * 6;
      el.style.setProperty('--x', Math.round(Math.random() * 100) + '%');
      el.style.setProperty('--s', size.toFixed(1) + 'px');
      el.style.setProperty('--d', (10 + Math.random() * 10).toFixed(1) + 's');
      el.style.setProperty('--delay', (-Math.random() * 14).toFixed(1) + 's');
      layer.appendChild(el);
    }
  }

  /** 统一控制收入摘要的显隐（摘要与明细一起）。 */
  function setIncomeVisible(visible) {
    var summary = $('#incomeSummary');
    if (summary) summary.hidden = !visible;
    if (!visible) {
      var detail = $('#incomeDetail');
      if (detail) detail.hidden = true;
      if (summary) summary.classList.remove('is-open');
    }
  }

  /** 朋友关系值与恋爱状态。 */
  function renderRelations() {
    var section = $('#relationSection');
    var list = $('#relationList');
    if (!section || !list) return;
    var rel = state.near.relations || {};
    var names = Object.keys(rel);
    var romance = state.near.romance;
    if (!names.length && !romance) { section.hidden = true; return; }
    section.hidden = false;
    var html = '';
    names.forEach(function (name) {
      var v = rel[name];
      var mood = v >= 4 ? '很铁' : v >= 2 ? '不错' : v > 0 ? '一般' : '有点冷';
      html += '<div class="rel-row"><span>' + name + ' · ' + mood + '</span><b>' + v.toFixed(1) + '</b></div>';
    });
    if (romance) {
      html += '<div class="rel-row"><span>💗 和阿青在一起（第 ' + romance.year + ' 年 ' + romance.month + ' 月起）</span><b>恋爱中</b></div>';
    }
    list.innerHTML = html;
  }

  /** 状态层：学业 / 社交 / 经历 / 身体。 */
  function renderStats() {
    var strip = $('#statStrip');
    if (!strip) return;
    var s = state.near.stats || blankStats();
    strip.innerHTML = STAT_KEYS.map(function (k) {
      var v = s[k];
      var cls = v >= 7 ? ' is-high' : (v <= 2 ? ' is-low' : '');
      return '<span class="stat-chip' + cls + '">' + STAT_ICONS[k] + ' ' + STAT_NAMES[k] +
        ' <b>' + v.toFixed(1) + '</b></span>';
    }).join('');
  }

  /** 生活档案（固定支出的来源）。 */
  function renderProfile() {
    var section = $('#profileSection');
    var list = $('#profileList');
    if (!section || !list) return;
    var p = state.profile;
    if (!p || !profileAnswered()) { section.hidden = true; return; }
    section.hidden = false;
    var rows = [
      ['餐费', '早 ' + p.breakfast + ' / 午 ' + p.lunch + ' / 晚 ' + p.dinner + ' 元', profileMeal()],
      ['交通', p.transport + ' 元/月', p.transport],
      ['日用 + 通讯', DAILY_COST + ' + ' + TELECOM_COST, DAILY_COST + TELECOM_COST],
      ['社交', p.social + ' 元/月', p.social]
    ];
    list.innerHTML = rows.map(function (r) {
      return '<div class="rel-row"><span>' + r[0] + ' · ' + r[1] + '</span><b>' + fmtMoney(r[2]) + '</b></div>';
    }).join('') +
      '<div class="rel-row"><span>合计（每月会有 ±8% 波动）</span><b>' + fmtMoney(profileFixed()) + '</b></div>';
  }

  function renderPockets() {
    var segs = { money: $('#pocketMoney'), skill: $('#pocketSkill'), memory: $('#pocketMemory'), relation: $('#pocketRelation'), freedom: $('#pocketFreedom') };
    var maxPocket = Math.max(nearPocketTotal(), 1);
    POCKETS.forEach(function (k) {
      var seg = segs[k];
      if (!seg) return;
      seg.setAttribute('data-name', POCKET_NAMES[k]);
      seg.style.width = (state.near[k] / maxPocket * 100) + '%';
    });

    var list = $('#pocketList');
    list.innerHTML = '';
    POCKETS.forEach(function (k) {
      var row = document.createElement('div');
      row.className = 'pocket-row';
      var note = POCKET_NOTES[k];
      row.innerHTML = '<span><span class="p-dot" style="background:' + POCKET_COLORS[k] + '"></span>' +
        '<span class="p-name">' + POCKET_NAMES[k] + '</span> <span class="p-note">' + note + '</span></span>' +
        '<span class="p-value">' + fmtMoney(state.near[k]) + '</span>';
      list.appendChild(row);
    });
  }

  /** 本月账本：收入、支出、决策带来的变化。 */
  function renderMonthLog(month) {
    var wrap = $('#monthLogWrap');
    var body = $('#monthLog');
    var parts = monthParts(month);
    var events = state.near.events.filter(function (e) { return e.y === parts.year && e.m === parts.month; });
    var decided = state.near.decisions[month];
    var lines = [];

    if (events.length === 0 && !(decided && decided.plan)) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    if (decided && decided.plan) {
      POCKETS.forEach(function (k) {
        var v = decided.plan[k] || 0;
        if (v > 0) lines.push('<div class="log-line"><span>' + POCKET_ICONS[k] + ' 放入' + POCKET_NAMES[k] + '</span><b>−' + fmtMoney(v) + '</b></div>');
      });
    }
    events.forEach(function (e) {
      var cls = e.accident ? ' accident' : (e.amt < 0 ? ' spend' : ' gain');
      var sign = e.amt > 0 ? '+' : (e.amt < 0 ? '−' : '');
      var amtText = e.amt === 0 ? '放弃' : sign + fmtMoney(Math.abs(e.amt));
      lines.push('<div class="log-line' + cls + '"><span>' + e.t + ' <small>' + e.note + '</small></span><b>' + amtText + '</b></div>');
    });
    body.innerHTML = lines.join('') || '<div class="log-line"><span>这个月没有特别的事</span><b>—</b></div>';
  }

  var POCKET_ICONS = { money: '💰', skill: '📚', memory: '🎒', relation: '🍲', freedom: '🛟' };
  var POCKET_NOTES = {
    money: '存下来的钱',
    skill: '书 / 课 / 证 / 考研',
    memory: '旅行 / 演唱会 / 经历',
    relation: '请客 / 家人 / 朋友',
    freedom: '应急备用金'
  };

  /** 玩家点了某个分配选项：把钱放进对应口袋。 */
  function decidePocket(key) {
    var month = state.slider;
    var free = monthFreeMoney(month);
    if (free <= 0) return;
    var plan = {};
    plan[key] = free;
    // 合并而不是覆盖：别把这个月已经做过的换挡/事件选择冲掉
    var d = state.near.decisions[month] || {};
    d.plan = plan;
    state.near.decisions[month] = d;
    runNearTo(month);
    renderNear();
    maybeAdvance();
  }

  /** 玩家做了一个事件选择。 */
  function decideEvent(key, extra) {
    var month = state.slider;
    var ev = eventFor(month);
    if (!ev) return;
    var d = state.near.decisions[month] || {};
    d.eventChoice = key;
    if (extra && extra.companion) d.companion = extra.companion;
    if (extra && extra.basePrice) d.basePrice = extra.basePrice;
    state.near.decisions[month] = d;
    runNearTo(month);
    renderNear();
    // 抢票失败时还要继续选（找黄牛 / 算了），不自动推进
    var opt = (ev.options || []).filter(function (o) { return o.key === key; })[0];
    if (ev.key === 'concert' && opt && opt.win === false) return;
    maybeAdvance();
  }

  /** 回应意外卡（第二幕）。 */
  function decideAccident(key) {
    var month = state.slider;
    var acc = accidentFor(month);
    if (!acc) return;
    var d = state.near.decisions[month] || {};
    d.accidentChoice = key;
    state.near.decisions[month] = d;
    runNearTo(month);
    renderNear();
    maybeAdvance();
  }

  /** 回答换挡提示：降档 / 不降。 */
  function answerGear(choice) {
    var month = state.slider;
    var d = state.near.decisions[month] || {};
    d.gearChoice = choice;
    state.near.decisions[month] = d;
    runNearTo(month);
    renderNear();
    maybeAdvance();
  }

  /** 当前选择的同行者（旅行用）。 */
  var travelCompanion = 'solo';

  function setCompanion(key) {
    travelCompanion = key;
    var row = document.querySelectorAll('.comp-row .comp-chip');
    for (var i = 0; i < row.length; i++) {
      row[i].classList.toggle('is-on', row[i].getAttribute('data-comp') === key);
    }
  }

  /** 下一个月。 */
  function nextMonth() {
    // 离开第一个月时，把它存下的钱记成基准
    if (state.slider === 0 && typeof state.near.baseline !== 'number') {
      state.near.baseline = monthFreeMoney(0);
    }
    if (state.slider >= NEAR_MONTHS - 1) {
      go('replay');
      return;
    }
    state.slider = state.slider + 1;
    $('#timeSlider').value = state.slider;
    // 大一逐月教学结束：进入第 2 学年时自动切到「学年模式」
    if (state.slider >= 12 && state.slider % 12 === 0 && state.pace === 'monthly') {
      state.pace = 'yearly';
    }
    renderNear();
  }

  /** 重来这一个月。 */
  function resetMonth() {
    // 学年模式：重来这一年（清掉方案和本年自动记录）
    if (state.pace === 'yearly') {
      var y = yearIndex(state.slider);
      delete state.near.plans[y];
      for (var m = y * 12; m <= Math.min(NEAR_MONTHS - 1, y * 12 + 11); m++) {
        delete state.near.decisions[m];
      }
      state.slider = y * 12;
    } else {
      delete state.near.decisions[state.slider];
    }
    runNearTo(state.slider);
    renderNear();
  }

  function narrationNear(month, ev) {
    var d = state.near.decisions[month];
    if (d && d.plan) {
      var picked = Object.keys(d.plan).filter(function (k) { return d.plan[k] > 0; });
      if (picked.length) {
        return '你把这笔钱放进了' + picked.map(function (k) { return POCKET_NAMES[k]; }).join('、') +
          '。第 ' + (month + 1) + ' 个月，就这样过去了。';
      }
    }
    if (ev && ev.gain) return ev.title + '：' + ev.text;
    if (ev) return ev.title + '。' + ev.text;
    if (month === 0) return '毕业前还有 ' + NEAR_MONTHS + ' 个月。每一个月，你都要决定一次。';
    return '第 ' + (month + 1) + ' 个月。这个月没什么特别的事，日子照样过。';
  }

  function narrationFar(y, actual, ideal) {
    if (y === 0) return '三十年后，三条线从这里出发。';
    if (y < 5) return '第 ' + y + ' 年。三条线还靠在一起。';
    if (y < 10) return '第 ' + y + ' 年。实际开始跟不上理想——这就是人性税。';
    if (y < 18) return '第 ' + y + ' 年。差距像滚雪球一样滚大。';
    return '第 ' + y + ' 年。实际：' + fmtMoney(actual) + '，理想：' + fmtMoney(ideal) + '。差的那部分，是你中途松手的日子。';
  }

  function disclaimerText() {
    if (state.timelineMode === 'near') {
      return '价格均为真实口径：高铁二等座按 12306（南京南→成都东 679 元、→西安 550 元、→扬州 70 元），景区学生票按官方（熊猫基地 27、兵马俑 60、瘦西湖 50），四六级 30 元、考研报名 120 元（江苏）。意外按真实概率掷骰。';
    }
    return '长期按年化 ' + rateLabel() + ' 计算；「理想」假设你一直坚持，「实际」假设你中途松手（人性税）。8% 是长期股票指数的历史假设，不是承诺。';
  }

  /* 播放 */
  var playRaf = 0;

  function setPlayLabel(playing) {
    $('#playBtn').textContent = playing ? '⏸ 暂停' : '▶ 让它自己走';
  }

  function togglePlay() {
    // 近期模式：不是"播放"，而是快进——没决定的月份全部按「存起来」自动处理
    if (state.timelineMode === 'near') {
      for (var m = 0; m < NEAR_MONTHS; m++) {
        if (!monthDecided(m) && monthFreeMoney(m) > 0) {
          state.near.decisions[m] = { plan: { money: monthFreeMoney(m) } };
        }
      }
      state.slider = NEAR_MONTHS - 1;
      runNearTo(state.slider);
      go('replay');
      return;
    }

    var slider = $('#timeSlider');
    if (playRaf) {
      cancelAnimationFrame(playRaf);
      playRaf = 0;
      setPlayLabel(false);
      return;
    }
    var max = FAR_YEARS;
    var from = state.slider >= max - 1 ? 0 : state.slider;
    var started = 0;
    var duration = 8000;
    setPlayLabel(true);
    var step = function (now) {
      if (!started) started = now;
      var k = Math.min(1, (now - started) / duration);
      var eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      state.slider = Math.round(from + (max - from) * eased);
      slider.value = state.slider;
      sync();
      if (k < 1) {
        playRaf = requestAnimationFrame(step);
      } else {
        playRaf = 0;
        setPlayLabel(false);
      }
    };
    playRaf = requestAnimationFrame(step);
  }

  /* 重掷意外 */
  function rerollAccident() {
    if (state.timelineMode !== 'near') return;
    state.slider = Math.max(0, state.slider - 12);
    sync();
  }

  /* ---------- 回放：七年快放 ---------- */

  var recapTimer = 0;

  /** 把七年里值得回看的事整理成一串条目。 */
  function buildRecapItems() {
    var items = [];
    for (var y = 1; y <= 7; y++) {
      items.push({ kind: 'year', year: y });
      var picked = [];
      var seen = {};
      state.near.events.forEach(function (e) {
        if (e.y !== y) return;
        var kind = null;
        if (e.special === 'romance') kind = 'romance';
        else if (typeof e.t === 'string' && e.t.indexOf('去了') === 0) kind = 'trip';
        else if (e.accident) kind = 'accident';
        else if (e.special && e.chosen === true) kind = 'spend';
        else if (e.special && e.chosen === false) kind = 'skip';
        if (!kind) return;
        var key = kind + ':' + e.t;
        if (seen[key]) return;
        seen[key] = 1;
        picked.push({ kind: kind, text: e.t, amt: e.amt, note: e.note });
      });
      picked.slice(0, 3).forEach(function (p) { items.push(p); });
    }
    return items;
  }

  /** 播放回放；结束或跳过后进入反转幕。 */
  function playRecap() {
    clearInterval(recapTimer);
    var items = buildRecapItems();
    var feed = $('#recapFeed');
    feed.innerHTML = '';
    $('#recapBar').style.width = '0%';
    $('#recapYear').textContent = '第 1 年';
    $('#recapTotal').textContent = '0';

    var finalTotal = nearPocketTotal();
    var idx = 0;
    var tick = function () {
      if (idx >= items.length) {
        clearInterval(recapTimer);
        recapTimer = setTimeout(function () { go('reveal'); }, 900);
        return;
      }
      var item = items[idx];
      if (item.kind === 'year') {
        $('#recapYear').textContent = '第 ' + item.year + ' 年';
      } else {
        var row = document.createElement('div');
        row.className = 'recap-item ' + item.kind;
        var icon = item.kind === 'trip' ? '🎒'
          : item.kind === 'accident' ? '⚠️'
            : item.kind === 'romance' ? '💗'
              : item.kind === 'skip' ? '🚫' : '✅';
        var label = item.kind === 'skip' ? item.text + '（你放弃了）' : item.text;
        var amt = item.amt ? (item.amt > 0 ? '+' : '−') + fmtMoney(Math.abs(item.amt)) : '';
        row.innerHTML = '<span>' + icon + ' ' + label + '</span><span class="r-amt">' + amt + '</span>';
        feed.appendChild(row);
        // 只保留最近 5 条，旧的变淡
        var rows = feed.querySelectorAll('.recap-item');
        for (var i = 0; i < rows.length; i++) {
          rows[i].classList.toggle('dim', i < rows.length - 3);
        }
        if (rows.length > 6) rows[0].remove();
      }
      idx++;
      $('#recapBar').style.width = Math.round(idx / items.length * 100) + '%';
      $('#recapTotal').textContent = fmtMoney(finalTotal * idx / items.length);
    };
    tick();
    recapTimer = setInterval(tick, 420);
  }

  function skipRecap() {
    clearInterval(recapTimer);
    recapTimer = 0;
    go('reveal');
  }

  /* ---------- 星图 ---------- */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var starCache = null;
  var STAR_ARMS = 3;
  var STAR_TURNS = 3.2;

  function buildStars(width, height) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cx = width / 2;
    var cy = height / 2;
    var reach = Math.min(width, height) * 0.46;
    var rnd = mulberry32(20261027);
    var COUNT = DAYS_FAR; // 10950 天

    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.9);
    glow.addColorStop(0, 'rgba(255, 220, 160, .30)');
    glow.addColorStop(0.4, 'rgba(228, 160, 86, .10)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    var buckets = [[], [], [], [], []];
    for (var i = 0; i < COUNT; i++) {
      var arm = i % STAR_ARMS;
      var t = Math.pow((i / COUNT), 0.72);
      var radius = t * reach;
      var spread = 0.05 + 0.13 * t;
      var angle = t * STAR_TURNS * Math.PI * 2 + arm * (Math.PI * 2 / STAR_ARMS) + (rnd() - 0.5) * spread;
      var jitter = (rnd() - 0.5) * spread * reach * 0.55;

      var x = cx + Math.cos(angle) * (radius + jitter);
      var y = cy + Math.sin(angle) * (radius + jitter) * 0.8;

      var bucket = Math.min(4, Math.floor(Math.pow(rnd(), 0.55) * 5));
      buckets[bucket].push(x, y);
    }

    var alphas = [0.14, 0.26, 0.42, 0.64, 0.95];
    for (var b = 0; b < buckets.length; b++) {
      var coords = buckets[b];
      ctx.fillStyle = 'rgba(255, 208, 145, ' + alphas[b] + ')';
      for (var j = 0; j < coords.length; j += 2) {
        ctx.fillRect(coords[j], coords[j + 1], b === 4 ? 1.5 : 1.1, b === 4 ? 1.5 : 1.1);
      }
    }

    return { canvas: canvas, width: width, height: height, dpr: dpr, cx: cx, cy: cy, reach: reach };
  }

  function armPoint(u, cx, cy, reach) {
    var r = Math.pow(u, 0.82) * reach;
    var a = u * STAR_TURNS * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.8 };
  }

  function drawStars() {
    var canvas = $('#stars');
    var width = canvas.clientWidth || 420;
    var height = 300;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (!starCache || starCache.width !== width) {
      starCache = buildStars(width, height);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(starCache.canvas, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cx = starCache.cx;
    var cy = starCache.cy;
    var reach = starCache.reach;
    var from = 0.015;
    var to = 0.93;
    var steps = 64;

    var paint = function (headU) {
      var curve = [];
      for (var s = 0; s <= steps; s++) {
        var u = from + (headU - from) * (s / steps);
        curve.push(armPoint(u, cx, cy, reach));
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(curve[0].x, curve[0].y);
      for (var p = 1; p < curve.length; p++) ctx.lineTo(curve[p].x, curve[p].y);
      ctx.strokeStyle = 'rgba(24, 18, 14, .92)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 236, 200, .98)';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = 'rgba(255, 186, 96, .95)';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();

      var head = curve[curve.length - 1];
      ctx.save();
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffeccb';
      ctx.shadowColor = '#ffbe6a';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    };

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      paint(to);
      return;
    }

    var started = 0;
    var duration = 1500;
    var frame = function (now) {
      if (!started) started = now;
      var k = Math.min(1, (now - started) / duration);
      var eased = 1 - Math.pow(1 - k, 3);
      paint(from + (to - from) * eased);
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ---------- 结局三线 ---------- */

  function renderEnding() {
    var seed = state.near.money;
    var actual = farLineActual();
    var ideal = farLineIdeal();
    var zero = farLineZero();
    $('#lineActual').textContent = fmtMoney(actual);
    $('#lineIdeal').textContent = fmtMoney(ideal);
    $('#lineZero').textContent = fmtMoney(zero);
    $('#lineActualNote').textContent = '按你实际攒下的 ' + fmtMoney(seed) + ' 复利 30 年';
    $('#lineIdealNote').textContent = '理想：全程坚持 + 之后继续存';
    $('#lineZeroNote').textContent = '一分没存';
    $('#taxLine').textContent = '「人性税」：理想与实际之差 = ' + fmtMoney(ideal - actual) +
      '。这三个人，都是你。';

    // 节奏统计：这几年里，有多少是自动跑的
    var st = paceStats();
    var totalDecided = st.auto + st.manual;
    if (totalDecided > 0) {
      var autoShare = Math.round(st.auto / totalDecided * 100);
      var yearsText = (st.auto / 12).toFixed(1);
      $('#paceLine').textContent = '七年里，你有 ' + st.auto + ' 个月是「按方案自动走的」' +
        '（约 ' + yearsText + ' 年，占 ' + autoShare + '%），' +
        st.manual + ' 个月是你亲手决定的。';
      $('#paceLine').hidden = false;
    } else {
      $('#paceLine').hidden = true;
    }
  }

  /* ---------- 纪念海报 ---------- */

  var reportCanvas = null;

  function wrapText(ctx, text, maxWidth) {
    var lines = [];
    var line = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      var next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function reportRows() {
    var rows = [];
    var school = SCHOOLS[state.school] ? SCHOOLS[state.school].label : '—';
    var grade = GRADES[state.grade] ? GRADES[state.grade].label : '—';
    rows.push(['身份', school + ' · ' + grade]);
    rows.push(['每月生活费', fmtMoney(state.budget) + ' / 月']);
    rows.push(['每天随手花掉', fmtMoney(state.amount) + ' 元']);
    rows.push(['七年后五口袋合计', fmtMoney(nearPocketTotal())]);
    rows.push(['其中·钱袋', fmtMoney(state.near.money)]);
    rows.push(['其中·能力袋', fmtMoney(state.near.skill)]);
    rows.push(['其中·经历袋', fmtMoney(state.near.memory)]);
    rows.push(['三十年后·实际', fmtMoney(farLineActual())]);
    rows.push(['三十年后·理想', fmtMoney(farLineIdeal())]);
    return rows;
  }

  function renderReport() {
    var canvas = document.createElement('canvas');
    var W = 720;
    var H = 1080;
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var startYear = new Date().getFullYear();

    ctx.fillStyle = '#f8f2e6';
    ctx.fillRect(0, 0, W, H);

    /* 角落的点阵 */
    var rnd = mulberry32(77);
    ctx.fillStyle = 'rgba(191, 90, 44, .10)';
    for (var i = 0; i < 900; i++) {
      var x = 400 + rnd() * 300;
      var y = 60 + rnd() * 150;
      ctx.fillRect(x, y, 1.6, 1.6);
    }

    ctx.fillStyle = '#bf5a2c';
    ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('AI 创客大赛 · 数字内容与创意表达类', 60, 96);

    ctx.fillStyle = '#241f1b';
    ctx.font = '600 46px "Songti SC", "STSong", "SimSun", serif';
    ctx.fillText('你的这一种人生', 60, 168);

    ctx.strokeStyle = '#dccbb2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 208);
    ctx.lineTo(W - 60, 208);
    ctx.stroke();

    var head = fmtMoney(nearPocketTotal());
    ctx.fillStyle = '#bf5a2c';
    ctx.font = '600 88px "Songti SC", serif';
    ctx.fillText(head, 60, 330);

    ctx.fillStyle = '#6b5f54';
    ctx.font = '400 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('七年五口袋 · ' + startYear + ' 年', 60, 386);

    var rows = reportRows();
    var y = 470;
    for (var r = 0; r < rows.length; r++) {
      var label = rows[r][0];
      var value = rows[r][1];
      ctx.fillStyle = '#6b5f54';
      ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(label, 60, y);

      ctx.fillStyle = '#241f1b';
      ctx.font = '600 25px "Songti SC", "STSong", serif';
      var vw = ctx.measureText(value).width;
      ctx.fillText(value, W - 60 - vw, y);

      ctx.strokeStyle = 'rgba(220, 203, 178, .8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(60, y + 21);
      ctx.lineTo(W - 60, y + 21);
      ctx.stroke();

      y += 56;
    }

    var quote = cardQuote();
    ctx.fillStyle = '#4a4038';
    ctx.font = '400 27px "Songti SC", "STSong", serif';
    var lines = wrapText(ctx, quote, W - 140);
    var qy = Math.max(y + 40, 880);
    for (var l = 0; l < lines.length && qy < H - 96; l++) {
      ctx.fillText(lines[l], 60, qy);
      qy += 38;
    }

    ctx.strokeStyle = '#dccbb2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, H - 84);
    ctx.lineTo(W - 60, H - 84);
    ctx.stroke();

    ctx.fillStyle = '#9a8b78';
    ctx.font = '400 21px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('一块钱的两万种人生 · 五类去向，互相转化', 60, H - 44);

    var img = $('#reportImg');
    img.src = canvas.toDataURL('image/png');
    img.dataset.ready = '1';

    $('#reportLine').textContent = '这一张海报，是你刚才那几分钟留下的东西。';

    reportCanvas = canvas;
  }

  function cardQuote() {
    return '你当年只是把 15 块换了个地方放。\n剩下的，时间替你做了。';
  }

  function downloadReport() {
    if (!reportCanvas) return;
    reportCanvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '我的一种人生.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, 'image/png');
  }

  /* AI 回顾视频（预留位） */
  function generateVideo() {
    var btn = $('#videoBtn');
    var original = btn.textContent;
    btn.textContent = '⏳ AI 正在回顾你的人生…';
    btn.disabled = true;
    // 真实实现：这里会把 state 快照发给生成服务，返回视频 URL。
    // demo 阶段：模拟 2.2 秒后"生成"一段回放动画（用海报 canvas 做一帧）。
    setTimeout(function () {
      if (reportCanvas) {
        var url = reportCanvas.toDataURL('image/png');
        // 生成一个 <video> 占位：真实接入时换成服务返回的 mp4 URL
        var existing = $('#reviewVideo');
        if (existing) existing.remove();
        var video = document.createElement('video');
        video.id = 'reviewVideo';
        video.controls = true;
        video.style.cssText = 'width:100%;border-radius:14px;margin-top:12px;';
        video.poster = url;
        var src = document.createElement('source');
        src.src = ''; // 预留：AI 视频服务返回的 mp4
        video.appendChild(src);
        var actions = $('.actions');
        actions.parentNode.insertBefore(video, actions);
        btn.textContent = '🎬 回顾视频已生成（接入 AI 后可用）';
      }
      btn.disabled = false;
    }, 2200);
  }

  function restart() {
    state.grade = null; state.school = null; state.major = null; state.birthday = null; state.profile = null;
    state.budget = 1800; state.amount = 15; state.habit = 5;
    state.pace = 'monthly'; state.timelineMode = 'near'; state.slider = 0;
    state.rate = 0.08; state.inflation = false;
    state.near = { money: 0, skill: 0, memory: 0, relation: 0, freedom: 0, cash: 0, events: [], decisions: {}, plans: {}, eventCache: {}, relations: {}, flags: {}, stats: { study: 3, social: 3, exp: 3, body: 5 }, statsAtMonth: [], memories: [], romance: null, gearSet: {}, baseline: null, monthLog: [], done84: false };
    state.far = { actual: 0, ideal: 0, zero: 0, years: 0, series: { actual: [], ideal: [], zero: [] } };
    $('#inflationToggle').checked = false;
    $$('.chip').forEach(function (c) { c.classList.remove('is-on'); });
    $$('.card').forEach(function (c) { c.classList.remove('is-picked'); });
    $('#identityNext').disabled = true;
    var v = $('#reviewVideo');
    if (v) v.remove();
    go('cover');
  }

  /* ---------- 绑定 ---------- */

  function bind() {
    document.addEventListener('click', function (event) {
      var node = event.target;
      if (!node || typeof node.closest !== 'function') return;

      // 学年方案：四选一
      var planBtn = node.closest('[data-plan]');
      if (planBtn) {
        choosePlan(planBtn.getAttribute('data-plan'));
        return;
      }

      // 本月分配：五选一
      var decide = node.closest('[data-decide]');
      if (decide) {
        decidePocket(decide.getAttribute('data-decide'));
        return;
      }

      // 同行者选择（旅行）
      var comp = node.closest('[data-comp]');
      if (comp) {
        setCompanion(comp.getAttribute('data-comp'));
        return;
      }

      // 换挡
      var gear = node.closest('[data-gear]');
      if (gear) {
        answerGear(gear.getAttribute('data-gear'));
        return;
      }

      // 意外卡（第二幕）
      var accBtn = node.closest('[data-acc]');
      if (accBtn) {
        decideAccident(accBtn.getAttribute('data-acc'));
        return;
      }

      // 事件选项
      var evBtn = node.closest('[data-ev]');
      if (evBtn) {
        var ev = eventFor(state.slider);
        var extra = { companion: travelCompanion };
        if (evBtn.getAttribute('data-base')) extra.basePrice = Number(evBtn.getAttribute('data-base'));
        decideEvent(evBtn.getAttribute('data-ev'), extra);
        return;
      }

      var nav = node.closest('[data-go]');
      if (nav) {
        go(nav.getAttribute('data-go'));
        return;
      }
    });

    $('#amount').addEventListener('input', function () { readInputs(false); });
    $('#amount').addEventListener('blur', function () { readInputs(true); });

    // 暂停 / 账本抽屉 / 收入明细
    $('#recapSkip').addEventListener('click', skipRecap);

    $('#pauseBtn').addEventListener('click', function () {
      state.autoPaused = !state.autoPaused;
      if (state.autoPaused) cancelAdvance(); else maybeAdvance();
      renderNear();
    });

    $('#ledgerToggle').addEventListener('click', function () {
      var drawer = $('#ledgerDrawer');
      drawer.hidden = !drawer.hidden;
      this.classList.toggle('is-on', drawer.hidden === false);
    });

    $('#incomeSummary').addEventListener('click', function () {
      var detail = $('#incomeDetail');
      detail.hidden = !detail.hidden;
      this.classList.toggle('is-open', detail.hidden === false);
    });

    $('#nextMonthBtn').addEventListener('click', function () {
      cancelAdvance();
      if (state.timelineMode === 'far') { go('reveal'); return; }

      if (state.pace === 'yearly') {
        var y = yearIndex(state.slider);
        var plan = state.near.plans[y];
        var ev2 = eventFor(state.slider);
        var d = state.near.decisions[state.slider];
        if (!plan) {
          $('#planCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (isMajorEvent(ev2) && !(d && d.eventChoice)) {
          $('#specialCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if ((state.slider % 12) === 11) {
          // 学年末
          if (state.slider >= NEAR_MONTHS - 1) { go('replay'); return; }
          nextYear();
          return;
        }
        autoRunYear();
        return;
      }

      // 逐月模式
      if (!monthDecided(state.slider) && monthFreeMoney(state.slider) > 0) {
        $('#decideTitle').textContent = '先决定这个月这笔钱怎么放，再往下走。';
        $('#decideGrid').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      nextMonth();
    });

    // 节奏切换
    $('#paceSeg').addEventListener('click', function (event) {
      var item = event.target.closest('.pace-item');
      if (!item) return;
      state.pace = item.getAttribute('data-pace');
      renderNear();
    });

    $('#resetMonthBtn').addEventListener('click', resetMonth);

    $('#timeSlider').addEventListener('input', function () {
      if (playRaf) { cancelAnimationFrame(playRaf); playRaf = 0; setPlayLabel(false); }
      state.slider = parseFloat(this.value) || 0;
      sync();
    });

    $('#playBtn').addEventListener('click', togglePlay);
    $('#rollBtn').addEventListener('click', rerollAccident);

    $('#rateSeg').addEventListener('click', function (event) {
      var button = event.target.closest('.seg-item');
      if (!button) return;
      state.rate = parseFloat(button.getAttribute('data-rate'));
      $$('.seg-item', this).forEach(function (b) { b.classList.toggle('is-on', b === button); });
      sync();
    });

    $('#inflationToggle').addEventListener('change', function () {
      state.inflation = this.checked;
      sync();
    });

    // 双模式切换
    $('.mode-seg').addEventListener('click', function (event) {
      var item = event.target.closest('.mode-item');
      if (!item) return;
      state.timelineMode = item.getAttribute('data-mode');
      $$('.mode-item', this).forEach(function (b) { b.classList.toggle('is-on', b === item); });
      prepareMachine();
    });

    $('#downloadBtn').addEventListener('click', downloadReport);
    $('#videoBtn').addEventListener('click', generateVideo);
    $('#restartBtn').addEventListener('click', restart);

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if ($('.screen[data-screen="reveal"]').classList.contains('is-active')) {
          starCache = null;
          drawStars();
        }
        if ($('.screen[data-screen="machine"]').classList.contains('is-active')) {
          drawCurve();
        }
      }, 220);
    });
  }

  /* 直达某一屏（演示用） */
  function deepLink() {
    var hash = location.hash.replace(/^#/, '');
    if (SCREENS.indexOf(hash) <= 0) return false;
    var params = new URLSearchParams(location.search);
    var mode = params.get('mode');
    if (mode === 'near' || mode === 'far') state.timelineMode = mode;
    var pace = params.get('pace');
    if (pace === 'monthly' || pace === 'yearly') state.pace = pace;
    if (hash === 'setup') { go(hash); return true; }
    // 长期模式依赖近期账本做种子：直达 far 屏时先补跑七年
    if (state.timelineMode === 'far' && (hash === 'machine' || hash === 'ending' || hash === 'report')) {
      if (!state.near.done84) {
        runNearTo(NEAR_MONTHS);
        state.near.done84 = true;
      }
    }
    // y 按模式解释：near 是月份 0..84，far 是年份 0..30
    var rawY = parseFloat(params.get('y'));
    if (isFinite(rawY)) {
      pendingSlider = state.timelineMode === 'far'
        ? Math.min(FAR_YEARS, Math.max(0, rawY))
        : Math.min(NEAR_MONTHS, Math.max(0, rawY));
    } else {
      pendingSlider = null;
    }
    go(hash);
    return true;
  }

  bindIdentity();
  bindArchive();
  bindHabit();
  readInputs(true);
  bind();
  if (!deepLink()) go('cover');
})();
