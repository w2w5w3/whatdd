/* 我的刀盾 · 修正版 — 应用入口与交互 */
(function () {
  'use strict';
  const E = window.DD_ENGINE;
  const C = window.DD_CONFIG;
  const AI = window.DD_AI;
  const LAN = window.DD_LAN;
  const UI = window.UI;
  const $ = (sel) => document.querySelector(sel);

  const app = {
    screen: 'home',
    mode: 'solo',
    selectedClass: Math.floor(Math.random() * C.CLASS_LIST.length),
    game: null,
    logCount: 0,
    lastActionAt: 0,
    // 局域网联机
    lan: null,
    lanRole: null,
    lanClass: null,
    lanSetup: null,
    lanRoomCode: null,
    lanStarting: false,
    lanSnapshotId: 0,
    guestSnapshotId: 0,
    guestResultKey: null,
    guestResultOpen: false,
    guestRevealKey: null,
    guestBusy: false,
    guestPrepKey: null,
    tutorial: false,
    tutorialStep: 0,
    tutorialCardPlayed: false,
    hostSendQueue: Promise.resolve(),
    guestSendQueue: Promise.resolve(),
    // 实时出牌 / 隐藏必杀开关
    inspectUid: null,
    lastCardClick: { uid: null, at: 0 },
    ultClickCount: 0,
    ultClickAt: 0,
    ultimatesEnabled: true,
  };
  try {
    const savedUlt = localStorage.getItem('dd_ultimates');
    if (savedUlt === '0') app.ultimatesEnabled = false;
  } catch (e) { /* private mode */ }
  UI.ultimatesEnabled = app.ultimatesEnabled;
  app.selectedClass = C.CLASS_LIST[app.selectedClass].id;

  /* ---------------- 页面切换 ---------------- */
  function showScreen(name) {
    app.screen = name;
    $('#screen-home').classList.toggle('hidden', name !== 'home');
    $('#screen-game').classList.toggle('hidden', name !== 'game');
    if (name === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showHome() {
    stopLan();
    UI.closeModal();
    UI.hideInspector();
    app.mode = 'solo';
    app.tutorial = false;
    app.game = null;
    showScreen('home');
    applyUltimateSetting(true);
    UI.renderHome(app.selectedClass);
    UI.setSoundUI();
  }

  /* ---------------- 开始 / 重开 ---------------- */
  function launchGame() {
    stopLan();
    UI.ensureAudio();
    UI.clearToasts();
    app.mode = 'solo';
    app.tutorial = false;
    const state = E.createGame({ playerClass: app.selectedClass, controllers: { ai: AI }, ultimatesEnabled: app.ultimatesEnabled });
    app.game = state;
    app.logCount = state.log.length;
    app.inspectUid = null;
    app.lastCardClick = { uid: null, at: 0 };
    UI.resetVisualState();
    UI.closeModal();
    showScreen('game');
    renderGame(false);
    if (state.setupNeeded.length > 0) {
      UI.showSetup(state, (kind, value) => {
        const r = E.chooseSetup(state, kind, value);
        if (!r.ok) { UI.toast(r.error, 'error'); return; }
        if (state.setupNeeded.length > 0) {
          UI.showSetup(state, () => finishStart(state));
          return;
        }
        finishStart(state);
      });
    } else {
      finishStart(state);
    }
  }

  function finishStart(state) {
    const r = E.startGame(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    UI.closeModal();
    app.logCount = state.log.length;
    app.inspectUid = null;
    app.lastCardClick = { uid: null, at: 0 };
    UI.resetVisualState();
    renderGame(false);
    UI.clearToasts();
    const ch = state.player.long.poisonType;
    if (ch) {
      const cat = (C.POISON_CATEGORIES || []).find((x) => x.id === ch);
      UI.toast('你的毒咒：对手摸到「' + (cat ? cat.name : ch) + '」时受到 1 点真实伤害', 'success');
    }
    startPlayerTurn();
  }

  function restartGame() {
    stopLan();
    UI.closeModal();
    UI.hideInspector();
    app.mode = 'solo';
    launchGame();
  }

  /* ---------------- 渲染 ---------------- */
  function renderGame(animate) {
    const state = app.game;
    if (!state) return;
    const old = app.logCount;
    UI.renderGame(state, { preserveScroll: true, animateLogs: false, inspectUid: app.inspectUid });
    app.logCount = state.log.length;
    if (app.mode === 'lan-host') sendHostSnapshot();
  }

  function actionDone(animate) {
    if (!app.game) return;
    renderGame(animate !== false);
    if (app.game.phase === 'gameover') {
      setTimeout(() => showEnd(), 760);
    }
  }

  function overHandlers() {
    return { onRestart: restartGame, onHome: showHome };
  }
  function resultOpts() {
    return { lanGame: app.mode === 'lan-host' || app.mode === 'lan-guest' };
  }
  function showEnd() {
    const state = app.game;
    if (!state || state.phase !== 'gameover') return;
    app.inspectUid = null;
    UI.hideInspector();
    UI.showResult(state, overHandlers(), resultOpts());
  }

  function resetTurnUi() {
    app.inspectUid = null;
    app.lastCardClick = { uid: null, at: 0 };
    UI.hideInspector();
  }

  function prepActions(state) {
    const info = E.getAbilityInfo(state, 'player');
    const defs = {
      cute: { label: '💗 可爱即是正义', desc: '将 1 张伤害牌转化为护甲牌' },
      meditation: { label: '🍢 烧烤摸 3', desc: '额外摸 3 张牌' },
      withered: { label: '🔄 竭泽换牌', desc: '当前手牌与牌库互换' },
      magicianSkip: { label: '⏭ 跳过摸牌', desc: '跳过摸牌，本回合可出 3 张（不能出凝神）' },
      scavenge: { label: '♻ 开拓拾牌', desc: '跳过摸牌，从弃牌堆拾回 1 张' },
      wolfJudge: { label: '🌕 月嚎判定', desc: '失去 5 点生命，判定两张同牌' },
      sameSorrow: { label: '💞 同殇', desc: state.player.long.sameSorrow ? '关闭反伤' : '开启反伤' },
    };
    return Object.keys(info).filter((k) => info[k] && defs[k]).map((id) => ({ id, ...defs[id] }));
  }

  function startPlayerTurn() {
    const state = app.game;
    if (!state || app.mode === 'lan-guest') return;
    if (state.active !== 'player' || state.phase !== 'prepare') return;
    resetTurnUi();
    const acts = prepActions(state);
    if (acts.length) {
      UI.showPrepPrompt(acts, (id) => useAbility(id, () => autoDrawPlayer()), () => autoDrawPlayer());
    } else {
      setTimeout(autoDrawPlayer, 260);
    }
  }

  function autoDrawPlayer() {
    const state = app.game;
    if (!state || state.active !== 'player' || state.phase !== 'prepare') return;
    if (app.mode === 'lan-guest') { guestSendAction('draw'); return; }
    const r = E.startDraw(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    renderGame(true);
    if (state.phase === 'gameover') { setTimeout(showEnd, 700); return; }
    const line = $('#turn-toast-line');
    if (line) line.textContent = '第 ' + state.round + ' 回合 · 你的回合 · 单击查看 / 双击出牌';
  }

  function startGuestTurn() {
    const state = app.game;
    if (!state || app.mode !== 'lan-guest' || state.active !== 'player' || state.phase !== 'prepare') return;
    const key = state.round + ':' + state.turn + ':' + state.active;
    if (app.guestPrepKey === key) return;
    app.guestPrepKey = key;
    const acts = prepActions(state);
    if (acts.length) {
      UI.showPrepPrompt(
        acts,
        (id) => guestUseAbility(id, () => guestSendAction('draw')),
        () => guestSendAction('draw')
      );
    } else {
      setTimeout(() => {
        if (app.game && app.game === state && app.game.phase === 'prepare' && app.game.active === 'player') {
          guestSendAction('draw');
        }
      }, 450);
    }
  }

  function advanceAfterTurn() {
    const state = app.game;
    if (!state || state.phase !== 'result' || app.mode === 'lan-guest') return;
    const wasSide = state.active;
    resetTurnUi();
    const r = E.nextTurn(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    renderGame(false);
    const line = $('#turn-toast-line');
    if (line) line.textContent = wasSide === 'player' ? '对手回合' : '你的回合';
    if (app.mode === 'solo') {
      if (state.active === 'ai') startAITurn();
      else startPlayerTurn();
    } else if (app.mode === 'lan-host') {
      if (state.active === 'player') startPlayerTurn();
    }
  }

  function startAITurn() {
    const state = app.game;
    if (!state || app.mode !== 'solo' || state.active !== 'ai' || state.phase !== 'prepare') return;
    UI.clearToasts();
    renderGame(false);
    setTimeout(() => {
      if (!app.game || app.mode !== 'solo') return;
      const st = app.game;
      AI.prepare(st);
      if (st.phase === 'gameover') { renderGame(true); setTimeout(showEnd, 700); return; }
      const r = E.startDraw(st);
      renderGame(true);
      if (!r.ok || st.phase === 'gameover') { setTimeout(showEnd, 700); return; }
      setTimeout(() => {
        if (!app.game || app.mode !== 'solo' || st.phase !== 'play') return;
        AI.beforeCards(st);
        renderGame(true);
        if (st.phase === 'gameover') { setTimeout(showEnd, 700); return; }
        setTimeout(aiPlayNext, 620);
      }, 580);
    }, 520);
  }

  function aiPlayNext() {
    const state = app.game;
    if (!state || app.mode !== 'solo' || state.active !== 'ai') return;
    if (state.phase === 'gameover') { setTimeout(showEnd, 700); return; }
    if (state.phase !== 'play') { setTimeout(advanceAfterTurn, 300); return; }
    const limit = E.getPlayLimit(state, 'ai');
    if ((state.ai.temp.playedCards || []).length >= limit) { finishAITurn(); return; }
    const pick = AI.chooseOne(state);
    if (!pick) { finishAITurn(); return; }
    const r = E.playCard(state, 'ai', pick.uid, { choice: pick.choice });
    if (!r.ok) { finishAITurn(); return; }
    renderGame(true);
    if (state.phase === 'gameover') { setTimeout(showEnd, 800); return; }
    if ((state.ai.temp.playedCards || []).length >= limit) { setTimeout(finishAITurn, 850); return; }
    setTimeout(aiPlayNext, 900);
  }

  function finishAITurn() {
    const state = app.game;
    if (!state || app.mode !== 'solo') return;
    if (state.phase === 'play') {
      E.endTurn(state);
      renderGame(true);
    }
    if (state.phase === 'gameover') { setTimeout(showEnd, 700); return; }
    setTimeout(advanceAfterTurn, 360);
  }

  /* ---------------- 基础操作 ---------------- */
  /* ---------------- 基础操作 ---------------- */
  function endPlayerTurn() {
    if (app.tutorial) return;
    const state = app.game;
    if (!state || state.phase !== 'play' || state.active !== 'player') return;
    if (app.mode === 'lan-guest') {
      if (app.guestBusy) return;
      app.guestBusy = true;
      guestSendAction('endTurn');
      return;
    }
    const delayed = state.player.long.delayedCard;
    if (delayed && delayed.delayedAtTurn < state.player.turnsTaken) {
      UI.showDelayedPrompt(
        delayed,
        () => {
          const ar = E.resolveDelayed(state, 'player', true);
          if (!ar.ok) { UI.toast(ar.error, 'error'); return; }
          resetTurnUi();
          renderGame(true);
          if (state.phase === 'gameover') { setTimeout(showEnd, 800); return; }
          doEndPlayerTurn();
        },
        () => {
          const pr = E.resolveDelayed(state, 'player', false);
          if (!pr.ok) { UI.toast(pr.error, 'error'); return; }
          resetTurnUi();
          renderGame(true);
          doEndPlayerTurn();
        }
      );
      return;
    }
    doEndPlayerTurn();
  }

  function doEndPlayerTurn() {
    const state = app.game;
    const r = E.endTurn(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    resetTurnUi();
    renderGame(true);
    if (state.phase === 'gameover') { setTimeout(showEnd, 800); return; }
    setTimeout(advanceAfterTurn, 260);
  }

  function closeInspector() {
    app.inspectUid = null;
    app.lastCardClick = { uid: null, at: 0 };
    UI.hideInspector();
    if (app.game) renderGame(false);
  }

  function inspectOrPlayCard(uid) {
    const state = app.game;
    if (!state) return;
    const card = state.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    const now = Date.now();
    const isDouble = app.lastCardClick.uid === uid || app.inspectUid === uid;
    app.lastCardClick = { uid, at: now };
    if (!isDouble) {
      app.inspectUid = uid;
      UI.showCardInspector(state, uid);
      renderGame(false);
      UI.Sound.play('select');
      return;
    }
    // 双击：尝试打出
    if (state.active !== 'player') { UI.toast('当前是对手回合，请等待对手行动', 'error'); return; }
    if (state.phase !== 'play') {
      UI.toast(state.phase === 'prepare' ? '先进入摸牌阶段，再打出卡牌' : '当前不是出牌阶段', 'error');
      return;
    }
    const info = E.playableInfo(state, state.player, card);
    if (!info.ok) { UI.toast(info.reason, 'error'); UI.Sound.play('click'); return; }
    app.inspectUid = uid;
    UI.showCardInspector(state, uid);
    const modes = E.cardModeOptions(state, state.player, card);
    if (modes.length > 1) {
      showModeModal(card, modes, (mode) => playHandCard(uid, mode));
      return;
    }
    playHandCard(uid, modes.length ? modes[0].id : null);
  }

  function playHandCard(uid, choice) {
    const state = app.game;
    if (!state) return;
    const card = state.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    app.inspectUid = null;
    UI.hideInspector();
    if (app.mode === 'lan-guest') {
      if (app.guestBusy) return;
      app.guestBusy = true;
      guestSendAction('playCard', { uid, choice });
      UI.toast('已发送出牌请求，等待房主结算…');
      renderGame(false);
      return;
    }
    if (app.tutorial) {
      if (app.tutorialCardPlayed) { UI.toast('请先看下一步教程提示', 'error'); return; }
      const expected = tutorialSteps[app.tutorialStep];
      if (expected && card.type !== expected.type) { UI.toast('请按照教程提示打出当前类别的卡牌', 'error'); return; }
      const tr = E.playCard(state, 'player', uid, { choice });
      if (!tr.ok) { UI.toast(tr.error, 'error'); return; }
      app.tutorialCardPlayed = true;
      renderGame(true);
      setTimeout(tutorialAfterCard, 950);
      return;
    }
    const r = E.playCard(state, 'player', uid, { choice });
    if (!r.ok) { UI.toast(r.error, 'error'); app.guestBusy = false; return; }
    renderGame(true);
    if (r.delayed) { UI.toast('【延授】「' + card.name + '」延迟到下回合出牌阶段最后', 'success'); return; }
    if (state.phase === 'gameover') setTimeout(showEnd, 850);
  }

  function showModeModal(card, options, onChoose) {
    const body = options.map((o, i) => `
      <button type="button" class="setup-option" data-mode="${esc(o.id)}">
        <h4>${esc(o.label)}</h4>
        <p>${i === 0 ? '按卡牌原本效果结算。' : '改用职业被动效果结算。'}</p>
      </button>`).join('');
    UI.showModal({
      title: '选择结算方式 · ' + card.name,
      subtitle: '选择后会立即打出并实时结算',
      narrow: true,
      body,
      footer: [{ label: '取消', onClick: () => UI.closeModal() }],
      onMount(root) {
        root.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
          UI.closeModal();
          onChoose(btn.dataset.mode);
        }));
      },
    });
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- 能力 ---------------- */
  function useAbility(id, onDone) {
    if (app.tutorial) { if (onDone) onDone(); return; }
    const state = app.game;
    const done = () => { if (typeof onDone === 'function') onDone(); };
    if (!state) { done(); return; }
    if (state.active !== 'player') { UI.toast('当前是对手回合', 'error'); done(); return; }
    if (state.phase === 'gameover') { done(); return; }
    if (app.mode === 'lan-guest') { guestUseAbility(id, done); return; }
    if (id === 'ultimate') { askUltimate(done); return; }
    if (id === 'viewOpponent') {
      if (!state.ai.hand.length) UI.toast('对方没有手牌');
      else UI.showReveal(state.ai.hand);
      done();
      return;
    }
    if (id === 'divine') {
      if (!state.ai.hand.length) {
        const r = E.useDivine(state, 'player', {});
        if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
        renderGame(true);
        done();
        return;
      }
      UI.confirm({
        title: '命定',
        subtitle: '每局一次 · 弃置全部手牌',
        html: '弃置全部手牌，并选择对方最多 2 张手牌放回其牌库底。对方手牌会持续公开。',
        okLabel: '选择对方手牌',
        danger: true,
        onOk() {
          UI.showMultiCardPicker({
            title: '命定 · 选择对方手牌',
            subtitle: '选择最多 2 张放回牌库底；取消则不选择',
            cards: state.ai.hand.slice(),
            min: 0,
            max: 2,
            confirmLabel: '放回牌库底',
            onConfirm(uids) {
              const r = E.useDivine(state, 'player', { opponentUids: uids });
              if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
              renderGame(true);
              done();
            },
            onCancel() {
              const r = E.useDivine(state, 'player', {});
              if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
              renderGame(true);
              done();
            },
          });
        },
        onCancel: done,
      });
      return;
    }
    if (id === 'cute') {
      const cards = state.player.hand.filter((c) => c.type === 'break' || c.type === 'normal');
      UI.showCardPicker({
        title: '可爱即是正义',
        subtitle: '将 1 张伤害牌转化为等数值护甲牌',
        cards,
        empty: '手中没有伤害牌，无法转化。',
        onPick(card) {
          const r = E.usePrepAbility(state, 'player', 'cute', { uid: card.uid });
          if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
          actionDone(false);
          UI.toast('已转化为 ' + card.value + ' 点护甲牌', 'success');
          done();
        },
        onCancel: done,
      });
      return;
    }
    if (id === 'scavenge') {
      UI.showCardPicker({
        title: '开拓 · 从弃牌堆拾取',
        subtitle: '跳过摸牌阶段，选择 1 张已出过的牌',
        cards: state.player.discard.slice(),
        empty: '弃牌堆还是空的。',
        onPick(card) {
          const r = E.usePrepAbility(state, 'player', 'scavenge', { uid: card.uid });
          if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
          actionDone(false);
          UI.toast('已选择从弃牌堆拾取「' + card.name + '」', 'success');
          done();
        },
        onCancel: done,
      });
      return;
    }
    if (id === 'withered') {
      UI.confirm({
        title: '竭泽',
        dismissable: false,
        html: '将当前手牌与牌库互换。<br><b>手牌 ' + state.player.hand.length + ' 张 / 牌库 ' + state.player.deck.length + ' 张</b><br>每局仅一次。',
        okLabel: '交换',
        onOk() {
          const r = E.usePrepAbility(state, 'player', 'withered');
          if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
          actionDone(false);
          UI.toast('手牌与牌库已互换', 'success');
          done();
        },
        onCancel: done,
      });
      return;
    }
    if (id === 'selfHarm') {
      const cards = state.player.hand.filter((c) => c.type === 'break' || c.type === 'normal');
      UI.showCardPicker({
        title: '新生',
        subtitle: '选择一张攻击卡（不消耗该牌）：受到其数值伤害（可被护盾抵消），回合结束回复等量生命',
        cards,
        empty: '手中没有攻击卡，无法发动【新生】。',
        onPick(card) {
          const r = E.usePrepAbility(state, 'player', 'selfHarm', { uid: card.uid });
          if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
          actionDone(false);
          UI.toast('【新生】已发动：回合结束回复 ' + card.value + ' 点生命', 'success');
          done();
        },
        onCancel: done,
      });
      return;
    }
    const map = { meditation: 'meditation', magicianSkip: 'magicianSkip', wolfJudge: 'wolfJudge', sameSorrow: 'sameSorrow' };
    if (map[id]) {
      const r = E.usePrepAbility(state, 'player', map[id]);
      if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
      actionDone(false);
      if (id === 'meditation') UI.toast('触发【别吵，我在烧烤】：额外摸 3 张牌', 'success');
      if (id === 'magicianSkip') UI.toast(state.player.temp.skipDraw ? '本回合跳过摸牌，可出 3 张牌（不能出凝神）' : '已取消跳过摸牌', 'success');
      if (id === 'wolfJudge') UI.toast(state.player.temp.werewolfJudge ? '摸牌时将进行【月嚎】判定' : '已取消【月嚎】判定', 'success');
      if (id === 'sameSorrow') UI.toast(state.player.long.sameSorrow ? '【同殇】已开启' : '【同殇】已关闭', 'success');
      done();
      return;
    }
    done();
  }

  function applyUltimate(opts, onDone) {
    const state = app.game;
    const done = () => { if (typeof onDone === 'function') onDone(); };
    const r = E.useUltimate(state, 'player', opts || {});
    if (!r.ok) { UI.toast(r.error, 'error'); done(); return; }
    if (state.phase === 'gameover') {
      renderGame(true);
      setTimeout(showEnd, 700);
      done();
      return;
    }
    renderGame(true);
    UI.Sound.play('ult');
    UI.toast('必杀发动：' + state.player.char.ultimateName, 'success');
    if (state.pendingKuaishou) {
      const pending = state.pendingKuaishou;
      UI.showMultiCardPicker({
        title: '神偷 · 对方牌库顶端三张',
        subtitle: '宣言「' + (pending.declared ? (C.TYPE_META[pending.declared] || {}).label || pending.declared : '') + '」 · 选择 0~' + (pending.maxPick == null ? 2 : pending.maxPick) + ' 张；其余加入对方手牌',
        cards: pending.cards.slice(),
        min: 0,
        max: pending.maxPick == null ? 2 : pending.maxPick,
        confirmLabel: '确认选择',
        onConfirm(uids) {
          E.resolveKuaishou(state, uids);
          state.pendingKuaishou = null;
          renderGame(true);
          done();
        },
        onCancel() {
          E.resolveKuaishou(state, []);
          state.pendingKuaishou = null;
          renderGame(true);
          done();
        },
      });
      return;
    }
    done();
  }

  function askUltimate(onDone) {
    const state = app.game;
    if (!state) { if (onDone) onDone(); return; }
    if (state.active !== 'player') { UI.toast('当前是对手回合', 'error'); if (onDone) onDone(); return; }
    if (app.mode === 'lan-guest') { askGuestUltimate(onDone); return; }
    const cls = state.player.char;
    const can = E.canUseUltimate(state, 'player');
    if (!can.ok) { UI.toast(can.reason, 'error'); if (onDone) onDone(); return; }
    const cost = E.getUltimateCost(state, 'player');
    UI.confirm({
      title: '必杀 · ' + cls.ultimateName,
      subtitle: '每局仅限一次',
      html: `<b>效果</b><br>${esc(cls.ultimateText)}<br><br><b>代价</b><br>${esc(cls.ultimateCost)}`,
      okLabel: '发动必杀',
      danger: true,
      onOk() {
        if (state.player.classId === 'kuaishou') {
          UI.showTypeChoice({
            title: '神偷 · 宣言卡牌类型',
            subtitle: '从对方牌库顶端摸 3 张牌',
            onPick(type) { applyUltimate({ declaredType: type }, onDone); },
            onCancel() { if (onDone) onDone(); },
          });
          return;
        }
        if (cost.discard > 0) {
          UI.showMultiCardPicker({
            title: '必杀代价 · 选择弃置的牌',
            subtitle: '请选择 ' + cost.discard + ' 张手牌弃置',
            cards: state.player.hand.slice(),
            min: cost.discard,
            max: cost.discard,
            confirmLabel: '弃置并发动',
            onConfirm(uids) { applyUltimate({ discardUids: uids }, onDone); },
            onCancel() { if (onDone) onDone(); },
          });
          return;
        }
        applyUltimate({}, onDone);
      },
    });
  }

  function askGuestUltimate(onDone) {
    const state = app.game;
    if (!state) return;
    const cls = state.player.char;
    const can = E.canUseUltimate(state, 'player');
    if (!can.ok) { UI.toast(can.reason, 'error'); if (onDone) onDone(); return; }
    const cost = E.getUltimateCost(state, 'player');
    UI.confirm({
      title: '必杀 · ' + cls.ultimateName,
      subtitle: '每局仅限一次 · 由房主端执行',
      html: `<b>效果</b><br>${esc(cls.ultimateText)}<br><br><b>代价</b><br>${esc(cls.ultimateCost)}`,
      okLabel: '发动必杀',
      danger: true,
      onOk() {
        if (state.player.classId === 'kuaishou') {
          UI.showTypeChoice({
            title: '神偷 · 宣言卡牌类型',
            subtitle: '由房主端执行',
            onPick(type) { guestSendAction('ultimate', { declaredType: type }); if (onDone) onDone(); },
            onCancel() { if (onDone) onDone(); },
          });
          return;
        }
        if (cost.discard > 0) {
          UI.showMultiCardPicker({
            title: '必杀代价 · 选择弃置的牌',
            subtitle: '请选择 ' + cost.discard + ' 张手牌弃置',
            cards: state.player.hand.slice(),
            min: cost.discard,
            max: cost.discard,
            confirmLabel: '弃置并发动',
            onConfirm(uids) { guestSendAction('ultimate', { discardUids: uids }); if (onDone) onDone(); },
            onCancel() { if (onDone) onDone(); },
          });
          return;
        }
        guestSendAction('ultimate', {});
        if (onDone) onDone();
      },
    });
  }


  /* ---------------- 新手教程对局 ---------------- */
  const tutorialSteps = [
    {
      card: 'kuaizhan',
      type: 'normal',
      title: '普通攻击卡',
      text: '普通攻击卡会造成普通伤害。双击「快斩」，对敌人造成 5 点伤害。',
      tip: '注意：如果自己回合开始时对方有护盾，本回合普通攻击卡就不能打出。',
    },
    {
      card: 'qingdun',
      type: 'armor',
      title: '护甲卡',
      text: '护甲卡会获得护甲。双击「轻盾」，获得 3 点护甲。护甲可以抵挡破甲伤害，也会让普通伤害完全无效。',
      tip: '普通护甲会在自己的下一个回合开始时消散。',
    },
    {
      card: 'tiaoxi',
      type: 'rest',
      title: '休整卡',
      text: '休整卡可以回复生命或摸牌。双击「调息」，回复 3 点生命。',
      tip: '生命值很重要，合理使用休整卡可以延长对局。',
      playerHp: 24,
    },
    {
      card: 'zhongji',
      type: 'break',
      title: '破甲卡',
      text: '破甲卡专门对付护盾。敌人现在有 3 点护甲，双击「重击」，先打破护甲，再用剩余伤害攻击。',
      tip: '对方没有护盾时，破甲卡不能打出。',
      aiArmor: 3,
      aiHp: 25,
    },
  ];

  function resetTutorialTemp(state) {
    const t = state.player.temp;
    Object.assign(t, {
      skipDraw: false, skipKind: null, scavengeUid: null, werewolfJudge: false,
      cuteUsed: false, selfHarm: 0, newbornValue: 0, playLimitBonus: 0,
      damagePerCard: 0, armorBonus: 0, healBonus: 0, skipPlay: false, freePlayUids: [],
      breakMultiplier: 1, ignoreArmorAll: false, damageReduction: 0,
      armorValues: [], playedCount: 0, playedCards: [], normalDisabled: false,
      wasAttacked: false, ultimate: false,
    });
    state.player.choices = {};
    state.player.selection = [];
    state.player.status.frozenTurn = 0;
  }

  function showTutorialGuide(step) {
    const def = tutorialSteps[step];
    const card = C.CARDS[def.card];
    const catCards = C.CARD_LIST.filter((c) => c.type === def.type);
    UI.showModal({
      title: '新手教程 · 第 ' + (step + 1) + ' / 4 步',
      subtitle: def.title,
      narrow: true,
      dismissable: false,
      body: `<div class="tut-lesson">
        <img src="${card.img}" alt="${esc(card.name)}" />
        <div><p>${esc(def.text)}</p><p class="tut-tip">${esc(def.tip)}</p><p class="tut-action">本类别全部卡牌已置入手中：${catCards.map((c) => '「' + c.name + '」').join('')}</p></div>
      </div>`,
      footer: [{ label: '开始演示', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  }

  function applyTutorialStep(step) {
    const state = app.game;
    if (!state || !app.tutorial) return;
    const def = tutorialSteps[step];
    app.tutorialStep = step;
    state.tutorial = true;
    state.tutorialStep = step;
    state.active = 'player';
    state.phase = 'play';
    state.lastPlay = null;
    state.lastShieldHit = null;
    resetTutorialTemp(state);
    if (def.playerHp != null) state.player.hp = def.playerHp;
    if (def.aiHp != null) state.ai.hp = def.aiHp;
    state.ai.armor = def.aiArmor || 0;
    state.ai.extraArmor = 0;
    state.ai.hand = [];
    state.player.hand = C.CARD_LIST.filter((c) => c.type === def.type).map((c) => E.makeCard(state, c.id));
    state.player.discard = [];
    app.tutorialCardPlayed = false;
    renderGame(false);
    showTutorialGuide(step);
  }

  function tutorialAfterCard() {
    if (!app.tutorial) return;
    const next = app.tutorialStep + 1;
    if (next < tutorialSteps.length) {
      applyTutorialStep(next);
      return;
    }
    UI.showModal({
      title: '教程完成',
      subtitle: '你已经学会了四种基础卡牌',
      body: `<div class="tut-lesson tut-complete"><div><p><b>普通攻击</b>：无盾时造成伤害。</p><p><b>护甲</b>：抵挡破甲、让普通伤害无效，下回合开始消散。</p><p><b>休整</b>：回复生命或摸牌。</p><p><b>破甲</b>：先打护盾，再扣剩余生命。</p><p class="tut-tip">正式对局中，回合开始会自动摸牌，准备能力会弹窗询问；单击查看、双击出牌。</p></div></div>`,
      footer: [{ label: '返回首页', variant: 'primary', onClick: () => { UI.closeModal(); showHome(); } }],
      dismissable: false,
    });
  }

  function startTutorialGame() {
    stopLan();
    UI.closeModal();
    UI.clearToasts();
    const state = E.createGame({ playerClass: 'fanren', aiClass: 'fanren' });
    const r = E.startGame(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    state.tutorial = true;
    state.tutorialStep = 0;
    state.ai.hand = [];
    state.ai.armor = 0;
    state.ai.extraArmor = 0;
    state.player.hand = [];
    state.player.discard = [];
    state.player.armor = 0;
    state.player.extraArmor = 0;
    state.player.hp = state.player.maxHp;
    state.ai.hp = state.ai.maxHp;
    app.mode = 'tutorial';
    app.tutorial = true;
    app.tutorialStep = 0;
    app.tutorialCardPlayed = false;
    app.game = state;
    app.inspectUid = null;
    app.lastCardClick = { uid: null, at: 0 };
    UI.resetVisualState();
    showScreen('game');
    renderGame(false);
    applyTutorialStep(0);
  }

  /* ---------------- 局域网联机 ---------------- */
  function stopLan() {
    if (app.lan) {
      try { app.lan.stop(); } catch (e) { /* ignore */ }
    }
    app.lan = null;
    app.lanRole = null;
    app.lanClass = null;
    app.lanSetup = null;
    app.lanRoomCode = null;
    app.lanStarting = false;
    app.lanSnapshotId = 0;
    app.guestSnapshotId = 0;
    app.guestResultKey = null;
    app.guestResultOpen = false;
    app.guestRevealKey = null;
    app.guestBusy = false;
    app.guestPrepKey = null;
    app.hostSendQueue = Promise.resolve();
    app.guestSendQueue = Promise.resolve();
    app.mode = app.screen === 'game' ? app.mode : 'solo';
  }

  function lanAvailable() {
    return (location.protocol === 'http:' || location.protocol === 'https:') && !!LAN;
  }

  function showLanUnavailable(reason) {
    const url = location.protocol === 'file:' ? '（当前是 file:// 本地文件）' : location.origin;
    UI.showModal({
      title: '局域网联机不可用',
      subtitle: '需要先启动本地服务器',
      body: `
        <p class="setup-lead">${esc(reason || '当前页面不是通过局域网服务器打开的。')}</p>
        <div class="rule-note" style="line-height:1.9">
          1. 在电脑上双击 <b>手机访问-局域网服务器.bat</b>（或运行 <code>python serve.py</code>）。<br />
          2. 两台设备连接同一个 Wi-Fi，用终端显示的地址打开游戏：<br />
          <b>${esc(url)}</b><br />
          3. 两台设备都进入首页后，点击 <b>局域网联机</b>，一人创建房间，另一人输入房间码加入。<br />
          4. 本功能需要 Python 服务器提供房间中继；GitHub Pages 等纯静态托管没有这个接口。
        </div>`,
      footer: [{ label: '知道了', variant: 'primary', onClick: () => UI.closeModal() }],
    });
  }

  function openLanModal() {
    if (!lanAvailable()) {
      showLanUnavailable(location.protocol === 'file:' ? '当前是直接打开的本地文件，无法联机。' : '联机模块未加载。');
      return;
    }
    UI.showModal({
      title: '局域网联机',
      subtitle: '检测服务器…',
      narrow: true,
      body: '<div class="setup-lead">正在检测房间中继服务，请稍候…</div>',
      footer: [],
      dismissable: true,
    });
    fetch('/api/lan/health').then((r) => r.json()).then((data) => {
      if (!data || !data.ok) throw new Error('联机服务异常');
      showLanChooser();
    }).catch(() => {
      showLanUnavailable('没有检测到联机服务。请确认页面是通过电脑上的本地服务器打开的，而不是 GitHub Pages 或 file://。');
    });
  }

  function showLanChooser() {
    const cls = C.CLASSES[app.selectedClass];
    UI.showModal({
      title: '局域网联机',
      subtitle: '两台设备 · 同一个 Wi-Fi · 同一个网址',
      body: `
        <p class="setup-lead">当前选择职业：<b>${esc(cls.name)}</b>（可关闭后回首页更换）<br />
        房主创建房间后会得到一个房间码；另一位玩家输入房间码加入。房主浏览器需要保持打开。</p>
        <button type="button" class="setup-option" data-lan-action="create">
          <h4>🏠 创建房间（我当房主）</h4>
          <p>生成房间码，等待另一位玩家加入。房主负责结算，另一位玩家操作自己的手牌。</p>
        </button>
        <button type="button" class="setup-option" data-lan-action="join">
          <h4>🔑 加入房间</h4>
          <p>输入房主屏幕上的房间码，加入后等待房主开始。</p>
        </button>`,
      footer: [{ label: '取消', onClick: () => UI.closeModal() }],
      onMount(root) {
        root.querySelectorAll('[data-lan-action]').forEach((btn) => btn.addEventListener('click', () => {
          UI.Sound.play('click');
          if (btn.dataset.lanAction === 'create') lanCreateFlow();
          else lanJoinFlow();
        }));
      },
    });
  }

  function chooseLanSetup(classId, cb) {
    if (classId !== 'nvwu' && classId !== 'langren') { cb(null); return; }
    if (classId === 'nvwu') {
      const cats = C.POISON_CATEGORIES || [];
      UI.showModal({
        title: '战前准备 · 毒咒',
        subtitle: '选择一种卡牌类别投毒（对手摸到该类牌时受到 1 点真实伤害）',
        body: `<div class="setup-cards">${cats.map((cat) => `
          <button type="button" class="setup-card" data-lan-poison="${cat.id}">
            <b>${esc(cat.name)}</b>
          </button>`).join('')}</div>`,
        footer: [{ label: '取消', onClick: () => UI.closeModal() }],
        onMount(root) {
          root.querySelectorAll('[data-lan-poison]').forEach((btn) => btn.addEventListener('click', () => {
            UI.closeModal();
            cb({ type: 'poison', value: btn.dataset.lanPoison });
          }));
        },
      });
      return;
    }
    UI.showModal({
      title: '战前准备 · 月嚎',
      subtitle: '整局选择一种月嚎模式',
      body: `
        <button type="button" class="setup-option" data-lan-wolf="A">
          <h4>① 血月 · 狂暴</h4><p>血量小于等于 8 时，造成的所有伤害 +1。</p>
        </button>
        <button type="button" class="setup-option" data-lan-wolf="B">
          <h4>② 月嚎 · 赌命</h4><p>每次摸牌前可失去 5 点生命进行判定；摸到两张相同的牌则造成 15 真伤并进入狼化。</p>
        </button>`,
      footer: [{ label: '取消', onClick: () => UI.closeModal() }],
      onMount(root) {
        root.querySelectorAll('[data-lan-wolf]').forEach((btn) => btn.addEventListener('click', () => {
          UI.closeModal();
          cb({ type: 'wolf', value: btn.dataset.lanWolf });
        }));
      },
    });
  }

  function setupLanClient() {
    if (app.lan && app.lan.running) app.lan.stop();
    app.lan = new LAN.LanClient();
    app.lan.onMessage = onLanMessage;
    app.lan.onError = onLanError;
    app.lanErrorNotified = false;
    app.hostSendQueue = Promise.resolve();
    app.guestSendQueue = Promise.resolve();
    app.lanSnapshotId = 0;
    app.guestSnapshotId = 0;
    return app.lan;
  }

  function lanErrorText(err) {
    return err && err.message ? err.message : '网络连接失败';
  }

  function onLanError(err) {
    if (!app.lanErrorNotified) {
      app.lanErrorNotified = true;
      UI.toast('联机连接异常：' + lanErrorText(err), 'error');
    }
  }

  function lanCreateFlow() {
    UI.closeModal();
    chooseLanSetup(app.selectedClass, (setup) => {
      app.lanRole = 'host';
      app.lanClass = app.selectedClass;
      app.lanSetup = setup;
      const client = setupLanClient();
      client.createRoom(app.lanClass, setup).then((r) => {
        app.lanRoomCode = r.room;
        showLanWaiting('host', r.room);
      }).catch((e) => {
        stopLan();
        UI.toast('创建房间失败：' + lanErrorText(e), 'error');
        showLanChooser();
      });
    });
  }

  function lanJoinFlow() {
    UI.closeModal();
    UI.showModal({
      title: '加入局域网房间',
      subtitle: '输入房主屏幕上的房间码',
      narrow: true,
      body: `
        <div class="lan-field">
          <label for="lan-room-input">房间码</label>
          <input id="lan-room-input" maxlength="5" autocomplete="off" placeholder="例如 ABCDE" />
        </div>
        <p class="setup-lead" style="margin-top:12px">房间码不区分大小写。加入后还需要选择你的职业并点击开始。</p>`,
      footer: [
        { label: '取消', onClick: () => UI.closeModal() },
        { label: '加入', variant: 'primary', onClick: () => {
          const input = document.querySelector('#lan-room-input');
          const code = (input ? input.value : '').toUpperCase().trim();
          if (code.length < 4) { UI.toast('请输入正确的房间码', 'error'); return; }
          UI.closeModal();
          chooseLanSetup(app.selectedClass, (setup) => {
            app.lanRole = 'guest';
            app.lanClass = app.selectedClass;
            app.lanSetup = setup;
            const client = setupLanClient();
            client.joinRoom(code, app.lanClass, setup).then((r) => {
              app.lanRoomCode = r.room;
              showLanWaiting('guest', r.room);
            }).catch((e) => {
              stopLan();
              UI.toast('加入失败：' + lanErrorText(e), 'error');
              showLanChooser();
            });
          });
        } },
      ],
      onMount(root) {
        const input = root.querySelector('#lan-room-input');
        if (input) { input.focus(); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = root.querySelector('[data-mbtn="1"]'); if (b) b.click(); } }); }
      },
    });
  }

  function showLanWaiting(role, room) {
    const host = role === 'host';
    const url = location.origin + location.pathname;
    UI.showModal({
      title: host ? '房间已创建' : '已加入房间',
      subtitle: host ? '等待另一位玩家加入' : '等待房主开始',
      body: `
        <div class="lan-room-box">
          <span>房间码</span>
          <b id="lan-room-code">${esc(room)}</b>
          <button type="button" class="modal-btn" id="lan-copy-code">复制</button>
        </div>
        <p class="setup-lead" style="margin-top:14px">
          ${host
    ? `让另一位玩家在同一个 Wi-Fi 下打开 <b>${esc(url)}</b>，点击「局域网联机 → 加入房间」，输入上面的房间码。`
    : '房主开始对局后，本页面会自动进入游戏。请保持本页面打开。'}
        </p>
        <p class="lan-waiting"><span class="lan-pulse"></span>${host ? '等待玩家加入…' : '等待房主开始对局…'}</p>`,
      footer: [{ label: '取消联机', onClick: lanAbort }],
      dismissable: false,
      onMount(root) {
        const copy = root.querySelector('#lan-copy-code');
        if (copy) copy.addEventListener('click', () => {
          const text = room;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => UI.toast('房间码已复制', 'success')).catch(() => UI.toast('房间码：' + text));
          } else {
            UI.toast('房间码：' + text);
          }
        });
      },
    });
  }

  function lanAbort() {
    stopLan();
    UI.closeModal();
    showScreen('home');
    UI.toast('已取消联机');
  }

  function onLanMessage(msg) {
    if (!msg || !app.lan) return;
    if (app.lan.role === 'host') {
      if (msg.type === 'guestJoined') startHostGame(msg.payload || {});
      else if (msg.type === 'action') handleGuestAction(msg.payload || {});
    } else if (app.lan.role === 'guest') {
      if (msg.type === 'state') applyGuestSnapshot(msg.payload);
      else if (msg.type === 'viewHand') UI.showReveal((msg.payload && msg.payload.cards) || []);
      else if (msg.type === 'error') UI.toast((msg.payload && msg.payload.message) || '房主拒绝了操作', 'error');
    }
  }

  function startHostGame(payload) {
    if (app.mode === 'lan-host' || app.lanStarting) return;
    app.lanStarting = true;
    const guestClass = C.CLASSES[payload.classId] ? payload.classId : 'fanren';
    const guestSetup = payload.setup || null;
    const hostClass = app.lanClass || app.selectedClass;
    const state = E.createGame({ playerClass: hostClass, aiClass: guestClass, controllers: {}, ultimatesEnabled: app.ultimatesEnabled });
    state.mode = 'lan-host';
    // 房主自己的开局选择
    if (hostClass === 'nvwu') {
      const value = app.lanSetup && app.lanSetup.type === 'poison' ? app.lanSetup.value : C.POISON_CATEGORIES[0].id;
      E.chooseSetup(state, 'poison', value);
    }
    if (hostClass === 'langren') {
      const value = app.lanSetup && app.lanSetup.type === 'wolf' ? app.lanSetup.value : 'A';
      E.chooseSetup(state, 'wolf', value);
    }
    // 加入者的开局选择由房主写入
    if (guestClass === 'nvwu') {
      state.ai.long.poisonType = guestSetup && guestSetup.type === 'poison' ? guestSetup.value : C.POISON_CATEGORIES[0].id;
    }
    if (guestClass === 'langren') {
      state.ai.long.wolfMode = guestSetup && guestSetup.type === 'wolf' ? guestSetup.value : 'A';
    }
    state.setupNeeded = [];
    const r = E.startGame(state);
    if (!r.ok) {
      UI.toast('联机开局失败：' + r.error, 'error');
      app.lanStarting = false;
      return;
    }
    UI.closeModal();
    app.mode = 'lan-host';
    app.game = state;
    app.logCount = state.log.length;
    app.inspectUid = null;
    app.lastCardClick = { uid: null, at: 0 };
    UI.resetVisualState();
    showScreen('game');
    renderGame(false);
    UI.clearToasts();
    UI.toast('联机对局开始！你先手。', 'success');
    startPlayerTurn();
  }

  function sendHostSnapshot() {
    if (!app.lan || app.mode !== 'lan-host' || !app.game) return;
    app.lanSnapshotId += 1;
    const view = LAN.buildGuestView(app.game);
    if (!view) return;
    view.snapshotId = app.lanSnapshotId;
    const serialized = view;
    app.hostSendQueue = app.hostSendQueue.then(() => app.lan.send('state', serialized)).catch(() => {});
  }

  function sendGuestError(message) {
    if (app.lan && app.lan.role === 'host') app.lan.send('error', { message });
  }

  function handleGuestAction(action) {
    const state = app.game;
    if (!state || app.mode !== 'lan-host') return;
    let result = { ok: true };
    if (action.kind === 'surrender') {
      E.concede(state, 'ai');
    } else if (action.kind === 'viewOpponent') {
      if (app.lan) {
        const cards = state.player.hand.map((c) => ({ uid: c.uid, id: c.id, name: c.name, type: c.type, value: c.value, img: c.img, desc: c.desc }));
        app.lan.send('viewHand', { cards });
      }
      return;
    } else if (state.active !== 'ai') {
      sendGuestError('现在不是你的回合');
      return;
    } else if (action.kind === 'draw') {
      result = E.startDraw(state);
    } else if (action.kind === 'playCard') {
      result = E.playCard(state, 'ai', action.uid, { choice: action.choice });
    } else if (action.kind === 'endTurn' || action.kind === 'commit') {
      result = E.endTurn(state);
    } else if (action.kind === 'prepAbility') {
      result = E.usePrepAbility(state, 'ai', action.ability, action.payload || {});
    } else if (action.kind === 'divine') {
      result = E.useDivine(state, 'ai', { opponentUids: action.opponentUids });
    } else if (action.kind === 'ultimate') {
      result = E.useUltimate(state, 'ai', {
        discardUids: action.discardUids,
        opponentUids: action.opponentUids,
        declaredType: action.declaredType,
      });
    } else {
      sendGuestError('未知操作');
      return;
    }
    if (result && !result.ok) {
      sendGuestError(result.error || result.reason || '操作失败');
      renderGame(false);
      return;
    }
    renderGame(true);
    if (state.phase === 'gameover') setTimeout(() => showEnd(), 800);
    else if (state.phase === 'result') setTimeout(advanceAfterTurn, 350);
  }

  function applyGuestSnapshot(view) {
    if (!view) return;
    if (view.snapshotId && view.snapshotId <= app.guestSnapshotId) return;
    app.guestSnapshotId = view.snapshotId || app.guestSnapshotId;
    const prevActive = app.game ? app.game.active : null;
    const firstGame = !app.game || app.screen !== 'game';
    app.mode = 'lan-guest';
    app.game = view;
    if (firstGame) {
      showScreen('game');
      app.inspectUid = null;
      app.lastCardClick = { uid: null, at: 0 };
      app.guestPrepKey = null;
      UI.resetVisualState();
      UI.closeModal();
    }
    if (app.inspectUid && !view.player.hand.some((c) => c.uid === app.inspectUid)) {
      app.inspectUid = null;
      UI.hideInspector();
    }
    if (prevActive !== view.active) {
      app.inspectUid = null;
      app.lastCardClick = { uid: null, at: 0 };
      app.guestPrepKey = null;
      UI.hideInspector();
    }
    app.guestBusy = false;
    UI.clearToasts();
    renderGame(false);
    if (view.phase === 'gameover') {
      setTimeout(() => {
        if (app.game === view) UI.showResult(view, { onRestart: restartGame, onHome: showHome }, { lanGame: true });
      }, 850);
      return;
    }
    if (view.phase === 'prepare' && view.active === 'player') {
      startGuestTurn();
      return;
    }
    if (prevActive !== view.active && view.active === 'player') UI.toast('轮到你的回合', 'success');
    else if (prevActive !== view.active && view.active === 'ai') UI.toast('对手回合', 'success');
  }

  function guestSendAction(kind, data) {
    if (!app.lan || app.lan.role !== 'guest') return;
    const action = LAN.action(kind, data);
    app.guestSendQueue = app.guestSendQueue.then(() => app.lan.send('action', action)).catch(() => {});
  }

  function guestUseAbility(id, onDone) {
    const state = app.game;
    const done = () => { if (typeof onDone === 'function') onDone(); };
    if (!state) { done(); return; }
    if (id === 'ultimate') { askGuestUltimate(done); return; }
    if (id === 'viewOpponent') {
      guestSendAction('viewOpponent');
      done();
      return;
    }
    if (id === 'divine') {
      UI.confirm({
        title: '命定',
        subtitle: '每局一次 · 弃置全部手牌',
        html: '弃置全部手牌，由房主端将对方最多 2 张手牌放回牌库底。对方手牌会持续公开。',
        okLabel: '发动命定',
        danger: true,
        onOk() { guestSendAction('divine'); done(); },
        onCancel: done,
      });
      return;
    }
    if (id === 'cute') {
      const cards = state.player.hand.filter((c) => c.type === 'break' || c.type === 'normal');
      UI.showCardPicker({
        title: '可爱即是正义',
        subtitle: '选择 1 张伤害牌转化为护甲牌',
        cards,
        empty: '手中没有伤害牌。',
        onPick(card) { guestSendAction('prepAbility', { ability: 'cute', payload: { uid: card.uid } }); UI.toast('已发送转化请求…'); done(); },
        onCancel: done,
      });
      return;
    }
    if (id === 'scavenge') {
      UI.showCardPicker({
        title: '开拓 · 从弃牌堆拾取',
        subtitle: '选择 1 张已出过的牌',
        cards: state.player.discard.slice(),
        empty: '弃牌堆还是空的。',
        onPick(card) { guestSendAction('prepAbility', { ability: 'scavenge', payload: { uid: card.uid } }); UI.toast('已发送开拓…'); done(); },
        onCancel: done,
      });
      return;
    }
    if (id === 'withered') {
      UI.confirm({
        title: '竭泽',
        dismissable: false,
        html: '请求房主执行手牌与牌库互换。',
        okLabel: '交换',
        onOk() { guestSendAction('prepAbility', { ability: 'withered' }); UI.toast('已发送竭泽请求…'); done(); },
        onCancel: done,
      });
      return;
    }
    if (id === 'selfHarm') {
      const cards = state.player.hand.filter((c) => c.type === 'break' || c.type === 'normal');
      UI.showCardPicker({
        title: '新生',
        subtitle: '选择一张攻击卡（不消耗）：受到其数值伤害（可被护盾抵消），回合结束回复等量生命',
        cards,
        empty: '手中没有攻击卡。',
        onPick(card) {
          guestSendAction('prepAbility', { ability: 'selfHarm', payload: { uid: card.uid } });
          UI.toast('已发送【新生】…');
          done();
        },
        onCancel: done,
      });
      return;
    }
    const map = { meditation: 'meditation', magicianSkip: 'magicianSkip', wolfJudge: 'wolfJudge', sameSorrow: 'sameSorrow' };
    if (map[id]) {
      guestSendAction('prepAbility', { ability: map[id] });
      UI.toast('已发送操作，等待房主同步…');
      done();
      return;
    }
    done();
  }

  function applyUltimateSetting(silent) {
    const el = document.getElementById('ultimate-state');
    if (el) el.textContent = app.ultimatesEnabled ? '必杀：启用' : '必杀：关闭';
    UI.ultimatesEnabled = app.ultimatesEnabled;
    try { localStorage.setItem('dd_ultimates', app.ultimatesEnabled ? '1' : '0'); } catch (e) { /* private mode */ }
    if (app.screen === 'home') UI.updateHomeSelection(app.selectedClass);
    if (!silent) {
      UI.toast(app.ultimatesEnabled ? '隐藏开关：必杀技已启用' : '隐藏开关：必杀技已关闭', app.ultimatesEnabled ? 'success' : '');
      UI.Sound.play(app.ultimatesEnabled ? 'ult' : 'deselect');
    }
  }

  function toggleUltimates() {
    app.ultimatesEnabled = !app.ultimatesEnabled;
    applyUltimateSetting(false);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 首页
    $('#class-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.class-card');
      if (!btn) return;
      const classId = btn.dataset.classId;
      app.selectedClass = classId;
      UI.updateHomeSelection(app.selectedClass);
      UI.Sound.play('click');
      // 隐藏开关：连续点击预言家 5 次，切换必杀技启用状态
      if (classId === 'yuyanjia') {
        const now = Date.now();
        if (now - app.ultClickAt > 900) app.ultClickCount = 0;
        app.ultClickAt = now;
        app.ultClickCount += 1;
        if (app.ultClickCount >= 5) {
          app.ultClickCount = 0;
          toggleUltimates();
        }
      } else {
        app.ultClickCount = 0;
      }
    });
    $('#btn-random-class').addEventListener('click', () => {
      const pool = C.CLASS_LIST.filter((c) => c.id !== app.selectedClass);
      app.selectedClass = pool[Math.floor(Math.random() * pool.length)].id;
      UI.updateHomeSelection(app.selectedClass);
      UI.Sound.play('select');
      UI.toast('随机职业：' + C.CLASSES[app.selectedClass].name, 'success');
    });
    $('#btn-start').addEventListener('click', launchGame);
    $('#btn-lan').addEventListener('click', openLanModal);
    $('#btn-jump-classes').addEventListener('click', () => {
      const panel = document.querySelector('.picker-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      UI.Sound.play('click');
    });
    $('#btn-tutorial').addEventListener('click', () => UI.showTutorial(startTutorialGame));
    $('#btn-rules-home').addEventListener('click', UI.showRules);
    $('#btn-rules-game').addEventListener('click', UI.showRules);
    $('#btn-sound').addEventListener('click', toggleSound);
    $('#btn-sound-game').addEventListener('click', toggleSound);
    window.addEventListener('pointerdown', () => UI.ensureAudio(), { once: true });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (UI.modal && UI.modal.opts && UI.modal.opts.dismissable === false) return;
      UI.closeModal();
    });

    // 对局
    $('#turn-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      UI.Sound.play('click');
      if (btn.dataset.action === 'commit') endPlayerTurn();
    });
    $('#hand').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      inspectOrPlayCard(card.dataset.uid);
    });
    $('#btn-clear-select').addEventListener('click', closeInspector);
    $('#btn-commit').addEventListener('click', () => { UI.Sound.play('click'); endPlayerTurn(); });
    $('#ability-bar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ability]');
      if (!btn || btn.disabled) return;
      UI.Sound.play('click');
      useAbility(btn.dataset.ability);
    });
    $('#btn-surrender').addEventListener('click', () => {
      if (!app.game || app.game.phase === 'gameover') return;
      UI.confirm({
        title: '认输',
        text: '确定要放弃本局吗？',
        okLabel: '认输',
        danger: true,
        onOk() {
          if (app.mode === 'lan-guest') {
            guestSendAction('surrender');
            UI.toast('已发送认输请求');
            return;
          }
          E.concede(app.game);
          renderGame(false);
          showEnd();
        },
      });
    });
  }

  function toggleSound() {
    UI.Sound.setEnabled(!UI.soundEnabled);
    UI.setSoundUI();
    UI.toast(UI.soundEnabled ? '音效已开启' : '音效已关闭');
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    applyUltimateSetting(true);
    UI.renderHome(app.selectedClass);
    UI.setSoundUI();
    bind();
    // 首次提示
    let seen = null;
    try { seen = localStorage.getItem('dd_seen_intro'); localStorage.setItem('dd_seen_intro', '1'); } catch (e) { /* private mode */ }
    if (!seen) {
      setTimeout(() => UI.toast('选择职业 → 开始对局。回合开始自动摸牌；单击查看、双击出牌，每张牌立即结算。'), 700);
    }
    // 公告：优先读取 assets/inform/in.txt；file:// 直接打开时 fetch 会被浏览器拦截，
    // 因此提供一份与当前 in.txt 一致的兜底文本，保证双击 index.html 也能看到公告。
    const fallbackAnnouncement = '新增角色\n增加动画\n修改了一部分角色\n\n求赞助喵....';
    const showAnnouncementFallback = () => setTimeout(() => UI.showAnnouncement(fallbackAnnouncement), 420);
    fetch('assets/inform/in.txt', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('no announcement file'))))
      .then((text) => {
        if (text.trim()) setTimeout(() => UI.showAnnouncement(text), 420);
        else showAnnouncementFallback();
      })
      .catch(showAnnouncementFallback);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
