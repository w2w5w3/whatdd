/* 我的刀盾 · 修正版 — 电脑对手
 * 启发式 AI：会利用职业能力、必杀、回血/破甲/普伤条件与斩杀线。
 */
(function (global) {
  'use strict';
  const E = global.DD_ENGINE || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const C = global.DD_CONFIG || (typeof require !== 'undefined' ? require('./config.js') : null);

  function rand(state) { return state.rng(); }

  function playableCards(state, side) {
    return side.hand
      .map((card) => ({ card, info: E.playableInfo(state, side, card) }))
      .filter((x) => x.info.ok);
  }

  function pickModes(state, side, picks) {
    const foe = E._internal.otherSide(state, side);
    const choices = {};
    picks.forEach((card) => {
      if (card.id === 'ningshen' && side.classId === 'kuaishou') {
        choices[card.uid] = 'steal';
      } else if ((card.id === 'tiaoxi' || card.id === 'huanyu') && side.classId === 'dunai') {
        const lethal = foe.hp <= card.value;
        if (lethal) choices[card.uid] = 'curse';
        else if (side.hp <= 7) choices[card.uid] = 'heal';
        else choices[card.uid] = foe.hp <= 10 ? 'curse' : 'heal';
      }
    });
    return choices;
  }

  function scoreCard(state, side, card) {
    const foe = E._internal.otherSide(state, side);
    const armor = E.totalArmor(foe);
    let score = 0;
    if (card.type === 'break') {
      score = 60 + card.value;
      if (armor > 0 && armor < card.value) score += 8;
    } else if (card.type === 'normal') {
      score = armor > 0 ? 8 : 58 + card.value;
      if (armor === 0 && foe.hp <= card.value) score += 25;
    } else if (card.type === 'armor') {
      score = side.hp <= 12 ? 72 : 38;
      score += card.value * 2;
    } else if (card.type === 'rest') {
      if (card.id === 'ningshen') score = side.hand.length <= 3 ? 82 : 52;
      else {
        score = side.hp <= 8 ? 80 : 24;
        if (side.classId === 'dunai') score = foe.hp <= 10 ? 84 : score;
      }
    }
    if (side.hp <= 5 && card.type === 'armor') score += 12;
    if (side.hp <= 4 && card.type === 'rest') score += 15;
    return score;
  }

  function chooseCards(state, side) {
    const foe = E._internal.otherSide(state, side);
    const limit = E.getPlayLimit(state, side.id);
    const options = playableCards(state, side);
    if (!options.length) return [];
    const armor = E.totalArmor(foe);

    // 斩杀优先：只计算已经可打出的伤害牌
    const damageOptions = options.filter((x) => x.card.type === 'break' || (x.card.type === 'normal' && armor === 0));
    const sortedDmg = damageOptions.slice().sort((a, b) => b.card.value - a.card.value);
    let dmgSum = 0;
    const lethalPicks = [];
    for (const opt of sortedDmg) {
      if (lethalPicks.length >= limit) break;
      let v = opt.card.value;
      if (opt.card.type === 'break' && side.classId === 'pojiazhankuang') v += 2;
      if (opt.card.type === 'break') {
        // 破甲会先打护甲
        lethalPicks.push(opt.card);
        dmgSum += v;
        if (dmgSum >= armor + foe.hp) break;
      } else {
        lethalPicks.push(opt.card);
        dmgSum += v;
        if (dmgSum >= foe.hp) break;
      }
    }
    const lethal = dmgSum >= (armor > 0 ? armor + foe.hp : foe.hp);
    if (lethal) return lethalPicks.slice(0, limit);

    // 通用评分
    const ranked = options
      .map((x) => ({ card: x.card, score: scoreCard(state, side, x.card) }))
      .sort((a, b) => b.score - a.score);
    const picks = [];
    const hasNingshen = side.hand.some((c) => c.id === 'ningshen');
    const skipDraw = side.temp.skipKind === 'magician';
    for (const item of ranked) {
      if (picks.length >= limit) break;
      if (skipDraw && item.card.id === 'ningshen') continue;
      // 避免在同回合选两张凝神（过牌过量）
      if (item.card.id === 'ningshen' && picks.some((c) => c.id === 'ningshen')) continue;
      picks.push(item.card);
    }
    // 若手里有凝神且位置足够、手牌不多，优先补一张凝神
    if (!skipDraw && hasNingshen && side.hand.length <= 2 && picks.length < limit) {
      const ns = side.hand.find((c) => c.id === 'ningshen' && !picks.includes(c));
      const info = ns ? E.playableInfo(state, side, ns) : null;
      if (ns && info && info.ok) picks.push(ns);
    }
    return picks.slice(0, limit);
  }

  function tryUltimate(state, side) {
    const foe = E._internal.otherSide(state, side);
    if (!E.canUseUltimate(state, side.id).ok) return false;
    const classId = side.classId;
    const lowHand = side.hand.length <= 4;
    const foeLow = foe.hp <= 9;
    const round2 = state.round >= 2;
    let use = false;
    switch (classId) {
      case 'baobao': use = side.hp <= 12 || lowHand; break;
      case 'fanren': use = side.hp <= 12 && round2; break;
      case 'chensiyu': use = lowHand; break;
      case 'kuaishou': use = lowHand || foe.hand.length >= 3; break;
      case 'sanyueqi': use = side.hp <= 12 || round2; break;
      case 'yuxue': use = side.hp > 8 && (round2 || foe.hp <= 12); break;
      case 'kupai': use = side.hp <= 6 || lowHand; break;
      case 'jifeng': use = foeLow || round2; break;
      case 'xunqing': use = side.hp > 6 && (foeLow || side.hp > foe.hp + 6); break;
      case 'moshushou': use = round2 && side.hp > 4; break;
      case 'ranxue': use = side.hp > 8 && (round2 || foeLow); break;
      case 'jianbi': use = side.hp <= 14 && round2; break;
      case 'chuanxi': use = foe.hp <= 12 || round2; break;
      case 'suyu': use = side.hp <= 12 && round2; break;
      case 'pojiazhankuang': use = side.hp > 8 && round2; break;
      case 'dunai': use = foeLow || (side.hp > 5 && round2); break;
      case 'yuyanjia': use = lowHand || round2; break;
      case 'nvwu': use = side.hp > 5 && (foeLow || round2); break;
      case 'langren': use = side.hp > 8 && (round2 || foeLow); break;
      case 'dao': use = foeLow || round2; break;
      case 'shihuangzhe': use = lowHand || round2; break;
      case 'chuanzhang': use = side.hp > 5 && (foeLow || round2); break;
      default: use = false;
    }
    if (!use) return false;
    const res = E.useUltimate(state, side.id);
    return res.ok;
  }

  function prepare(state) {
    const side = state.ai;
    if (!side || state.phase !== 'prepare') return;
    const foe = state.player;

    // 三月七：转化伤害牌为护甲
    if (side.classId === 'sanyueqi' && side.long.cuteWindowTurn === side.turnsTaken && !side.temp.cuteUsed) {
      const dmg = side.hand.filter((c) => c.type === 'break' || c.type === 'normal').sort((a, b) => b.value - a.value)[0];
      if (dmg) E.usePrepAbility(state, 'ai', 'cute', { uid: dmg.uid });
    }
    // 沉思语：额外摸牌
    if (side.classId === 'chensiyu' && !side.long.meditationUsed && side.hand.length <= 3) {
      E.usePrepAbility(state, 'ai', 'meditation');
    }
    // 枯牌先知
    if (side.classId === 'kupai' && !side.long.witheredUsed && side.hp <= 4 && side.hand.length <= 4) {
      E.usePrepAbility(state, 'ai', 'withered');
    }
    // 预言家：命定
    if (side.classId === 'yuyanjia' && !side.long.destinyUsed && state.phase === 'prepare') {
      const pool = ['tiaoxi', 'huanyu', 'ningshen', 'qingdun', 'qingji'];
      E.usePrepAbility(state, 'ai', 'destiny', { cardId: pool[Math.floor(rand(state) * pool.length)] });
    }
    // 魔术手：手牌足够时跳过摸牌，换取 3 张出牌
    if (side.classId === 'moshushou' && state.phase === 'prepare' && !side.temp.skipDraw) {
      const playable = playableCards(state, side);
      const hasNingshen = side.hand.some((c) => c.id === 'ningshen');
      if (playable.length >= 3 && !hasNingshen && side.hp > 8 && rand(state) < 0.65) {
        E.usePrepAbility(state, 'ai', 'magicianSkip');
      }
    }
    // 拾荒者：弃牌堆有高价值牌
    if (side.classId === 'shihuangzhe' && side.discard.length > 0 && side.hand.length <= 4) {
      const best = side.discard.slice().sort((a, b) => b.value - a.value)[0];
      if (best && (best.type === 'normal' || best.type === 'break' || best.value >= 5)) {
        E.usePrepAbility(state, 'ai', 'scavenge', { uid: best.uid });
      }
    }
    // 狼人 B 模式：血量充裕时赌一把
    if (side.classId === 'langren' && side.long.wolfMode === 'B' && side.hp > 8 && rand(state) < 0.55) {
      E.usePrepAbility(state, 'ai', 'wolfJudge');
    }
    // 殉情者：中期开启同殇
    if (side.classId === 'xunqing' && !side.long.sameSorrow && side.hp > 10 && foe.hp < 12) {
      side.long.sameSorrow = true;
    }
  }

  function plan(state) {
    const side = state.ai;
    if (!side || state.phase !== 'play') return { uids: [], choices: {} };
    // 必杀（若使用可能造成伤害/抽牌，再重新选牌）
    let ult = false;
    if (E.canUseUltimate(state, side.id).ok) {
      ult = tryUltimate(state, side);
      if (state.phase === 'gameover') return { uids: [], choices: {}, ultimate: ult };
    }
    // 燃血行者：如果护盾能完全挡住攻击卡数值，用【新生】换一次回合末回复
    if (side.classId === 'ranxue' && state.phase === 'play' && !side.temp.selfHarm) {
      const shield = E.totalArmor(side);
      const atk = side.hand
        .filter((c) => c.type === 'break' || c.type === 'normal')
        .sort((a, b) => b.value - a.value)
        .find((c) => c.value <= shield);
      if (atk) E.usePrepAbility(state, 'ai', 'selfHarm', { uid: atk.uid });
    }
    const picks = chooseCards(state, side);
    const choices = pickModes(state, side, picks);
    return { uids: picks.map((c) => c.uid), choices, ultimate: ult };
  }

  const AI = { prepare, plan, chooseCards, tryUltimate, playableCards };
  global.DD_AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
