/* 我的刀盾 · 修正版 — 游戏引擎
 * 纯逻辑，不依赖 DOM；浏览器挂载为 window.DD_ENGINE，Node 可 require 用于测试。
 */
(function (global) {
  'use strict';

  const CONFIG = global.DD_CONFIG || (typeof require !== 'undefined' ? require('./config.js') : null);
  if (!CONFIG) throw new Error('DD_CONFIG 未加载');

  const SIDES = ['player', 'ai'];

  /* ---------------- 基础工具 ---------------- */
  function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function rng() {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function clampMin(n, min) { return Math.max(min, n); }
  function floor(n) { return Math.floor(n); }

  function cardDef(id) { return CONFIG.CARDS[id]; }
  function charDef(id) { return CONFIG.CLASSES[id]; }
  function otherSide(state, side) { return side.id === 'player' ? state.ai : state.player; }

  function makeCard(state, id, extra) {
    const def = cardDef(id);
    state.uid += 1;
    return Object.assign({
      uid: 'c' + state.uid,
      id,
      name: def.name,
      type: def.type,
      value: def.value,
      img: def.img,
      desc: def.desc,
      generated: false,
    }, extra || {});
  }

  function log(state, text, kind, sideId) {
    state.log.push({ round: state.round, text, kind: kind || 'info', sideId: sideId || null });
    if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
    state.logVersion += 1;
  }

  function cardNames(cards) {
    const counts = {};
    cards.forEach((c) => { counts[c.name] = (counts[c.name] || 0) + 1; });
    return Object.keys(counts).map((n) => (counts[n] > 1 ? n + '×' + counts[n] : n)).join('、') || '无';
  }

  function damageValue(card) {
    if (!card) return 0;
    return card.type === 'break' || card.type === 'normal' ? card.value : 0;
  }

  function smallestDamageCard(hand) {
    let best = null;
    hand.forEach((c) => {
      if (c.type !== 'break' && c.type !== 'normal') return;
      if (!best || c.value < best.value) best = c;
    });
    return best;
  }

  function isWolfForm(state, side) { return (side.status.wolfFormUntilTurn || 0) > side.turnsTaken; }
  function hasArmor(side) { return side.armor + side.extraArmor > 0; }
  function totalArmor(side) { return side.armor + side.extraArmor; }
  function armorTierFor(value) { return value >= 7 ? 'gold' : (value >= 5 ? 'blue' : 'white'); }

  function canHeal(state, side) {
    return !(side.status.healLockUntilTurn && side.turnsTaken < side.status.healLockUntilTurn);
  }

  /* ---------------- 建局 ---------------- */
  function makeSide(state, id, classId, isAI) {
    const char = charDef(classId);
    const maxHp = char.hp || CONFIG.MAX_HP_DEFAULT;
    return {
      id,
      isAI: !!isAI,
      turnsTaken: 0,
      classId,
      char,
      name: char.name,
      hp: maxHp,
      maxHp,
      armor: 0,
      extraArmor: 0,
      deck: [],
      hand: [],
      discard: [],
      selection: [],
      choices: {},
      temp: {},
      long: {
        poisonType: null,
        wolfMode: null,
        ultimateUsed: false,
        witheredUsed: false,
        meditationUsed: false,
        destinyUsed: false,
        skyUsed: false,
        sameSorrow: false,
        cutePending: false,
        cuteWindowTurn: 0,
        babyHealTurn: -1,
        destinyPendingCardId: null,
        allSeeing: false,
        viewOpponent: false,
        doubleArmorPending: 0,
        doubleArmorTier: null,
        armorTier: null,
        extraArmorTier: null,
        captainCount: 0,
        captainProgress: 0,
      },
      status: {
        drawPenalty: 0,
        pendingDrawPenalty: 0,
        wolfFormUntilTurn: 0,
        armorLockTurn: 0,
        breakAsNormalTurn: 0,
        healLockUntilTurn: 0,
        frozenTurn: 0,
      },
      pendingNextDamage: 0,
    };
  }

  function resetTemp(state, side) {
    side.temp = {
      skipDraw: false,
      skipKind: null,
      scavengeUid: null,
      werewolfJudge: false,
      cuteUsed: false,
      selfHarm: 0,
      newbornValue: 0,
      playLimitBonus: 0,
      damagePerCard: 0,
      breakMultiplier: 1,
      ignoreArmorAll: false,
      damageReduction: 0,
      armorValues: [],
      playedCount: 0,
      playedCards: [],
      normalDisabled: false,
      wasAttacked: false,
      ultimate: false,
      ultimateName: '',
    };
    side.selection = [];
    side.choices = {};
  }

  function createDeck(state) {
    const cards = CONFIG.FULL_DECK.map((id) => makeCard(state, id));
    return shuffle(cards, state.rng);
  }

  function createGame(opts) {
    opts = opts || {};
    const playerClass = opts.playerClass || 'baobao';
    let aiClass = opts.aiClass;
    if (!aiClass || !charDef(aiClass)) {
      const pool = CONFIG.CLASS_LIST.map((c) => c.id).filter((id) => id !== playerClass);
      aiClass = pool[Math.floor((opts.seed ? makeRng(opts.seed)() : Math.random()) * pool.length)];
    }
    const seed = opts.seed || Math.floor(Math.random() * 2147483647);
    const state = {
      cfg: CONFIG,
      rng: makeRng(seed),
      seed,
      uid: 0,
      round: 0,
      turnSerial: 0,
      phase: 'setup',
      log: [],
      logVersion: 0,
      lastResult: null,
      winner: null,
      setupNeeded: [],
      setupChoices: {},
      controllers: opts.controllers || {},
      aiPlan: null,
      active: null,
      turn: 0,
      ultimatesEnabled: opts.ultimatesEnabled !== false,
      playSeq: 0,
      lastPlay: null,
      drawSeq: 0,
      lastDraw: null,
      shieldHitSeq: 0,
      lastShieldHit: null,
      turnLogStart: 0,
      mode: opts.mode || 'solo',
      ruleVersion: 2,
    };
    state.player = makeSide(state, 'player', playerClass, false);
    state.ai = makeSide(state, 'ai', aiClass, true);
    state.player.deck = createDeck(state);
    state.ai.deck = createDeck(state);

    if (playerClass === 'nvwu') state.setupNeeded.push('poison');
    if (playerClass === 'langren') state.setupNeeded.push('wolf');
    // 电脑的对应选择自动完成
    if (aiClass === 'nvwu') state.ai.long.poisonType = autoPoisonType(state);
    if (aiClass === 'langren') state.ai.long.wolfMode = state.rng() < 0.5 ? 'A' : 'B';

    log(state, '对局建立：' + state.player.name + ' VS ' + state.ai.name, 'system');
    return state;
  }

  function autoPoisonType(state) {
    const pool = CONFIG.POISON_CATEGORIES.map((c) => c.id);
    return pool[Math.floor(state.rng() * pool.length)];
  }

  function chooseSetup(state, kind, value) {
    if (state.phase !== 'setup') return { ok: false, error: '当前不在开局设置阶段' };
    if (kind === 'poison') {
      if (!CONFIG.POISON_CATEGORIES.some((c) => c.id === value)) return { ok: false, error: '无效的牌类' };
      state.player.long.poisonType = value;
      state.setupChoices.poison = value;
    } else if (kind === 'wolf') {
      if (value !== 'A' && value !== 'B') return { ok: false, error: '无效的月嚎选项' };
      state.player.long.wolfMode = value;
      state.setupChoices.wolf = value;
    } else {
      return { ok: false, error: '未知设置项' };
    }
    state.setupNeeded = state.setupNeeded.filter((s) => s !== kind);
    return { ok: true };
  }

  function startGame(state) {
    if (state.phase !== 'setup') return { ok: false, error: '对局已经开始' };
    if (state.setupNeeded.length > 0) return { ok: false, error: '请先完成开局选择' };
    if (state.player.classId === 'nvwu' && !state.player.long.poisonType) state.player.long.poisonType = autoPoisonType(state);
    if (state.player.classId === 'langren' && !state.player.long.wolfMode) state.player.long.wolfMode = 'A';
    if (state.ai.classId === 'nvwu' && !state.ai.long.poisonType) state.ai.long.poisonType = autoPoisonType(state);
    if (state.ai.classId === 'langren' && !state.ai.long.wolfMode) state.ai.long.wolfMode = 'A';

    [state.player, state.ai].forEach((side) => {
      for (let i = 0; i < CONFIG.INITIAL_HAND; i += 1) {
        const c = side.deck.shift();
        if (c) side.hand.push(c);
      }
      log(state, side.name + ' 起手 ' + side.hand.length + ' 张牌', 'system', side.id);
    });
    state.round = 1;
    state.turn = 0;
    state.active = 'player';
    beginTurn(state, 'player');
    return { ok: true };
  }

  /* ---------------- 回合开始 / 切换 ---------------- */
  function beginTurn(state, sideId) {
    if (state.phase === 'gameover') return { ok: false, error: '对局已结束' };
    const side = state[sideId];
    if (!side) return { ok: false, error: '无效角色' };
    const foe = otherSide(state, side);
    state.active = sideId;
    state.phase = 'prepare';
    state.turn += 1;
    state.lastResult = null;
    state.aiPlan = null;
    state.revealedCard = null;
    state.revealedCards = null;
    state.seerDraw = null;
    state.seerAll = null;
    state.turnSerial += 1;
    state.turnLogStart = state.log.length;
    [state.player, state.ai].forEach((s) => resetTemp(state, s));
    side.turnsTaken += 1;
    side.status.drawPenalty = side.status.pendingDrawPenalty || 0;
    side.status.pendingDrawPenalty = 0;

    log(state, '—— 第 ' + state.round + ' 回合 · ' + side.name + ' 的回合 · 准备阶段 ——', 'round');

    // 枯牌阶段：轮到谁，谁在回合开始失去 2 点生命
    if (side.deck.length === 0 && side.hp > 0) {
      log(state, side.name + ' 牌库已空，枯牌阶段失去 2 点生命', 'damage', side.id);
      loseHp(state, side, 2, { sourceId: null, label: '枯牌', noReflect: true });
    }
    resolveDeaths(state);
    if (state.phase === 'gameover') return { ok: true, gameover: true };

    // 预言家 · 前瞻：每当对手摸牌时看到摸到的牌（在 drawCards 中记录）

    // 预言家必杀 · 全知：每个人回合开始前，查看对方全部手牌
    [state.player, state.ai].forEach((viewer) => {
      if (viewer.classId !== 'yuyanjia' || !viewer.long.allSeeing || viewer.hp <= 0) return;
      const target = otherSide(state, viewer);
      if (!target || target.hp <= 0) return;
      if (!state.seerAll) state.seerAll = {};
      state.seerAll[viewer.id] = target.hand.map((c) => ({
        uid: c.uid, id: c.id, name: c.name, type: c.type, value: c.value, img: c.img,
      }));
      log(state, viewer.name + ' 的【全知】看到 ' + target.name + ' 的全部手牌', 'passive', viewer.id);
    });

    if (side.status.frozenTurn === side.turnsTaken) {
      log(state, side.name + ' 被【冰刻箭雨之时】冻结，本回合无法出牌', 'status', side.id);
    }

    // 三月七 · 可爱即是正义：上一轮持甲且未被攻击，本回合开始就绪
    if (side.classId === 'sanyueqi') {
      if (side.long.cutePending && totalArmor(side) > 0) {
        side.long.cuteWindowTurn = side.turnsTaken;
        log(state, side.name + ' 的【可爱即是正义】已就绪：可将 1 张伤害牌转化为护甲牌', 'passive', side.id);
      }
      side.long.cutePending = false;
    }

    // 护盾维护：
    // 1) 自己的下一个回合开始时，普通护甲全部消失；
    // 2) 若上一回合打出至少 2 张叠甲卡，且对手回合结束时护甲未被完全击碎，
    //    则把较小的那张叠甲卡数值留作额外护盾。
    if (side.classId !== 'sanyueqi' && side.long.doubleArmorPending > 0 && side.armor > 0) {
      const keep = side.long.doubleArmorPending;
      if (keep > side.extraArmor) {
        side.extraArmor = keep;
        side.long.extraArmorTier = side.long.doubleArmorTier || armorTierFor(keep);
      }
      log(state, side.name + ' 的双甲未被全部击碎，额外护盾为 ' + side.extraArmor + ' 点', 'armor', side.id);
    }
    side.long.doubleArmorPending = 0;
    side.long.doubleArmorTier = null;
    if (side.armor > 0) {
      const lost = side.armor;
      side.armor = 0;
      log(state, side.name + ' 的普通护甲在回合开始时消散（-' + lost + '）', 'armor', side.id);
    }
    if (totalArmor(side) <= 0) {
      side.long.armorTier = null;
      side.long.extraArmorTier = null;
    }

    // 普通攻击卡限制：自己回合开始时若对方有护盾，则本回合不能打出普通攻击卡
    side.temp.normalDisabled = hasArmor(foe);
    if (side.temp.normalDisabled) {
      log(state, foe.name + ' 在 ' + side.name + ' 回合开始时持有护盾，' + side.name + ' 本回合无法打出普通攻击卡', 'status', side.id);
    }

    if (side.classId === 'langren' && side.long.wolfMode === 'B') {
      log(state, side.name + ' 可在摸牌前发动【月嚎】判定（失去 5 点生命）', 'passive', side.id);
    }
    if (side.status.drawPenalty > 0) {
      log(state, side.name + ' 受【快手】影响，本回合摸牌 -' + side.status.drawPenalty, 'status', side.id);
    }
    return { ok: true };
  }

  function nextTurn(state) {
    if (state.phase !== 'result') return { ok: false, error: '当前不能进入下一回合' };
    const next = state.active === 'player' ? 'ai' : 'player';
    if (next === 'player') state.round += 1;
    const r = beginTurn(state, next);
    return r.ok ? { ok: true, active: state.active } : r;
  }

  /* ---------------- 生命 / 护甲 / 回复 ---------------- */
  function battleLog(state, side, text, kind) { log(state, side.name + ' ' + text, kind || 'info', side.id); }

  function onHpLost(state, side, before, after) {
    if (after <= 0) return;
    if (before > 6 && after <= 6) {
      [state.player, state.ai].forEach((s) => {
        if (s.classId === 'yuxue') {
          s.pendingNextDamage += 2;
          log(state, s.name + ' 的【血屠】触发：下一次伤害 +2（当前 +' + s.pendingNextDamage + '）', 'passive', s.id);
        }
      });
    }
  }

  function loseHp(state, side, amount, opts) {
    opts = opts || {};
    amount = Math.max(0, Math.floor(amount));
    if (!amount || side.hp <= 0) return 0;
    const before = side.hp;
    side.hp = Math.max(0, side.hp - amount);
    onHpLost(state, side, before, side.hp);
    if (opts.silent !== true) {
      log(state, side.name + ' 失去 ' + amount + ' 点生命' + (opts.label ? '（' + opts.label + '）' : '') + '，剩余 ' + side.hp, 'damage', side.id);
    }
    if (opts.sourceId) state.lastDamageSource = opts.sourceId;
    return amount;
  }

  function healSide(state, side, amount, label, opts) {
    opts = opts || {};
    if (!canHeal(state, side)) {
      if (!opts.silent) log(state, side.name + ' 受到回血封锁，无法回复生命', 'status', side.id);
      return 0;
    }
    amount = Math.max(0, Math.floor(amount));
    const actual = Math.min(amount, Math.max(0, side.maxHp - side.hp));
    if (actual <= 0) return 0;
    side.hp += actual;
    log(state, side.name + ' 回复 ' + actual + ' 点生命' + (label ? '（' + label + '）' : '') + '，当前 ' + side.hp, 'heal', side.id);
    const foe = otherSide(state, side);
    if (foe.classId === 'baobao' && foe.hp > 0 && actual > 0 && !opts.fromBaby) {
      if (foe.long.babyHealTurn !== state.turn) {
        foe.long.babyHealTurn = state.turn;
        const half = Math.floor(actual / 2);
        if (half > 0) {
          log(state, foe.name + ' 的【吃奶奶】触发', 'passive', foe.id);
          healSide(state, foe, half, '吃奶奶', { fromBaby: true, silent: false });
        }
      }
    }
    return actual;
  }

  function addArmor(state, side, amount, label) {
    amount = Math.max(0, Math.floor(amount));
    if (!amount) return 0;
    side.armor += amount;
    const tier = armorTierFor(amount);
    if (!side.long.armorTier || tier === 'gold' || (tier === 'blue' && side.long.armorTier === 'white')) {
      side.long.armorTier = tier;
    }
    log(state, side.name + ' 获得 ' + amount + ' 点护甲（' + (label || '叠甲') + '），护甲 ' + totalArmor(side), 'armor', side.id);
    return amount;
  }

  function consumeArmor(state, target, amount, opts) {
    opts = opts || {};
    const before = totalArmor(target);
    if (before <= 0 || amount <= 0) return 0;
    if (opts.ignoreAll) {
      log(state, target.name + ' 的护甲被完全无视', 'armor', target.id);
      return 0;
    }
    let effective = before;
    if (opts.ignoreHalf) {
      effective = Math.floor(before / 2);
      log(state, target.name + ' 的护甲被【裂隙】无视一半（' + before + ' → ' + effective + '）', 'passive', target.id);
    }
    const absorbed = Math.min(amount, effective);
    if (absorbed <= 0) return 0;
    let need = absorbed;
    const fromExtra = Math.min(target.extraArmor, need);
    target.extraArmor -= fromExtra;
    need -= fromExtra;
    if (need > 0) target.armor = Math.max(0, target.armor - need);
    if (totalArmor(target) <= 0) {
      target.long.armorTier = null;
      target.long.extraArmorTier = null;
    }
    log(state, target.name + ' 的护甲抵挡 ' + absorbed + ' 点伤害（护甲剩余 ' + totalArmor(target) + '）', 'armor', target.id);
    return absorbed;
  }

  /* ---------------- 摸牌 ---------------- */
  function applyPoisonOnDraw(state, side, card) {
    const foe = otherSide(state, side);
    if (foe.classId === 'nvwu' && foe.long.poisonType === card.type) {
      log(state, foe.name + ' 的【毒咒】触发：' + side.name + ' 摸到剧毒牌「' + card.name + '」', 'passive', foe.id);
      directDamage(state, foe, side, 1, { label: '毒咒', noReflect: false });
    }
  }

  function noteCaptainCards(state, side, n) {
    if (!side || side.classId !== 'chuanzhang') return;
    side.long.captainCount = (side.long.captainCount || 0) + n;
    side.long.captainProgress = (side.long.captainProgress || 0) + n;
    while (side.long.captainProgress >= 2) {
      side.long.captainProgress -= 2;
      loseHp(state, side, 1, { label: '潮涌·出牌/弃牌', noReflect: true });
    }
  }

  function gainCard(state, side, card, opts) {
    opts = opts || {};
    side.hand.push(card);
    log(state, side.name + (side.isAI ? ' 摸到 1 张牌' : ' 获得「' + card.name + '」'), 'draw', side.id);
    if (opts.quiet) return;
    if (side.classId === 'chuanzhang') {
      healSide(state, side, 1, '潮涌');
    }
    applyPoisonOnDraw(state, side, card);
  }

  function drawOne(state, side) {
    if (side.deck.length === 0) return null;
    const card = side.deck.shift();
    gainCard(state, side, card);
    return card;
  }

  function drawCards(state, side, n, opts) {
    opts = opts || {};
    const drawn = [];
    for (let i = 0; i < n; i += 1) {
      const c = drawOne(state, side);
      if (!c) break;
      drawn.push(c);
    }
    if (drawn.length < n) log(state, side.name + ' 牌库不足，只摸到 ' + drawn.length + ' 张', 'draw', side.id);
    if (drawn.length > 0) {
      state.drawSeq += 1;
      state.lastDraw = { seq: state.drawSeq, sideId: side.id, count: drawn.length };
      noteSeerDraw(state, side, drawn);
    }
    return drawn;
  }

  // 预言家·前瞻：对手每次摸牌，记录看到的牌（同一回合内累加）
  function noteSeerDraw(state, drawingSide, drawn) {
    const seer = otherSide(state, drawingSide);
    if (!seer || seer.classId !== 'yuyanjia' || seer.hp <= 0) return;
    if (!state.seerDraw || state.seerDraw.turn !== state.turn || state.seerDraw.viewer !== seer.id) {
      state.seerDraw = { viewer: seer.id, owner: drawingSide.id, turn: state.turn, round: state.round, cards: [] };
    }
    drawn.forEach((c) => state.seerDraw.cards.push({
      uid: c.uid, id: c.id, name: c.name, type: c.type, value: c.value, img: c.img,
    }));
    log(state, seer.name + ' 看到 ' + drawingSide.name + ' 摸到：' + cardNames(drawn), 'passive', seer.id);
  }

  function takeFromOpponent(state, thief, count) {
    const victim = otherSide(state, thief);
    const taken = [];
    for (let i = 0; i < count && victim.hand.length > 0; i += 1) {
      const idx = Math.floor(state.rng() * victim.hand.length);
      const card = victim.hand.splice(idx, 1)[0];
      if (thief.classId === 'chuanzhang') healSide(state, thief, 1, '潮涌');
      thief.hand.push(card);
      taken.push(card);
      log(state, thief.name + (thief.isAI ? ' 从对手手中获得 1 张牌' : ' 从对手手中获得「' + card.name + '」'), 'draw', thief.id);
    }
    if (!taken.length) log(state, thief.name + ' 想偷牌，但对方没有手牌', 'draw', thief.id);
    return taken;
  }

  /* ---------------- 出牌阶段 ---------------- */
  function getSelectedCards(side) {
    return side.selection.map((uid) => side.hand.find((c) => c.uid === uid)).filter(Boolean);
  }

  function currentPlayLimit(state, side) {
    let limit = CONFIG.BASE_PLAY_LIMIT + (side.temp.playLimitBonus || 0);
    if (side.temp.skipKind === 'magician') limit = Math.max(limit, 3);
    if (isWolfForm(state, side)) limit += 1;
    return limit;
  }

  function cardModeOptions(state, side, card) {
    if (!card) return [];
    if (card.type === 'rest' && (card.id === 'tiaoxi' || card.id === 'huanyu') && side.classId === 'dunai') {
      return [
        { id: 'heal', label: '回复自己 ' + card.value + ' 点生命' },
        { id: 'curse', label: '对对手造成 ' + card.value + ' 点真伤并封锁回血' },
      ];
    }
    if (card.id === 'ningshen' && side.classId === 'kuaishou') {
      return [
        { id: 'draw', label: '摸 2 张牌' },
        { id: 'steal', label: '改为摸对手 2 张手牌' },
      ];
    }
    return [];
  }

  function playableInfo(state, side, card) {
    if (state.phase !== 'play') return { ok: false, reason: '当前不是出牌阶段' };
    if (state.active !== side.id) return { ok: false, reason: '不是你的回合' };
    if (side.status.frozenTurn === side.turnsTaken) return { ok: false, reason: '被【冰刻箭雨之时】冻结，本回合无法出牌' };
    if (!card) return { ok: false, reason: '牌不存在' };
    const inHand = side.hand.some((c) => c.uid === card.uid);
    if (!inHand) return { ok: false, reason: '这张牌不在手中' };
    const limit = currentPlayLimit(state, side);
    if ((side.temp.playedCount || 0) >= limit) return { ok: false, reason: '本回合出牌数已达上限（' + limit + '）' };
    const foe = otherSide(state, side);
    if (card.type === 'armor') {
      if (side.status.armorLockTurn === side.turnsTaken) return { ok: false, reason: '【绝杀】代价：本回合不能使用叠甲卡' };
      return { ok: true, treatedAs: 'armor' };
    }
    if (card.type === 'break') {
      if (side.status.breakAsNormalTurn > 0 && side.status.breakAsNormalTurn === side.turnsTaken) {
        return { ok: true, treatedAs: 'normal' };
      }
      if (!hasArmor(foe)) return { ok: false, reason: '对方无护甲，破甲卡不可打出' };
      return { ok: true, treatedAs: 'break' };
    }
    if (card.type === 'normal') {
      if (side.temp.normalDisabled) return { ok: false, reason: '对方在你回合开始时持有护盾，本回合无法打出普通攻击卡' };
      return { ok: true, treatedAs: 'normal' };
    }
    if (card.type === 'rest') {
      if (card.id === 'ningshen' && side.temp.skipKind === 'magician') {
        return { ok: false, reason: '【快手】本回合不能使用凝神' };
      }
      return { ok: true };
    }
    return { ok: false, reason: '未知卡牌' };
  }

  function selectCard(state, sideId, uid) {
    const side = state[sideId];
    if (!side) return { ok: false, error: '无效角色' };
    if (state.active !== sideId) return { ok: false, error: '不是你的回合' };
    const card = side.hand.find((c) => c.uid === uid);
    const info = playableInfo(state, side, card);
    if (!info.ok) return { ok: false, error: info.reason };
    if (side.selection.indexOf(uid) >= 0) return { ok: false, error: '已经选中' };
    side.selection.push(uid);
    const opts = cardModeOptions(state, side, card);
    if (opts.length) side.choices[uid] = opts[0].id;
    return { ok: true, card, options: opts, choice: side.choices[uid] };
  }

  function deselectCard(state, sideId, uid) {
    const side = state[sideId];
    if (!side) return { ok: false, error: '无效角色' };
    if (state.active !== sideId) return { ok: false, error: '不是你的回合' };
    side.selection = side.selection.filter((x) => x !== uid);
    delete side.choices[uid];
    return { ok: true };
  }

  function setCardChoice(state, sideId, uid, mode) {
    const side = state[sideId];
    if (!side) return { ok: false, error: '无效角色' };
    if (state.active !== sideId) return { ok: false, error: '不是你的回合' };
    const card = side.hand.find((c) => c.uid === uid);
    if (!card) return { ok: false, error: '牌不在手中' };
    const opts = cardModeOptions(state, side, card);
    if (!opts.some((o) => o.id === mode)) return { ok: false, error: '无效的结算方式' };
    side.choices[uid] = mode;
    return { ok: true };
  }

  /* ---------------- 准备阶段能力 ---------------- */
  function usePrepAbility(state, sideId, ability, payload) {
    const side = state[sideId];
    payload = payload || {};
    if (!side) return { ok: false, error: '无效角色' };
    if (state.phase === 'gameover') return { ok: false, error: '对局已结束' };
    if (state.active !== side.id) return { ok: false, error: '不是你的回合' };

    if (ability === 'meditation') {
      if (side.classId !== 'chensiyu') return { ok: false, error: '职业不符' };
      if (side.long.meditationUsed) return { ok: false, error: '本局已经使用过' };
      if (state.phase !== 'prepare' && state.phase !== 'play') return { ok: false, error: '当前不能使用' };
      side.long.meditationUsed = true;
      log(state, side.name + ' 发动【别吵，我在烧烤】：额外摸 3 张牌', 'passive', side.id);
      drawCards(state, side, 3);
      resolveDeaths(state);
      return { ok: true };
    }

    if (ability === 'cute') {
      if (side.classId !== 'sanyueqi') return { ok: false, error: '职业不符' };
      if (state.phase !== 'prepare') return { ok: false, error: '只能在回合准备阶段使用' };
      if (side.temp.cuteUsed) return { ok: false, error: '本回合已经转化过' };
      if (side.long.cuteWindowTurn !== side.turnsTaken) return { ok: false, error: '尚未满足【可爱即是正义】条件' };
      const card = side.hand.find((c) => c.uid === payload.uid);
      if (!card) return { ok: false, error: '请选择手牌' };
      if (card.type !== 'break' && card.type !== 'normal') return { ok: false, error: '只能转化伤害牌' };
      const armorValue = card.value;
      const generated = makeCard(state, 'gujia', {
        uid: card.uid,
        name: '可爱护甲',
        type: 'armor',
        value: armorValue,
        img: 'assets/cards/gujia.webp',
        desc: '由「' + card.name + '」转化而来，获得 ' + armorValue + ' 点护甲。',
        generated: true,
      });
      side.hand = side.hand.map((c) => (c.uid === card.uid ? generated : c));
      side.temp.cuteUsed = true;
      side.long.cuteWindowTurn = 0;
      log(state, side.name + ' 发动【可爱即是正义】' + (side.isAI ? '，将 1 张伤害牌转化为了护甲牌' : '，将「' + card.name + '」转化为 ' + armorValue + ' 点护甲牌'), 'passive', side.id);
      return { ok: true };
    }

    if (ability === 'withered') {
      if (side.classId !== 'kupai') return { ok: false, error: '职业不符' };
      if (side.long.witheredUsed) return { ok: false, error: '本局已经使用过' };
      if (state.phase !== 'prepare' && state.phase !== 'play') return { ok: false, error: '当前不能使用' };
      if (side.hp > 4) return { ok: false, error: '血量需 ≤ 4' };
      side.long.witheredUsed = true;
      const hand = side.hand;
      side.hand = side.deck;
      side.deck = shuffle(hand, state.rng);
      side.selection = [];
      side.choices = {};
      log(state, side.name + ' 发动【竭泽】：手牌与牌库互换（手牌 ' + side.hand.length + ' / 牌库 ' + side.deck.length + '）', 'passive', side.id);
      return { ok: true };
    }

    if (ability === 'destiny') {
      if (side.classId !== 'yuyanjia') return { ok: false, error: '职业不符' };
      if (side.long.destinyUsed) return { ok: false, error: '本局已经使用过【命定】' };
      if (state.phase !== 'prepare') return { ok: false, error: '只能在对方摸牌前发动' };
      if (!payload.cardId || !cardDef(payload.cardId)) return { ok: false, error: '请选择一种牌' };
      side.long.destinyUsed = true;
      side.long.destinyPendingCardId = payload.cardId;
      log(state, side.name + ' 发动【命定】' + (side.isAI ? '，指定了对方下一次摸到的牌' : '，指定对方下一次摸到「' + cardDef(payload.cardId).name + '」'), 'passive', side.id);
      return { ok: true };
    }

    if (ability === 'magicianSkip') {
      if (side.classId !== 'moshushou') return { ok: false, error: '职业不符' };
      if (state.phase !== 'prepare') return { ok: false, error: '只能在准备阶段选择' };
      side.temp.skipDraw = !side.temp.skipDraw;
      side.temp.skipKind = side.temp.skipDraw ? 'magician' : null;
      log(state, side.name + (side.temp.skipDraw ? ' 决定跳过摸牌阶段（本回合可出 3 张，下回合少摸 1 张）' : ' 取消跳过摸牌'), 'passive', side.id);
      return { ok: true, skipDraw: side.temp.skipDraw };
    }

    if (ability === 'scavenge') {
      if (side.classId !== 'shihuangzhe') return { ok: false, error: '职业不符' };
      if (state.phase !== 'prepare') return { ok: false, error: '只能在准备阶段选择' };
      if (!payload.uid) return { ok: false, error: '请选择弃牌堆中的牌' };
      const card = side.discard.find((c) => c.uid === payload.uid);
      if (!card) return { ok: false, error: '弃牌堆中没有这张牌' };
      side.temp.skipDraw = true;
      side.temp.skipKind = 'scavenge';
      side.temp.scavengeUid = card.uid;
      log(state, side.name + ' 发动【开拓】，将从弃牌堆拾取「' + card.name + '」', 'passive', side.id);
      return { ok: true };
    }

    if (ability === 'wolfJudge') {
      if (side.classId !== 'langren') return { ok: false, error: '职业不符' };
      if (side.long.wolfMode !== 'B') return { ok: false, error: '当前为月嚎 A 模式' };
      if (state.phase !== 'prepare') return { ok: false, error: '只能在摸牌前选择' };
      if (side.hp <= 5) return { ok: false, error: '生命不足 5 点，无法承担月嚎代价' };
      side.temp.werewolfJudge = !side.temp.werewolfJudge;
      log(state, side.name + (side.temp.werewolfJudge ? ' 决定发动【月嚎】判定' : ' 取消【月嚎】判定'), 'passive', side.id);
      return { ok: true, judge: side.temp.werewolfJudge };
    }

    if (ability === 'selfHarm') {
      if (side.classId !== 'ranxue') return { ok: false, error: '职业不符' };
      if (state.phase !== 'play') return { ok: false, error: '只能在出牌阶段使用' };
      if (side.temp.selfHarm) return { ok: false, error: '本回合已经使用过【新生】' };
      const atk = side.hand.find((c) => c.uid === payload.uid && (c.type === 'break' || c.type === 'normal'));
      if (!atk) return { ok: false, error: '请选择一张攻击卡' };
      const value = atk.value;
      const expectLoss = Math.max(0, value - totalArmor(side));
      if (expectLoss >= side.hp) return { ok: false, error: '生命不足以承受这次自伤' };
      side.temp.selfHarm = 1;
      side.temp.newbornValue = value;
      const absorbed = consumeArmor(state, side, value, {});
      const rest = value - absorbed;
      if (rest > 0) loseHp(state, side, rest, { label: '新生', noReflect: true });
      log(state, side.name + ' 发动【新生】选择「' + atk.name + '」：受到 ' + value + ' 点可被护盾抵挡的伤害，回合结束回复 ' + value + ' 点生命', 'passive', side.id);
      return { ok: true };
    }

    if (ability === 'sameSorrow') {
      if (side.classId !== 'xunqing') return { ok: false, error: '职业不符' };
      if (state.phase !== 'play' && state.phase !== 'prepare') return { ok: false, error: '当前不能切换' };
      side.long.sameSorrow = !side.long.sameSorrow;
      log(state, side.name + ' ' + (side.long.sameSorrow ? '开启' : '关闭') + '【同殇】', 'passive', side.id);
      return { ok: true, enabled: side.long.sameSorrow };
    }

    return { ok: false, error: '未知能力' };
  }

  function payDiscard(state, side, n, reason, uids) {
    if (side.hand.length < n) return false;
    let picked = [];
    if (Array.isArray(uids)) {
      const seen = {};
      uids.forEach((uid) => {
        if (picked.length >= n || seen[uid]) return;
        const card = side.hand.find((c) => c.uid === uid);
        if (card) { picked.push(card); seen[uid] = true; }
      });
    }
    const pool = side.hand.slice().sort((a, b) => a.value - b.value);
    while (picked.length < n && pool.length) picked.push(pool.shift());
    picked = picked.slice(0, n);
    picked.forEach((card) => {
      side.hand = side.hand.filter((c) => c.uid !== card.uid);
      side.discard.push(card);
      noteCaptainCards(state, side, 1);
      log(state, side.name + (side.isAI ? ' 弃置 1 张手牌作为' + (reason || '代价') : ' 弃置「' + card.name + '」作为' + (reason || '代价')), 'cost', side.id);
    });
    return true;
  }

  function getUltimateCost(state, sideId) {
    const side = state[sideId];
    if (!side) return { discard: 0, discardAll: false, hp: 0 };
    const charId = side.classId;
    const needDiscard = { kupai: 2, dao: 2, chuanzhang: 2, baobao: 1, chensiyu: 1, kuaishou: 1, sanyueqi: 1, jianbi: 1, chuanxi: 1, suyu: 1, shihuangzhe: 1 }[charId] || 0;
    const selfCost = { fanren: 3, yuxue: 4, ranxue: 3, pojiazhankuang: 3, dunai: 2, nvwu: 3, langren: 6 }[charId] || 0;
    return { discard: needDiscard, discardAll: charId === 'yuyanjia', hp: selfCost };
  }

  function useUltimate(state, sideId, opts) {
    opts = opts || {};
    const side = state[sideId];
    if (!side) return { ok: false, error: '无效角色' };
    if (!state.ultimatesEnabled) return { ok: false, error: '本局必杀技已关闭' };
    if (state.phase !== 'play') return { ok: false, error: '必杀只能在出牌阶段使用' };
    if (state.active !== sideId) return { ok: false, error: '不是你的回合' };
    if (side.long.ultimateUsed) return { ok: false, error: '本局必杀已经使用过' };
    const charId = side.classId;

    // 代价检查
    const needDiscard = { kupai: 2, dao: 2, chuanzhang: 2, baobao: 1, chensiyu: 1, kuaishou: 1, sanyueqi: 1, jianbi: 1, chuanxi: 1, suyu: 1, shihuangzhe: 1 }[charId] || 0;
    if (side.hand.length < needDiscard) return { ok: false, error: '手牌不足以支付必杀代价' };
    const selfCost = { fanren: 3, yuxue: 4, ranxue: 3, pojiazhankuang: 3, dunai: 2, nvwu: 3, langren: 6 }[charId] || 0;
    if (selfCost && side.hp <= selfCost) return { ok: false, error: '生命不足以支付必杀代价' };
    const xunqingHalf = charId === 'xunqing' ? Math.floor(side.hp / 2) : 0;
    if (charId === 'xunqing' && side.hp < 2) return { ok: false, error: '生命不足以支付必杀代价' };

    side.long.ultimateUsed = true;
    side.temp.ultimate = true;
    side.temp.ultimateName = side.char.ultimateName;
    log(state, '★ ' + side.name + ' 发动必杀【' + side.char.ultimateName + '】！', 'ultimate', side.id);
    if (needDiscard) payDiscard(state, side, needDiscard, '必杀', opts.discardUids);
    if (charId === 'yuyanjia') {
      const count = side.hand.length;
      side.discard.push.apply(side.discard, side.hand);
      side.hand = [];
      side.selection = [];
      side.choices = {};
      noteCaptainCards(state, side, count);
      log(state, side.name + ' 弃置全部手牌（' + count + ' 张）作为【命定】的代价', 'cost', side.id);
    }
    if (selfCost) loseHp(state, side, selfCost, { label: '必杀代价', noReflect: true });
    if (charId === 'xunqing') loseHp(state, side, xunqingHalf, { label: '必杀代价', noReflect: true });
    if (side.hp <= 0) {
      resolveDeaths(state);
      return { ok: true, died: true };
    }

    const foe = otherSide(state, side);
    switch (charId) {
      case 'baobao':
        healSide(state, side, 5, '奶妈降临');
        drawCards(state, side, 1);
        break;
      case 'fanren':
        healSide(state, side, 3, '不屈凡躯');
        side.temp.damageReduction += 2;
        break;
      case 'chensiyu':
        drawCards(state, side, 3);
        break;
      case 'kuaishou':
        takeFromOpponent(state, side, 2);
        break;
      case 'sanyueqi':
        foe.status.frozenTurn = foe.turnsTaken + 1;
        log(state, side.name + ' 发动【冰刻箭雨之时】：冻结 ' + foe.name + ' 的所有牌，其下一回合无法出牌', 'status', side.id);
        break;
      case 'yuxue':
        side.temp.damagePerCard += 3;
        break;
      case 'kupai':
        side.deck = shuffle(side.deck.concat(side.discard), state.rng);
        side.discard = [];
        log(state, side.name + ' 将弃牌堆洗入牌库', 'passive', side.id);
        drawCards(state, side, 3);
        break;
      case 'jifeng':
        directDamage(state, side, foe, 6, { label: '一箭穿心', noReflect: false });
        break;
      case 'xunqing':
        directDamage(state, side, foe, xunqingHalf, { label: '生死相许', noReflect: false });
        break;
      case 'moshushou':
        side.temp.playLimitBonus += 2;
        side.temp.damagePerCard += 1;
        side.status.pendingDrawPenalty += 1;
        break;
      case 'ranxue':
        drawCards(state, side, 2);
        side.temp.damagePerCard += 2;
        break;
      case 'jianbi':
        addArmor(state, side, 8, '绝对壁垒');
        side.temp.damageReduction += 2;
        break;
      case 'chuanxi':
        side.temp.ignoreArmorAll = true;
        drawCards(state, side, 1);
        break;
      case 'suyu':
        healSide(state, side, 6, '生命洪流');
        side.temp.damageReduction += 1;
        break;
      case 'pojiazhankuang':
        side.temp.breakMultiplier = 2;
        break;
      case 'dunai':
        directDamage(state, side, foe, 5, { label: '剧毒奶昔', noReflect: false });
        foe.status.healLockUntilTurn = foe.turnsTaken + 2;
        log(state, foe.name + ' 下回合无法回血', 'status', foe.id);
        break;
      case 'yuyanjia': {
        side.long.allSeeing = true;
        side.long.viewOpponent = true;
        let selected = Array.isArray(opts.opponentUids) ? opts.opponentUids : [];
        selected = selected.filter((uid) => foe.hand.some((c) => c.uid === uid)).slice(0, 2);
        if (side.isAI && !selected.length) {
          selected = foe.hand.slice().sort((a, b) => b.value - a.value).slice(0, 2).map((c) => c.uid);
        }
        const moved = [];
        selected.forEach((uid) => {
          const idx = foe.hand.findIndex((c) => c.uid === uid);
          if (idx < 0) return;
          const card = foe.hand.splice(idx, 1)[0];
          foe.deck.push(card);
          moved.push(card.name);
        });
        if (moved.length) log(state, side.name + ' 将对方 ' + moved.length + ' 张手牌放回其牌库底', 'status', side.id);
        log(state, side.name + ' 获得【命定】：对方手牌持续公开，必杀已替换为【查看】', 'status', side.id);
        break;
      }
      case 'nvwu':
        directDamage(state, side, foe, 4, { label: '万毒锅', noReflect: false });
        drawCards(state, side, 2);
        break;
      case 'langren':
        side.status.wolfFormUntilTurn = side.turnsTaken + CONFIG.WOLF_FORM_TURNS;
        log(state, side.name + ' 进入【狼化】：出牌上限 +1，所有伤害 +2，持续 2 回合', 'status', side.id);
        break;
      case 'dao':
        if (hasArmor(foe)) {
          const absorbed = consumeArmor(state, foe, 8, {});
          const rest = 8 - absorbed;
          if (rest > 0) loseHp(state, foe, rest, { label: '断魂', sourceId: side.id });
        } else {
          directDamage(state, side, foe, 8, { label: '断魂', noReflect: false });
        }
        break;
      case 'shihuangzhe':
        for (let i = 0; i < 2 && side.discard.length > 0; i += 1) {
          const card = side.discard.pop();
          side.hand.push(card);
          log(state, side.name + (side.isAI ? ' 从弃牌堆拾回 1 张牌' : ' 从弃牌堆拾回「' + card.name + '」'), 'draw', side.id);
        }
        drawCards(state, side, 1);
        break;
      case 'chuanzhang':
        directDamage(state, side, foe, 5, { label: '风暴', noReflect: false });
        healSide(state, side, 5, '风暴');
        break;
      default:
        break;
    }
    resolveDeaths(state);
    side.selection = side.selection.filter((uid) => side.hand.some((c) => c.uid === uid));
    if (state.phase === 'gameover' && !state.lastResult) finishResult(state);
    return { ok: true };
  }

  function directDamage(state, source, target, amount, opts) {
    opts = opts || {};
    if (target.hp <= 0) return 0;
    let dmg = Math.max(0, Math.floor(amount));
    if (dmg > 0 && !opts.raw && source) {
      let bonus = 0;
      if (isWolfForm(state, source)) bonus += 2;
      if (source.classId === 'langren' && source.long.wolfMode === 'A' && source.hp <= 8) bonus += 1;
      if (source.pendingNextDamage > 0) {
        bonus += source.pendingNextDamage;
        source.pendingNextDamage = 0;
      }
      if (bonus) {
        dmg += bonus;
        log(state, source.name + ' 的伤害加成使本次真伤 +' + bonus, 'passive', source.id);
      }
    }
    if (dmg <= 0) return 0;
    if (target.classId === 'xunqing' && target.long.sameSorrow && !opts.noReflect && dmg > 0) {
      const actual = Math.floor(dmg * 1.5);
      const extra = actual - dmg;
      log(state, target.name + ' 触发【同殇】，伤害变为 ' + actual + ' 点，并反噬对手 ' + dmg + ' 点', 'passive', target.id);
      loseHp(state, target, actual, { label: opts.label || '伤害', sourceId: source.id, noReflect: true });
      if (source.hp > 0) loseHp(state, source, dmg, { label: '同殇反噬', sourceId: target.id, noReflect: true });
      return actual;
    }
    loseHp(state, target, dmg, { label: opts.label || '真实伤害', sourceId: source.id, noReflect: true });
    return dmg;
  }

  /* ---------------- 摸牌阶段 ---------------- */
  function resolveDestiny(state, side) {
    const caster = otherSide(state, side);
    if (!caster.long.destinyPendingCardId) return;
    const wanted = caster.long.destinyPendingCardId;
    const def = cardDef(wanted);
    const idx = side.deck.findIndex((c) => c.id === wanted);
    if (idx < 0) {
      side.temp.destinySkip = true;
      caster.long.destinyPendingCardId = null;
      log(state, '【命定】发动：' + side.name + ' 的牌库中已无指定牌，跳过摸牌', 'passive', caster.id);
      return;
    }
    const card = side.deck.splice(idx, 1)[0];
    side.deck.unshift(card);
    caster.long.destinyPendingCardId = null;
    log(state, '【命定】发动：' + side.name + (caster.isAI ? ' 下一次摸到的牌被指定' : ' 下一次摸到的牌被指定为「' + card.name + '」'), 'passive', caster.id);
  }

  function drawPhaseFor(state, side) {
    const foe = otherSide(state, side);
    if (side.temp.skipDraw) {
      if (side.temp.skipKind === 'scavenge' && side.temp.scavengeUid) {
        const idx = side.discard.findIndex((c) => c.uid === side.temp.scavengeUid);
        if (idx >= 0) {
          const card = side.discard.splice(idx, 1)[0];
          gainCard(state, side, card);
          log(state, side.name + ' 跳过摸牌，用【开拓】拾回「' + card.name + '」', 'passive', side.id);
        }
      } else {
        side.status.pendingDrawPenalty += 1;
        log(state, side.name + ' 跳过摸牌阶段；下回合摸牌 -1，本回合可出 3 张（不能使用凝神）', 'passive', side.id);
      }
      resolveDeaths(state);
      return;
    }

    resolveDestiny(state, side);
    if (side.temp.destinySkip) {
      resolveDeaths(state);
      return;
    }

    if (side.temp.werewolfJudge) {
      if (side.hp <= 5) {
        log(state, side.name + ' 生命不足以发动【月嚎】判定', 'status', side.id);
      } else {
        loseHp(state, side, 5, { label: '月嚎代价', noReflect: true });
        log(state, side.name + ' 发动【月嚎】判定，失去 5 点生命', 'passive', side.id);
        if (side.hp <= 0) { resolveDeaths(state); return; }
      }
    }

    let n = CONFIG.BASE_DRAW - (side.status.drawPenalty || 0);
    side.status.drawPenalty = 0;
    if (side.temp.destinySkip) n = 0;
    if (n < 0) n = 0;
    const drawn = drawCards(state, side, n);
    log(state, side.name + ' 摸牌阶段摸了 ' + drawn.length + ' 张牌', 'draw', side.id);

    if (side.temp.werewolfJudge && drawn.length >= 2) {
      let pair = false;
      const ids = {};
      drawn.forEach((c) => { ids[c.id] = (ids[c.id] || 0) + 1; if (ids[c.id] >= 2) pair = true; });
      if (pair) {
        const duplicated = drawn.filter((c, i) => drawn.findIndex((x) => x.id === c.id) !== i).map((c) => c.name);
        log(state, '🌕 【月嚎】判定成功！摸到相同的牌：' + (duplicated.join('、') || drawn[0].name), 'ultimate', side.id);
        directDamage(state, side, foe, 15, { label: '月嚎·满月撕咬', noReflect: false });
        side.status.wolfFormUntilTurn = side.turnsTaken + CONFIG.WOLF_FORM_TURNS;
        log(state, side.name + ' 进入【狼化】：出牌上限 +1，所有伤害 +2，持续 2 回合', 'status', side.id);
      } else {
        log(state, side.name + ' 的【月嚎】判定失败，没有摸到相同的牌', 'status', side.id);
      }
    }
    resolveDeaths(state);
  }

  function startDraw(state) {
    if (state.phase !== 'prepare') return { ok: false, error: '当前不在准备阶段' };
    if (!state.active) return { ok: false, error: '尚未开始回合' };
    state.phase = 'draw';
    log(state, '—— 摸牌阶段 ——', 'round');
    const side = state[state.active];
    drawPhaseFor(state, side);
    if (state.phase === 'gameover') return { ok: true, gameover: true };
    state.phase = 'play';
    log(state, '—— 出牌阶段：最多打出 ' + currentPlayLimit(state, side) + ' 张牌，双击手牌打出 ——', 'round');
    state.aiPlan = null;
    return { ok: true };
  }

  /* ---------------- 结算 ---------------- */
  function computeArmorValue(side, card) {
    let v = card.value;
    if (side.classId === 'jianbi') v += 1;
    if (side.classId === 'sanyueqi') v += 1;
    if (side.classId === 'pojiazhankuang') v -= 1;
    return Math.max(0, v);
  }

  function buildIntent(state, side, cards) {
    const foe = otherSide(state, side);
    const intent = {
      cards,
      names: [],
      armorValues: [],
      breakCards: [],
      normalCards: [],
      heals: [],
      curses: [],
      draws: [],
      steals: [],
      played: [],
      notes: [],
    };
    cards.forEach((card) => {
      const idx = side.hand.findIndex((c) => c.uid === card.uid);
      if (idx < 0) return;
      side.hand.splice(idx, 1);
      side.discard.push(card);
      intent.played.push(card);
      intent.names.push(card.name);
      side.temp.playedCount += 1;
      if (side.classId === 'chuanzhang') {
        loseHp(state, side, 1, { label: '潮涌·失去牌', noReflect: true });
      }
      if (card.type === 'armor') {
        const val = computeArmorValue(side, card);
        intent.armorValues.push(val);
        addArmor(state, side, val, card.name);
      } else if (card.type === 'break') {
        const asNormal = side.status.breakAsNormalTurn > 0 && side.status.breakAsNormalTurn === side.turnsTaken;
        if (asNormal) {
          intent.normalCards.push({ card, value: card.value + (side.classId === 'jifeng' ? 1 : 0) });
        } else {
          let v = card.value;
          if (side.classId === 'pojiazhankuang') v += 2;
          intent.breakCards.push({ card, value: v });
        }
        if (card.id === 'juesha') {
          side.status.armorLockTurn = side.turnsTaken + 1;
          foe.status.breakAsNormalTurn = foe.turnsTaken + 1;
          log(state, '【绝杀】余波：' + side.name + ' 下回合不能使用叠甲卡；' + foe.name + ' 下回合破甲卡可当普通伤害牌打出', 'status', side.id);
        }
      } else if (card.type === 'normal') {
        intent.normalCards.push({ card, value: card.value + (side.classId === 'jifeng' ? 1 : 0) });
      } else if (card.type === 'rest') {
        if (card.id === 'ningshen') {
          const mode = side.choices[card.uid] || 'draw';
          if (mode === 'steal' && side.classId === 'kuaishou') intent.steals.push({ count: 2 });
          else intent.draws.push({ count: 2 + (side.classId === 'chensiyu' ? 1 : 0) });
        } else {
          const mode = side.choices[card.uid] || 'heal';
          if (mode === 'curse' && side.classId === 'dunai') intent.curses.push({ value: card.value });
          else intent.heals.push({ value: card.value, card });
        }
      }
    });
    intent.playedCount = intent.played.length;
    return intent;
  }

  function applyRoundDamageBonuses(state, side, intent) {
    const wolf = isWolfForm(state, side) ? 2 : 0;
    const wolfA = (side.classId === 'langren' && side.long.wolfMode === 'A' && side.hp <= 8) ? 1 : 0;
    const flat = side.temp.damagePerCard || 0;
    const breakMult = side.temp.breakMultiplier || 1;
    let breakTotal = 0;
    let normalTotal = 0;
    let bonusLeft = side.pendingNextDamage || 0;
    let bonusUsed = false;
    intent.breakCards.forEach((entry) => {
      let v = entry.value + wolf + wolfA + flat;
      if (bonusLeft > 0 && !bonusUsed) { v += bonusLeft; bonusUsed = true; }
      const before = v;
      v = Math.floor(v * breakMult);
      if (before !== v) entry.note = '翻倍';
      breakTotal += Math.max(0, v);
    });
    intent.normalCards.forEach((entry) => {
      let v = entry.value + wolf + wolfA + flat;
      if (bonusLeft > 0 && !bonusUsed) { v += bonusLeft; bonusUsed = true; }
      normalTotal += Math.max(0, v);
    });
    side.pendingNextDamage = bonusUsed ? 0 : bonusLeft;
    return { breakTotal: Math.max(0, breakTotal), normalTotal: Math.max(0, normalTotal) };
  }

  function applyDamagePacket(state, attacker, target, packet) {
    let breakDmg = packet.breakTotal;
    let normalDmg = packet.normalTotal;
    let trueDmg = packet.trueTotal;
    const hadArmor = hasArmor(target);
    if (packet.hadDamageCards) target.temp.wasAttacked = true;
    if (hadArmor && (breakDmg > 0 || normalDmg > 0)) {
      state.shieldHitSeq = (state.shieldHitSeq || 0) + 1;
      state.lastShieldHit = { seq: state.shieldHitSeq, sideId: target.id, broken: false };
    }
    // 修正：普通伤害在结算时如果对方仍有护盾，完全无法造成伤害。
    if (normalDmg > 0 && hasArmor(target)) {
      log(state, target.name + ' 持有护盾，普通伤害被完全抵消', 'armor', target.id);
      normalDmg = 0;
    }
    if (target.classId === 'sanyueqi' && packet.hadDamageCards) {
      target.long.cutePending = false;
    }
    if (target.classId === 'jianbi') {
      if (breakDmg > 0 && hadArmor) breakDmg = Math.max(0, breakDmg - 1);
      if (normalDmg > 0) normalDmg = Math.max(0, normalDmg - 1);
    }
    if (target.temp.damageReduction > 0) {
      const total = breakDmg + normalDmg;
      const reduce = Math.min(total, target.temp.damageReduction);
      if (breakDmg >= reduce) breakDmg -= reduce;
      else { const rest = reduce - breakDmg; breakDmg = 0; normalDmg = Math.max(0, normalDmg - rest); }
      if (reduce > 0) log(state, target.name + ' 的减伤效果减免了 ' + reduce + ' 点伤害', 'status', target.id);
    }
    const incoming = breakDmg + normalDmg;
    if (incoming <= 0 && trueDmg <= 0) {
      if (state.lastShieldHit && state.lastShieldHit.sideId === target.id && totalArmor(target) <= 0) {
        state.lastShieldHit.broken = true;
      }
      return;
    }

    // 殉情者 · 同殇
    if (target.classId === 'xunqing' && target.long.sameSorrow && !packet.reflected && (incoming + trueDmg) > 0) {
      const original = incoming + trueDmg;
      const actual = Math.floor(original * 1.5);
      const extra = actual - original;
      trueDmg += extra;
      log(state, target.name + ' 触发【同殇】：自己受到 ' + actual + ' 点伤害（原 ' + original + '），并对 ' + attacker.name + ' 造成 ' + original + ' 点反噬', 'passive', target.id);
      loseHp(state, attacker, original, { label: '同殇反噬', sourceId: target.id, noReflect: true });
      packet.reflected = true;
    }

    let absorbed = 0;
    if (breakDmg > 0) {
      const attackerIgnoresHalf = attacker.classId === 'chuanxi' && totalArmor(target) >= 8;
      const ignoreAll = attacker.temp.ignoreArmorAll === true;
      absorbed = consumeArmor(state, target, breakDmg, { ignoreHalf: attackerIgnoresHalf, ignoreAll });
      const rest = breakDmg - absorbed;
      if (rest > 0) loseHp(state, target, rest, { label: '破甲', sourceId: attacker.id, noReflect: true });
    }
    if (normalDmg > 0) {
      loseHp(state, target, normalDmg, { label: '普通伤害', sourceId: attacker.id, noReflect: true });
    }
    if (trueDmg > 0) {
      loseHp(state, target, trueDmg, { label: '真实伤害', sourceId: attacker.id, noReflect: true });
    }
    if (breakDmg > 0 || normalDmg > 0) target.temp.wasAttacked = true;
    log(state, attacker.name + ' 的伤害结算：' + (breakDmg > 0 ? '破甲 ' + breakDmg + ' ' : '') + (normalDmg > 0 ? '普伤 ' + normalDmg + ' ' : '') + (trueDmg > 0 ? '真伤 ' + trueDmg : '') + ' → ' + target.name + ' 剩余 ' + target.hp, 'damage', attacker.id);
    if (absorbed > 0) packet.absorbed = absorbed;
    if (state.lastShieldHit && state.lastShieldHit.sideId === target.id && totalArmor(target) <= 0) {
      state.lastShieldHit.broken = true;
    }
  }

  function resolveDeaths(state) {
    if (state.phase === 'gameover') return;
    const p = state.player;
    const a = state.ai;
    SIDES.forEach((id) => {
      const side = state[id];
      if (side.hp > 0) return;
      if (side.classId === 'dao' && side.hand.length >= 2) {
        const sorted = side.hand.slice().sort((x, y) => x.value - y.value);
        const discard = sorted.slice(0, 2);
        side.hand = side.hand.filter((c) => !discard.some((d) => d.uid === c.uid));
        side.discard.push.apply(side.discard, discard);
        noteCaptainCards(state, side, discard.length);
        side.hp = 1;
        log(state, '⚔ ' + side.name + ' 发动【淬炼】，弃置「' + discard.map((c) => c.name).join('」「') + '」后复活至 1 点生命', 'ultimate', side.id);
      }
    });
    const pDead = p.hp <= 0;
    const aDead = a.hp <= 0;
    if (pDead && aDead) {
      state.winner = 'draw';
      state.phase = 'gameover';
      log(state, '双方同时倒下，本局平局', 'system');
    } else if (pDead) {
      state.winner = 'ai';
      state.phase = 'gameover';
      log(state, p.name + ' 倒下了，' + a.name + ' 获胜。', 'system');
    } else if (aDead) {
      state.winner = 'player';
      state.phase = 'gameover';
      log(state, a.name + ' 倒下了，' + p.name + ' 获胜！', 'system');
    }
  }

  function cardDamageValue(state, side, card, asNormal) {
    let v = card.value;
    if (card.type === 'normal' || asNormal) {
      if (side.classId === 'jifeng') v += 1;
    }
    if (card.type === 'break' && !asNormal && side.classId === 'pojiazhankuang') v += 2;
    if (isWolfForm(state, side)) v += 2;
    if (side.classId === 'langren' && side.long.wolfMode === 'A' && side.hp <= 8) v += 1;
    v += side.temp.damagePerCard || 0;
    if (side.pendingNextDamage > 0) {
      v += side.pendingNextDamage;
      side.pendingNextDamage = 0;
    }
    if (card.type === 'break' && !asNormal) {
      v = Math.floor(v * (side.temp.breakMultiplier || 1));
    }
    return Math.max(0, v);
  }

  function applyCardDamage(state, attacker, target, totals) {
    const packet = {
      breakTotal: Math.max(0, totals.breakTotal || 0),
      normalTotal: Math.max(0, totals.normalTotal || 0),
      trueTotal: Math.max(0, totals.trueTotal || 0),
      hadDamageCards: !!(totals.hadDamageCards),
      reflected: false,
    };
    target.temp.hadArmorBefore = hasArmor(target);
    applyDamagePacket(state, attacker, target, packet);
    if (target.classId === 'sanyueqi' && target.temp.hadArmorBefore && target.temp.wasAttacked && totalArmor(target) > 0) {
      const smallest = smallestDamageCard(target.hand);
      if (smallest) {
        log(state, target.name + ' 的【少女的特权】触发，持甲被击且护甲未碎，反击 ' + smallest.value + ' 点伤害', 'passive', target.id);
        loseHp(state, attacker, smallest.value, { label: '少女的特权', sourceId: target.id, noReflect: true });
      }
    }
    resolveDeaths(state);
    return packet;
  }

  function playCard(state, sideId, uid, opts) {
    opts = opts || {};
    if (state.phase !== 'play') return { ok: false, error: '当前不是出牌阶段' };
    if (state.active !== sideId) return { ok: false, error: '不是你的回合' };
    const side = state[sideId];
    if (!side) return { ok: false, error: '无效角色' };
    const card = side.hand.find((c) => c.uid === uid);
    if (!card) return { ok: false, error: '牌不在手中' };
    const info = playableInfo(state, side, card);
    if (!info.ok) return { ok: false, error: info.reason };

    const foe = otherSide(state, side);
    const modes = cardModeOptions(state, side, card);
    let choice = opts.choice || side.choices[uid] || (modes.length ? modes[0].id : null);
    if (modes.length && !modes.some((m) => m.id === choice)) choice = modes[0].id;
    const startLog = state.log.length;

    // 打出与消耗
    side.hand = side.hand.filter((c) => c.uid !== uid);
    side.discard.push(card);
    side.temp.playedCount = (side.temp.playedCount || 0) + 1;
    side.temp.playedCards.push({
      uid: card.uid, id: card.id, name: card.name, type: card.type, value: card.value,
      desc: card.desc, img: card.img, choice,
    });
    delete side.choices[uid];
    noteCaptainCards(state, side, 1);
    log(state, side.name + ' 打出「' + card.name + '」' + (choice === 'curse' ? '（腐乳）' : ''), 'play', side.id);

    const summary = { damage: 0, heal: 0, armor: 0, draws: 0, notes: [] };

    if (card.type === 'armor') {
      const val = computeArmorValue(side, card);
      side.temp.armorValues.push(val);
      addArmor(state, side, val, card.name);
      summary.armor = val;
    } else if (card.type === 'break') {
      const asNormal = side.status.breakAsNormalTurn > 0 && side.status.breakAsNormalTurn === side.turnsTaken;
      if (card.id === 'juesha') {
        side.status.armorLockTurn = side.turnsTaken + 1;
        foe.status.breakAsNormalTurn = foe.turnsTaken + 1;
        log(state, '【绝杀】余波：' + side.name + ' 下回合不能使用叠甲卡；' + foe.name + ' 下回合破甲卡可当普通伤害牌打出', 'status', side.id);
      }
      const value = cardDamageValue(state, side, card, asNormal);
      if (asNormal) {
        log(state, '【破甲→普伤】「' + card.name + '」作为普通伤害结算', 'damage', side.id);
        summary.damage = value;
        applyCardDamage(state, side, foe, { normalTotal: value, hadDamageCards: true });
      } else {
        summary.damage = value;
        applyCardDamage(state, side, foe, { breakTotal: value, hadDamageCards: true });
      }
    } else if (card.type === 'normal') {
      const value = cardDamageValue(state, side, card, false);
      summary.damage = value;
      applyCardDamage(state, side, foe, { normalTotal: value, hadDamageCards: true });
    } else if (card.type === 'rest') {
      if (card.id === 'ningshen') {
        if (choice === 'steal' && side.classId === 'kuaishou') {
          takeFromOpponent(state, side, 2);
          summary.notes.push('偷取对手 2 张手牌');
        } else {
          const n = 2 + (side.classId === 'chensiyu' ? 1 : 0);
          drawCards(state, side, n);
          summary.draws = n;
          if (side.classId === 'chensiyu') log(state, '【别吵，我在烧烤】凝神额外摸 1 张牌', 'passive', side.id);
        }
      } else if (choice === 'curse' && side.classId === 'dunai') {
        log(state, side.name + ' 的【腐乳】将「奶」化为毒：对 ' + foe.name + ' 造成 ' + card.value + ' 点真实伤害，并封锁回血', 'passive', side.id);
        summary.damage = card.value;
        directDamage(state, side, foe, card.value, { label: '腐乳', noReflect: false });
        foe.status.healLockUntilTurn = foe.turnsTaken + 2;
      } else {
        healSide(state, side, card.value, card.name);
        summary.heal = card.value;
      }
    }

    resolveDeaths(state);
    state.playSeq += 1;
    state.lastPlay = {
      seq: state.playSeq,
      sideId: side.id,
      card: { uid: card.uid, id: card.id, name: card.name, type: card.type, value: card.value, desc: card.desc, img: card.img },
      choice,
      summary,
      logs: state.log.slice(startLog).map((l) => ({ text: l.text, kind: l.kind, sideId: l.sideId })),
    };
    if (state.phase === 'gameover' && !state.lastResult) finishResult(state);
    return { ok: true, play: state.lastPlay, gameover: state.phase === 'gameover' };
  }

  function endTurn(state) {
    if (state.phase !== 'play') return { ok: false, error: '当前不是出牌阶段' };
    const active = state[state.active];
    if (!active) return { ok: false, error: '尚未开始回合' };

    // 双叠甲：自己回合结束时记录，等下一回合开始检查是否未被击碎
    if (active.classId !== 'sanyueqi' && active.temp.armorValues.length >= 2) {
      const keep = Math.min.apply(null, active.temp.armorValues);
      active.long.doubleArmorPending = keep;
      active.long.doubleArmorTier = armorTierFor(keep);
      log(state, active.name + ' 打出双叠甲；若对手回合结束时护甲未被全部击碎，下回合保留较小值作为额外护盾', 'armor', active.id);
    } else {
      active.long.doubleArmorPending = 0;
      active.long.doubleArmorTier = null;
    }

    // 回合结束触发
    if (active.hp > 0) {
      if (active.classId === 'suyu') {
        const heal = active.hp <= 8 ? 2 : 1;
        if (active.temp.playedCount <= 1) healSide(state, active, heal, '静息');
        else log(state, active.name + ' 本回合打出 ' + active.temp.playedCount + ' 张牌，【静息】未触发', 'passive', active.id);
      }
      if (active.classId === 'ranxue' && active.temp.newbornValue > 0) {
        healSide(state, active, active.temp.newbornValue, '新生');
      }
      if (active.classId === 'sanyueqi') {
        active.long.cutePending = totalArmor(active) > 0;
        if (active.long.cutePending) log(state, active.name + ' 持甲结束回合，若下个对手回合未被攻击，下回合可转化护甲', 'passive', active.id);
      }
    }
    resolveDeaths(state);
    log(state, '—— ' + active.name + ' 结束回合 ——', 'round');
    finishResult(state);
    return { ok: true, gameover: state.phase === 'gameover' };
  }

  function finishResult(state) {
    const active = state[state.active];
    const played = (active.temp.playedCards || []).slice();
    state.player.selection = [];
    state.ai.selection = [];
    state.lastResult = {
      round: state.round,
      turnSide: state.active,
      turnName: active.name,
      logs: state.log.slice(state.turnLogStart || 0),
      playedCards: played.map((c) => c.name),
      playedCardDetails: played,
      playerHp: state.player.hp,
      aiHp: state.ai.hp,
      playerArmor: totalArmor(state.player),
      aiArmor: totalArmor(state.ai),
      winner: state.winner,
      ultimate: !!(active.temp && active.temp.ultimate),
    };
    state.aiPlan = null;
    state.phase = state.winner ? 'gameover' : 'result';
  }

  function commitTurn(state) {
    if (state.phase !== 'play') return { ok: false, error: '当前不是出牌阶段' };
    return endTurn(state);
  }

  function runAITurn(state, controller) {
    if (state.phase === 'gameover') return { ok: false, error: '对局已结束' };
    if (state.active !== 'ai') return { ok: false, error: '现在不是电脑的回合' };
    const ctrl = controller || state.controllers.ai;
    if (ctrl && typeof ctrl.prepare === 'function') {
      try { ctrl.prepare(state); } catch (e) { /* AI 失败不影响对局 */ }
    }
    if (state.phase === 'gameover') return { ok: true, gameover: true };
    const r = startDraw(state);
    if (!r.ok || state.phase === 'gameover') return { ok: !!(r.ok), gameover: state.phase === 'gameover' };
    if (ctrl && typeof ctrl.beforeCards === 'function') {
      try { ctrl.beforeCards(state); } catch (e) { /* AI 失败不影响对局 */ }
    }
    let guard = 0;
    while (state.phase === 'play' && guard < 12) {
      guard += 1;
      let pick = null;
      if (ctrl && typeof ctrl.chooseOne === 'function') {
        try { pick = ctrl.chooseOne(state); } catch (e) { pick = null; }
      }
      if (!pick) break;
      const res = playCard(state, 'ai', pick.uid, { choice: pick.choice });
      if (!res.ok || state.phase === 'gameover') break;
    }
    if (state.phase === 'play') endTurn(state);
    return { ok: true, gameover: state.phase === 'gameover' };
  }

  function getPlayLimit(state, sideId) {
    const side = state[sideId];
    return currentPlayLimit(state, side);
  }

  function canUseUltimate(state, sideId) {
    const side = state[sideId];
    if (!state.ultimatesEnabled) return { ok: false, reason: '本局必杀技已关闭' };
    if (state.active !== sideId) return { ok: false, reason: '不是你的回合' };
    if (state.phase !== 'play') return { ok: false, reason: '仅出牌阶段可用' };
    if (side.long.ultimateUsed) return { ok: false, reason: '本局已使用' };
    return { ok: true };
  }

  function getAbilityInfo(state, sideId) {
    const side = state[sideId];
    const mine = state.active === sideId;
    const out = {};
    if (side.classId === 'sanyueqi') out.cute = mine && side.long.cuteWindowTurn === side.turnsTaken && state.phase === 'prepare' && !side.temp.cuteUsed;
    if (side.classId === 'chensiyu') out.meditation = mine && !side.long.meditationUsed && (state.phase === 'prepare' || state.phase === 'play');
    if (side.classId === 'kupai') out.withered = mine && !side.long.witheredUsed && (state.phase === 'prepare' || state.phase === 'play') && side.hp <= 4;
    if (side.classId === 'yuyanjia' && side.long.viewOpponent) out.viewOpponent = mine && (state.phase === 'prepare' || state.phase === 'play');
    if (side.classId === 'moshushou') out.magicianSkip = mine && state.phase === 'prepare';
    if (side.classId === 'shihuangzhe') out.scavenge = mine && state.phase === 'prepare' && side.discard.length > 0;
    if (side.classId === 'langren' && side.long.wolfMode === 'B') out.wolfJudge = mine && state.phase === 'prepare' && side.hp > 5;
    if (side.classId === 'ranxue') out.selfHarm = mine && state.phase === 'play' && !side.temp.selfHarm && side.hand.some((c) => c.type === 'break' || c.type === 'normal');
    if (side.classId === 'xunqing') out.sameSorrow = mine && (state.phase === 'play' || state.phase === 'prepare');
    return out;
  }

  function concede(state, sideId) {
    if (state.phase === 'gameover') return;
    const loser = sideId || 'player';
    state.winner = loser === 'player' ? 'ai' : 'player';
    state.phase = 'gameover';
    state.lastResult = null;
    log(state, (state[loser] ? state[loser].name : '玩家') + ' 认输了。', 'system');
  }

  const API = {
    createGame,
    chooseSetup,
    startGame,
    beginTurn,
    nextTurn,
    startDraw,
    selectCard,
    deselectCard,
    setCardChoice,
    getSelectedCards,
    usePrepAbility,
    useUltimate,
    getUltimateCost,
    commitTurn,
    playCard,
    endTurn,
    runAITurn,
    resolveDeaths,
    getPlayLimit,
    cardModeOptions,
    playableInfo,
    canUseUltimate,
    getAbilityInfo,
    concede,
    currentPlayLimit,
    hasArmor,
    totalArmor,
    isWolfForm,
    smallestDamageCard,
    makeCard,
    // 供测试 / AI 使用
    _internal: {
      gainCard, drawCards, takeFromOpponent, directDamage, loseHp, healSide,
      addArmor, consumeArmor, cardDef, otherSide, log, shuffle, makeRng,
      onHpLost, computeArmorValue, applyPoisonOnDraw, resetTemp,
    },
    CONFIG,
  };

  global.DD_ENGINE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
