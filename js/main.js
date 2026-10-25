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
    hostSendQueue: Promise.resolve(),
    guestSendQueue: Promise.resolve(),
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
    stopLan();
    UI.closeModal();
    app.mode = 'solo';
    app.game = null;
    showScreen('home');
    UI.renderHome(app.selectedClass);
    UI.setSoundUI();
  }

  /* ---------------- 开始 / 重开 ---------------- */
  function launchGame() {
    stopLan();
    UI.ensureAudio();
    UI.clearToasts();
    app.mode = 'solo';
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
    stopLan();
    UI.closeModal();
    app.mode = 'solo';
    launchGame();
  }

  /* ---------------- 渲染 ---------------- */
  function renderGame(animate) {
    const state = app.game;
    if (!state) return;
    const old = app.logCount;
    UI.renderGame(state, { preserveScroll: true, animateLogs: false });
    if (animate && app.mode !== 'lan-guest') UI.handleNewLogs(state, old);
    app.logCount = state.log.length;
    if (app.mode === 'lan-host') sendHostSnapshot();
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
        if (app.mode === 'lan-guest') return;
        const wasSide = state.active;
        const r = E.nextTurn(state);
        if (!r.ok) { UI.toast(r.error, 'error'); return; }
        UI.clearToasts();
        renderGame(false);
        if (wasSide === 'player' && state.active === 'ai' && app.mode === 'solo') {
          startAITurn();
        } else if (wasSide === 'ai' && state.active === 'player') {
          UI.toast('第 ' + state.round + ' 回合 · 你的回合', 'success');
        }
        $('#battle-feed') && ($('#battle-feed').scrollTop = $('#battle-feed').scrollHeight);
      },
      onRestart: restartGame,
      onHome: showHome,
    };
  }

  function resultOpts() {
    return {
      guestWaiting: app.mode === 'lan-guest',
      lanGame: app.mode === 'lan-host' || app.mode === 'lan-guest',
    };
  }

  function showResultNow() {
    const state = app.game;
    if (!state) return;
    UI.showResult(state, resultHandlers(), resultOpts());
  }

  function showEnd() {
    const state = app.game;
    if (!state || state.phase !== 'gameover') return;
    UI.showResult(state, resultHandlers(), resultOpts());
  }

  function startAITurn() {
    const state = app.game;
    if (!state || app.mode !== 'solo' || state.active !== 'ai' || state.phase !== 'prepare') return;
    UI.clearToasts();
    UI.toast('对手回合…');
    renderGame(false);
    setTimeout(() => {
      if (!app.game || app.mode !== 'solo') return;
      E.runAITurn(app.game, AI);
      renderGame(true);
      if (app.game.phase === 'result' || app.game.phase === 'gameover') showResultNow();
    }, 650);
  }

  /* ---------------- 基础操作 ---------------- */
  function enterDraw() {
    const state = app.game;
    if (!state || state.phase !== 'prepare' || state.active !== 'player') return;
    if (app.mode === 'lan-guest') {
      if (app.guestBusy) return;
      app.guestBusy = true;
      guestSendAction('draw');
      UI.toast('已请求摸牌，等待房主同步…');
      return;
    }
    const r = E.startDraw(state);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    if (state.phase === 'gameover') { renderGame(true); showEnd(); return; }
    renderGame(true);
    UI.clearToasts();
    UI.Sound.play('draw');
    const handCount = state.player.hand.length;
    setTimeout(() => {
      UI.clearToasts();
      UI.toast('摸牌完成，手牌 ' + handCount + ' 张。选择至多 ' + E.getPlayLimit(state, 'player') + ' 张牌。');
    }, 120);
  }

  function commitTurn() {
    const state = app.game;
    if (!state || state.phase !== 'play' || state.active !== 'player') return;
    if (app.mode === 'lan-guest') {
      if (app.guestBusy) return;
      app.guestBusy = true;
      guestSendAction('commit');
      UI.clearToasts();
      UI.toast('已结束出牌，等待房主结算…');
      return;
    }
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
    if (app.mode === 'lan-guest') guestSendAction('clearSelection');
    UI.Sound.play('deselect');
  }

  function selectHandCard(uid) {
    const state = app.game;
    if (!state) return;
    if (state.active !== 'player') {
      UI.toast('当前是对手回合，请等待对手行动', 'error');
      return;
    }
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
      if (app.mode === 'lan-guest') guestSendAction('deselect', { uid });
      UI.Sound.play('deselect');
      return;
    }
    const r = E.selectCard(state, 'player', uid);
    if (!r.ok) { UI.toast(r.error, 'error'); UI.Sound.play('click'); return; }
    renderGame(false);
    if (app.mode === 'lan-guest') guestSendAction('select', { uid });
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
          if (app.mode === 'lan-guest') guestSendAction('setChoice', { uid: card.uid, mode: btn.dataset.mode });
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
    if (state.active !== 'player') { UI.toast('当前是对手回合', 'error'); return; }
    if (state.phase === 'gameover') return;
    if (app.mode === 'lan-guest') { guestUseAbility(id); return; }
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
      const cards = state.player.hand.filter((c) => c.type === 'break' || c.type === 'normal');
      UI.showCardPicker({
        title: '新生',
        subtitle: '选择一张攻击卡（不消耗该牌）：受到其数值伤害（可被护盾抵消），回合结束回复等量生命',
        cards,
        empty: '手中没有攻击卡，无法发动【新生】。',
        onPick(card) {
          const r = E.usePrepAbility(state, 'player', 'selfHarm', { uid: card.uid });
          if (!r.ok) { UI.toast(r.error, 'error'); return; }
          actionDone(false);
          UI.toast('【新生】已发动：回合结束回复 ' + card.value + ' 点生命', 'success');
        },
      });
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
    if (state.active !== 'player') { UI.toast('当前是对手回合', 'error'); return; }
    if (app.mode === 'lan-guest') { askGuestUltimate(); return; }
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
      },
    });
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
      UI.showModal({
        title: '战前准备 · 毒咒',
        subtitle: '选择一种牌投毒（对手摸到时受到 1 点真实伤害）',
        body: `<div class="setup-cards">${C.CARD_LIST.map((card) => `
          <button type="button" class="setup-card" data-lan-poison="${card.id}">
            <img src="${card.img}" alt="${esc(card.name)}" loading="lazy" /><b>${esc(card.name)}</b>
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
      else if (msg.type === 'error') UI.toast((msg.payload && msg.payload.message) || '房主拒绝了操作', 'error');
    }
  }

  function startHostGame(payload) {
    if (app.mode === 'lan-host' || app.lanStarting) return;
    app.lanStarting = true;
    const guestClass = C.CLASSES[payload.classId] ? payload.classId : 'fanren';
    const guestSetup = payload.setup || null;
    const hostClass = app.lanClass || app.selectedClass;
    const state = E.createGame({ playerClass: hostClass, aiClass: guestClass, controllers: {} });
    state.mode = 'lan-host';
    // 房主自己的开局选择
    if (hostClass === 'nvwu') {
      const value = app.lanSetup && app.lanSetup.type === 'poison' ? app.lanSetup.value : C.CARD_LIST[0].id;
      E.chooseSetup(state, 'poison', value);
    }
    if (hostClass === 'langren') {
      const value = app.lanSetup && app.lanSetup.type === 'wolf' ? app.lanSetup.value : 'A';
      E.chooseSetup(state, 'wolf', value);
    }
    // 加入者的开局选择由房主写入
    if (guestClass === 'nvwu') {
      state.ai.long.poisonType = guestSetup && guestSetup.type === 'poison' ? guestSetup.value : C.CARD_LIST[0].id;
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
    showScreen('game');
    renderGame(false);
    UI.clearToasts();
    UI.toast('联机对局开始！你先手。', 'success');
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
    } else if (state.active !== 'ai') {
      sendGuestError('现在不是你的回合');
      return;
    } else if (action.kind === 'draw') {
      result = E.startDraw(state);
    } else if (action.kind === 'select') {
      result = E.selectCard(state, 'ai', action.uid);
    } else if (action.kind === 'deselect') {
      result = E.deselectCard(state, 'ai', action.uid);
    } else if (action.kind === 'setChoice') {
      result = E.setCardChoice(state, 'ai', action.uid, action.mode);
    } else if (action.kind === 'clearSelection') {
      state.ai.selection = [];
      state.ai.choices = {};
    } else if (action.kind === 'commit') {
      result = E.commitTurn(state);
    } else if (action.kind === 'prepAbility') {
      result = E.usePrepAbility(state, 'ai', action.ability, action.payload || {});
    } else if (action.kind === 'ultimate') {
      result = E.useUltimate(state, 'ai');
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
    if (state.phase === 'gameover') setTimeout(() => showResultNow(), 220);
    else if (state.phase === 'result') setTimeout(() => showResultNow(), 220);
  }

  function applyGuestSnapshot(view) {
    if (!view) return;
    if (view.snapshotId && view.snapshotId <= app.guestSnapshotId) return;
    app.guestSnapshotId = view.snapshotId || app.guestSnapshotId;
    const prevActive = app.game ? app.game.active : null;
    app.mode = 'lan-guest';
    app.game = view;
    if (app.screen !== 'game') {
      showScreen('game');
      app.logCount = view.log ? view.log.length : 0;
      UI.closeModal();
    }
    app.guestBusy = false;
    UI.clearToasts();
    renderGame(false);
    if (view.phase === 'result' || view.phase === 'gameover') {
      const key = [view.turn, view.phase, view.active, view.winner].join(':');
      if (app.guestResultKey !== key) {
        app.guestResultKey = key;
        app.guestResultOpen = true;
        setTimeout(() => {
          if (app.game === view) showResultNow();
        }, 90);
      }
    } else {
      app.guestResultKey = null;
      if (app.guestResultOpen) {
        app.guestResultOpen = false;
        UI.closeModal();
      }
      if (prevActive !== view.active && view.active === 'player') UI.toast('轮到你的回合', 'success');
      else if (prevActive !== view.active && view.active === 'ai') UI.toast('对手回合', 'success');
    }
    if (view.revealedCards && view.revealedCards.length) {
      const key = 'reveal:' + view.turn + ':' + view.active;
      if (app.guestRevealKey !== key) {
        app.guestRevealKey = key;
        const cards = view.revealedCards.slice();
        setTimeout(() => UI.showReveal(cards), 350);
      }
    }
  }

  function guestSendAction(kind, data) {
    if (!app.lan || app.lan.role !== 'guest') return;
    const action = LAN.action(kind, data);
    app.guestSendQueue = app.guestSendQueue.then(() => app.lan.send('action', action)).catch(() => {});
  }

  function guestUseAbility(id) {
    const state = app.game;
    if (!state) return;
    if (id === 'ultimate') { askGuestUltimate(); return; }
    if (id === 'cute') {
      const cards = state.player.hand.filter((c) => c.type === 'break' || c.type === 'normal');
      UI.showCardPicker({
        title: '可爱即是正义',
        subtitle: '选择 1 张伤害牌转化为护甲牌',
        cards,
        empty: '手中没有伤害牌。',
        onPick(card) { guestSendAction('prepAbility', { ability: 'cute', payload: { uid: card.uid } }); UI.toast('已发送转化请求…'); },
      });
      return;
    }
    if (id === 'destiny') {
      UI.showTypePicker({
        title: '命定 · 指定对手下一张牌',
        subtitle: '每局一次，房主端会执行命定',
        onPick(cardId) { guestSendAction('prepAbility', { ability: 'destiny', payload: { cardId } }); UI.toast('已发送命定…'); },
      });
      return;
    }
    if (id === 'scavenge') {
      UI.showCardPicker({
        title: '开拓 · 从弃牌堆拾取',
        subtitle: '选择 1 张已出过的牌',
        cards: state.player.discard.slice(),
        empty: '弃牌堆还是空的。',
        onPick(card) { guestSendAction('prepAbility', { ability: 'scavenge', payload: { uid: card.uid } }); UI.toast('已发送开拓…'); },
      });
      return;
    }
    if (id === 'withered') {
      UI.confirm({
        title: '竭泽',
        html: '请求房主执行手牌与牌库互换。',
        okLabel: '交换',
        onOk() { guestSendAction('prepAbility', { ability: 'withered' }); UI.toast('已发送竭泽请求…'); },
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
        },
      });
      return;
    }
    const map = { meditation: 'meditation', magicianSkip: 'magicianSkip', wolfJudge: 'wolfJudge', sameSorrow: 'sameSorrow' };
    if (map[id]) {
      guestSendAction('prepAbility', { ability: map[id] });
      UI.toast('已发送操作，等待房主同步…');
    }
  }

  function askGuestUltimate() {
    const state = app.game;
    if (!state) return;
    if (state.active !== 'player') { UI.toast('当前是对手回合', 'error'); return; }
    const cls = state.player.char;
    const can = E.canUseUltimate(state, 'player');
    if (!can.ok) { UI.toast(can.reason, 'error'); return; }
    UI.confirm({
      title: '必杀 · ' + cls.ultimateName,
      subtitle: '每局仅限一次 · 由房主端执行',
      html: `<b>效果</b><br>${esc(cls.ultimateText)}<br><br><b>代价</b><br>${esc(cls.ultimateCost)}`,
      okLabel: '发动必杀',
      danger: true,
      onOk() {
        guestSendAction('ultimate');
        UI.toast('已发送必杀，等待房主同步…', 'success');
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
    $('#btn-lan').addEventListener('click', openLanModal);
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
    UI.renderHome(app.selectedClass);
    UI.setSoundUI();
    bind();
    // 首次提示
    let seen = null;
    try { seen = localStorage.getItem('dd_seen_intro'); localStorage.setItem('dd_seen_intro', '1'); } catch (e) { /* private mode */ }
    if (!seen) {
      setTimeout(() => UI.toast('选择职业 → 开始对局。双方轮流行动，每回合摸 2 张、出至多 2 张。'), 700);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
