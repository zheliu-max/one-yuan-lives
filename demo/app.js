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
    timelineMode: 'near',     // 'near' | 'far'
    slider: 0,                // 近期按月(0-84)，长期按年(0-30)
    rate: 0.08,
    inflation: false,
    near: {                   // 近期账本（五口袋累计）
      money: 0, skill: 0, memory: 0, relation: 0, freedom: 0,
      cash: 0,               // 手上现金（生活费结余）
      events: []             // 已发生事件（含意外）摘要
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

  // 校历关键事件（一年里几次真实决策）——简化为一组月度事件
  var CALENDAR = [
    { month: 1, name: '开学·教材', cost: 300, pocket: 'skill', note: '教材 + 文具' },
    { month: 3, name: '四六级报名', cost: 130, pocket: 'skill', note: '考试费' },
    { month: 5, name: '奥体演唱会', cost: 680, pocket: 'memory', note: '一场演唱会' },
    { month: 7, name: '暑假·旅行', cost: 1200, pocket: 'memory', note: '短途旅行' },
    { month: 9, name: '双十一', cost: 600, pocket: 'relation', note: '给家人朋友买点东西' },
    { month: 11, name: '压岁钱到账', cost: -2000, pocket: 'money', note: '压岁钱' },
    { month: 12, name: '考研班/技能', cost: 800, pocket: 'skill', note: '自我投资' }
  ];

  // 意外事件（真实概率掷骰）—— 简化：每年一次机会
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

  // 近期推进一个月
  function advanceNearMonth(monthIndex) {
    var n = state.near;
    // 生活费流入
    var allowance = monthlyAllowance();
    n.cash += allowance;
    // 基础支出
    n.cash -= monthlyBase();
    // 习惯投入：默认每天省一笔（amount），投入"钱袋"（存钱）
    var daily = state.amount;
    var invest = daily * 30; // 每月约省 amount×30
    if (!habitActive(monthIndex)) invest = Math.round(invest * 0.5); // 人性税
    if (invest > 0) {
      n.money += invest;
      n.cash -= invest;
    }

    // 校历事件（每月可能触发一个）
    var cal = CALENDAR.filter(function (c) { return (monthIndex % 12) === c.month - 1; });
    cal.forEach(function (c) {
      var amt = c.cost;
      if (amt > 0) {
        // 从对应口袋扣（若不够，从现金补）
        if (n[c.pocket] >= amt) { n[c.pocket] -= amt; }
        else { n.cash -= amt; }
      } else {
        // 收入类（压岁钱）→ 现金
        n.cash += -amt;
      }
      n.events.push({ t: c.name, y: Math.ceil((monthIndex + 1) / 12), m: (monthIndex % 12) + 1, amt: amt, note: c.note });
    });

    // 意外：每年第一次掷骰
    if ((monthIndex % 12) === 0) {
      var rnd = Math.random();
      var acc = null;
      var accTotal = 0;
      ACCIDENTS.forEach(function (a) { accTotal += a.chance; });
      var roll = rnd * accTotal;
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

  // 推进到第 month 个月（0-84）
  function runNearTo(monthIndex) {
    var n = state.near;
    var start = n.events.length === 0 ? 0 : monthIndex; // 简化：从 0 重新算
    // 简单实现：从 0 重算到目标月（84 个月最多，性能无碍）
    n.cash = 0; n.money = 0; n.skill = 0; n.memory = 0; n.relation = 0; n.freedom = 0; n.events = [];
    for (var m = 0; m <= monthIndex; m++) advanceNearMonth(m);
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
    if (name === 'ending') { renderEnding(); }
    if (name === 'report') { renderReport(); }
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
      if (state.slider < NEAR_MONTHS) state.slider = NEAR_MONTHS + 1; // 跳转到长期
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
      var month = state.slider;
      runNearTo(month);
      var year = Math.floor(month / 12);
      var m = (month % 12) + 1;
      var total = nearPocketTotal();

      var valueNum = $('#valueNum');
      var valueUnit = $('#valueUnit');
      var readout = $('.readout-value');

      if (state.choice === 'learn') {
        readout.classList.add('is-text');
        valueNum.textContent = '能力';
        valueUnit.textContent = '不可计算';
        $('#readoutLabel').textContent = month === 0 ? '现在' : '第 ' + year + ' 年 · 第 ' + m + ' 月';
        $('#ghostLine').textContent = '能力袋里的东西，不算钱';
      } else {
        readout.classList.remove('is-text');
        var parts = readoutParts(total);
        valueNum.textContent = parts.num;
        valueUnit.textContent = parts.unit;
        $('#readoutLabel').textContent = month === 0 ? '现在 · 七年的第一天' : '第 ' + year + ' 年 · 第 ' + m + ' 月';
        $('#ghostLine').textContent = '五口袋合计：' + fmtMoney(total) +
          ' · 手上现金 ' + fmtMoney(state.near.cash);
      }

      // 五口袋条
      var segs = { money: $('#pocketMoney'), skill: $('#pocketSkill'), memory: $('#pocketMemory'), relation: $('#pocketRelation'), freedom: $('#pocketFreedom') };
      var maxPocket = Math.max(nearPocketTotal(), 1);
      POCKETS.forEach(function (k) {
        var seg = segs[k];
        seg.setAttribute('data-name', POCKET_NAMES[k]);
        seg.style.width = (state.near[k] / maxPocket * 100) + '%';
      });

      // 口袋列表
      var list = $('#pocketList');
      list.innerHTML = '';
      POCKETS.forEach(function (k) {
        var row = document.createElement('div');
        row.className = 'pocket-row';
        var note = '';
        if (k === 'money') note = '存下来的钱';
        if (k === 'skill') note = '书/课/证/考研';
        if (k === 'memory') note = '旅行/演唱会/经历';
        if (k === 'relation') note = '请客/家人/朋友';
        if (k === 'freedom') note = '应急备用金';
        row.innerHTML = '<span><span class="p-dot" style="background:' + POCKET_COLORS[k] + '"></span><span class="p-name">' + POCKET_NAMES[k] + '</span> <span class="p-note">' + note + '</span></span>' +
          '<span class="p-value">' + fmtMoney(state.near[k]) + '</span>';
        list.appendChild(row);
      });

      $('#narration').textContent = narrationNear(month);

      // 近期读数随拖动更新标签
      var slider = $('#timeSlider');
      slider.style.setProperty('--p', (month / NEAR_MONTHS * 100) + '%');

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

  function narrationNear(month) {
    if (month === 0) return '从今天开始。每个月，钱会自己流进五个口袋。';
    var year = Math.floor(month / 12) + 1;
    var m = (month % 12) + 1;
    if (m === 1) return '第 ' + year + ' 年开始了。';
    if (m === 6) return '第 ' + year + ' 年 · 年中。钱在五个口袋之间流动。';
    if (m === 12) return '第 ' + year + ' 年 · 年末。这一年攒下了 ' + fmtMoney(nearPocketTotal()) + '。';
    return '第 ' + year + ' 年 · 第 ' + m + ' 月。日子在过，账本在记。';
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
    state.near = { money: 0, skill: 0, memory: 0, relation: 0, freedom: 0, cash: 0, events: [] };
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
    pendingSlider = params.get('y') !== null ? parseFloat(params.get('y')) || 0 : null;
    go(hash);
    return true;
  }

  bindIdentity();
  bindHabit();
  readInputs(true);
  bind();
  if (!deepLink()) go('cover');
})();
