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

  var SCREENS = ['cover', 'identity', 'setup', 'fork', 'machine', 'reveal', 'ending', 'report'];
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
    choice: null,
    birthday: null,           // 生日月份 1-12
    timelineMode: 'near',     // 'near' | 'far'
    slider: 0,                // 近期按月(0-84)，长期按年(0-30)
    rate: 0.08,
    inflation: false,
    near: {                   // 近期账本（五口袋累计）
      money: 0, skill: 0, memory: 0, relation: 0, freedom: 0,
      cash: 0,               // 手上现金（生活费结余）
      done84: false,         // 是否已推进满 84 个月（结算完整标记）
      events: [],            // 已发生事件（含意外）摘要
      decisions: {},         // 月份索引 -> { plan, specialChoice }
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
    nju: { label: '南京大学', city: '南京', type: '双一流' },
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

  function pickChip(container, value) {
    $$('.chip', container).forEach(function (chip) {
      chip.classList.toggle('is-on', chip.getAttribute('data-') ? chip.dataset === undefined ? chip.getAttribute('data-' + chip.datasetKey) : false : false);
    });
  }

  /* ---------- 数字 ---------- */

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

  // 每月决策选项：玩家把一个月的闲钱分配到这里
  var DECISIONS = [
    { key: 'money', label: '存起来', icon: '💰', note: '放进钱袋，等复利', pocket: 'money' },
    { key: 'skill', label: '买书 / 报课', icon: '📚', note: '考级、考研资料、技能课', pocket: 'skill' },
    { key: 'memory', label: '攒旅行基金', icon: '🎒', note: '为一次出发攒钱', pocket: 'memory' },
    { key: 'relation', label: '请客 / 顾家', icon: '🍲', note: '室友聚会、给家里买点', pocket: 'relation' },
    { key: 'freedom', label: '留作应急', icon: '🛟', note: '应付突然的一天', pocket: 'freedom' }
  ];

  // 特殊日子：按月份触发的真实情境（大学生活）
  // kind: 'ask'   = 需要玩家额外决定（花 / 不花）
  //       'gain'  = 一笔额外收入，自动进账
  //       'info'  = 只是提示，不改变钱
  var SPECIAL_DAYS = [
    { month: 1, key: 'winter-home', kind: 'ask', tag: '寒假', title: '回家过年', text: '回家的车票 400 元。你还会被亲戚问“以后想做什么”。', cost: 400, pocket: 'relation' },
    { month: 2, key: 'birthday', kind: 'auto-birthday', tag: '生日', title: '你的生日', text: '生日那个月，你总会多花一点，也总会收到一点。' },
    { month: 2, key: 'lucky-money', kind: 'gain', tag: '春节', title: '压岁钱', text: '长辈给的压岁钱，一笔突然到手的钱。', amount: 2000 },
    { month: 3, key: 'cet', kind: 'ask', tag: '考试季', title: '四六级 / 计算机二级', text: '报名费 130 元。考不过，明年再来一次。', cost: 130, pocket: 'skill' },
    { month: 4, key: 'concert', kind: 'ask', tag: '春天', title: '奥体有场演唱会', text: '票 680 元。你会记很久，也可能只是站了三小时。', cost: 680, pocket: 'memory' },
    { month: 5, key: 'labour', kind: 'ask', tag: '五一', title: '五一假期', text: '室友都出门了。去一趟扬州，两天 500 元。', cost: 500, pocket: 'memory' },
    { month: 6, key: 'final', kind: 'info', tag: '期末', title: '期末周', text: '打印店排队，通宵，外卖涨到 25 一顿。这个月存不下什么。' },
    { month: 6, key: 'graduation', kind: 'ask', tag: '毕业季', title: '毕业旅行 / 送别饭', text: '大四的六月，很多人会花掉一大笔。1200 元。', cost: 1200, pocket: 'memory' },
    { month: 7, key: 'summer', kind: 'ask-travel', tag: '暑假', title: '暑假到了', text: '你攒了一个学期的旅行基金，现在可以决定去哪。' },
    { month: 8, key: 'intern', kind: 'gain', tag: '实习', title: '实习工资', text: '这个暑假你实习了，拿到一笔钱。', amount: 3000 },
    { month: 9, key: 'newterm', kind: 'ask', tag: '开学', title: '开学采购', text: '教材、被套、新的耳机。600 元。', cost: 600, pocket: 'skill' },
    { month: 10, key: 'autumn', kind: 'ask', tag: '秋天', title: '栖霞山 / 秋游', text: '南京的秋天只有几周。一趟 200 元。', cost: 200, pocket: 'memory' },
    { month: 11, key: 'double11', kind: 'ask', tag: '双十一', title: '双十一', text: '购物车里躺了很久的东西，今晚打折。800 元。', cost: 800, pocket: 'relation' },
    { month: 12, key: 'newyear', kind: 'ask', tag: '年末', title: '跨年 / 圣诞', text: '朋友约你跨年，人均 300 元。', cost: 300, pocket: 'memory' },
    { month: 12, key: 'kaoyan', kind: 'ask', tag: '规划', title: '考研班 / 技能课', text: '要不要报？800 元，可能改变你之后几年的方向。', cost: 800, pocket: 'skill' }
  ];

  // 暑假旅行目的地（南京出发，真实价格）
  var TRAVELS = [
    { key: 'yangzhou', name: '扬州', days: 2, cost: 500, desc: '高铁 1 小时，瘦西湖 + 早茶' },
    { key: 'chengdu', name: '成都', days: 4, cost: 1800, desc: '高铁往返 1080 + 青旅 3 晚 420 + 熊猫基地 27 + 火锅 300' },
    { key: 'xian', name: '西安', days: 4, cost: 1500, desc: '高铁往返 900 + 青旅 3 晚 300 + 兵马俑 + 吃' },
    { key: 'sanya', name: '三亚', days: 5, cost: 3200, desc: '机票往返 1600 + 青旅 4 晚 600 + 玩海 + 吃' },
    { key: 'home', name: '哪也不去', days: 0, cost: 0, desc: '钱留着，暑假在家' }
  ];

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
      n.cash += sp.amount;
      n.events.push({ t: sp.title, y: Math.ceil((monthIndex + 1) / 12), m: (monthIndex % 12) + 1, amt: sp.amount, note: sp.text, special: sp.key });
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
        n.events.push({ t: acc.name, y: Math.ceil((monthIndex + 1) / 12), m: 1, amt: -amt, note: acc.note, accident: true });
      }
    }
  }

  /** 取某个月的特殊日子（可能多个，取第一个作为主情境）。 */
  function specialFor(monthIndex) {
    var month = (monthIndex % 12) + 1;
    var list = SPECIAL_DAYS.filter(function (s) { return s.month === month; });
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
    var y = Math.ceil((monthIndex + 1) / 12);
    var m = (monthIndex % 12) + 1;
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
    var required = ['grade', 'school', 'major'];
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

  /* 岔路 */
  function pickChoice(choice) {
    state.choice = choice;
    $$('.card').forEach(function (card) {
      card.classList.toggle('is-picked', card.getAttribute('data-choice') === choice);
    });
    setTimeout(function () { go('machine'); }, 220);
  }

  /* ---------- 时间机器（双模式） ---------- */

  var pendingSlider = null;

  function prepareMachine() {
    if (pendingSlider !== null) { state.slider = pendingSlider; pendingSlider = null; }
    var slider = $('#timeSlider');

    if (state.timelineMode === 'near') {
      slider.min = 0; slider.max = NEAR_MONTHS; slider.step = 1;
      if (state.slider > NEAR_MONTHS) state.slider = 0;
      $('#tlMid').textContent = '3 年半';
      $('#tlEnd').textContent = '7 年';
      $('#nearStage').hidden = false;
      $('#farStage').hidden = true;
      $('#rollBtn').hidden = true;
    } else {
      slider.min = 0; slider.max = FAR_YEARS; slider.step = 1;
      // 长期模式依赖近期账本做种子：切过来时若账本未跑满，先补跑七年
      if (!state.near.done84) {
        runNearTo(NEAR_MONTHS);
        state.near.done84 = true;
      }
      // 把 slider 钳到 0..30（年）。若之前停留在近期月份（0..84），
      // 直接跳到长期的第一年，避免越界产生 NaN。
      if (state.slider > FAR_YEARS) state.slider = 0;
      $('#tlMid').textContent = '15 年';
      $('#tlEnd').textContent = '30 年';
      $('#nearStage').hidden = true;
      $('#farStage').hidden = false;
      $('#rollBtn').hidden = false;
    }
    slider.value = state.slider;

    $('#rateSeg').hidden = false;
    $('#inflationRow').hidden = state.choice === 'learn' && state.timelineMode === 'near';
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

    var year = Math.floor(month / 12) + 1;
    var m = (month % 12) + 1;
    var label = '第 ' + year + ' 年 · ' + m + ' 月';
    $('#monthBadge').textContent = label;
    $('#monthLeft').textContent = '还剩 ' + (NEAR_MONTHS - month - 1) + ' 次决定';
    $('#readoutLabel').textContent = label;

    var free = monthFreeMoney(month);
    var sp = specialFor(month);

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
      $('#specialTag').textContent = sp.tag;
      $('#specialText').textContent = sp.title + '：' + sp.text;
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

    // 决策按钮
    var grid = $('#decideGrid');
    var decided = state.near.decisions[month];
    if (free <= 0) {
      $('#decideTitle').textContent = '这个月没有闲钱可以分。';
      grid.innerHTML = '<p class="decide-empty">生活费刚好够用。很多人是这样过的。</p>';
    } else if (decided && decided.plan) {
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
    if (state.choice === 'learn') {
      readout.classList.add('is-text');
      $('#valueNum').textContent = '能力';
      $('#valueUnit').textContent = '不可测算';
    } else {
      readout.classList.remove('is-text');
      var parts = readoutParts(total);
      $('#valueNum').textContent = parts.num;
      $('#valueUnit').textContent = parts.unit;
    }
    $('#ghostLine').textContent = '五口袋 ' + fmtMoney(total) + ' · 手上现金 ' + fmtMoney(state.near.cash);

    renderPockets();
    $('#narration').textContent = narrationNear(month, sp);
    $('#timeSlider').style.setProperty('--p', (month / (NEAR_MONTHS - 1) * 100) + '%');
  }

  /** 顶部三行摘要（身份 / 学校 / 生日）。 */
  function syncHeader() {
    // 目前不需要额外元素，保留钩子便于后续加抬头信息
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
    var events = state.near.events.filter(function (e) { return e.y === Math.floor(month / 12) + 1 && e.m === (month % 12) + 1; });
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
    renderNear();
  }

  /** 重来这一个月。 */
  function resetMonth() {
    delete state.near.decisions[state.slider];
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
    if (state.choice === 'learn') {
      return '能力袋不产生复利，它只改变你以后赚钱的斜率。';
    }
    if (state.timelineMode === 'near') {
      return '近期账本按你选的「每月生活费」估算。意外按真实概率掷骰：丢手机约 6%/年、住院约 4%/年、诈骗约 5%/年、重修约 4%/年。';
    }
    return '长期按年化 ' + rateLabel() + ' 计算；「理想」假设你一直坚持，「实际」假设你中途松手（人性税）。8% 是长期股票指数的历史假设，不是承诺。';
  }

  /* 播放 */
  var playRaf = 0;

  function setPlayLabel(playing) {
    $('#playBtn').textContent = playing ? '⏸ 暂停' : '▶ 让它自己走';
  }

  function togglePlay() {
    var slider = $('#timeSlider');
    if (playRaf) {
      cancelAnimationFrame(playRaf);
      playRaf = 0;
      setPlayLabel(false);
      return;
    }
    var max = state.timelineMode === 'near' ? NEAR_MONTHS : FAR_YEARS;
    var from = state.slider >= max - 1 ? 0 : state.slider;
    var started = 0;
    var duration = state.timelineMode === 'near' ? 14000 : 8000;
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

    $('#reportLine').textContent = state.choice === 'learn'
      ? '这一张海报上没有数字。有些东西本来就不该被打分。'
      : '这一张海报，是你刚才那几分钟留下的东西。';

    reportCanvas = canvas;
  }

  function cardQuote() {
    if (state.choice === 'spend') return '你不是输给了复利。\n你只是买了三十秒的凉。';
    if (state.choice === 'learn') return '有些选择不产生利息，\n它只产生你自己。';
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
    state.grade = null; state.school = null; state.major = null;
    state.budget = 1800; state.amount = 15; state.habit = 5;
    state.choice = null; state.timelineMode = 'near'; state.slider = 0;
    state.rate = 0.08; state.inflation = false;
    state.near = { money: 0, skill: 0, memory: 0, relation: 0, freedom: 0, cash: 0, events: [], done84: false };
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
      var card = node.closest('.card');
      if (card) pickChoice(card.getAttribute('data-choice'));
    });

    $('#amount').addEventListener('input', function () { readInputs(false); });
    $('#amount').addEventListener('blur', function () { readInputs(true); });

    $('#nextMonthBtn').addEventListener('click', function () {
      // 该月还没决定且有钱可决定 → 先提醒，不硬跳
      if (state.timelineMode === 'near' && !monthDecided(state.slider) && monthFreeMoney(state.slider) > 0) {
        $('#decideTitle').textContent = '先决定这个月这笔钱怎么放，再往下走。';
        $('#decideGrid').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (state.timelineMode === 'near') nextMonth();
      else go('reveal');
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
    var choice = params.get('choice');
    if (choice === 'spend' || choice === 'invest' || choice === 'learn') state.choice = choice;
    var mode = params.get('mode');
    if (mode === 'near' || mode === 'far') state.timelineMode = mode;
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
