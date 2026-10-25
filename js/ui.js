/* 我的刀盾 · 修正版 — DOM 渲染与界面组件 */
(function (global) {
  'use strict';
  const C = global.DD_CONFIG;
  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* private mode */ } }
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const typeMeta = C.TYPE_META;

  const UI = {
    lastHp: { player: null, ai: null },
    modal: null,
    soundEnabled: safeGet('dd_sound') !== '0',
    audioCtx: null,
    lastLogCount: 0,
  };

  /* ================= 音效 ================= */
  function ensureAudio() {
    if (!UI.soundEnabled) return null;
    if (!UI.audioCtx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { UI.audioCtx = new AC(); } catch (e) { return null; }
    }
    if (UI.audioCtx.state === 'suspended') UI.audioCtx.resume();
    return UI.audioCtx;
  }
  function tone(freq, dur, type, gain, delay, slideTo) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  const Sound = {
    play(name) {
      if (!UI.soundEnabled) return;
      switch (name) {
        case 'click': tone(520, 0.035, 'triangle', 0.035); break;
        case 'select': tone(640, 0.06, 'triangle', 0.04); tone(880, 0.08, 'triangle', 0.025, 0.05); break;
        case 'deselect': tone(430, 0.04, 'triangle', 0.025); break;
        case 'draw': tone(460, 0.08, 'sine', 0.035); tone(680, 0.12, 'sine', 0.03, 0.06); break;
        case 'armor': tone(260, 0.14, 'sine', 0.05); tone(390, 0.18, 'sine', 0.03, 0.05); break;
        case 'hit': tone(120, 0.12, 'sawtooth', 0.05, 0, 50); tone(70, 0.16, 'square', 0.035); break;
        case 'heal': tone(540, 0.11, 'sine', 0.04); tone(810, 0.14, 'sine', 0.03, 0.07); break;
        case 'ult': [440, 554, 659, 880].forEach((f, i) => tone(f, 0.24, 'triangle', 0.04, i * 0.06)); break;
        case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 'triangle', 0.045, i * 0.12)); break;
        case 'lose': [330, 294, 247, 196].forEach((f, i) => tone(f, 0.45, 'sine', 0.04, i * 0.15)); break;
        default: break;
      }
    },
    setEnabled(on) {
      UI.soundEnabled = on;
      safeSet('dd_sound', on ? '1' : '0');
      if (on) { ensureAudio(); Sound.play('click'); }
    },
  };

  /* ================= 首页 ================= */
  UI.renderHome = function (selectedId) {
    const grid = $('#class-grid');
    grid.innerHTML = C.CLASS_LIST.map((cls) => `
      <button type="button" class="class-card ${cls.id === selectedId ? 'selected' : ''}" data-class-id="${cls.id}" aria-label="${esc(cls.name)}">
        <img src="${cls.img.replace('/characters/', '/portraits/')}" alt="${esc(cls.name)}" loading="lazy" />
        <span class="cc-hp">${cls.hp} HP</span>
        <span class="cc-tag">${esc(cls.tags[0] || '')}</span>
        <span class="cc-name">${esc(cls.name)}</span>
      </button>`).join('');
    $('#class-count').textContent = C.CLASS_LIST.length;
    UI.updateHomeSelection(selectedId);
  };

  UI.updateHomeSelection = function (selectedId) {
    $$('.class-card').forEach((el) => el.classList.toggle('selected', el.dataset.classId === selectedId));
    const cls = C.CLASSES[selectedId];
    const wrap = $('#selected-preview');
    if (!cls) {
      wrap.innerHTML = '<div class="sp-placeholder">选择一个职业开始</div>';
      return;
    }
    wrap.innerHTML = `
      <div class="sp-art"><img src="${cls.img.replace('/characters/', '/portraits/')}" alt="${esc(cls.name)}" /></div>
      <div class="sp-body">
        <div class="sp-top">
          <span class="sp-name">${esc(cls.name)}</span>
          <span class="sp-tag">${cls.hp} HP</span>
          ${cls.tags.map((t) => `<span class="sp-tag">${esc(t)}</span>`).join('')}
          <button class="sp-detail" type="button" id="btn-class-detail">详情 →</button>
        </div>
        <div class="sp-passive">【${esc(cls.passiveName)}】${esc(cls.passiveText)}</div>
        <div class="sp-ult">必杀 · ${esc(cls.ultimateName)}（${esc(cls.ultimateCost)}）</div>
      </div>`;
    const btn = $('#btn-class-detail');
    if (btn) btn.addEventListener('click', () => UI.showClass(selectedId));
  };

  /* ================= 弹窗基础设施 ================= */
  UI.showModal = function (opts) {
    UI.closeModal(true);
    const root = $('#modal-root');
    const footer = (opts.footer || []).map((b, i) => `
      <button type="button" class="modal-btn ${b.variant || ''}" data-mbtn="${i}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`).join('');
    root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop></div>
      <div class="modal ${opts.wide ? 'wide' : ''} ${opts.narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>${opts.title || ''}</h2>
            ${opts.subtitle ? `<div class="mh-sub">${opts.subtitle}</div>` : ''}
          </div>
          ${opts.dismissable === false ? '' : '<button type="button" class="modal-close" data-close-modal aria-label="关闭">✕</button>'}
        </div>
        <div class="modal-body">${opts.body || ''}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    root.classList.add('active');
    UI.modal = { root, opts };
    const close = () => UI.closeModal();
    $$('[data-close-modal]', root).forEach((b) => b.addEventListener('click', close));
    const backdrop = $('[data-close-backdrop]', root);
    if (backdrop && opts.dismissable !== false) backdrop.addEventListener('click', close);
    (opts.footer || []).forEach((b, i) => {
      const el = $(`[data-mbtn="${i}"]`, root);
      if (el && b.onClick) el.addEventListener('click', () => b.onClick(UI));
    });
    if (opts.onMount) opts.onMount(root, UI);
    return root;
  };

  UI.closeModal = function (silent) {
    const root = $('#modal-root');
    if (!root) return;
    root.classList.remove('active');
    root.innerHTML = '';
    UI.modal = null;
  };

  UI.refreshModalFooter = function (footer) {
    if (!UI.modal) return;
    const root = UI.modal.root;
    const foot = $('.modal-foot', root);
    if (!foot) return;
    foot.innerHTML = footer.map((b, i) => `<button type="button" class="modal-btn ${b.variant || ''}" data-mbtn="${i}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`).join('');
    footer.forEach((b, i) => {
      const el = $(`[data-mbtn="${i}"]`, root);
      if (el && b.onClick) el.addEventListener('click', () => b.onClick(UI));
    });
  };

  UI.clearToasts = function () {
    const root = $('#toast-root');
    if (root) root.innerHTML = '';
  };

  UI.toast = function (text, type) {
    const root = $('#toast-root');
    while (root.children.length >= 2) root.removeChild(root.firstChild);
    const node = document.createElement('div');
    node.className = 'toast ' + (type || '');
    node.textContent = text;
    root.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  };

  UI.setSoundUI = function () {
    const icon = UI.soundEnabled ? '🔊' : '🔇';
    ['#btn-sound', '#btn-sound-game'].forEach((sel) => {
      const el = $(sel);
      if (el) {
        if (sel === '#btn-sound') el.innerHTML = `${icon} <span>音效</span>`;
        else el.textContent = icon;
      }
    });
  };

  /* ================= 规则 / 职业 / 日志 ================= */
  UI.showRules = function () {
    const tabs = C.RULES.map((r, i) => `<button type="button" class="rules-tab ${i === 0 ? 'active' : ''}" data-rule-tab="${i}">${esc(r.title)}</button>`).join('');
    const blocks = C.RULES.map((r, i) => `
      <div class="rule-block" data-rule-block="${i}" ${i === 0 ? '' : 'style="display:none"'}>
        <ul>${r.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>`).join('');
    const cards = C.CARD_LIST.map((card) => `
      <div class="rule-card" style="border-left:2px solid ${typeMeta[card.type].color}">
        <b>${esc(card.name)} <span>${typeMeta[card.type].label} ×${card.copies}</span></b>
        <p>${esc(card.desc)}</p>
      </div>`).join('');
    UI.showModal({
      title: '完整规则 · 修正版',
      subtitle: '回合制对战 / 破甲与叠甲 / 22 职业必杀',
      body: `
        <div class="rules-tabs">${tabs}<button type="button" class="rules-tab" data-rule-tab="cards">卡牌一览</button></div>
        ${blocks}
        <div class="rule-block" data-rule-block="cards" style="display:none">
          <div class="card-rules-grid">${cards}</div>
        </div>
        <div class="rule-note">补充说明：原规则未列出各职业必杀的具体数值，本作按职业定位补全；开局 3 张起手与“轮流行动、各自结算”的流程用于保证对局流畅。所有详细数值以游戏内实际结算为准。</div>`,
      footer: [{ label: '知道了', variant: 'primary', onClick: () => UI.closeModal() }],
    });
    $$('[data-rule-tab]', UI.modal.root).forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('[data-rule-tab]', UI.modal.root).forEach((t) => t.classList.toggle('active', t === tab));
        $$('[data-rule-block]', UI.modal.root).forEach((b) => { b.style.display = b.dataset.ruleBlock === tab.dataset.ruleTab ? '' : 'none'; });
      });
    });
  };

  UI.showClass = function (classId) {
    const cls = C.CLASSES[classId];
    if (!cls) return;
    const hasSecond = !!cls.passiveName2;
    UI.showModal({
      title: cls.name,
      subtitle: '职业详情 · 整局不可更换',
      body: `
        <div class="class-modal-top">
          <div class="class-modal-art"><img src="${portrait(cls)}" alt="${esc(cls.name)}" /></div>
          <div class="class-modal-meta">
            <h3>${esc(cls.name)}</h3>
            <div class="class-modal-tags">
              <span class="sp-tag">${cls.hp} 点生命</span>
              ${cls.tags.map((t) => `<span class="sp-tag">${esc(t)}</span>`).join('')}
            </div>
            <div class="skill-block">
              <h4>【${esc(cls.passiveName)}】<span>常驻被动</span></h4>
              <p>${esc(cls.passiveText)}</p>
            </div>
            ${hasSecond ? `<div class="skill-block"><h4>【${esc(cls.passiveName2)}】<span>常驻被动</span></h4><p>${esc(cls.passiveText2)}</p></div>` : ''}
            <div class="skill-block ultimate">
              <h4>【${esc(cls.ultimateName)}】<span>限定必杀 · 每局一次</span></h4>
              <p>${esc(cls.ultimateText)}</p>
              <span class="cost-pill">代价：${esc(cls.ultimateCost)}</span>
            </div>
          </div>
        </div>`,
      footer: [{ label: '关闭', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  };

  function logLine(item, showRound) {
    return `<div class="feed-line ${item.kind || 'info'}">${showRound ? `<span class="fl-round">R${item.round}</span>` : ''}<span class="fl-dot"></span><span>${esc(item.text)}</span></div>`;
  }
  UI.showLog = function (state) {
    const body = state.log.length
      ? `<div class="log-full">${state.log.map((l) => logLine(l, true)).join('')}</div>`
      : '<div class="rule-note">还没有战斗记录。</div>';
    UI.showModal({
      title: '战斗日志',
      subtitle: '第 ' + state.round + ' 回合',
      wide: true,
      body,
      footer: [{ label: '关闭', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  };

  /* ================= 开局设置 ================= */
  UI.showSetup = function (state, onSubmit) {
    let chosenKind = state.setupNeeded[0];
    let chosenValue = null;
    const cls = state.player.char;
    let body = '';
    if (chosenKind === 'poison') {
      body = `
        <p class="setup-lead">你是女巫。对一种牌投毒：对手每次摸到该牌时受到 <b>1 点真实伤害</b>。整局只能选择一次。</p>
        <div class="setup-cards">
          ${C.CARD_LIST.map((card) => `
            <button type="button" class="setup-card" data-poison="${card.id}">
              <img src="${card.img}" alt="${esc(card.name)}" loading="lazy" />
              <b>${esc(card.name)}</b>
            </button>`).join('')}
        </div>`;
    } else if (chosenKind === 'wolf') {
      body = `
        <p class="setup-lead">你是狼人。开局二选一，整局生效：</p>
        <button type="button" class="setup-option" data-wolf="A">
          <h4>① 血月 · 狂暴</h4>
          <p>血量小于等于 8 时，造成的所有伤害 +1。</p>
        </button>
        <button type="button" class="setup-option" data-wolf="B">
          <h4>② 月嚎 · 赌命</h4>
          <p>每次摸牌前可判定：失去 5 点生命；若摸到两张相同的牌，展示并立即对对方造成 15 点真实伤害，然后进入「狼化」：出牌上限 +1，所有伤害 +2，持续 2 回合。</p>
        </button>`;
    }
    UI.showModal({
      title: '战前准备',
      subtitle: cls.name + ' · ' + (chosenKind === 'poison' ? '选择毒咒' : '选择月嚎'),
      body,
      dismissable: false,
      footer: [{ label: '开始对局', variant: 'primary', id: 'setup-confirm', disabled: true, onClick: () => {
        if (!chosenValue) return;
        onClickSetup(chosenKind, chosenValue);
      } }],
      onMount(root) {
        const confirmBtn = $('[data-mbtn="0"]', root);
        if (chosenKind === 'poison') {
          $$('[data-poison]', root).forEach((btn) => btn.addEventListener('click', () => {
            $$('[data-poison]', root).forEach((b) => b.classList.toggle('selected', b === btn));
            chosenValue = btn.dataset.poison;
            if (confirmBtn) confirmBtn.disabled = false;
            Sound.play('click');
          }));
        } else {
          $$('[data-wolf]', root).forEach((btn) => btn.addEventListener('click', () => {
            $$('[data-wolf]', root).forEach((b) => b.classList.toggle('selected', b === btn));
            chosenValue = btn.dataset.wolf;
            if (confirmBtn) confirmBtn.disabled = false;
            Sound.play('click');
          }));
        }
        function onClickSetup(kind, value) { onSubmit(kind, value); }
      },
    });
    function onClickSetup(kind, value) { onSubmit(kind, value); }
  };

  /* ================= 对局渲染 ================= */
  function portrait(cls) { return cls.img.replace('/characters/', '/portraits/'); }

  function statusChips(state, side) {
    const chips = [];
    if (E_isWolf(state, side)) chips.push(['🐺 狼化', 'red']);
    if (side.status.armorLockTurn > 0 && side.status.armorLockTurn === side.turnsTaken) chips.push(['锁甲', 'red']);
    if (side.status.breakAsNormalTurn > 0 && side.status.breakAsNormalTurn === side.turnsTaken) chips.push(['破甲→普伤', 'blue']);
    if (side.status.healLockUntilTurn && side.turnsTaken < side.status.healLockUntilTurn) chips.push(['禁疗', 'red']);
    if (side.status.frozenTurn === side.turnsTaken) chips.push(['冻结', 'blue']);
    if (side.extraArmor > 0) chips.push(['额外护盾 ' + side.extraArmor, 'blue']);
    if (side.long.sameSorrow) chips.push(['同殇', 'blue']);
    if (side.long.allSeeing) chips.push(['全知', 'green']);
    if (side.status.pendingDrawPenalty > 0) chips.push(['下回合摸牌-' + side.status.pendingDrawPenalty, '']);
    if (side.status.drawPenalty > 0) chips.push(['本回合摸牌-' + side.status.drawPenalty, '']);
    if (side.deck.length === 0) chips.push(['枯牌', 'red']);
    if (side.classId === 'sanyueqi' && side.long.cuteWindowTurn === side.turnsTaken) chips.push(['可爱就绪', 'green']);
    if (side.classId === 'langren' && side.long.wolfMode === 'A' && side.hp <= 8) chips.push(['血月+1', 'red']);
    if (side.classId === 'langren' && side.long.wolfMode) chips.push([side.long.wolfMode === 'A' ? '血月模式' : '月嚎·B', '']);
    if (side.classId === 'nvwu' && side.long.poisonType && side.id === state.player.id) chips.push(['毒咒:' + (C.CARDS[side.long.poisonType] ? C.CARDS[side.long.poisonType].name : ''), 'green']);
    if (side.classId === 'yuyanjia' && side.long.destinyUsed) chips.push(['命定已用', '']);
    return chips.map(([t, k]) => `<span class="status-chip ${k}">${esc(t)}</span>`).join('');
  }
  function E_isWolf(state, side) { return (side.status.wolfFormUntilTurn || 0) > side.turnsTaken; }

  function setText(sel, value) { const el = $(sel); if (el) el.textContent = value; }
  function setWidth(sel, pct) { const el = $(sel); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; }

  UI.renderGame = function (state, opts) {
    opts = opts || {};
    const p = state.player;
    const a = state.ai;
    const myTurn = state.active === 'player';
    const phaseLabel = { prepare: '准备阶段', draw: '摸牌阶段', play: '出牌阶段', result: '结算阶段', gameover: '对局结束', setup: '战前准备' }[state.phase] || state.phase;
    const activeLabel = myTurn ? '你的回合' : '对手回合';
    setText('#hud-round', state.round);
    setText('#stage-round', String(state.round).padStart(2, '0'));
    setText('#clash-round', activeLabel + ' · 第 ' + state.round + ' 回合');
    setText('#hud-phase', activeLabel);
    const kicker = $('#phase-kicker');
    if (kicker) kicker.textContent = phaseLabel + ' · ' + activeLabel;
    const hint = $('#phase-hint');
    const hints = {
      prepare: myTurn ? '使用准备能力，然后进入摸牌阶段' : '对手正在准备…',
      draw: '正在摸牌…',
      play: myTurn ? '选择至多 ' + global.DD_ENGINE.getPlayLimit(state, 'player') + ' 张牌，然后结束出牌' : '对手正在出牌…',
      result: '查看本回合结算结果',
      gameover: '对局结束',
    };
    if (hint) hint.textContent = hints[state.phase] || '';
    const aiFighter = $('#fighter-ai');
    const playerFighter = $('#fighter-player');
    if (aiFighter) aiFighter.classList.toggle('active', state.active === 'ai');
    if (playerFighter) playerFighter.classList.toggle('active', state.active === 'player');

    // 对手
    setText('#ai-name', a.name);
    setText('#player-name', p.name);
    setText('#ai-hp', a.hp);
    setText('#player-hp', p.hp);
    setText('#ai-max-hp', '/' + a.maxHp);
    setText('#player-max-hp', '/' + p.maxHp);
    setWidth('#ai-hp-fill', (a.hp / a.maxHp) * 100);
    setWidth('#player-hp-fill', (p.hp / p.maxHp) * 100);
    const ghostA = $('#ai-hp-ghost'); const ghostP = $('#player-hp-ghost');
    if (ghostA) ghostA.style.width = (a.hp / a.maxHp) * 100 + '%';
    if (ghostP) ghostP.style.width = (p.hp / p.maxHp) * 100 + '%';
    setText('#ai-armor', global.DD_ENGINE.totalArmor(a));
    setText('#player-armor', global.DD_ENGINE.totalArmor(p));
    setText('#ai-deck', a.deck.length);
    setText('#player-deck', p.deck.length);
    setText('#ai-discard', a.discard.length);
    setText('#player-discard', p.discard.length);
    setText('#ai-hand-count', a.hand.length);
    setText('#player-hand-count', p.hand.length);
    setText('#hand-limit', myTurn
      ? (state.phase === 'play' ? `${p.selection.length} / ${global.DD_ENGINE.getPlayLimit(state, 'player')}` : `${p.hand.length} 张手牌`)
      : '等待对手行动');
    const aiArt = $('#ai-art');
    if (aiArt) aiArt.innerHTML = `<img src="${portrait(a.char)}" alt="${esc(a.name)}"><span class="art-name">${esc(a.name)}</span><span class="art-class">${esc(a.char.tags[0] || '')}</span>`;
    const pArt = $('#player-art');
    if (pArt) pArt.innerHTML = `<img src="${portrait(p.char)}" alt="${esc(p.name)}"><span class="art-name">${esc(p.name)}</span><span class="art-class">${esc(p.char.tags[0] || '')}</span>`;
    const aiDuel = $('#duel-ai-avatar'); const pDuel = $('#duel-player-avatar');
    if (aiDuel) aiDuel.innerHTML = `<img src="${portrait(a.char)}" alt="${esc(a.name)}" />`;
    if (pDuel) pDuel.innerHTML = `<img src="${portrait(p.char)}" alt="${esc(p.name)}" />`;
    setText('#duel-ai-armor', global.DD_ENGINE.totalArmor(a));
    setText('#duel-player-armor', global.DD_ENGINE.totalArmor(p));
    $('#ai-status').innerHTML = statusChips(state, a);
    $('#player-status').innerHTML = statusChips(state, p);
    const skillHtml = (side) => `
      <div class="fs-passive"><b>【${esc(side.char.passiveName)}】</b><span>${esc(side.char.passiveText)}</span></div>
      <div class="fs-ult">必杀 · <b>${esc(side.char.ultimateName)}</b> <span>${side.long.ultimateUsed ? '已使用' : '未使用'}</span></div>`;
    $('#ai-skill').innerHTML = skillHtml(a);
    $('#player-skill').innerHTML = skillHtml(p);
    const backCount = Math.min(a.hand.length, 9);
    $('#ai-hand-back').innerHTML = Array.from({ length: backCount }, () => '<span class="foe-card-back"></span>').join('')
      + (a.hand.length > 9 ? `<span class="more">+${a.hand.length - 9}</span>` : '');
    // 点击角色查看详情
    ['#fighter-ai', '#fighter-player', '#duel-ai-avatar', '#duel-player-avatar'].forEach((sel) => {
      const el = $(sel);
      if (el) {
        el.onclick = () => UI.showClass(sel.indexOf('ai') >= 0 ? a.classId : p.classId);
        el.style.cursor = 'pointer';
      }
    });

    // 情报
    const intel = $('#intel-strip');
    let intelHtml = '';
    if (state.seerDraw && state.seerDraw.viewer === p.id) {
      const names = state.seerDraw.cards.map((c) => c.name).join('、');
      intelHtml += `<span>🔮 <b>前瞻</b></span><span>对手摸到：<b>${esc(names)}</b></span>`;
    }
    if (state.seerAll && state.seerAll[p.id]) {
      const names = state.seerAll[p.id].map((c) => c.name).join('、');
      intelHtml += `<span>👁 <b>全知</b></span><span>对手手牌：<b>${esc(names || '无')}</b></span>`;
    }
    if (p.classId === 'yuyanjia' && p.long.destinyPendingCardId) {
      intelHtml += `<span>📌 命定：<b>${esc(C.CARDS[p.long.destinyPendingCardId] ? C.CARDS[p.long.destinyPendingCardId].name : '')}</b></span>`;
    }
    if (intel) intel.innerHTML = intelHtml;

    // 操作按钮
    const turnActions = $('#turn-actions');
    let taHtml = '';
    if (myTurn && state.phase === 'prepare') {
      taHtml = `<button type="button" class="turn-btn primary" data-action="draw">进入摸牌阶段 →</button>`;
    } else if (myTurn && state.phase === 'play') {
      taHtml = `<button type="button" class="turn-btn primary" data-action="commit">结束出牌</button>`;
    } else if (!myTurn && (state.phase === 'prepare' || state.phase === 'play')) {
      taHtml = `<span class="turn-wait">⏳ 对手行动中…</span>`;
    }
    if (turnActions) turnActions.innerHTML = taHtml;

    renderHand(state, opts);
    renderHandTips(state);
    renderAbilities(state);
    renderFeed(state, opts);
    updateCommandBar(state);
  };

  function renderHand(state, opts) {
    const p = state.player;
    const scroll = $('#hand-scroll');
    const prevScroll = opts.preserveScroll ? scroll.scrollLeft : 0;
    const hand = $('#hand');
    if (!p.hand.length) {
      hand.innerHTML = '<div class="hand-empty">手牌空空如也</div>';
    } else {
      hand.innerHTML = p.hand.map((card) => {
        const selected = p.selection.indexOf(card.uid) >= 0;
        const info = global.DD_ENGINE.playableInfo(state, p, card);
        const locked = state.phase !== 'play' || state.active !== p.id;
        const disabled = !selected && !locked && !info.ok;
        const meta = typeMeta[card.type];
        const reason = info.ok ? '' : info.reason;
        const valueLabel = card.type === 'rest' && card.id === 'ningshen' ? '2' : (card.type === 'armor' || card.type === 'rest' ? '+' + card.value : card.value);
        return `<button type="button" class="card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}" data-uid="${esc(card.uid)}" aria-pressed="${selected}" ${locked ? 'data-locked="1"' : ''}>
          <span class="card-inner"><img src="${card.img}" alt="${esc(card.name)}" loading="lazy" /></span>
          <span class="card-badge ${card.type}">${esc(meta.label)}</span>
          <span class="card-value ${card.type}">${valueLabel}</span>
          <span class="card-tooltip"><b>${esc(card.name)}</b><span class="tt-type">${esc(meta.label)}${reason ? ' · ' + esc(reason) : ''}</span>${esc(card.desc)}</span>
        </button>`;
      }).join('');
    }
    if (scroll) scroll.scrollLeft = prevScroll;
    const selected = global.DD_ENGINE.getSelectedCards(p);
    const slot = $('#selected-slot');
    if (slot) slot.innerHTML = selected.map((c) => `<span class="sel-chip ${c.type === 'rest' ? 'rest' : ''}">${esc(c.name)}</span>`).join('');
  }


  function renderHandTips(state) {
    const tips = $('#hand-tips');
    if (!tips) return;
    const p = state.player;
    const foe = state.ai;
    const selected = global.DD_ENGINE.getSelectedCards(p);
    if (selected.length) {
      const card = selected[selected.length - 1];
      const mode = p.choices[card.uid];
      let modeText = '';
      if (mode === 'curse') modeText = ' · 结算方式：毒奶（对对手造成真伤并封锁回血）';
      if (mode === 'steal') modeText = ' · 结算方式：掠影（摸对手 2 张手牌）';
      tips.innerHTML = `
        <div class="ht-head"><span>已选 ${selected.length} / ${global.DD_ENGINE.getPlayLimit(state, 'player')}</span><b>${esc(card.name)}</b><em>${esc(typeMeta[card.type].label)}${modeText}</em></div>
        <p>${esc(card.desc)}</p>`;
    } else {
      let line = '';
      if (state.active !== p.id) {
        line = '对手回合：等待对手摸牌、出牌和结算。';
      } else if (p.status.frozenTurn === p.turnsTaken) {
        line = '你被【冰刻箭雨之时】冻结，本回合无法打出任何手牌，只能使用职业能力或不出牌结束回合。';
      } else if (state.phase === 'prepare') {
        line = '准备阶段：可先使用职业能力。「进入摸牌阶段」后摸 2 张，再出牌。';
      } else if (state.phase === 'play') {
        const armor = global.DD_ENGINE.totalArmor(foe);
        line = armor > 0
          ? `对手有 ${armor} 点护盾：普通伤害可以打出但会被完全抵消；建议使用破甲卡。`
          : '对手无护盾：可用普通伤害卡；破甲卡不可打出。';
      } else if (state.phase === 'gameover') {
        line = '对局结束。';
      } else {
        line = '选择一个行动继续。';
      }
      tips.innerHTML = `
        <div class="ht-head"><span>出牌提示</span><b>${esc(p.name)}</b><em>${state.phase === 'play' ? '最多 ' + global.DD_ENGINE.getPlayLimit(state, 'player') + ' 张' : '准备阶段'}</em></div>
        <p>${esc(line)}</p>
        <div class="ht-legend"><i class="legend break">破甲</i><i class="legend armor">叠甲</i><i class="legend normal">普伤</i><i class="legend rest">休整</i><span>普通护甲下回合开始消散 · 双甲未碎保留小值额外护盾</span></div>`;
    }
  }

  function renderAbilities(state) {
    const p = state.player;
    const bar = $('#ability-bar');
    const myTurn = state.active === 'player';
    const info = myTurn ? global.DD_ENGINE.getAbilityInfo(state, 'player') : {};
    const buttons = [];
    const add = (id, label, active) => buttons.push(`<button type="button" class="ability-btn ${active ? 'active' : ''}" data-ability="${id}">${label}</button>`);
    if (info.cute) add('cute', '💗 可爱即是正义');
    if (info.meditation) add('meditation', '🍢 烧烤摸 3');
    if (info.withered) add('withered', '🔄 竭泽换牌');
    if (info.destiny) add('destiny', '🔮 命定');
    if (info.magicianSkip) add('magicianSkip', `${p.temp.skipDraw ? '✓ ' : ''}⏭ 跳过摸牌`, p.temp.skipDraw);
    if (info.scavenge) add('scavenge', '♻ 开拓拾牌');
    if (info.wolfJudge) add('wolfJudge', `${p.temp.werewolfJudge ? '✓ ' : ''}🌕 月嚎判定`, p.temp.werewolfJudge);
    if (info.selfHarm) add('selfHarm', '🩸 新生');
    if (info.sameSorrow) add('sameSorrow', `${p.long.sameSorrow ? '✓ ' : ''}💞 同殇`, p.long.sameSorrow);
    if (!myTurn) {
      if (bar) bar.innerHTML = '<span class="ability-hint">对手回合，等待对手行动…</span>';
      return;
    }
    const ult = global.DD_ENGINE.canUseUltimate(state, 'player');
    if (state.phase === 'play' || (ult.ok && p.long.ultimateUsed)) {
      buttons.push(`<button type="button" class="ability-btn ultimate" data-ability="ultimate" ${ult.ok ? '' : 'disabled'}>✦ 必杀 · ${esc(p.char.ultimateName)} <small>${esc(p.char.ultimateCost)}</small></button>`);
    }
    if (state.phase === 'prepare') {
      buttons.push(`<span class="ability-hint">准备阶段：使用能力或直接摸牌</span>`);
    } else if (state.phase === 'play' && !buttons.length) {
      buttons.push(`<span class="ability-hint">点击手牌选择，最多 ${global.DD_ENGINE.getPlayLimit(state, 'player')} 张</span>`);
    }
    if (bar) bar.innerHTML = buttons.join('');
  }

  function renderFeed(state, opts) {
    const feed = $('#battle-feed');
    if (!feed) return;
    const logs = state.log.slice(-9);
    feed.innerHTML = logs.length ? logs.map((l) => logLine(l, false)).join('') : '<div class="feed-line system"><span class="fl-dot"></span><span>对局开始，等待你的行动。</span></div>';
    feed.scrollTop = feed.scrollHeight;
    if (opts.animateLogs) {
      const newLogs = state.log.slice(opts.oldLogCount || 0);
      newLogs.forEach((l) => {
        if (l.kind === 'ultimate') { Sound.play('ult'); }
        else if (l.kind === 'damage' && l.text.indexOf('失去') >= 0) { Sound.play('hit'); flashFighter(l.sideId, 'damage'); }
        else if (l.kind === 'heal') { Sound.play('heal'); flashFighter(l.sideId, 'heal'); }
        else if (l.kind === 'armor') { Sound.play('armor'); }
        else if (l.kind === 'draw' && l.sideId === 'player') { Sound.play('draw'); }
      });
    }
  }
  function flashFighter(sideId, type) {
    if (!sideId) return;
    const el = $('#fighter-' + sideId);
    if (!el) return;
    const cls = type === 'damage' ? 'flash-damage' : 'flash-heal';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 650);
  }

  function updateCommandBar(state) {
    const p = state.player;
    const btn = $('#btn-commit');
    const label = $('#commit-label');
    const sub = $('#commit-sub');
    const myTurn = state.active === 'player';
    const canPlay = myTurn && state.phase === 'play';
    if (btn) btn.disabled = !canPlay;
    if (label) {
      if (!myTurn) label.textContent = '对手回合';
      else if (!canPlay) label.textContent = state.phase === 'prepare' ? '等待摸牌' : '等待结算';
      else if (!p.selection.length) label.textContent = '不出牌 · 结算';
      else label.textContent = `结算 ${p.selection.length} 张牌`;
    }
    if (sub) sub.textContent = canPlay ? '结束出牌并结算' : (myTurn ? '当前不可操作' : '等待对手行动');
    const clear = $('#btn-clear-select');
    if (clear) clear.disabled = !p.selection.length || !canPlay;
  }

  /* ================= 选牌 / 确认 ================= */
  UI.showCardPicker = function (opts) {
    const cards = opts.cards || [];
    const body = cards.length ? `<div class="pick-grid">${cards.map((c, i) => `
      <button type="button" class="pick-card" data-pick="${i}">
        <img src="${c.img}" alt="${esc(c.name)}" loading="lazy" />
        <span>${esc(c.name)}${c.value ? ' · ' + c.value : ''}</span>
      </button>`).join('')}</div>` : `<div class="rule-note">${esc(opts.empty || '没有可选的牌。')}</div>`;
    UI.showModal({
      title: opts.title || '选择一张牌',
      subtitle: opts.subtitle || '',
      body,
      footer: [{ label: '取消', onClick: () => UI.closeModal() }],
      onMount(root) {
        $$('[data-pick]', root).forEach((btn) => btn.addEventListener('click', () => {
          const card = cards[Number(btn.dataset.pick)];
          UI.closeModal();
          if (opts.onPick) opts.onPick(card);
        }));
      },
    });
  };

  UI.showTypePicker = function (opts) {
    const body = `<div class="setup-cards">${C.CARD_LIST.map((card) => `
      <button type="button" class="setup-card" data-type-pick="${card.id}">
        <img src="${card.img}" alt="${esc(card.name)}" loading="lazy" />
        <b>${esc(card.name)}</b>
      </button>`).join('')}</div>`;
    UI.showModal({
      title: opts.title || '选择一种牌',
      subtitle: opts.subtitle || '',
      body,
      footer: [{ label: '取消', onClick: () => UI.closeModal() }],
      onMount(root) {
        $$('[data-type-pick]', root).forEach((btn) => btn.addEventListener('click', () => {
          UI.closeModal();
          if (opts.onPick) opts.onPick(btn.dataset.typePick);
        }));
      },
    });
  };

  UI.confirm = function (opts) {
    UI.showModal({
      title: opts.title || '确认',
      subtitle: opts.subtitle || '',
      narrow: true,
      body: `<div class="setup-lead">${opts.html || esc(opts.text || '')}</div>`,
      footer: [
        { label: opts.cancelLabel || '取消', onClick: () => { UI.closeModal(); if (opts.onCancel) opts.onCancel(); } },
        { label: opts.okLabel || '确定', variant: opts.danger ? 'danger' : 'primary', onClick: () => { UI.closeModal(); if (opts.onOk) opts.onOk(); } },
      ],
    });
  };

  UI.showReveal = function (cards) {
    if (!cards || !cards.length) return;
    UI.showModal({
      title: '命运被看穿',
      subtitle: '对手的全部手牌',
      body: `<div class="pick-grid">${cards.map((c) => `<div class="pick-card"><img src="${c.img}" alt="${esc(c.name)}" /><span>${esc(c.name)}</span></div>`).join('')}</div>`,
      footer: [{ label: '记下了', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  };

  /* ================= 结算 / 结束 ================= */
  UI.showResult = function (state, handlers, opts) {
    opts = opts || {};
    const isEnd = state.phase === 'gameover';
    const p = state.player;
    const a = state.ai;
    const result = state.lastResult || {};
    const turnSide = result.turnSide || state.active || 'player';
    const active = turnSide === 'player' ? p : a;
    let title = turnSide === 'player' ? '你的回合结算' : '对手回合结算';
    let sub = '第 ' + state.round + ' 回合 · ' + (result.turnName || active.name) + ' 的回合结束';
    let titleClass = '';
    if (isEnd) {
      if (state.winner === 'player') { title = '胜 利'; sub = '刀盾归你 · 对手倒下'; titleClass = 'win'; Sound.play('win'); }
      else if (state.winner === 'ai') { title = '败 北'; sub = '此局已尽 · 再来一刀'; titleClass = 'lose'; Sound.play('lose'); }
      else { title = '平 局'; sub = '同归于尽 · 刀盾俱碎'; titleClass = 'draw'; }
    }
    const logs = result.logs && result.logs.length ? result.logs : state.log.slice(-20);
    const played = result.playedCards || [];
    const body = `
      <div class="result-head">
        <h2 class="result-title ${titleClass}">${title}</h2>
        <div class="result-sub">${esc(sub)}</div>
      </div>
      <div class="result-versus">
        <div class="result-side">
          <span class="rs-art"><img src="${portrait(p.char)}" alt="${esc(p.name)}" /></span>
          <b>${esc(p.name)}</b>
          <span>${p.hp} HP · ${result.playerArmor != null ? result.playerArmor : global.DD_ENGINE.totalArmor(p)} 甲</span>
        </div>
        <span class="result-vs">VS</span>
        <div class="result-side">
          <span class="rs-art"><img src="${portrait(a.char)}" alt="${esc(a.name)}" /></span>
          <b>${esc(a.name)}</b>
          <span>${a.hp} HP · ${result.aiArmor != null ? result.aiArmor : global.DD_ENGINE.totalArmor(a)} 甲</span>
        </div>
      </div>
      ${state.seerDraw && state.seerDraw.viewer === p.id ? `<div class="result-seer">🔮 前瞻：对手本回合摸到 <b>${esc(state.seerDraw.cards.map((c) => c.name).join('、'))}</b></div>` : ''}
      <div class="result-stats">
        <div class="result-stat"><span>${turnSide === 'player' ? '你' : '对手'}本回合打出</span><b>${esc(played.join(' · ') || '无')}</b></div>
        <div class="result-stat"><span>你的牌库 / 弃牌</span><b>${p.deck.length} / ${p.discard.length}</b></div>
        <div class="result-stat"><span>对手牌库 / 弃牌</span><b>${a.deck.length} / ${a.discard.length}</b></div>
        <div class="result-stat"><span>当前回合</span><b>第 ${state.round} 回合 · ${turnSide === 'player' ? '你的回合' : '对手回合'}</b></div>
      </div>
      <div class="result-log">${logs.map((l) => logLine(l, true)).join('') || '<div class="feed-line system">本回合没有产生额外记录。</div>'}</div>`;
    let footer;
    if (isEnd) {
      if (opts.lanGame) {
        footer = [{ label: '返回首页', variant: 'primary', onClick: () => { UI.closeModal(); handlers.onHome && handlers.onHome(); } }];
      } else {
        footer = [
          { label: '再来一局', variant: 'primary', onClick: () => { UI.closeModal(); handlers.onRestart && handlers.onRestart(); } },
          { label: '返回首页', onClick: () => { UI.closeModal(); handlers.onHome && handlers.onHome(); } },
        ];
      }
    } else if (opts.guestWaiting) {
      footer = [
        { label: '等待房主继续…', disabled: true },
      ];
    } else {
      footer = [
        { label: turnSide === 'player' ? '结束回合 →' : '开始你的回合 →', variant: 'primary', onClick: () => { UI.closeModal(); handlers.onNext && handlers.onNext(); } },
      ];
    }
    UI.showModal({
      title: isEnd ? '对局结束' : '本回合结算',
      subtitle: '第 ' + state.round + ' 回合',
      wide: true,
      body,
      footer,
      dismissable: false,
    });
  };

  UI.showGameOver = function (state, handlers) {
    const p = state.player;
    UI.showResult(state, handlers);
  };

  /* ================= 日志差异播放 ================= */
  UI.handleNewLogs = function (state, oldCount) {
    const logs = state.log.slice(oldCount);
    logs.forEach((l) => {
      if (l.kind === 'ultimate') Sound.play('ult');
      else if (l.kind === 'damage' && l.text.indexOf('失去') >= 0) { Sound.play('hit'); flashFighter(l.sideId, 'damage'); }
      else if (l.kind === 'heal') { Sound.play('heal'); flashFighter(l.sideId, 'heal'); }
      else if (l.kind === 'armor') Sound.play('armor');
    });
  };

  UI.portrait = portrait;
  UI.Sound = Sound;
  UI.ensureAudio = ensureAudio;
  global.UI = UI;
})(window);
