/* ============================================================
 * 我的刀盾 · BLADE & SHIELD
 * ai.js — 直觉型对手：会破甲、抢血、留牌与使用职业机制
 * ============================================================ */
(function (global) {
  'use strict';
  const CG = (global.CG = global.CG || {});

  const AI = {};

  function cardDef(game, card) { return game.cardDef(card); }
  function enemyOf(game, p) { return game.other(p); }

  function permanentMods(game, p, def) {
    let v = def.value;
    if (def.type === 'break') {
      if (p.heroId === 'pojia') v += 2;
    } else if (def.type === 'damage') {
      if (p.heroId === 'jifeng') v += 1;
    }
    if (p.flags.wolfTurns > 0) v += 2;
    if (p.heroId === 'langren' && p.flags.wolfMode === 'a' && p.hp <= 8) v += 1;
    return v;
  }

  function valueOf(game, p, card) {
    const def = cardDef(game, card);
    if (def.type === 'armor') {
      let v = def.value;
      if (p.heroId === 'jianbi') v += 1;
      if (p.heroId === 'sanyueqi') v += 1;
      if (p.heroId === 'pojia') v -= 1;
      return Math.max(0, v);
    }
    if (def.type === 'break' || def.type === 'damage') return permanentMods(game, p, def);
    return def.value || 0;
  }

  function canLethal(game, p, card) {
    const enemy = enemyOf(game, p);
    const def = cardDef(game, card);
    if (!enemy) return false;
    let dmg = 0;
    if (def.type === 'damage') {
      if (game.totalShield(enemy) > 0) return false;
      dmg = permanentMods(game, p, def);
      if (enemy.heroId === 'jianbi') dmg = Math.max(0, dmg - 1);
    } else if (def.type === 'break') {
      if (game.totalShield(enemy) === 0 && !p.breakAsNormal) return false;
      let v = permanentMods(game, p, def);
      if (enemy.heroId === 'jianbi' && game.totalShield(enemy) > 0) v = Math.max(0, v - 1);
      if (p.heroId === 'chuanxi' && enemy.armor >= 8) dmg = Math.ceil(v / 2);
      else dmg = Math.max(0, v - game.totalShield(enemy));
    }
    return dmg >= enemy.hp;
  }

  function scoreCard(game, p, card) {
    const def = cardDef(game, card);
    const enemy = enemyOf(game, p);
    const shield = game.totalShield(enemy);
    let score = 0;
    if (canLethal(game, p, card)) score += 200;

    if (def.type === 'break') {
      const v = permanentMods(game, p, def);
      if (shield <= 0) {
        if (p.breakAsNormal) score = v * 1.15;
        else return -999;
      } else {
        const effective = p.heroId === 'chuanxi' && enemy.armor >= 8 ? Math.ceil(v / 2) + Math.ceil(shield / 2) : v;
        score = Math.min(v + 1, shield + 3) * 1.1;
        if (v <= shield) score += 1.5; // 轻破甲不溢出
        if (def.id === 'juesha') score -= 1.2; // 保留绝杀的可能
      }
    } else if (def.type === 'damage') {
      if (shield > 0) return -999;
      let v = valueOf(game, p, card);
      if (p.heroId === 'jifeng') v += 1; // valueOf already adds; harmless fallback
      score = v * 1.35;
      if (enemy.hp <= v) score += 200;
    } else if (def.type === 'armor') {
      if (p.noArmor) return -999;
      const v = valueOf(game, p, card);
      score = 2.2 + v * 0.15;
      if (p.hp <= 8) score += 2.5;
      if (shield === 0) score += 1.2;
      if (p.hand.filter((c) => cardDef(game, c).type === 'armor').length >= 2) score += 2;
    } else if (def.type === 'rest') {
      if (def.id === 'ningshen') {
        if (p.noNingshen) return -999;
        score = p.hand.length <= 2 ? 8 : 4.2;
        if (p.heroId === 'chensiyu') score += 1.5;
        if (p.heroId === 'kuaishou' && enemy.hand.length >= 2) score += 1.2;
      } else {
        const missing = p.maxHp - p.hp;
        if (missing <= 0) score = 0.6;
        else score = Math.min(def.heal || 0, missing) * 1.25;
        if (p.hp <= 8) score += 3.2;
        if (p.heroId === 'dunai' && enemy.hp <= (def.heal || 0) + 2) score += 5;
      }
    }
    return score;
  }

  function choosePlayable(game, p) {
    const list = p.hand
      .filter((c) => game.playability(p, c).ok)
      .map((c) => ({ card: c, score: scoreCard(game, p, c) + game.rng() * 1.2 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return list[0] ? list[0].card : null;
  }

  AI.decide = async function (game, p, spec) {
    const title = spec.title || '';
    const enemy = game.other(p);

    if (spec.kind === 'confirm') {
      if (title.includes('快手')) {
        const usable = p.hand.filter((c) => game.playability(p, c).ok).length;
        return usable >= 2 && p.hand.length >= 3;
      }
      if (title.includes('开拓')) {
        return p.discard.length > 0 && p.hand.length <= 4 &&
          p.discard.some((c) => cardDef(game, c).value >= 5);
      }
      if (title.includes('月嚎')) {
        return p.hp > 9 && game.rng() < 0.62;
      }
      if (title.includes('同殇')) {
        const m = /受到 (\d+) 点/.exec(spec.desc || '');
        const incoming = m ? parseInt(m[1], 10) : 0;
        const selfLoss = Math.floor(incoming * 1.5);
        if (enemy && enemy.hp <= incoming && p.hp > selfLoss) return true;
        return false;
      }
      if (title.includes('淬炼')) return true;
      if (title.includes('延授')) return true;
      return !!spec.default;
    }

    if (spec.kind === 'choose') {
      if (title.includes('赐福')) {
        const card = spec.card || {};
        if (card.heal && enemy && enemy.hp >= enemy.maxHp) return 'enemy';
        return 'self';
      }
      if (title.includes('腐乳')) {
        if (p.hp <= p.maxHp - 4) return 'heal';
        if (enemy && enemy.hp <= 8) return 'curse';
        return p.hp <= 10 ? 'heal' : 'curse';
      }
      if (title.includes('掠影')) {
        return enemy && enemy.hand.length >= 2 ? 'steal' : 'draw';
      }
      if (title.includes('月嚎')) {
        return game.rng() < 0.35 ? 'b' : 'a';
      }
      if (title.includes('延授')) return 'fire';
      const opts = spec.options || [];
      if (spec.default !== undefined) return spec.default;
      return opts[0] ? opts[0].value : null;
    }

    if (spec.kind === 'card') {
      const cards = spec.cards || [];
      if (!cards.length) return null;
      if (title.includes('可爱即是正义')) {
        const sorted = cards.slice().sort((a, b) => valueOf(game, p, a) - valueOf(game, p, b));
        return sorted[0].uid;
      }
      if (title.includes('新生') || title.includes('血祭')) {
        const sorted = cards.slice().sort((a, b) => valueOf(game, p, b) - valueOf(game, p, a));
        return sorted[0].uid;
      }
      if (title.includes('投喂')) {
        const sorted = cards.slice().sort((a, b) => valueOf(game, p, a) - valueOf(game, p, b));
        return sorted[0].uid;
      }
      if (title.includes('开拓')) {
        const sorted = cards.slice().sort((a, b) => valueOf(game, p, b) - valueOf(game, p, a));
        return sorted[0].uid;
      }
      return cards[0].uid;
    }

    if (spec.kind === 'cards') {
      const cards = (spec.cards || []).slice();
      const count = spec.count || 1;
      cards.sort((a, b) => valueOf(game, p, a) - valueOf(game, p, b));
      return cards.slice(0, count).map((c) => c.uid);
    }

    if (spec.kind === 'cardId') {
      if (title.includes('骇入')) {
        const ids = spec.cardIds || [];
        return ids.length ? ids[Math.floor(game.rng() * ids.length)] : 'kuaizhan';
      }
      if (title.includes('命定')) return 'kuaizhan';
      if (title.includes('毒咒')) return 'kuaizhan';
      return spec.default || 'kuaizhan';
    }

    if (spec.kind === 'type') {
      // 女巫毒咒：优先选择数量更多的“普通伤害/破甲”类牌
      if (title.includes('毒咒')) return game.rng() < 0.5 ? 'damage' : 'break';
      return 'break';
    }

    return spec.default !== undefined ? spec.default : null;
  };

  AI.playTurn = async function (game, p) {
    game.log('对手正在行动…', 'system');
    game.update();
    await game.wait(550);

    if (game.state.over) return;

    // 开局/回合主动技能
    const skills = game.activeSkillDefs(p);
    const findSkill = (id) => skills.find((s) => s.id === id);
    if (findSkill('chensiyu_draw3')?.available && p.hand.length <= 2) {
      await game.activateSkill(p, 'chensiyu_draw3');
      await game.wait(320);
    }
    if (findSkill('kupai_swap')?.available && p.hand.length < Math.max(3, p.deck.length * 0.6)) {
      await game.activateSkill(p, 'kupai_swap');
      await game.wait(320);
    }
    if (findSkill('yuyan_destiny')?.available && p.deck.length > 2) {
      await game.activateSkill(p, 'yuyan_destiny');
      await game.wait(260);
    }
    if (findSkill('dengliren_glare')?.available) {
      await game.activateSkill(p, 'dengliren_glare');
      await game.wait(260);
    }
    if (findSkill('heike_hack')?.available && p.played < p.playLimit && enemyOf(game, p).hand.length) {
      await game.activateSkill(p, 'heike_hack');
      await game.wait(260);
    }
    if (findSkill('ranxue_blood')?.available && p.hp > 11 && enemyOf(game, p).hp > 6) {
      await game.activateSkill(p, 'ranxue_blood');
      await game.wait(260);
    }
    if (findSkill('ranxue_new')?.available && p.hp <= 8 && p.hp > 4) {
      // 新生净收益为 0，低血量时避免自伤
    }

    let guard = 0;
    while (guard++ < 8 && !game.state.over) {
      if (p.played >= p.playLimit) break;
      const card = choosePlayable(game, p);
      if (!card) break;
      const before = p.played;
      await game.aiPlayCard(p, card.uid, {});
      await game.wait(340);
      if (p.played === before) break;
      if (game.state.over) return;
    }

    if (game.state.over) return;
    game.log('对手结束出牌，进入回合收尾。', 'system');
    await game.wait(380);
    await game.aiEndTurn(p);
  };

  CG.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
