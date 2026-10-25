/* 我的刀盾 · 修正版 — 局域网联机客户端
 *
 * 架构：房主浏览器是唯一权威，运行完整游戏引擎；加入者只接收给“自己视角”
 * 的脱敏快照并发送操作指令。Python 服务器（serve.py）只负责房间与长轮询消息中继。
 */
(function (global) {
  'use strict';
  const E = global.DD_ENGINE;

  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  class LanClient {
    constructor() {
      this.role = null;
      this.token = null;
      this.room = null;
      this.seq = 0;
      this.running = false;
      this.onMessage = null;
      this.onError = null;
      this._polling = null;
    }

    async request(path, body) {
      const opts = { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch('/api/lan/' + path, opts);
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || data.ok === false) {
        const msg = data && data.error ? data.error : ('网络请求失败（HTTP ' + res.status + '）');
        throw new Error(msg);
      }
      return data;
    }

    async createRoom(classId, setup) {
      const r = await this.request('create', { classId, setup: setup || null });
      this.role = 'host';
      this.token = r.token;
      this.room = r.room;
      this.seq = r.seq || 0;
      this.startPolling();
      return r;
    }

    async joinRoom(code, classId, setup) {
      const r = await this.request('join', { room: code, classId, setup: setup || null });
      this.role = 'guest';
      this.token = r.token;
      this.room = r.room;
      this.seq = r.seq || 0;
      this.startPolling();
      return r;
    }

    send(type, payload) {
      if (!this.room || !this.token) return Promise.resolve();
      return this.request('send', { room: this.room, role: this.role, token: this.token, type, payload }).catch(() => {});
    }

    startPolling() {
      if (this.running) return;
      this.running = true;
      this._polling = this.pollLoop();
    }

    async pollLoop() {
      let failures = 0;
      while (this.running) {
        try {
          const url = '/api/lan/poll?room=' + encodeURIComponent(this.room)
            + '&role=' + encodeURIComponent(this.role)
            + '&token=' + encodeURIComponent(this.token)
            + '&since=' + this.seq;
          const res = await fetch(url);
          const data = await res.json();
          if (!this.running) break;
          if (!res.ok || data.ok === false) throw new Error(data && data.error ? data.error : '轮询失败');
          failures = 0;
          if (Array.isArray(data.messages)) {
            data.messages.forEach((m) => {
              if (m && m.from !== this.role && typeof this.onMessage === 'function') {
                try { this.onMessage(m); } catch (e) { /* console.warn(e); */ }
              }
            });
          }
          if (typeof data.latest === 'number') this.seq = data.latest;
        } catch (e) {
          failures += 1;
          if (this.onError && failures === 1) this.onError(e);
          await delay(Math.min(4000, 800 + failures * 600));
        }
      }
    }

    stop() {
      this.running = false;
      this.role = null;
      this.token = null;
      this.room = null;
      this.seq = 0;
    }
  }

  function totalArmor(side) { return (side.armor || 0) + (side.extraArmor || 0); }

  function mapWinner(winner) {
    if (winner === 'player') return 'ai';
    if (winner === 'ai') return 'player';
    return winner || null;
  }

  // 房主状态 → 加入者视角。必须把房主的手牌 / 牌库彻底替换掉。
  function buildGuestView(hostState) {
    if (!hostState) return null;
    const view = JSON.parse(JSON.stringify(hostState));
    const host = hostState.player;
    const guest = hostState.ai;

    view.controllers = {};
    view.aiPlan = null;
    view.mode = 'lan-guest';

    // 交换两侧：加入者 become player，房主 become ai
    view.player = JSON.parse(JSON.stringify(guest));
    view.ai = JSON.parse(JSON.stringify(host));
    view.player.id = 'player';
    view.ai.id = 'ai';
    view.player.isAI = false;
    view.ai.isAI = true;
    view.active = hostState.active === 'player' ? 'ai' : (hostState.active === 'ai' ? 'player' : null);
    view.winner = mapWinner(hostState.winner);

    // 房主隐藏信息
    view.ai.hand = Array.from({ length: host.hand.length }, (_, i) => ({
      uid: 'hidden-hand-' + i, id: 'hidden', name: '？', type: 'normal', value: 0,
      img: 'assets/cards/back.webp', desc: '对手手牌', hidden: true,
    }));
    view.ai.deck = Array.from({ length: host.deck.length }, (_, i) => ({ uid: 'hidden-deck-' + i, id: 'hidden' }));
    view.ai.discard = Array.from({ length: host.discard.length }, (_, i) => ({ uid: 'hidden-discard-' + i, id: 'hidden' }));
    view.ai.selection = [];
    view.ai.choices = {};
    if (view.ai.long) {
      view.ai.long.destinyPendingCardId = null;
      view.ai.long.poisonType = null;
    }
    view.ai.temp = {};
    view.revealedCard = null;
    view.revealedCards = null;
    view.seerDraw = null;
    view.seerAll = null;

    // 加入者作为预言家时，自己看到的信息可以给；房主看到的信息不泄露。
    if (hostState.seerDraw && hostState.seerDraw.viewer === 'ai') {
      view.seerDraw = JSON.parse(JSON.stringify(hostState.seerDraw));
      view.seerDraw.viewer = 'player';
    }
    if (hostState.seerAll && hostState.seerAll.ai) {
      view.seerAll = { player: JSON.parse(JSON.stringify(hostState.seerAll.ai)) };
    }

    view.log = sanitizeLogs(hostState, hostState.log);
    if (hostState.lastResult) {
      const lr = Object.assign({}, hostState.lastResult);
      lr.logs = sanitizeLogs(hostState, hostState.lastResult.logs);
      lr.turnSide = hostState.lastResult.turnSide === 'player' ? 'ai' : 'player';
      lr.playerHp = guest.hp;
      lr.aiHp = host.hp;
      lr.playerArmor = totalArmor(guest);
      lr.aiArmor = totalArmor(host);
      lr.winner = mapWinner(hostState.lastResult.winner);
      view.lastResult = lr;
    } else {
      view.lastResult = null;
    }
    return view;
  }

  // 隐藏房主的摸牌 / 弃牌 / 命定等私密信息
  function sanitizeLogs(hostState, logs) {
    if (!Array.isArray(logs)) return [];
    const host = hostState.player;
    return logs.map((entry) => {
      if (!entry) return entry;
      if (entry.sideId !== 'player') return entry;
      const t = String(entry.text || '');
      if (entry.kind === 'draw' && (t.indexOf('「') >= 0 || t.indexOf('获得') >= 0 || t.indexOf('拾回') >= 0)) {
        return Object.assign({}, entry, { text: host.name + ' 摸到 1 张牌' });
      }
      if (entry.kind === 'cost' && t.indexOf('「') >= 0) {
        return Object.assign({}, entry, { text: host.name + ' 弃置 1 张手牌作为代价' });
      }
      if (entry.kind === 'passive' && t.indexOf('【命定】') >= 0) {
        return Object.assign({}, entry, { text: host.name + ' 发动【命定】' });
      }
      if (entry.kind === 'passive' && t.indexOf('可爱即是正义') >= 0 && t.indexOf('「') >= 0) {
        return Object.assign({}, entry, { text: host.name + ' 发动【可爱即是正义】，转化了 1 张伤害牌' });
      }
      return entry;
    });
  }

  // 加入者发给房主的操作说明（便于 UI 与网络层共用）
  function action(kind, data) {
    return Object.assign({ kind }, data || {});
  }

  global.DD_LAN = {
    LanClient,
    buildGuestView,
    sanitizeLogs,
    action,
  };
})(window);
