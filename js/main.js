/* 我的刀盾 · 修正版 — 应用入口与交互 */
(function () {
  'use strict';
  const E = window.DD_ENGINE;
  const C = window.DD_CONFIG;
  const AI = window.DD_AI;
  const UI = window.UI;
  const $ = (sel) => document.querySelector(sel);

  const app = {
    screen: 'home',
    selectedClass: Math.floor(Math.random() * C.CLASS_LIST.length),
    game: null,
    logCount: 0,
    lastActionAt: 0,
  };
  app.selectedClass = C.CLASS_LIST[app.selectedClass].id;

  /* ---------------- 页面切换 ---------------- */
  function showScreen(name) {
    app.screen = name;
    $('#screen-home').classList.toggle('hidden', name !== 'home');
    $('#screen-game').classList.toggle('hidden', name !== 'game');
    if (name === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showHome() {
    UI.closeModal();
    app.game = null;
    showScreen('home');
    UI.renderHome(app.selectedClass);
    UI.setSoundUI();
  }

  /* ---------------- 开始 / 重开 ---------------- */
  function launchGame() {
    UI.ensureAudio();
    UI.clearToasts();
    const state = E.createGame({ playerClass: app.selectedClass, controllers: { ai: AI } });
    app.game = state;
    app.logCount = state.log.length;
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
    renderGame(false);
    UI.clearToasts();
    const ch = state.player.long.poisonType;
    if (ch) UI.toast('你的毒咒：对手摸到「' + C.CARDS[ch].name + '」时受到 1 点真实伤害', 'success');
  }

  function restartGame() {
    UI.closeModal();
    launchGame();
  }

  /* ---------------- 渲染 ---------------- */
  function renderGame(animate) {
    const state = app.game;
    if (!state) return;
    const old = app.logCount;
    UI.renderGame(state, { preserveScroll: true, animateLogs: false });
    if (animate) UI.handleNewLogs(state, old);
    app.logCount = state.log.length;
  }

  function actionDone(animate) {
    if (!app.game) return;
    renderGame(animate !== false);
    if (app.game.phase === 'gameover') {
      setTimeout(() => showEnd(), 260);
    }
  }

  function resultHandlers() {
    return {
      onNext: () => {
        const state = app.game;
        if (!state || state.phase !== 'result') return;
        const r = E.nextRound(state);
        if (!r.ok) { UI.toast(r.error, 'error'); return; }
        UI.clearToasts();
        renderGame(false);
        UI.toast('第 ' + state.round + ' 回合 · 准备阶段', 'success');
        $('#battle-feed') && ($('#battle-feed').scrollTop = $('#battle-feed').scrollHeight);
      },
      onRestart: restartGame,
      onHome: showHome,
    };
  }

  function showResultNow() {
    const state = app.game;
    if (!state) return;
    UI.showResult(state, resultHandlers());
  }

  function showEnd() {
    const state = app.game;
    if (!state || state.phase !== 'gameover') return;
    UI.showResult(state, resultHandlers());
  }

  /* ---------------- 基础操作 ---------------- */
  function enterDraw() {
    const state = app.game;
    if (!state || state.phase !== 'prepare') return;
    const r = E.startDraw(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    if (state.phase === 'gameover') { renderGame(true); showEnd(); return; }
    renderGame(true);
    UI.clearToasts();
    UI.Sound.play('draw');
    if (state.revealedCard && state.revealedCard.viewer === 'player') {
      const rc = state.revealedCard.card;
      UI.toast('【前瞻】对手手牌：' + rc.name, 'success');
    }
    const handCount = state.player.hand.length;
    setTimeout(() => {
      UI.clearToasts();
      UI.toast('摸牌完成，手牌 ' + handCount + ' 张。选择至多 ' + E.getPlayLimit(state, 'player') + ' 张牌。');
    }, 120);
  }

  function commitTurn() {
    const state = app.game;
    if (!state || state.phase !== 'play') return;
    const r = E.commitTurn(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    UI.clearToasts();
    renderGame(true);
    setTimeout(() => showResultNow(), 260);
  }

  function clearSelection() {
    const state = app.game;
    if (!state) return;
    state.player.selection.slice().forEach((uid) => E.deselectCard(state, 'player', uid));
    renderGame(false);
    UI.Sound.play('deselect');
  }

  function selectHandCard(uid) {
    const state = app.game;
    if (!state) return;
    if (state.phase !== 'play') {
      const msg = state.phase === 'prepare' ? '先进入摸牌阶段，再选择手牌' : '当前不是出牌阶段';
      UI.toast(msg, 'error');
      return;
    }
    const card = state.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    if (state.player.selection.indexOf(uid) >= 0) {
      E.deselectCard(state, 'player', uid);
      renderGame(false);
      UI.Sound.play('deselect');
      return;
    }
    const r = E.selectCard(state, 'player', uid);
    if (!r.ok) { UI.toast(r.error, 'error'); UI.Sound.play('click'); return; }
    renderGame(false);
    UI.Sound.play('select');
    if (r.options && r.options.length > 1) showModeModal(card, r.options);
  }

  function showModeModal(card, options) {
    const state = app.game;
    const body = options.map((o, i) => `
      <button type="button" class="setup-option" data-mode="${esc(o.id)}">
        <h4>${esc(o.label)}</h4>
        <p>${i === 0 ? '按卡牌原本效果结算。' : '改用职业被动效果结算。'}</p>
      </button>`).join('');
    UI.showModal({
      title: '选择结算方式 · ' + card.name,
      subtitle: card.desc,
      narrow: true,
      body,
      footer: [{ label: '保持默认', onClick: () => UI.closeModal() }],
      onMount(root) {
        root.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
          const r = E.setCardChoice(state, 'player', card.uid, btn.dataset.mode);
          if (!r.ok) { UI.toast(r.error, 'error'); return; }
          UI.closeModal();
          renderGame(false);
          UI.toast('已选择：' + (options.find((o) => o.id === btn.dataset.mode) || {}).label, 'success');
        }));
      },
    });
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- 能力 ---------------- */
  function useAbility(id) {
    const state = app.game;
    if (!state) return;
    if (state.phase === 'gameover') return;
    if (id === 'ultimate') { askUltimate(); return; }
    if (id === 'cute') {
      const cards = state.player.hand.filter((c) => c.type === 'break' || c.type === 'normal');
      UI.showCardPicker({
        title: '可爱即是正义',
        subtitle: '将 1 张伤害牌转化为等数值护甲牌',
        cards,
        empty: '手中没有伤害牌，无法转化。',
        onPick(card) {
          const r = E.usePrepAbility(state, 'player', 'cute', { uid: card.uid });
          if (!r.ok) { UI.toast(r.error, 'error'); return; }
          actionDone(false);
          UI.toast('已转化为 ' + card.value + ' 点护甲牌', 'success');
        },
      });
      return;
    }
    if (id === 'destiny') {
      UI.showTypePicker({
        title: '命定 · 指定对手下一张牌',
        subtitle: '若对手牌库中已无该牌，则对手跳过本次摸牌（每局一次）',
        onPick(cardId) {
          const r = E.usePrepAbility(state, 'player', 'destiny', { cardId });
          if (!r.ok) { UI.toast(r.error, 'error'); return; }
          actionDone(false);
          UI.toast('已命定：' + C.CARDS[cardId].name, 'success');
        },
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
          if (!r.ok) { UI.toast(r.error, 'error'); return; }
          actionDone(false);
          UI.toast('已选择从弃牌堆拾取「' + card.name + '」，进入摸牌阶段时生效', 'success');
        },
      });
      return;
    }
    if (id === 'withered') {
      UI.confirm({
        title: '竭泽',
        html: '将当前手牌与牌库互换。<br><b>手牌 ' + state.player.hand.length + ' 张 / 牌库 ' + state.player.deck.length + ' 张</b><br>每局仅一次。',
        okLabel: '交换',
        onOk() {
          const r = E.usePrepAbility(state, 'player', 'withered');
          if (!r.ok) { UI.toast(r.error, 'error'); return; }
          actionDone(false);
          UI.toast('手牌与牌库已互换', 'success');
        },
      });
      return;
    }
    if (id === 'selfHarm') {
      const r = E.usePrepAbility(state, 'player', 'selfHarm');
      if (!r.ok) { UI.toast(r.error, 'error'); return; }
      actionDone(false);
      return;
    }
    const map = { meditation: 'meditation', magicianSkip: 'magicianSkip', wolfJudge: 'wolfJudge', sameSorrow: 'sameSorrow' };
    if (map[id]) {
      const r = E.usePrepAbility(state, 'player', map[id]);
      if (!r.ok) { UI.toast(r.error, 'error'); return; }
      actionDone(false);
      if (id === 'meditation') UI.toast('触发【别吵，我在烧烤】：额外摸 3 张牌', 'success');
      if (id === 'magicianSkip') UI.toast(state.player.temp.skipDraw ? '本回合跳过摸牌，可出 3 张牌（不能出凝神）' : '已取消跳过摸牌', 'success');
      if (id === 'wolfJudge') UI.toast(state.player.temp.werewolfJudge ? '摸牌时将进行【月嚎】判定' : '已取消【月嚎】判定', 'success');
      if (id === 'sameSorrow') UI.toast(state.player.long.sameSorrow ? '【同殇】已开启' : '【同殇】已关闭', 'success');
      return;
    }
  }

  function askUltimate() {
    const state = app.game;
    if (!state) return;
    const cls = state.player.char;
    const can = E.canUseUltimate(state, 'player');
    if (!can.ok) { UI.toast(can.reason, 'error'); return; }
    UI.confirm({
      title: '必杀 · ' + cls.ultimateName,
      subtitle: '每局仅限一次',
      html: `<b>效果</b><br>${esc(cls.ultimateText)}<br><br><b>代价</b><br>${esc(cls.ultimateCost)}<br><br><span style="color:#8f96a3">必杀造成的抽牌、伤害与状态会在发动时立即结算，请确认血量与手牌。</span>`,
      okLabel: '发动必杀',
      danger: true,
      onOk() {
        const r = E.useUltimate(state, 'player');
        if (!r.ok) { UI.toast(r.error, 'error'); return; }
        if (state.phase === 'gameover') {
          renderGame(true);
          showEnd();
          return;
        }
        renderGame(true);
        UI.Sound.play('ult');
        UI.toast('必杀发动：' + cls.ultimateName, 'success');
        if (state.revealedCards && state.revealedCards.length) {
          const cards = state.revealedCards.slice();
          state.revealedCards = null;
          setTimeout(() => UI.showReveal(cards), 500);
        }
      },
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 首页
    $('#class-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.class-card');
      if (!btn) return;
      app.selectedClass = btn.dataset.classId;
      UI.updateHomeSelection(app.selectedClass);
      UI.Sound.play('click');
    });
    $('#btn-random-class').addEventListener('click', () => {
      const pool = C.CLASS_LIST.filter((c) => c.id !== app.selectedClass);
      app.selectedClass = pool[Math.floor(Math.random() * pool.length)].id;
      UI.updateHomeSelection(app.selectedClass);
      UI.Sound.play('select');
      UI.toast('随机职业：' + C.CLASSES[app.selectedClass].name, 'success');
    });
    $('#btn-start').addEventListener('click', launchGame);
    $('#btn-jump-classes').addEventListener('click', () => {
      const panel = document.querySelector('.picker-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      UI.Sound.play('click');
    });
    $('#btn-rules-home').addEventListener('click', UI.showRules);
    $('#btn-rules-game').addEventListener('click', UI.showRules);
    $('#btn-log').addEventListener('click', () => app.game && UI.showLog(app.game));
    $('#btn-feed-more').addEventListener('click', () => app.game && UI.showLog(app.game));
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
      if (btn.dataset.action === 'draw') enterDraw();
      else if (btn.dataset.action === 'commit') commitTurn();
    });
    $('#hand').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      selectHandCard(card.dataset.uid);
    });
    $('#btn-clear-select').addEventListener('click', clearSelection);
    $('#btn-commit').addEventListener('click', () => { UI.Sound.play('click'); commitTurn(); });
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
    UI.renderHome(app.selectedClass);
    UI.setSoundUI();
    bind();
    // 首次提示
    let seen = null;
    try { seen = localStorage.getItem('dd_seen_intro'); localStorage.setItem('dd_seen_intro', '1'); } catch (e) { /* private mode */ }
    if (!seen) {
      setTimeout(() => UI.toast('选择职业 → 开始对局。每回合摸 2 张、出至多 2 张，双方同时揭晓。'), 700);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
