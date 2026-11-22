/* 一块钱的两万种人生 —— 互动叙事 demo
 * 纯静态脚本，无依赖、无网络请求，断网也能完整演完。
 */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var SCREENS = ['cover', 'setup', 'fork', 'machine', 'reveal', 'report'];
  var TOTAL_YEARS = 30;
  var INFLATION = 0.03;

  var state = {
    amount: 15,
    age: 25,
    choice: null,
    years: 0,
    rate: 0.08,
    mode: 'daily',
    inflation: false
  };

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

  function compute() {
    var n = state.years;
    if (state.choice === 'learn') return null;

    if (state.choice === 'spend') {
      return {
        value: 0,
        principal: 0,
        counterfactual: fvYearly(state.amount * 365, state.rate, n)
      };
    }

    if (state.mode === 'single') {
      var once = fvSingle(state.amount, state.rate, n);
      return { value: once, principal: state.amount, counterfactual: 0 };
    }

    var perYear = state.amount * 365;
    return {
      value: fvYearly(perYear, state.rate, n),
      principal: perYear * n,
      counterfactual: 0
    };
  }

  function rateLabel() {
    return Math.round(state.rate * 100) + '%';
  }

  /* ---------- 文案 ---------- */

  function narrationFor(info) {
    var y = state.years;
    var yr = Math.max(1, Math.round(y));

    if (state.choice === 'spend') {
      if (y < 1) return '第一年。你手里有钱以外的东西：一杯还没化的冰。';
      if (y < 5) return '第 ' + yr + ' 年。账户里是 0。你偶尔会想起那杯奶茶，但已经记不清味道了。';
      if (y < 15) return '第 ' + yr + ' 年。你换过几份工作，搬过几次家。那 15 元，从来没出现在任何一张账单上。';
      if (y < 25) return '第 ' + yr + ' 年。你开始明白：有些钱花掉就是花掉了，它不会自己长回来。';
      return '第 ' + yr + ' 年。它没有变成 ' + fmtMoney(info.counterfactual) + '。它变成了一个下午。';
    }

    if (state.choice === 'learn') {
      if (y < 1) return '第一年。这本书不生利息，它甚至不算投资。';
      if (y < 3) return '第 ' + yr + ' 年。你开始能看懂行业里那些文章了。';
      if (y < 6) return '第 ' + yr + ' 年。你说话的方式变了。没人知道是因为一本书。';
      if (y < 10) return '第 ' + yr + ' 年。你换了一条路走。你以为那是运气。';
      if (y < 18) return '第 ' + yr + ' 年。你开始把懂的东西讲给别人听。';
      if (y < 26) return '第 ' + yr + ' 年。你带的第一个人，比当年的你还年轻。';
      return '第 ' + yr + ' 年。这条线算不出数字。它也不该被算出来。';
    }

    /* 定投 */
    if (y < 1) return '第一年。它几乎没动，你也几乎忘了它。';
    if (y < 3) return '第 ' + yr + ' 年。它长了一点。少到你会怀疑，这件事到底有没有用。';
    if (y < 6) return '第 ' + yr + ' 年。它长成了 ' + fmtMoney(info.value) + '。你还是没什么感觉。';
    if (y < 10) return '第 ' + yr + ' 年。它已经比你这两年攒下的钱还多。它开始不太听你的话了。';
    if (y < 18) return '第 ' + yr + ' 年。它每年自己长出来的钱，够你买一整年的奶茶。';
    if (y < 26) return '第 ' + yr + ' 年。你开始不敢动它。它长得比你想的快。';
    if (state.mode === 'single') {
      return '第 ' + yr + ' 年。它长成了 ' + fmtMoney(info.value) + '。复利很厉害，但 15 块的基数太小了 —— 真正的问题是「每天都算」。';
    }
    return '第 ' + yr + ' 年。它长成了 ' + fmtMoney(info.value) + '。你当年只是把 15 块，换了个地方放。';
  }

  function ghostFor(info) {
    if (!info) return '';
    var text = '';
    if (state.choice === 'spend') {
      text = '如果当初每天存下来：' + fmtMoney(info.counterfactual);
    } else if (state.mode === 'single') {
      text = '本金 ' + fmtMoney(info.principal) + ' · 时间替你赚了 ' + fmtMoney(info.value - info.principal);
    } else {
      text = '本金 ' + fmtMoney(info.principal) + ' · 时间替你赚了 ' + fmtMoney(info.value - info.principal);
    }
    if (state.inflation && state.choice !== 'learn') {
      text += ' · 扣掉通胀后 ' + fmtMoney(realValue(info.value, state.years));
    }
    return text;
  }

  function disclaimerText() {
    if (state.choice === 'learn') {
      return '这一屏故意不给数字：被读过的书没有年化收益率，把它的回报算成一个数，才是真的不诚实。';
    }
    if (state.choice === 'spend') {
      return '对照数字用同一套假设：每天 ' + state.amount + ' 元、年化 ' + rateLabel() + '、连续 ' + Math.round(state.years) + ' 年。8% 是长期股票指数的历史假设，不是承诺。';
    }
    return '按年化 ' + rateLabel() + ' 计算；「每天都算」按全年折算、年末计入。「8%」是长期股票指数的历史假设，不是承诺，也未计入风险与税费。';
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
    if (name === 'report') { renderReport(); }
  }

  /* 输入 */
  function readInputs(commit) {
    var amount = parseInt($('#amount').value, 10);
    var age = parseInt($('#age').value, 10);

    if (isFinite(amount)) {
      state.amount = Math.min(500, Math.max(1, amount));
      if (commit) $('#amount').value = state.amount;
    } else if (commit) {
      state.amount = 15;
      $('#amount').value = 15;
    }

    if (isFinite(age)) {
      state.age = Math.min(70, Math.max(12, age));
      if (commit) $('#age').value = state.age;
    } else if (commit) {
      state.age = 25;
      $('#age').value = 25;
    }

    $('#amountEcho').textContent = state.amount;
    var perYear = (state.amount * 365).toLocaleString('zh-CN');
    $('#setupHint').textContent = state.amount === 15
      ? '每天一杯，一年就是 ' + perYear + ' 元。'
      : '每天 ' + state.amount + ' 元，一年就是 ' + perYear + ' 元。';
  }

  /* 岔路 */
  function pickChoice(choice) {
    state.choice = choice;
    $$('.card').forEach(function (card) {
      card.classList.toggle('is-picked', card.getAttribute('data-choice') === choice);
    });
    setTimeout(function () { go('machine'); }, 220);
  }

  /* 时间机器 */
  var pendingYears = null;

  function prepareMachine() {
    state.years = pendingYears === null ? 0 : pendingYears;
    pendingYears = null;
    var slider = $('#timeSlider');
    slider.value = state.years;

    var scenes = { invest: '.scene-plant', spend: '.scene-cup', learn: '.scene-books' };
    $$('.scene').forEach(function (scene) { scene.classList.remove('is-on'); });
    var active = $(scenes[state.choice]);
    if (active) active.classList.add('is-on');

    $('#modeSeg').hidden = state.choice !== 'invest';
    $('#rateSeg').hidden = state.choice === 'learn';
    $('#inflationRow').hidden = state.choice === 'learn';
    $('#readoutLabel').textContent = '现在';
    sync();
  }

  function sync() {
    var info = compute();
    var years = state.years;
    var startYear = new Date().getFullYear();

    var slider = $('#timeSlider');
    slider.style.setProperty('--p', (years / TOTAL_YEARS * 100) + '%');

    var valueNum = $('#valueNum');
    var valueUnit = $('#valueUnit');
    var readout = $('.readout-value');

    if (state.choice === 'learn') {
      readout.classList.add('is-text');
      valueNum.textContent = '不可计算';
      valueUnit.textContent = '';
      $('#readoutLabel').textContent = years < 0.5 ? '现在' : '第 ' + Math.round(years) + ' 年 · ' + (startYear + Math.round(years)) + ' 年';
      $('#ghostLine').textContent = '这条线没有本金，也没有收益率';
    } else {
      readout.classList.remove('is-text');
      var parts = readoutParts(info.value);
      valueNum.textContent = parts.num;
      valueUnit.textContent = parts.unit;
      $('#readoutLabel').textContent = years < 0.5
        ? '现在 · ' + startYear + ' 年'
        : '第 ' + Math.round(years) + ' 年 · ' + (startYear + Math.round(years)) + ' 年';
      $('#ghostLine').textContent = ghostFor(info);
    }

    $('#narration').textContent = years < 0.15
      ? '拖动时间，看看它会变成什么。'
      : narrationFor(info);

    /* 生长动画 */
    var grow = Math.min(1, years / TOTAL_YEARS);
    var plant = $('#plantSvg');
    if (plant) plant.style.setProperty('--grow', grow.toFixed(3));
    $$('.leaf', plant).forEach(function (leaf) {
      leaf.classList.toggle('on', years >= parseFloat(leaf.getAttribute('data-year')));
    });
    $$('.book').forEach(function (book) {
      book.classList.toggle('on', years >= parseFloat(book.getAttribute('data-year')));
    });

    $('#disclaimer').textContent = disclaimerText();
  }

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
    var from = state.years >= TOTAL_YEARS - 0.05 ? 0 : state.years;
    var started = 0;
    var duration = 9500;
    setPlayLabel(true);
    var step = function (now) {
      if (!started) started = now;
      var k = Math.min(1, (now - started) / duration);
      var eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      state.years = from + (TOTAL_YEARS - from) * eased;
      slider.value = state.years;
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
    var COUNT = 20000;

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

  /** 沿着一条旋臂取点：这就是「你走的那一条」。 */
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
      /* 先压一条深色底，让「你的那一条」从星海里被挖出来 */
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

  /* ---------- 报告卡 ---------- */

  var NO_LINE_START = '，。、；：！？）】》」』”’…·%';

  function wrapText(ctx, text, maxWidth) {
    var lines = [];
    var line = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      var next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        if (NO_LINE_START.indexOf(ch) >= 0 && line.length > 1) {
          /* 标点不落行首：把上一行最后一个字一起带下来 */
          lines.push(line.slice(0, -1));
          line = line.charAt(line.length - 1) + ch;
        } else {
          lines.push(line);
          line = ch;
        }
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function reportRows(info) {
    var rows = [];
    rows.push(['今天你随手花掉的', fmtMoney(state.amount)]);
    rows.push(['你今年', state.age + ' 岁']);
    if (state.choice === 'invest') {
      rows.push(['你选的', '存起来，定投']);
      rows.push(['计算方式', state.mode === 'single' ? '只算这一杯' : '每天都算 · 年化 ' + rateLabel()]);
      rows.push(['这 ' + Math.round(state.years) + ' 年的本金', fmtMoney(info.principal)]);
      rows.push(['时间替你赚的', fmtMoney(info.value - info.principal)]);
      if (state.inflation) rows.push(['扣掉 3% 通胀', fmtMoney(realValue(info.value, state.years))]);
    } else if (state.choice === 'spend') {
      rows.push(['你选的', '喝掉这杯奶茶']);
      rows.push(['如果当初存下来', fmtMoney(info.counterfactual)]);
    } else {
      rows.push(['你选的', '买一本二手书']);
      rows.push(['计算方式', '不可计算']);
      rows.push(['它的年化收益率', '没有这一栏']);
      rows.push(['你换来的', '说不清的东西']);
    }
    return rows;
  }

  function cardHeadline(info) {
    if (state.choice === 'learn') return { big: '不可计算', unit: '' };
    if (state.choice === 'spend') return { big: '0', unit: '元' };
    var parts = readoutParts(info.value);
    return { big: parts.num, unit: parts.unit };
  }

  function cardQuote() {
    if (state.choice === 'spend') return '你不是输给了复利。\n你只是买了三十秒的凉。';
    if (state.choice === 'learn') return '有些选择不产生利息，\n它只产生你自己。';
    if (state.mode === 'single') return '15 块复利三十年，只有 151 块。\n真正被复利的，是「每天」。';
    return '你当年只是把 15 块换了个地方放。\n剩下的，时间替你做了。';
  }

  var reportCanvas = null;

  function renderReport() {
    var canvas = document.createElement('canvas');
    var W = 720;
    var H = 1080;
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var info = compute();
    var startYear = new Date().getFullYear();
    var endYear = startYear + Math.round(state.years);

    ctx.fillStyle = '#f8f2e6';
    ctx.fillRect(0, 0, W, H);

    /* 角落的两万颗点 */
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

    var head = cardHeadline(info);
    ctx.fillStyle = '#bf5a2c';
    var bigFont = head.big.length > 4 ? '600 64px "Songti SC", serif' : '600 104px "Songti SC", serif';
    ctx.font = bigFont;
    ctx.fillText(head.big, 60, 340);
    if (head.unit) {
      var bigWidth = ctx.measureText(head.big).width;
      ctx.fillStyle = '#6b5f54';
      ctx.font = '400 30px "PingFang SC", sans-serif';
      ctx.fillText(head.unit, 60 + bigWidth + 14, 340);
    }

    ctx.fillStyle = '#6b5f54';
    ctx.font = '400 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(endYear + ' 年 · 你 ' + (state.age + Math.round(state.years)) + ' 岁', 60, 396);

    /* 明细行 */
    var rows = reportRows(info);
    var y = 470;
    for (var r = 0; r < rows.length; r++) {
      var label = rows[r][0];
      var value = rows[r][1];
      ctx.fillStyle = '#6b5f54';
      ctx.font = '400 25px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(label, 60, y);

      ctx.fillStyle = '#241f1b';
      ctx.font = '600 26px "Songti SC", "STSong", serif';
      var vw = ctx.measureText(value).width;
      ctx.fillText(value, W - 60 - vw, y);

      ctx.strokeStyle = 'rgba(220, 203, 178, .8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(60, y + 21);
      ctx.lineTo(W - 60, y + 21);
      ctx.stroke();

      y += 58;
    }

    /* 一句结论 */
    var quote = cardQuote();
    ctx.fillStyle = '#4a4038';
    ctx.font = '400 27px "Songti SC", "STSong", serif';
    var lines = wrapText(ctx, quote, W - 140);
    var qy = Math.max(y + 34, 886);
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
    ctx.fillText('一块钱的两万种人生 · 21,900 次选择，你走了这一条', 60, H - 44);

    var img = $('#reportImg');
    img.src = canvas.toDataURL('image/png');
    img.dataset.ready = '1';

    $('#reportLine').textContent = state.choice === 'learn'
      ? '这一张卡上没有数字。有些东西本来就不该被打分。'
      : '这一张卡，是你刚才那三分钟留下的东西。';

    reportCanvas = canvas;
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

  function restart() {
    state.choice = null;
    state.years = 0;
    state.mode = 'daily';
    state.rate = 0.08;
    state.inflation = false;
    $('#modeSeg').hidden = false;
    $('#rateSeg').hidden = false;
    $('#inflationRow').hidden = false;
    $('#inflationToggle').checked = false;
    $$('.seg-item[data-mode]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-mode') === 'daily'); });
    $$('.seg-item[data-rate]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-rate') === '0.08'); });
    $$('.card').forEach(function (c) { c.classList.remove('is-picked'); });
    go('cover');
  }

  /* ---------- 直达某一屏（演示用） ----------
   * index.html#machine?choice=invest&y=22
   * 评审现场可以直接跳到任意一幕，也方便截图与回归检查。
   */
  function deepLink() {
    var hash = location.hash.replace(/^#/, '');
    if (SCREENS.indexOf(hash) <= 0) return false;
    if (hash === 'setup') { go(hash); return true; }

    var params = new URLSearchParams(location.search);
    var choice = params.get('choice');
    if (choice === 'spend' || choice === 'invest' || choice === 'learn') state.choice = choice;
    if (!state.choice) state.choice = 'invest';

    var y = parseFloat(params.get('y'));
    var years = isFinite(y) ? Math.min(TOTAL_YEARS, Math.max(0, y)) : (hash === 'machine' ? 0 : TOTAL_YEARS);
    if (hash === 'machine') pendingYears = years;
    else state.years = years;

    go(hash);
    return true;
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
    $('#age').addEventListener('input', function () { readInputs(false); });
    $('#amount').addEventListener('blur', function () { readInputs(true); });
    $('#age').addEventListener('blur', function () { readInputs(true); });

    $('#timeSlider').addEventListener('input', function () {
      if (playRaf) { cancelAnimationFrame(playRaf); playRaf = 0; setPlayLabel(false); }
      state.years = parseFloat(this.value) || 0;
      sync();
    });

    $('#playBtn').addEventListener('click', togglePlay);

    $('#modeSeg').addEventListener('click', function (event) {
      var button = event.target.closest('.seg-item');
      if (!button) return;
      state.mode = button.getAttribute('data-mode');
      $$('.seg-item', this).forEach(function (b) { b.classList.toggle('is-on', b === button); });
      sync();
    });

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

    $('#downloadBtn').addEventListener('click', downloadReport);
    $('#restartBtn').addEventListener('click', restart);

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if ($('.screen[data-screen="reveal"]').classList.contains('is-active')) {
          starCache = null;
          drawStars();
        }
      }, 220);
    });
  }

  readInputs(true);
  bind();
  if (!deepLink()) go('cover');
})();
