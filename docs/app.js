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

  var SCREENS = ['cover', 'identity', 'setup', 'machine', 'reveal', 'ending', 'report'];
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
    pace: 'monthly',          // 'monthly' 逐月 | 'yearly' 学年方案
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

  // 每月基础支出（吃饭/日用），约占生活费一半
  function monthlyBase() {
    return Math.round(state.budget * 0.55);
  }

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

  // 特殊日子：真实校历 + 真实价格（2026-11 校准）
  // kind: 'ask' = 花/不花；'gain' = 自动进账；'info' = 只提示；'ask-travel' = 选目的地
  var SPECIAL_DAYS = [
    { month: 1, key: 'winter-home', kind: 'ask', tag: '寒假', date: '1 月中下旬', title: '回家过年', text: '南京南到家里的高铁。学生票一年只有 4 次，且限家—校区间。', cost: 400, pocket: 'relation' },
    { month: 2, key: 'lucky-money', kind: 'gain', tag: '春节', date: '2 月中旬', title: '压岁钱', text: '长辈给的压岁钱。这笔钱是你一年里最大的一笔“横财”。', amount: 2000 },
    { month: 3, key: 'newterm', kind: 'ask', tag: '春季开学', date: '3 月初', title: '开学采购', text: '教材、打印、日用品。一学期 300 元起步。', cost: 300, pocket: 'skill' },
    { month: 4, key: 'qingming', kind: 'ask', tag: '清明', date: '4 月 4–6 日', title: '踏青', text: '南京的春天只有几周。去一趟栖霞山或玄武湖，100 元。', cost: 100, pocket: 'memory' },
    { month: 4, key: 'concert', kind: 'ask', tag: '演唱会', major: true, date: '4 月周末', title: '奥体有场演唱会', text: '看台票 680 元。你会记很久，也可能只是站了三小时。', cost: 680, pocket: 'memory' },
    { month: 5, key: 'labour', kind: 'ask', tag: '五一', date: '5 月 1–5 日', title: '五一假期', text: '去扬州：高铁往返 140 + 青旅 60 + 瘦西湖学生票 50 + 吃 120 ≈ 370 元。', cost: 370, pocket: 'memory' },
    { month: 6, key: 'final', kind: 'info', tag: '期末', date: '6 月下旬', title: '期末周', text: '打印店排队，通宵，外卖涨到 25 一顿。这个月存不下什么。' },
    { month: 6, key: 'cet', kind: 'ask', tag: '四六级', date: '6 月中旬', title: '四六级报名', text: '江苏笔试 30 元/人。考不过，下次再来。', cost: 30, pocket: 'skill' },
    { month: 6, key: 'graduation', kind: 'ask', tag: '毕业季', major: true, date: '6 月下旬', title: '毕业旅行 / 送别饭', text: '大四的六月，很多人会花掉一大笔。1,200 元。', cost: 1200, pocket: 'memory' },
    { month: 7, key: 'summer', kind: 'ask-travel', tag: '暑假', major: true, date: '7 月', title: '暑假到了', text: '你攒了一个学期的旅行基金，现在可以决定去哪。' },
    { month: 8, key: 'intern', kind: 'gain', tag: '实习', date: '8 月', title: '实习工资', text: '这个暑假你实习了，拿到一笔钱。', amount: 3000 },
    { month: 9, key: 'newterm2', kind: 'ask', tag: '秋季开学', date: '9 月初', title: '开学采购', text: '教材、被套、新的耳机。300 元。', cost: 300, pocket: 'skill' },
    { month: 10, key: 'autumn', kind: 'ask', tag: '国庆·秋游', date: '10 月 1–7 日', title: '栖霞山看红叶', text: '旺季门票 50 元，学生半价 25。南京的秋天只有几周。', cost: 25, pocket: 'memory' },
    { month: 11, key: 'double11', kind: 'ask', tag: '双十一', date: '11 月 11 日', title: '双十一', text: '购物车里躺了很久的东西，今晚打折。500 元。', cost: 500, pocket: 'relation' },
    { month: 12, key: 'kaoyan', kind: 'ask', tag: '考研', date: '12 月下旬', title: '考研报名 / 冲刺班', text: '江苏报名费 120 元。冲刺班另算，看你要不要赌这一把。', cost: 120, pocket: 'skill' },
    { month: 12, key: 'newyear', kind: 'ask', tag: '跨年', date: '12 月 31 日', title: '跨年', text: '朋友约你跨年，人均 300 元。', cost: 300, pocket: 'memory' }
  ];

  // 暑假旅行目的地（南京出发，真实价格，2026-11 校准）
  var TRAVELS = [
    {
      key: 'yangzhou', name: '扬州', days: 2, cost: 400,
      desc: '高铁 70×2 + 青旅 60 + 瘦西湖学生票 50 + 吃 120 + 市内 30'
    },
    {
      key: 'chengdu', name: '成都', days: 4, cost: 1900,
      desc: '高铁 679×2 + 青旅 3 晚 180 + 熊猫基地学生票 27 + 吃 280 + 市内 55'
    },
    {
      key: 'xian', name: '西安', days: 4, cost: 1600,
      desc: '高铁 550×2 + 青旅 3 晚 180 + 兵马俑学生票 60 + 吃 240 + 市内 40'
    },
    {
      key: 'sanya', name: '三亚', days: 5, cost: 2400,
      desc: '机票往返 1,500 + 青旅 4 晚 280 + 玩海 150 + 吃 400 + 市内 80'
    },
    { key: 'home', name: '哪也不去', days: 0, cost: 0, desc: '钱留着，暑假在家' }
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

    'kaoyan': '<svg viewBox="0 0 200 120"><rect x="46" y="76" width="76" height="14" rx="2" fill="#8a6a4a"/><rect x="52" y="62" width="64" height="14" rx="2" fill="#3f6f66"/><rect x="48" y="48" width="72" height="14" rx="2" fill="#d98a6a"/><path d="M150 24v52" stroke="#4a4038" stroke-width="3" stroke-linecap="round"/><path d="M150 24l18-6v14l-18 6z" fill="#d79a3f"/><ellipse cx="150" cy="82" rx="15" ry="5" fill="#f2c96b" opacity=".5"/><rect x="28" y="30" width="34" height="34" rx="3" fill="#fdf6ea" stroke="#cbb497" stroke-width="2"/><path d="M34 40h22M34 48h22M34 56h14" stroke="#cbb497" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  // 意外事件（真实概率）—— 每年一次机会
  var ACCIDENTS = [
    { name: '手机被偷', chance: 0.06, cost: 2500, pocket: 'freedom', note: '重新买一台' },
    { name: '生病住院', chance: 0.04, cost: 1200, pocket: 'freedom', note: '医保报销后自付' },
    { name: '电信诈骗', chance: 0.05, cost: 1500, pocket: 'freedom', note: '刷单骗局' },
    { name: '挂科重修', chance: 0.04, cost: 400, pocket: 'skill', note: '重修费 + 时间' }
  ];

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
    n.cash -= monthlyBase();
    // 期末周这种月份额外花销
    var sp = specialFor(monthIndex);

    // 习惯投入：默认每天省一笔（amount），投入"钱袋"（存钱）
    var daily = state.amount;
    var invest = daily * 30; // 每月约省 amount×30
    if (!habitActive(monthIndex)) invest = Math.round(invest * 0.5); // 人性税
    if (invest > 0) {
      n.money += invest;
      n.cash -= invest;
    }

    // 特殊日子：收入类自动进账
    if (sp && sp.kind === 'gain') {
      var spParts = monthParts(monthIndex);
      n.cash += sp.amount;
      n.events.push({ t: sp.title, y: spParts.year, m: spParts.month, amt: sp.amount, note: sp.text, special: sp.key });
    }

    // 意外：每年第一次掷骰（用固定种子，回看时结果稳定）
    if ((monthIndex % 12) === 0) {
      var acc = null;
      var accTotal = 0;
      ACCIDENTS.forEach(function (a) { accTotal += a.chance; });
      var roll = (rnd ? rnd() : Math.random()) * accTotal;
      var cursor = 0;
      for (var i = 0; i < ACCIDENTS.length; i++) {
        cursor += ACCIDENTS[i].chance;
        if (roll <= cursor) { acc = ACCIDENTS[i]; break; }
      }
      if (acc) {
        var amt = acc.cost;
        if (n[acc.pocket] >= amt) { n[acc.pocket] -= amt; }
        else { n.cash -= amt; }
        var accParts = monthParts(monthIndex);
        n.events.push({ t: acc.name, y: accParts.year, m: accParts.month, amt: -amt, note: acc.note, accident: true });
      }
    }
  }

  /** 取某个月的特殊日子。生日按玩家选的月份动态触发。 */
  function specialFor(monthIndex) {
    var parts = monthParts(monthIndex);
    // 生日优先：玩家选的月份就是这个月
    if (state.birthday && parts.month === Number(state.birthday)) {
      return {
        month: parts.month, key: 'birthday', kind: 'ask', tag: '生日', major: true,
        title: '你的生日', text: '生日这个月，你会请朋友吃顿饭，也会收到一点祝福。', cost: 300, pocket: 'relation'
      };
    }
    var list = SPECIAL_DAYS.filter(function (s) { return s.month === parts.month && s.key !== 'birthday'; });
    return list.length ? list[0] : null;
  }

  /**
   * 重放到第 monthIndex 个月：玩家在 state.near.decisions 里的选择会被应用，
   * 没有记录决策的月份按"默认分配"（全部存起来）处理。
   */
  function runNearTo(monthIndex) {
    var n = state.near;
    n.cash = 0; n.money = 0; n.skill = 0; n.memory = 0; n.relation = 0; n.freedom = 0; n.events = [];
    n.monthLog = [];
    // 每年意外结果需要稳定：用固定种子重放，保证回看不乱跳
    var rnd = mulberry32(20260901 + (state.birthday || 6));
    for (var m = 0; m <= monthIndex; m++) {
      advanceNearMonth(m, rnd);
      // 应用玩家在这个月的决策（如果有）
      var d = n.decisions[m];
      if (d && d.plan) applyPlan(m, d.plan);
      // 应用特殊日子的额外决定
      if (d && d.specialChoice) applySpecialChoice(m, d.specialChoice);
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

  /** 特殊日子的额外选择（花 / 不花 / 旅行）。 */
  function applySpecialChoice(monthIndex, choice) {
    var n = state.near;
    var sp = specialFor(monthIndex);
    if (!sp) return;
    var parts = monthParts(monthIndex);
    var y = parts.year;
    var m = parts.month;
    var d = n.decisions[monthIndex] || {};

    if (choice === 'travel') {
      var cost = d.travelCost || 0;
      var name = d.travelName || '旅行';
      if (cost > 0) {
        // 先用旅行基金（经历袋），不够再从现金补
        if (n.memory >= cost) { n.memory -= cost; }
        else {
          var rest = cost - n.memory;
          n.memory = 0;
          n.cash -= rest;
        }
        n.events.push({ t: '去了' + name, y: y, m: m, amt: -cost, note: '你出发了', special: sp.key, chosen: true });
      } else {
        n.events.push({ t: '暑假留在家', y: y, m: m, amt: 0, note: '你把钱留下来了', special: sp.key, chosen: false });
      }
      return;
    }

    if (!sp.cost) return;
    if (choice === 'yes') {
      var amt = sp.cost;
      if (n[sp.pocket] >= amt) n[sp.pocket] -= amt;
      else n.cash -= amt;
      n.events.push({ t: sp.title, y: y, m: m, amt: -amt, note: sp.text, special: sp.key, chosen: true });
    } else if (choice === 'skip') {
      n.events.push({ t: sp.title, y: y, m: m, amt: 0, note: '你放弃了：' + sp.title, special: sp.key, chosen: false });
    }
  }

  /** 本月可自由分配的闲钱。 */
  function monthFreeMoney(monthIndex) {
    var n = state.near;
    var allowance = monthlyAllowance();
    if (state.grade === 'grad') allowance += 0; // 补贴已含在 monthlyAllowance 里
    var base = monthlyBase();
    // 特殊日子的收入类先加到现金（重放时已处理），这里只算"可支配"
    var sp = specialFor(monthIndex);
    var extra = sp && sp.kind === 'gain' ? sp.amount : 0;
    var habitCut = state.amount * 30;
    return Math.max(0, allowance + extra - base - habitCut);
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
    if (name === 'machine') { prepareMachine(); }
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
    $('#identityNext').addEventListener('click', function () { go('setup'); });
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
      $('#readoutBox').hidden = false;
      $('#timelineWrap').hidden = false;
      $('#nextMonthBtn').textContent = state.slider >= NEAR_MONTHS - 1 ? '看结局 →' : '下一个月 →';
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
    $('#monthLeft').textContent = '还剩 ' + (NEAR_MONTHS - month - 1) + ' 次决定';
    $('#readoutLabel').textContent = label;

    var free = monthFreeMoney(month);
    var sp = specialFor(month);
    var decided = state.near.decisions[month];

    // 收入卡片
    $('#incAllow').textContent = fmtMoney(monthlyAllowance());
    if (sp && sp.kind === 'gain') {
      $('#incExtraRow').hidden = false;
      $('#incExtraLabel').textContent = sp.title;
      $('#incExtra').textContent = '+' + fmtMoney(sp.amount);
    } else {
      $('#incExtraRow').hidden = true;
    }
    $('#incBase').textContent = '−' + fmtMoney(monthlyBase() + state.amount * 30);
    $('#incFree').textContent = fmtMoney(free);

    // 特殊日子卡片
    var spBody = $('#specialBody');
    if (sp) {
      $('#specialCard').hidden = false;
      $('#specialTag').textContent = sp.tag + (sp.date ? ' · ' + sp.date : '');
      $('#specialText').textContent = sp.title + '：' + sp.text;
      // 每个日子配一张内联 SVG 插画（离线可用）
      var sceneEl = $('#specialScene');
      sceneEl.innerHTML = SCENES[sp.key] || '';
      spBody.innerHTML = '';

      if (decided && decided.specialChoice) {
        spBody.innerHTML = '<p class="special-done">' +
          (decided.specialChoice === 'yes' ? '你选择了：' + sp.title + '（−' + fmtMoney(sp.cost || 0) + '）'
            : decided.specialChoice === 'skip' ? '你放弃了：' + sp.title
              : '你选择了：' + (decided.travelName || '出发')) + '</p>';
      } else if (sp.kind === 'ask') {
        spBody.innerHTML =
          '<button class="mini-btn yes" data-special="yes">花 ' + fmtMoney(sp.cost) + '，' + sp.title + '</button>' +
          '<button class="mini-btn no" data-special="skip">算了，这次不去</button>';
      } else if (sp.kind === 'ask-travel') {
        var opts = TRAVELS.map(function (t) {
          var afford = nearPocketTotal() + state.near.cash >= t.cost;
          return '<button class="mini-btn travel' + (afford ? '' : ' unaffordable') + '" data-travel="' + t.key + '">' +
            '<b>' + t.name + '</b><small>' + (t.cost > 0 ? fmtMoney(t.cost) : '不花钱') + ' · ' + t.desc + '</small></button>';
        }).join('');
        spBody.innerHTML = opts;
      } else if (sp.kind === 'gain') {
        spBody.innerHTML = '<p class="special-done">自动到账 ' + fmtMoney(sp.amount) + '</p>';
      } else {
        spBody.innerHTML = '';
      }
    } else {
      $('#specialCard').hidden = true;
    }

    // —— 节奏相关界面：学年方案 / 学年结算 / 逐月决策 ——
    var grid = $('#decideGrid');
    var planCard = $('#planCard');
    var settleCard = $('#yearSettle');
    var y = yearIndex(month);
    var yearPlan = state.near.plans[y];
    var isYearEnd = (month % 12) === 11;
    var spPending = isMajorSpecial(sp) && !(decided && decided.specialChoice);

    planCard.hidden = true;
    settleCard.hidden = true;

    if (state.pace === 'yearly' && !yearPlan) {
      // 学年开始（或刚切到学年模式）：先定方案
      planCard.hidden = false;
      $('#incomeCard').hidden = true;
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
      $('#incomeCard').hidden = true;
      grid.innerHTML = '';
      $('#decideTitle').textContent = '';
      $('#monthLogWrap').hidden = true;
      renderYearSettle(y);
    } else if (state.pace === 'yearly') {
      // 学年模式普通月份：按方案自动安排
      $('#incomeCard').hidden = false;
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
    } else if (free <= 0) {
      $('#incomeCard').hidden = false;
      $('#decideTitle').textContent = '这个月没有闲钱可以分。';
      grid.innerHTML = '<p class="decide-empty">生活费刚好够用。很多人是这样过的。</p>';
    } else if (decided && decided.plan) {
      $('#incomeCard').hidden = false;
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
      $('#incomeCard').hidden = false;
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
    $('#narration').textContent = narrationNear(month, sp);
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
    $('#resetMonthBtn').hidden = !(decided && (decided.plan || decided.specialChoice));
    $('#playBtn').textContent = '▶ 快进（自动按「存起来」走完）';
  }

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

  /** 这个特殊日子需不需要玩家点头（收入类不需要）。 */
  function isAskingSpecial(sp) {
    return !!sp && (sp.kind === 'ask' || sp.kind === 'ask-travel');
  }

  /** 是不是「大日子」——只有大日子才打断学年模式。 */
  function isMajorSpecial(sp) {
    return isAskingSpecial(sp) && sp.major === true;
  }

  /** 小学年模式里，小日子按学年方案自动决定（花 or 算了）。 */
  function autoResolveSpecial(m, sp) {
    var d = state.near.decisions[m] || {};
    if (d.specialChoice) return;
    if (sp.kind === 'ask-travel') {
      d.specialChoice = 'skip';
    } else {
      var plan = state.near.plans[yearIndex(m)] || state.near.plans[yearIndex(m) - 1] || {};
      var share = plan[sp.pocket] || 0;
      d.specialChoice = share >= 0.2 ? 'yes' : 'skip';
    }
    state.near.decisions[m] = d;
  }

  /**
   * 从当前月开始，按方案自动跑到「本学年结束」或「下一个大日子」。
   * 小日子按方案自动决定，不会停下来打扰玩家。
   */
  function autoRunYear() {
    var start = state.slider;
    var y = yearIndex(start);
    var plan = state.near.plans[y];
    if (!plan) return;
    var end = Math.min(NEAR_MONTHS - 1, y * 12 + 11);

    for (var m = start; m <= end; m++) {
      var d = state.near.decisions[m];
      var sp = specialFor(m);

      // 大日子：还没决定就停下来问
      if (isMajorSpecial(sp) && !(d && d.specialChoice)) {
        state.slider = m;
        renderNear();
        return;
      }
      // 小日子：按方案自动决定
      if (isAskingSpecial(sp) && !(d && d.specialChoice)) {
        autoResolveSpecial(m, sp);
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
    state.near.decisions[month] = { plan: plan };
    runNearTo(month);
    renderNear();
  }

  /** 特殊日子的花 / 不花。 */
  function decideSpecial(choice) {
    var month = state.slider;
    var d = state.near.decisions[month] || {};
    d.specialChoice = choice;
    state.near.decisions[month] = d;
    runNearTo(month);
    renderNear();
  }

  /** 暑假：选一个目的地（真实价格，南京出发）。 */
  function chooseTravel(key) {
    var month = state.slider;
    var trip = null;
    TRAVELS.forEach(function (t) { if (t.key === key) trip = t; });
    if (!trip) return;

    var d = state.near.decisions[month] || {};
    d.specialChoice = trip.cost > 0 ? 'travel' : 'skip';
    d.travelKey = key;
    d.travelName = trip.name;
    d.travelCost = trip.cost;
    state.near.decisions[month] = d;
    runNearTo(month);
    renderNear();
  }

  /** 下一个月。 */
  function nextMonth() {
    if (state.slider >= NEAR_MONTHS - 1) {
      go('reveal');
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

  function narrationNear(month, sp) {
    var d = state.near.decisions[month];
    if (d && d.plan) {
      var picked = Object.keys(d.plan).filter(function (k) { return d.plan[k] > 0; });
      if (picked.length) {
        return '你把这笔钱放进了' + picked.map(function (k) { return POCKET_NAMES[k]; }).join('、') +
          '。第 ' + (month + 1) + ' 个月，就这样过去了。';
      }
    }
    if (sp && sp.kind === 'gain') return sp.title + '：' + sp.text;
    if (sp) return sp.title + '。' + sp.text;
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
      go('reveal');
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
    state.grade = null; state.school = null; state.major = null; state.birthday = null;
    state.budget = 1800; state.amount = 15; state.habit = 5;
    state.pace = 'monthly'; state.timelineMode = 'near'; state.slider = 0;
    state.rate = 0.08; state.inflation = false;
    state.near = { money: 0, skill: 0, memory: 0, relation: 0, freedom: 0, cash: 0, events: [], decisions: {}, plans: {}, monthLog: [], done84: false };
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

      // 特殊日子：花 / 不花
      var special = node.closest('[data-special]');
      if (special) {
        decideSpecial(special.getAttribute('data-special'));
        return;
      }

      // 暑假旅行：选目的地
      var travel = node.closest('[data-travel]');
      if (travel) {
        chooseTravel(travel.getAttribute('data-travel'));
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

    $('#nextMonthBtn').addEventListener('click', function () {
      if (state.timelineMode === 'far') { go('reveal'); return; }

      if (state.pace === 'yearly') {
        var y = yearIndex(state.slider);
        var plan = state.near.plans[y];
        var sp = specialFor(state.slider);
        var d = state.near.decisions[state.slider];
        if (!plan) {
          $('#planCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (isMajorSpecial(sp) && !(d && d.specialChoice)) {
          $('#specialCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if ((state.slider % 12) === 11) {
          // 学年末
          if (state.slider >= NEAR_MONTHS - 1) { go('reveal'); return; }
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
  bindHabit();
  readInputs(true);
  bind();
  if (!deepLink()) go('cover');
})();
