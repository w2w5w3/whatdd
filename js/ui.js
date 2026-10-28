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
    lastDrawSeq: 0,
    lastPlaySeq: 0,
    lastArmor: { player: null, ai: null },
    lastShieldHitSeq: 0,
    lastKuaishouSeq: 0,
    lastKuaishouUltSeq: 0,
    inspectUid: null,
    playRevealTimer: null,
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
        case 'play': tone(300, 0.06, 'triangle', 0.04); tone(540, 0.14, 'triangle', 0.03, 0.05); break;
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
        <div class="sp-ult">必杀 · ${esc(cls.ultimateName)}（${esc(cls.ultimateCost)}）${UI.ultimatesEnabled === false ? ' · <b>已关闭</b>' : ''}</div>
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
              ${UI.ultimatesEnabled === false ? '<div class="ultimate-hidden-note">🔒 隐藏开关已关闭必杀技</div>' : ''}
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
      const cats = C.POISON_CATEGORIES || [];
      body = `
        <p class="setup-lead">你是女巫。选择一种<strong>卡牌类别</strong>投毒：对手每次摸到该类别的牌时受到 <b>1 点真实伤害</b>。整局只能选择一次。</p>
        <div class="setup-cards">
          ${cats.map((cat) => `
            <button type="button" class="setup-card" data-poison="${cat.id}">
              <b>${esc(cat.name)}</b>
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
    if (side.long.babyBonusMaxHp > 0) chips.push(['额外生命上限 ' + side.long.babyBonusMaxHp, 'green']);
    if (side.long.fanrenGuardUntil >= state.turn) chips.push(['凡躯护佑', 'blue']);
    if (side.long.chensiyuTax) chips.push(['摸牌税', 'red']);
    if (side.temp.skipPlay) chips.push(['跳过出牌', 'red']);
    if (side.long.delayedCard) chips.push(['延授 ' + side.long.delayedCard.card.name + ' +' + side.long.delayedCard.boost, 'gold']);
    if (side.status.pendingDrawPenalty > 0) chips.push(['下回合摸牌-' + side.status.pendingDrawPenalty, '']);
    if (side.status.drawPenalty > 0) chips.push(['本回合摸牌-' + side.status.drawPenalty, '']);
    if (side.deck.length === 0) chips.push(['枯牌', 'red']);
    if (side.classId === 'sanyueqi' && side.long.cuteWindowTurn === side.turnsTaken) chips.push(['可爱就绪', 'green']);
    if (side.classId === 'langren' && side.long.wolfMode === 'A' && side.hp <= 8) chips.push(['血月+1', 'red']);
    if (side.classId === 'langren' && side.long.wolfMode) chips.push([side.long.wolfMode === 'A' ? '血月模式' : '月嚎·B', '']);
    if (side.classId === 'nvwu' && side.long.poisonType && side.id === state.player.id) {
      const cat = (C.POISON_CATEGORIES || []).find((x) => x.id === side.long.poisonType);
      chips.push(['毒咒:' + (cat ? cat.name : side.long.poisonType), 'green']);
    }
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
      prepare: myTurn ? '准备阶段：可发动能力，随后自动摸牌' : '对手正在准备…',
      draw: '正在摸牌…',
      play: myTurn ? '双击手牌打出，最多 ' + global.DD_ENGINE.getPlayLimit(state, 'player') + ' 张；可随时结束回合' : '对手正在出牌…',
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
      ? (state.phase === 'play' ? `已出 ${(p.temp.playedCards || []).length} / ${global.DD_ENGINE.getPlayLimit(state, 'player')}` : `${p.hand.length} 张手牌`)
      : '等待对手行动');
    const aiArt = $('#ai-art');
    if (aiArt) aiArt.innerHTML = `<img src="${a.char.originalImg || portrait(a.char)}" alt="${esc(a.name)}">`;
    const pArt = $('#player-art');
    if (pArt) pArt.innerHTML = `<img src="${p.char.originalImg || portrait(p.char)}" alt="${esc(p.name)}">`;
    const aiDuel = $('#duel-ai-avatar'); const pDuel = $('#duel-player-avatar');
    if (aiDuel) aiDuel.innerHTML = `<img src="${portrait(a.char)}" alt="${esc(a.name)}" />`;
    if (pDuel) pDuel.innerHTML = `<img src="${portrait(p.char)}" alt="${esc(p.name)}" />`;
    setText('#duel-ai-armor', global.DD_ENGINE.totalArmor(a));
    setText('#duel-player-armor', global.DD_ENGINE.totalArmor(p));
    $('#ai-status').innerHTML = statusChips(state, a);
    $('#player-status').innerHTML = statusChips(state, p);
    const skillHtml = (side) => `
      <div class="fs-passive"><b>【${esc(side.char.passiveName)}】</b><span>${esc(side.char.passiveText)}</span></div>
      <div class="fs-ult">必杀 · <b>${esc(side.char.ultimateName)}</b> <span>${state.ultimatesEnabled === false ? '本局关闭' : (side.long.ultimateUsed ? '已使用' : '未使用')}</span></div>`;
    $('#ai-skill').innerHTML = skillHtml(a);
    $('#player-skill').innerHTML = skillHtml(p);
    const renderBacks = (id, count) => {
      const el = $('#' + id);
      if (!el) return;
      const n = Math.min(count, 8);
      el.innerHTML = Array.from({ length: n }, () => '<img class="mini-back" src="assets/back.webp" alt="" />').join('')
        + (count > n ? `<span class="back-more">+${count - n}</span>` : '');
    };
    renderBacks('ai-hand-backs', a.hand.length);
    renderBacks('player-hand-backs', p.hand.length);

    // 船长计数器
    [['ai', a], ['player', p]].forEach(([id, side]) => {
      const cap = $('#' + id + '-captain');
      if (!cap) return;
      cap.classList.toggle('hidden', side.classId !== 'chuanzhang');
      if (side.classId === 'chuanzhang') {
        const prog = side.long.captainProgress || 0;
        cap.innerHTML = `<b>${prog}/2</b><small>出/弃</small>`;
        cap.title = '每打出或弃置 2 张牌失去 1 点生命；每获得 1 张牌回复 1 点生命（累计 ' + (side.long.captainCount || 0) + ' 张）';
      }
    });

    // 护盾光罩
    [['ai', a], ['player', p]].forEach(([id, side]) => {
      const aura = $('#' + id + '-shield-aura');
      if (!aura) return;
      const total = global.DD_ENGINE.totalArmor(side);
      aura.classList.toggle('hidden', total <= 0);
      aura.className = 'shield-aura' + (total <= 0 ? ' hidden' : '') + ' aura-' + ((side.armor > 0 ? side.long.armorTier : side.long.extraArmorTier) || side.long.armorTier || 'white');
    });
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
    if (p.long.viewOpponent && state.ai.hand.length && state.ai.hand.every((c) => !c.hidden)) {
      intelHtml += `<span>👁 <b>命定</b></span><span>对方手牌：<b>${esc(state.ai.hand.map((c) => c.name).join('、'))}</b></span>`;
    }
    if (intel) intel.innerHTML = intelHtml;

    // 操作按钮
    const turnActions = $('#turn-actions');
    let taHtml = '';
    if (state.tutorial) {
      taHtml = `<span class="turn-wait">新手教程进行中…</span>`;
    } else if (myTurn && state.phase === 'prepare') {
      taHtml = `<span class="turn-wait">准备阶段…</span>`;
    } else if (myTurn && state.phase === 'play') {
      taHtml = `<button type="button" class="turn-btn primary" data-action="commit">结束回合</button>`;
    } else if (!myTurn && (state.phase === 'prepare' || state.phase === 'play')) {
      taHtml = `<span class="turn-wait">⏳ 对手行动中…</span>`;
    }
    if (turnActions) turnActions.innerHTML = taHtml;

    renderHand(state, opts);
    renderHandTips(state);
    renderAbilities(state);
    renderFeed(state, opts);
    updateCommandBar(state);
    renderVisualEvents(state, opts);
  };

  function renderVisualEvents(state, opts) {
    const p = state.player;
    // 抽卡动画
    if (state.lastDraw && state.lastDraw.seq !== UI.lastDrawSeq) {
      UI.lastDrawSeq = state.lastDraw.seq;
      if (state.lastDraw.count > 0) animateDraw(state.lastDraw.sideId, state.lastDraw.count);
    }
    // 打出卡牌详情
    if (state.lastPlay && state.lastPlay.seq !== UI.lastPlaySeq) {
      UI.lastPlaySeq = state.lastPlay.seq;
      showPlayReveal(state.lastPlay, state);
    }
    // 护盾受击 / 破碎（由引擎事件驱动，普通伤害被盾完全挡下也会触发）
    if (state.lastKuaishouUlt && state.lastKuaishouUlt.seq !== UI.lastKuaishouUltSeq) {
      UI.lastKuaishouUltSeq = state.lastKuaishouUlt.seq;
      // 有选牌弹窗时直接由选牌界面展示三张牌，避免连续弹两个窗。
      if (!state.pendingKuaishou) UI.showKuaishouUltReveal(state.lastKuaishouUlt);
    }
    if (state.lastKuaishou && state.lastKuaishou.seq !== UI.lastKuaishouSeq) {
      UI.lastKuaishouSeq = state.lastKuaishou.seq;
      UI.showKuaishouReveal(state.lastKuaishou);
    }
    if (state.lastShieldHit && state.lastShieldHit.seq !== UI.lastShieldHitSeq) {
      UI.lastShieldHitSeq = state.lastShieldHit.seq;
      if (state.lastShieldHit.broken) shieldShatter(state.lastShieldHit.sideId);
      else shieldHit(state.lastShieldHit.sideId);
    }
    [['ai', state.ai], ['player', p]].forEach(([id, side]) => {
      UI.lastArmor[id] = global.DD_ENGINE.totalArmor(side);
    });
    // HP 变化：受击 / 回复动画与音效
    [['ai', state.ai], ['player', p]].forEach(([id, side]) => {
      const prev = UI.lastHp[id];
      if (prev != null && prev !== side.hp) animateHpChange(id, side.hp - prev);
      UI.lastHp[id] = side.hp;
    });
  }

  function animateDraw(sideId, count) {
    const layer = $('#draw-anim');
    if (!layer) return;
    const target = sideId === 'player' ? ($('#hand-scroll') || $('#fighter-player')) : ($('#ai-hand-back') || $('#fighter-ai'));
    const tr = target ? target.getBoundingClientRect() : { left: innerWidth / 2, top: sideId === 'player' ? innerHeight - 160 : 160, width: 0, height: 0 };
    const sx = innerWidth / 2;
    const sy = innerHeight * 0.42;
    const tx = tr.left + tr.width / 2;
    const ty = tr.top + tr.height / 2;
    const n = Math.max(1, Math.min(3, count));
    for (let i = 0; i < n; i += 1) {
      const el = document.createElement('div');
      el.className = 'draw-card';
      el.style.left = (sx + (i - (n - 1) / 2) * 16) + 'px';
      el.style.top = sy + 'px';
      el.style.setProperty('--rot', ((i - (n - 1) / 2) * 6) + 'deg');
      el.style.setProperty('--dx', (tx - sx) + 'px');
      el.style.setProperty('--dy', (ty - sy) + 'px');
      el.style.animationDelay = (i * 0.07) + 's';
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1000 + i * 80);
    }
    Sound.play('draw');
  }

  function animateHpChange(sideId, delta) {
    if (!delta) return;
    const el = $('#fighter-' + sideId);
    const hit = delta < 0;
    if (el) {
      el.classList.remove('hit-shake');
      void el.offsetWidth;
      el.classList.add('hit-shake');
      setTimeout(() => el.classList.remove('hit-shake'), 500);
    }
    if (hit) {
      const screen = $('#screen-game');
      if (screen) {
        screen.classList.remove('screen-shake');
        void screen.offsetWidth;
        screen.classList.add('screen-shake');
        setTimeout(() => screen.classList.remove('screen-shake'), 420);
      }
    }
    const rect = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const float = document.createElement('div');
    float.className = 'hit-float' + (hit ? '' : ' heal');
    float.textContent = (delta > 0 ? '+' : '') + delta;
    float.style.left = (rect.left + rect.width * 0.5) + 'px';
    float.style.top = (rect.top + Math.min(rect.height * 0.35, 140)) + 'px';
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 900);
    Sound.play(hit ? 'hit' : 'heal');
  }

  function shieldHit(sideId) {
    const aura = $('#' + sideId + '-shield-aura');
    if (aura) {
      aura.classList.remove('aura-hit');
      void aura.offsetWidth;
      aura.classList.add('aura-hit');
      setTimeout(() => aura.classList.remove('aura-hit'), 380);
    }
    Sound.play('armor');
  }

  function shieldShatter(sideId) {
    const aura = $('#' + sideId + '-shield-aura');
    if (aura) {
      aura.classList.remove('hidden');
      aura.classList.add('aura-shatter');
      setTimeout(() => { aura.classList.add('hidden'); aura.classList.remove('aura-shatter'); }, 520);
    }
    const fighter = $('#fighter-' + sideId);
    if (fighter) {
      const rect = fighter.getBoundingClientRect();
      for (let i = 0; i < 8; i += 1) {
        const shard = document.createElement('i');
        shard.className = 'shield-shard';
        shard.style.left = (rect.left + rect.width / 2) + 'px';
        shard.style.top = (rect.top + rect.height * 0.35) + 'px';
        shard.style.setProperty('--sx', ((Math.random() - 0.5) * 120) + 'px');
        shard.style.setProperty('--sy', ((Math.random() - 0.5) * 100) + 'px');
        document.body.appendChild(shard);
        setTimeout(() => shard.remove(), 700);
      }
    }
    Sound.play('hit');
  }

  UI.resetVisualState = function () {
    UI.lastHp = { player: null, ai: null };
    UI.lastDrawSeq = 0;
    UI.lastPlaySeq = 0;
    UI.lastArmor = { player: null, ai: null };
    UI.lastShieldHitSeq = 0;
    UI.lastKuaishouSeq = 0;
    UI.lastKuaishouUltSeq = 0;
    UI.inspectUid = null;
    UI.hideInspector();
    const pr = $('#play-reveal'); if (pr) { pr.classList.add('hidden'); pr.classList.remove('out'); }
    const da = $('#draw-anim'); if (da) da.innerHTML = '';
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
        const inspected = opts.inspectUid === card.uid;
        const free = Array.isArray(p.temp.freePlayUids) && p.temp.freePlayUids.indexOf(card.uid) >= 0;
        const info = global.DD_ENGINE.playableInfo(state, p, card);
        const locked = state.phase !== 'play' || state.active !== p.id;
        const disabled = !locked && !info.ok;
        const meta = typeMeta[card.type];
        const reason = info.ok ? '' : info.reason;
        const valueLabel = card.type === 'rest' && card.id === 'ningshen' ? '2' : (card.type === 'armor' || card.type === 'rest' ? '+' + card.value : card.value);
        return `<button type="button" class="card ${inspected ? 'inspected' : ''} ${free ? 'free-play' : ''} ${disabled ? 'disabled' : ''}" data-uid="${esc(card.uid)}" aria-pressed="${inspected}" ${locked ? 'data-locked="1"' : ''}>
          <span class="card-inner"><img src="${card.img}" alt="${esc(card.name)}" loading="lazy" /></span>
          <span class="card-badge ${card.type}">${esc(meta.label)}</span>
          <span class="card-value ${card.type}">${valueLabel}</span>
          ${free ? '<span class="card-free-badge">免</span>' : ''}<span class="card-tooltip"><b>${esc(card.name)}</b><span class="tt-type">${esc(meta.label)}${reason ? ' · ' + esc(reason) : ''}</span>${esc(card.desc)}</span>
        </button>`;
      }).join('');
    }
    if (scroll) scroll.scrollLeft = prevScroll;
    const slot = $('#selected-slot');
    const played = p.temp.playedCards || [];
    if (slot) slot.innerHTML = played.length
      ? played.map((c) => `<span class="sel-chip ${c.type === 'rest' ? 'rest' : ''}">${esc(c.name)}</span>`).join('')
      : '<span class="sel-empty">单击查看详情 · 双击打出</span>';
  }


  function renderHandTips(state) {
    const tips = $('#hand-tips');
    if (!tips) return;
    const p = state.player;
    const foe = state.ai;
    const played = (p.temp.playedCards || []).length;
    let line = '';
    if (state.active !== p.id) {
      line = '对手回合：等待对手摸牌、出牌和结算。';
    } else if (p.status.frozenTurn === p.turnsTaken) {
      line = '你被【冰刻箭雨之时】冻结，本回合无法打出任何手牌，只能使用职业能力或结束回合。';
    } else if (state.phase === 'prepare') {
      line = '准备阶段：可先使用职业能力，然后进入摸牌阶段。';
    } else if (state.phase === 'play') {
      if (p.temp.normalDisabled) line = '你回合开始时对方持有护盾，本回合普通攻击卡不可打出。可单击查看详情，双击打出其他牌。';
      else if (foe.hp > 0) line = '单击卡牌高亮并查看详情；双击卡牌打出并立即结算。';
      else line = '对局已结束。';
    } else if (state.phase === 'gameover') {
      line = '对局结束。';
    } else {
      line = '选择一个行动继续。';
    }
    tips.innerHTML = `
      <div class="ht-head"><span>已出 ${played} / ${state.phase === 'play' ? global.DD_ENGINE.getPlayLimit(state, 'player') : '—'}</span><b>${esc(p.name)}</b><em>${state.phase === 'play' ? '双击出牌' : '准备阶段'}</em></div>
      <p>${esc(line)}</p>
      <div class="ht-legend"><i class="legend break">破甲</i><i class="legend armor">叠甲</i><i class="legend normal">普伤</i><i class="legend rest">休整</i><span>普通护甲下回合开始消散 · 双甲未碎保留小值额外护盾</span></div>`;
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
    if (info.divine) add('divine', '🔮 命定');
    if (info.viewOpponent) add('viewOpponent', '👁 查看对方手牌');
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
    if (state.ultimatesEnabled !== false && !p.long.ultimateUsed && state.phase === 'play') {
      buttons.push(`<button type="button" class="ability-btn ultimate" data-ability="ultimate" ${ult.ok ? '' : 'disabled'}>✦ 必杀 · ${esc(p.char.ultimateName)} <small>${esc(p.char.ultimateCost)}</small></button>`);
    }
    if (state.ultimatesEnabled === false) {
      buttons.push(`<span class="ability-hint">🔒 本局必杀技已关闭</span>`);
    } else if (state.phase === 'prepare') {
      buttons.push(`<span class="ability-hint">准备阶段：使用能力或直接摸牌</span>`);
    } else if (state.phase === 'play' && !buttons.length) {
      buttons.push(`<span class="ability-hint">单击查看 · 双击打出，最多 ${global.DD_ENGINE.getPlayLimit(state, 'player')} 张</span>`);
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
    const canPlay = !state.tutorial && myTurn && state.phase === 'play';
    const played = (p.temp.playedCards || []).length;
    const limit = global.DD_ENGINE.getPlayLimit(state, 'player');
    if (btn) btn.disabled = !canPlay;
    if (label) {
      if (state.tutorial) label.textContent = '教程进行中';
      else if (!myTurn) label.textContent = '对手回合';
      else if (!canPlay) label.textContent = state.phase === 'prepare' ? '等待摸牌' : '等待结算';
      else label.textContent = '结束回合';
    }
    if (sub) sub.textContent = state.tutorial ? '按教程提示双击手牌' : (canPlay ? `已出 ${played} / ${limit} 张 · 点击结束本回合` : (myTurn ? '当前不可操作' : '等待对手行动'));
    const clear = $('#btn-clear-select');
    if (clear) clear.disabled = !UI.inspectUid;
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
      dismissable: false,
      body,
      footer: [{ label: '取消', onClick: () => { UI.closeModal(); if (opts.onCancel) opts.onCancel(); } }],
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
      dismissable: opts.dismissable !== false,
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

  /* ================= 卡牌详情 / 打出展示 ================= */
  UI.showCardInspector = function (state, uid) {
    const p = state.player;
    const card = p.hand.find((c) => c.uid === uid);
    const box = $('#card-inspector');
    if (!card || !box) return;
    UI.inspectUid = uid;
    const info = global.DD_ENGINE.playableInfo(state, p, card);
    const modes = global.DD_ENGINE.cardModeOptions(state, p, card);
    const meta = typeMeta[card.type];
    box.innerHTML = `
      <div class="ci-art"><img src="${card.img}" alt="${esc(card.name)}" /></div>
      <div class="ci-body">
        <div class="ci-top"><span class="ci-name">${esc(card.name)}</span><span class="ci-type">${esc(meta.label)}</span><span class="ci-value">${card.value}</span></div>
        <div class="ci-desc">${esc(card.desc)}</div>
        ${info.ok ? '' : `<div class="ci-reason">✕ ${esc(info.reason)}</div>`}
        ${modes.length ? `<div class="ci-hint">双击后选择：${esc(modes.map((m) => m.label).join(' / '))}</div>` : ''}
        <div class="ci-hint">${info.ok ? '双击卡牌立即打出' : '当前无法打出，可继续查看'}</div>
      </div>`;
    box.classList.remove('hidden');
  };

  UI.hideInspector = function () {
    UI.inspectUid = null;
    const box = $('#card-inspector');
    if (box) box.classList.add('hidden');
  };

  function showPlayReveal(play, state) {
    const box = $('#play-reveal');
    if (!box || !play || !play.card) return;
    box.innerHTML = `<div class="pr-art-only"><img src="${play.card.img}" alt="" /></div>`;
    box.classList.remove('hidden', 'out');
    if (UI.playRevealTimer) clearTimeout(UI.playRevealTimer);
    UI.playRevealTimer = setTimeout(() => {
      box.classList.add('out');
      setTimeout(() => { box.classList.add('hidden'); box.classList.remove('out'); }, 250);
    }, 1700);
    Sound.play('play');
  }

  /* ================= 准备阶段 / 多选 / 教程 ================= */
  UI.showPrepPrompt = function (actions, onChoose, onSkip) {
    const body = `<div class="prep-actions">${actions.map((a) => `<button type="button" class="prep-action" data-prep="${esc(a.id)}"><b>${esc(a.label)}</b><small>${esc(a.desc || '')}</small></button>`).join('')}</div>
      <div class="rule-note">发动能力后会自动进入摸牌阶段；也可以跳过。</div>`;
    UI.showModal({
      title: '准备阶段',
      subtitle: '是否发动职业能力？',
      narrow: true,
      dismissable: false,
      body,
      footer: [
        { label: '跳过，直接摸牌', onClick: () => { UI.closeModal(); onSkip && onSkip(); } },
      ],
      onMount(root) {
        $$('[data-prep]', root).forEach((btn) => btn.addEventListener('click', () => {
          UI.closeModal();
          if (onChoose) onChoose(btn.dataset.prep);
        }));
      },
    });
  };

  UI.showMultiCardPicker = function (opts) {
    const cards = opts.cards || [];
    const min = opts.min || 0;
    const max = Math.min(opts.max == null ? cards.length : opts.max, cards.length);
    const selected = [];
    const body = cards.length ? `<div class="pick-grid multi">${cards.map((c, i) => `
      <button type="button" class="pick-card" data-pick="${i}">
        <img src="${c.img}" alt="${esc(c.name)}" loading="lazy" />
        <span>${esc(c.name)}</span>
        <i class="pick-check">✓</i>
      </button>`).join('')}</div>` : `<div class="rule-note">${esc(opts.empty || '没有可选的牌。')}</div>`;
    const root = UI.showModal({
      title: opts.title || '选择卡牌',
      subtitle: (opts.subtitle || '') + `（${min === max ? '需选择 ' + min + ' 张' : '最多 ' + max + ' 张'}）`,
      body,
      dismissable: false,
      footer: [
        { label: '取消', onClick: () => UI.closeModal() },
        { label: opts.confirmLabel || '确认', variant: 'primary', onClick: () => {
          if (selected.length < min || selected.length > max) return;
          UI.closeModal();
          if (opts.onConfirm) opts.onConfirm(selected.slice());
        } },
      ],
      onMount(modalRoot) {
        const confirmBtn = $('[data-mbtn="1"]', modalRoot);
        const sync = () => {
          $$('[data-pick]', modalRoot).forEach((btn) => {
            const card = cards[Number(btn.dataset.pick)];
            btn.classList.toggle('selected', selected.indexOf(card.uid) >= 0);
          });
          if (confirmBtn) confirmBtn.disabled = selected.length < min || selected.length > max;
        };
        $$('[data-pick]', modalRoot).forEach((btn) => btn.addEventListener('click', () => {
          const card = cards[Number(btn.dataset.pick)];
          const at = selected.indexOf(card.uid);
          if (at >= 0) selected.splice(at, 1);
          else if (selected.length < max) selected.push(card.uid);
          Sound.play('select');
          sync();
        }));
        sync();
      },
    });
    return root;
  };

  UI.showTutorial = function (onStart) {
    UI.showModal({
      title: '新手教程',
      subtitle: '30 秒快速上手',
      wide: true,
      body: `
        <div class="tutorial">
          <div class="tut-step"><b>1. 选职业</b><p>首页选 1 个职业；每个职业有常驻被动和每局 1 次的必杀。</p></div>
          <div class="tut-step"><b>2. 回合流程</b><p>轮到你时自动摸牌。准备阶段若有关键能力，会弹窗询问是否发动。</p></div>
          <div class="tut-step"><b>3. 单击 / 双击</b><p>单击手牌查看详情并高亮；再次点击或双击立即打出，单张牌会实时结算。</p></div>
          <div class="tut-step"><b>4. 护盾</b><p>护甲抵挡破甲伤害；自己下回合开始时普通护甲消散。双叠甲未碎会留下额外护盾。</p></div>
          <div class="tut-step"><b>5. 必杀开关</b><p>在首页连续点击预言家 5 下，可以切换本局是否启用必杀。</p></div>
          <div class="tut-step"><b>6. 联机</b><p>局域网联机需要电脑运行「手机访问-局域网服务器.bat」，两台设备打开同一网址。</p></div>
        </div>`,
      footer: [{ label: '开始游戏', variant: 'primary', onClick: () => { UI.closeModal(); if (onStart) onStart(); } }],
    });
  };

  UI.showTypeChoice = function (opts) {
    const types = [
      { id: 'normal', label: '普通攻击卡' },
      { id: 'break', label: '破甲卡' },
      { id: 'rest', label: '休整功能卡' },
      { id: 'armor', label: '护甲卡' },
    ];
    UI.showModal({
      title: opts.title || '宣言卡牌类型',
      subtitle: opts.subtitle || '',
      narrow: true,
      body: `<div class="prep-actions">${types.map((t) => `<button type="button" class="prep-action" data-type-choice="${t.id}"><b>${t.label}</b></button>`).join('')}</div>`,
      footer: [{ label: '取消', onClick: () => { UI.closeModal(); if (opts.onCancel) opts.onCancel(); } }],
      onMount(root) {
        $$('[data-type-choice]', root).forEach((btn) => btn.addEventListener('click', () => {
          UI.closeModal();
          if (opts.onPick) opts.onPick(btn.dataset.typeChoice);
        }));
      },
    });
  };

  UI.showAnnouncement = function (text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    UI.showModal({
      title: '公告',
      subtitle: '欢迎来到《我的刀盾》',
      narrow: true,
      body: `<div class="announcement">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`,
      footer: [{ label: '知道了', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  };

  UI.showKuaishouUltReveal = function (ev) {
    if (!ev) return;
    const cards = ev.cards || [];
    UI.showModal({
      title: '神偷 · 对方牌库顶端三张',
      subtitle: '宣言「' + ev.declaredLabel + '」 · 符合 ' + ev.matches + ' 张 · 可选 ' + ev.maxPick + ' 张',
      narrow: true,
      body: `<div class="ks-ult-grid">${cards.map((c) => `
        <div class="ks-ult-card ${c.type === ev.declared ? 'matched' : ''}">
          <img src="${c.img}" alt="${esc(c.name)}" />
          <b>${esc(c.name)}</b>
          <i>${esc(c.type === 'normal' ? '攻击' : c.type === 'armor' ? '护盾' : c.type === 'break' ? '破甲' : '休整')} · ${c.value}</i>
        </div>`).join('')}</div>`,
      footer: [{ label: '继续', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  };

  UI.showKuaishouReveal = function (ev) {
    if (!ev) return;
    function cardBox(label, card, extraClass) {
      if (!card) return `<div class="ks-card ${extraClass || ''}"><span>${label}</span><div class="ks-empty">牌库为空</div></div>`;
      return `<div class="ks-card ${extraClass || ''}"><span>${label}</span><img src="${card.img}" alt="${esc(card.name)}" /><b>${esc(card.name)}</b><i>${esc(card.type === 'normal' ? '攻击' : card.type === 'armor' ? '护盾' : card.type === 'break' ? '破甲' : '休整')} · ${card.value}</i></div>`;
    }
    UI.showModal({
      title: '掠影 · 凝神',
      subtitle: ev.same ? '两张牌相同！触发额外效果' : '从双方牌库顶端各拿 1 张牌',
      narrow: true,
      body: `<div class="ks-reveal">
        ${cardBox('对方牌库顶端', ev.enemy)}
        <div class="ks-same">${ev.same ? '相同' : '不同'}</div>
        ${cardBox('自己牌库顶端', ev.own)}
        ${ev.extra ? `<div class="ks-extra">${cardBox(ev.autoPlayed ? '额外摸到 · 已自动打出' : '额外摸到', ev.extra, 'ks-auto')}</div>` : ''}
      </div>`,
      footer: [{ label: '继续', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  };

  UI.showDelayedPrompt = function (delayed, onActivate, onPostpone) {
    const card = delayed.card;
    const value = card.value + delayed.boost;
    UI.showModal({
      title: '延授 · ' + card.name,
      subtitle: '上回合延迟的牌已到结算时机',
      narrow: true,
      dismissable: false,
      body: `<div class="tut-lesson">
        <img src="${card.img}" alt="${esc(card.name)}" />
        <div><p>当前数值：<b>${value}</b>${delayed.boost ? '（原 ' + card.value + '，已蓄力 +' + delayed.boost + '）' : ''}</p>
        <p class="tut-tip">直接发动：立即结算此牌效果。</p>
        <p class="tut-tip">本回合不发动：此牌 +3（伤害/护盾/回血/抽牌数），继续延迟到下次回合结束。</p></div>
      </div>`,
      footer: [
        { label: '本回合不发动 · +3', onClick: () => { UI.closeModal(); onPostpone(); } },
        { label: '直接发动', variant: 'primary', onClick: () => { UI.closeModal(); onActivate(); } },
      ],
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
        ${(result.playedCardDetails || []).length ? `<div class="result-cards">${result.playedCardDetails.map((c) => `<div class="result-card"><img src="${c.img}" alt="${esc(c.name)}" /><span>${esc(c.name)}</span></div>`).join('')}</div>` : ''}
        <div class="result-stat"><span>你的牌库 / 弃牌</span><b>${p.deck.length} / ${p.discard.length}</b></div>
        <div class="result-stat"><span>对手牌库 / 弃牌</span><b>${a.deck.length} / ${a.discard.length}</b></div>
        <div class="result-stat"><span>当前回合</span><b>第 ${state.round} 回合 · ${turnSide === 'player' ? '你的回合' : '对手回合'}</b></div>
      </div>
      `;
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
      else if (l.kind === 'armor') Sound.play('armor');
    });
  };

  UI.portrait = portrait;
  UI.Sound = Sound;
  UI.ensureAudio = ensureAudio;
  global.UI = UI;
})(window);
