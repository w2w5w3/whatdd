/* ============================================================
 * 我的刀盾 · BLADE & SHIELD
 * engine.js — 回合、卡牌、护甲、伤害与 24 职业规则引擎
 * 无 DOM 依赖，可单独在 Node 中运行测试。
 * ============================================================ */
(function (global) {
  'use strict';
  const CG = (global.CG = global.CG || {});

  let UID = 0;
  const nextUid = () => ++UID;

  function createCard(cardId, overrides) {
    const def = CG.CARD_MAP[cardId];
    if (!def) throw new Error('未知卡牌: ' + cardId);
    return Object.assign({ uid: nextUid(), id: cardId, def }, overrides || {});
  }

  function createVirtualCard(def) {
    return { uid: nextUid(), id: def.id, def, virtual: true };
  }

  function emptyPending() {
    return {
      armor: 0, break: 0, normal: 0,
      armorValues: [], cards: [], extra: false,
    };
  }

  function defaultFlags() {
    return {
      baobaoTurn: -1,
      chensiyuUsed: false,
      kupaiUsed: false,
      yuxueNextDamage: 0,
      ranxueNextBonus: 0,
      ranxueTurnBonus: 0,
      ranxueNewUsed: false,
      ranxueBloodUsed: false,
      wolfMode: null,
      wolfTurns: 0,
      wolfJudgedTurn: -1,
      poisonType: null,
      lastArmorCardId: null,
      destinyUsed: false,
      destinyCard: null,
      meiguiDelayed: null,
      meiguiActive: false,
      dutuBetUsed: false,
      dutuBetActive: false,
      armorBanNext: false,
      breakNormalNext: false,
      armorValuesThisTurn: [],
      survivalShield: null,
      extraShieldExpireTurn: 0,
    };
  }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.hooks = {
        onUpdate: () => {},
        onLog: () => {},
        onFx: () => {},
        onGameOver: () => {},
        ask: async (spec) => this.defaultAnswer(spec),
        delay: (ms) => CG.sleep(ms),
      };
      Object.assign(this.hooks, opts.hooks || {});
      this.rng = opts.rng || Math.random;
      this.fast = !!opts.fast;
      this.playerHeroId = opts.playerHeroId || 'sanyueqi';
      this.enemyHeroId = opts.enemyHeroId || 'kuaishou';
      this.state = {
        players: [],
        turnNumber: 0,
        current: 0,
        phase: 'init',
        exhausted: false,
        over: false,
        winner: null,
        log: [],
        startedAt: Date.now(),
        busy: true,
        awaitingHuman: false,
        stats: { damage: [0, 0], healed: [0, 0], cardsPlayed: [0, 0] },
        lastAction: '',
      };
      this.awaitingHuman = false;
      this.busy = true;
      this._turnToken = 0;
    }

    /* ---------------- 基础工具 ---------------- */
    get players() { return this.state.players; }
    other(p) { return this.state.players[1 - p.index]; }
    async wait(ms) { if (this.fast) return; await this.hooks.delay(ms); }
    update() { this.hooks.onUpdate(this.state, this); }
    fx(name, data) { this.hooks.onFx(name, data || {}, this); }

    log(text, tone) {
      const entry = {
        id: nextUid(),
        text,
        tone: tone || 'system',
        turn: this.state.turnNumber,
        at: Date.now(),
      };
      this.state.log.push(entry);
      if (this.state.log.length > 240) this.state.log.shift();
      this.hooks.onLog(entry, this.state);
      return entry;
    }

    defaultAnswer(spec) {
      if (!spec) return null;
      if (spec.kind === 'cards') {
        const list = (spec.cards || spec.cardIds || []).slice(0, spec.count || 1);
        return list.map((c) => (typeof c === 'string' ? c : c.uid));
      }
      if (spec.kind === 'card') {
        const list = spec.cards || [];
        return list[0] ? list[0].uid : null;
      }
      if (spec.kind === 'cardId') return spec.default || null;
      if (spec.kind === 'type') return spec.default || spec.options?.[0]?.value || null;
      if (spec.kind === 'choose') return spec.default !== undefined ? spec.default : spec.options?.[0]?.value ?? null;
      return spec.default !== undefined ? spec.default : false;
    }

    async ask(p, spec) {
      spec = Object.assign({ actor: p.index, title: '', kind: 'confirm' }, spec);
      if (this.state.over) return this.defaultAnswer(spec);
      if (p.index === 0) {
        this.update();
        return this.hooks.ask(spec, this);
      }
      if (CG.AI && typeof CG.AI.decide === 'function') {
        try { return await CG.AI.decide(this, p, spec); }
        catch (err) { return this.defaultAnswer(spec); }
      }
      return this.defaultAnswer(spec);
    }

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    buildDeck() {
      const deck = [];
      CG.CARDS.forEach((c) => {
        for (let i = 0; i < c.count; i++) deck.push(createCard(c.id));
      });
      return this.shuffle(deck);
    }

    makePlayer(index, heroId) {
      const hero = CG.HERO_MAP[heroId] || CG.HERO_MAP.sanyueqi;
      return {
        index,
        heroId: hero.id,
        hero,
        name: hero.name,
        hp: hero.hp,
        maxHp: hero.hp,
        armor: 0,
        extraShield: 0,
        deck: this.buildDeck(),
        hand: [],
        discard: [],
        played: 0,
        playLimit: CG.RULES.playPerTurn,
        pending: emptyPending(),
        nextDrawPenalty: 0,
        noArmor: false,
        noNingshen: false,
        breakAsNormal: false,
        healLock: 0,
        attackedLastOpponentTurn: false,
        flags: defaultFlags(),
      };
    }

    /* ---------------- 对局开始 ---------------- */
    async start() {
      this.state.players = [
        this.makePlayer(0, this.playerHeroId),
        this.makePlayer(1, this.enemyHeroId),
      ];
      this.log('我的刀盾 对局开始：' + this.players[0].name + ' 对阵 ' + this.players[1].name, 'turn');
      this.log('双方各持 30 张固定牌库，初始 0 护甲、0 手牌。', 'system');
      this.update();
      await this.wait(300);
      await this.setupHeroChoices();
      if (this.state.over) return;
      this.update();
      await this.beginTurn(0);
    }

    async setupHeroChoices() {
      for (const p of this.players) {
        if (p.heroId === 'nvwu') {
          const options = CG.CARD_TYPES.map((t) => {
            const info = CG.TYPE_INFO[t];
            return { value: t, label: info.name, desc: info.desc };
          });
          const pick = await this.ask(p, {
            kind: 'type',
            title: '毒咒 · 选择一种牌型投毒',
            desc: '对方每次摸到该类型的牌，受到 1 点真实伤害。例如选择「普通伤害」，对方摸到快斩或猛击都会中毒。',
            options,
            default: 'damage',
            confirmText: '投下毒咒',
          });
          p.flags.poisonType = CG.CARD_TYPES.includes(pick) ? pick : 'damage';
          this.log(p.name + ' 对「' + CG.TYPE_INFO[p.flags.poisonType].name + '」类牌投下了毒咒。', 'poison');
        }
        if (p.heroId === 'langren') {
          const pick = await this.ask(p, {
            kind: 'choose',
            title: '月嚎 · 选择形态',
            desc: '开局只能选择一种月嚎形态，整局生效。',
            options: [
              { value: 'a', label: '嗜血', desc: '血量 ≤ 8 时，造成的伤害 +1。' },
              { value: 'b', label: '月嚎', desc: '每次摸牌时可判定：失去 5 点生命；若摸到两张相同的牌，造成 15 点真伤并进入狼化两回合。' },
            ],
            default: 'a',
          });
          p.flags.wolfMode = pick === 'b' ? 'b' : 'a';
          this.log(p.name + ' 选择了月嚎形态「' + (p.flags.wolfMode === 'a' ? '嗜血' : '月嚎') + '」。', 'skill');
        }
      }
    }

    /* ---------------- 回合流程 ---------------- */
    processExtraShieldExpiry(p) {
      if (!p.extraShield) {
        p.flags.extraShieldExpireTurn = 0;
        return;
      }
      if (p.flags.extraShieldExpireTurn && this.state.turnNumber >= p.flags.extraShieldExpireTurn) {
        const value = p.extraShield;
        p.extraShield = 0;
        p.flags.extraShieldExpireTurn = 0;
        this.log('「余盾」：' + p.name + ' 的 ' + value + ' 点额外护盾在回合开始时消散。', 'armor');
        this.fx('extraShieldExpire', { player: p.index });
        this.update();
      }
    }

    recordSurvivalShield(p) {
      if (!(p.flags.armorValuesThisTurn || []).length) return;
      p.flags.survivalShield = {
        fromTurn: this.state.turnNumber,
        cardId: p.flags.lastArmorCardId,
      };
    }

    processSurvivalShield(p) {
      const pending = p.flags.survivalShield;
      if (!pending) return;
      p.flags.survivalShield = null;
      if (pending.fromTurn >= this.state.turnNumber) return;
      if (p.heroId === 'sanyueqi') {
        this.log('「少女的特权」：三月七无法将存活的护盾转化为额外护盾。', 'skill');
        return;
      }
      if (p.armor <= 0) {
        this.log('「余盾」：上回合的护盾已被击碎，未能转化为额外护盾。', 'armor');
        return;
      }
      const value = p.armor;
      p.armor = 0;
      p.extraShield = value;
      p.flags.extraShieldExpireTurn = this.state.turnNumber + 2;
      this.log('「余盾」：' + value + ' 点普通护甲全部转化为额外护盾，普通护甲清零；额外护盾将在再下一个自己回合开始时消散。', 'armor');
      this.fx('extraShieldConvert', { player: p.index, value, cardId: p.flags.lastArmorCardId });
      this.update();
    }

    async beginTurn(pi) {
      if (this.state.over) return;
      const p = this.players[pi];
      this.state.current = pi;
      this.state.turnNumber += 1;
      this.state.phase = 'start';
      this.state.lastAction = '';
      p.played = 0;
      p.playLimit = CG.RULES.playPerTurn;
      p.pending = emptyPending();
      p.flags.ranxueNewUsed = false;
      p.flags.ranxueBloodUsed = false;
      p.flags.dutuBetUsed = false;
      p.flags.dutuBetActive = false;
      p.flags.armorValuesThisTurn = [];

      // 绝杀留下的下一回合状态
      p.noArmor = !!p.flags.armorBanNext;
      p.flags.armorBanNext = false;
      p.breakAsNormal = !!p.flags.breakNormalNext;
      p.flags.breakNormalNext = false;

      // 护盾存续：先处理上一轮额外护盾消散，再检查上回合护盾是否转化为额外护盾
      this.processExtraShieldExpiry(p);
      this.processSurvivalShield(p);

      this.busy = true;
      this.awaitingHuman = false;
      this.log('—— 第 ' + this.state.turnNumber + ' 回合 · ' + p.name + ' ——', 'turn');
      this.update();
      await this.wait(420);

      // 枯牌阶段
      if (this.state.exhausted) {
        this.log('枯牌阶段：' + p.name + ' 失去 2 点生命。', 'damage');
        await this.loseHp(p, 2, { type: 'exhaust', bypass: true });
        this.fx('exhaust', { player: p.index });
        if (await this.checkDeaths()) return;
      }

      // 三月七：未被攻击且持有护甲，转化一张伤害牌
      if (p.heroId === 'sanyueqi') {
        await this.sanyueqiTurnStart(p);
        if (this.state.over) return;
      }
      // 预言家：每回合开始窥视一张
      if (p.heroId === 'yuyan' && p.hp > 0) {
        await this.yuyanPeek(p);
      }

      this.state.phase = 'draw';
      this.update();
      await this.wait(250);
      await this.drawPhase(p);
      if (this.state.over) return;

      this.state.phase = 'play';
      this.update();
      await this.wait(200);

      if (p.index === 0) {
        this.busy = false;
        this.awaitingHuman = true;
        this.update();
        this.fx('humanTurn', {});
        return;
      }

      this.busy = true;
      this.update();
      if (CG.AI && typeof CG.AI.playTurn === 'function') {
        await CG.AI.playTurn(this, p);
      } else {
        await this.concludeTurn(p);
      }
    }

    async drawPhase(p) {
      let skipped = false;
      let drawn = [];

      // 魔术手：跳过摸牌
      if (p.heroId === 'moshushou') {
        const yes = await this.ask(p, {
          kind: 'confirm',
          title: '快手 · 跳过摸牌阶段？',
          desc: '若跳过：本回合出牌上限变为 3，且不能使用凝神；下回合摸牌阶段少摸 1 张。',
          default: false,
          confirmText: '跳过摸牌',
          cancelText: '正常摸牌',
        });
        if (yes) {
          skipped = true;
          p.nextDrawPenalty = 1;
          p.playLimit = 3;
          p.noNingshen = true;
          this.log(p.name + ' 发动「快手」，跳过摸牌，本回合可出 3 张牌（禁用凝神）。', 'skill');
          this.fx('skill', { player: p.index, name: '快手' });
        }
      }

      // 拾荒者：跳过摸牌，回收弃牌
      if (!skipped && p.heroId === 'shihuang' && p.discard.length > 0) {
        const yes = await this.ask(p, {
          kind: 'confirm',
          title: '开拓 · 跳过摸牌阶段？',
          desc: '从弃牌堆中选择一张已出过的牌加入手牌，代替本次摸牌。',
          default: false,
          confirmText: '跳过并回收',
          cancelText: '正常摸牌',
        });
        if (yes) {
          const picked = await this.ask(p, {
            kind: 'card',
            title: '开拓 · 选择弃牌',
            desc: '选择一张牌加入手牌。',
            cards: p.discard.slice(),
            default: p.discard[0]?.uid,
          });
          let card = p.discard.find((c) => c.uid === picked) || p.discard[0];
          if (card) {
            p.discard = p.discard.filter((c) => c.uid !== card.uid);
            await this.gainCard(p, card, { source: 'shihuang' });
            skipped = true;
            this.log(p.name + ' 发动「开拓」，回收了「' + this.cardDef(card).name + '」。', 'skill');
            this.fx('skill', { player: p.index, name: '开拓' });
          }
        }
      }

      if (!skipped) {
        let count = Math.max(0, CG.RULES.drawPerTurn - p.nextDrawPenalty);
        if (p.nextDrawPenalty > 0) {
          this.log(p.name + ' 受「快手」影响，本回合少摸 1 张牌。', 'warn');
          p.nextDrawPenalty = 0;
        }

        // 预言家「命定」
        if (p.flags.destinyCard) {
          const destinyId = p.flags.destinyCard;
          p.flags.destinyCard = null;
          const idx = p.deck.findIndex((c) => c.id === destinyId);
          if (idx < 0) {
            this.log('「命定」生效：' + p.name + ' 的牌库中已无「' + CG.CARD_MAP[destinyId].name + '」，跳过本次摸牌。', 'skill');
            count = 0;
          } else {
            const [card] = p.deck.splice(idx, 1);
            if (p.deck.length === 0) this.markExhausted();
            await this.gainCard(p, card, { source: 'destiny' });
            drawn.push(card);
            this.log('「命定」生效：' + p.name + ' 摸到「' + this.cardDef(card).name + '」。', 'skill');
            this.fx('destiny', { player: p.index, card: card.def });
            count = Math.max(0, count - 1);
            if (await this.poisonCheck(p, card)) {
              if (await this.checkDeaths()) return;
            }
          }
        }

        if (count > 0 && p.deck.length > 0) {
          const more = await this.drawCards(p, count);
          drawn = drawn.concat(more);
        } else if (count > 0 && p.deck.length === 0) {
          this.markExhausted();
          this.log(p.name + ' 的牌库已空，摸牌失败。', 'warn');
        }
        if (await this.checkDeaths()) return;

        // 狼人：摸牌判定
        if (p.heroId === 'langren' && p.flags.wolfMode === 'b' && drawn.length >= 2) {
          const a = drawn[0].id;
          const b = drawn[1].id;
          const yes = await this.ask(p, {
            kind: 'confirm',
            title: '月嚎 · 是否进行判定？',
            desc: '失去 5 点生命。若本回合摸到的前两张牌同名，则展示它们，对对方造成 15 点真实伤害，并进入狼化（出牌上限 +1，所有伤害 +2，持续两回合）。',
            default: false,
            confirmText: '以血判定',
            cancelText: '放弃判定',
          });
          if (yes) {
            p.flags.wolfJudgedTurn = this.state.turnNumber;
            await this.loseHp(p, 5, { type: 'wolf', bypass: true });
            this.log(p.name + ' 以 5 点生命进行月嚎判定。', 'skill');
            this.fx('blood', { player: p.index });
            if (await this.checkDeaths()) return;
            if (a === b) {
              this.log('双牌同名：「' + this.cardDef(drawn[0]).name + '」×2 —— 月嚎撕裂长空！', 'skill');
              this.fx('wolf', { player: p.index, cards: [drawn[0].def, drawn[1].def] });
              await this.dealDamage(this.other(p), 15, 'true', {
                source: p, isSkill: true, isReflect: true,
              });
              if (await this.checkDeaths()) return;
              p.flags.wolfTurns = 2;
              this.log(p.name + ' 进入「狼化」：出牌上限 +1，所有伤害 +2，持续两回合。', 'skill');
            } else {
              this.log('判定失败：摸到的牌不同名。', 'warn');
            }
          }
        }
      }

      this.update();
      await this.wait(300);
    }

    markExhausted() {
      if (this.state.exhausted) return;
      this.state.exhausted = true;
      this.log('有人的牌库已被摸空，对局进入「枯牌阶段」：此后每人回合开始时失去 2 点生命。', 'warn');
      this.fx('exhausted', {});
    }

    async drawCards(p, n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        if (p.deck.length === 0) {
          this.markExhausted();
          this.log(p.name + ' 的牌库已空，无法继续摸牌。', 'warn');
          break;
        }
        const card = p.deck.shift();
        if (p.deck.length === 0) this.markExhausted();
        await this.gainCard(p, card, { fromDraw: true });
        out.push(card);
        if (p.index === 0) {
          this.log('你摸到了「' + this.cardDef(card).name + '」。', 'draw');
        } else {
          this.log('对手摸了 1 张牌。', 'draw');
        }
        this.fx('draw', { player: p.index, card: p.index === 0 ? card.def : null });
        if (await this.poisonCheck(p, card)) {
          if (p.hp <= 0) break;
        }
        await this.wait(120);
      }
      this.update();
      return out;
    }

    async poisonCheck(p, card) {
      const enemy = this.other(p);
      if (!enemy || enemy.heroId !== 'nvwu' || enemy.flags.poisonType !== this.cardDef(card).type) return false;
      this.log('毒咒发作！' + p.name + ' 摸到「' + this.cardDef(card).name + '」，受到 1 点真实伤害。', 'poison');
      this.fx('poison', { player: p.index, card: card.def });
      await this.dealDamage(p, 1, 'true', { source: enemy, isSkill: true, isReflect: true });
      return true;
    }

    async gainCard(p, card, opts) {
      opts = opts || {};
      p.hand.push(card);
      if (p.heroId === 'chuanzhang' && !opts.skipCaptain) {
        this.log(p.name + ' 获得一张牌，「潮涌」回复 1 点生命。', 'heal');
        await this.heal(p, 1, { fromCaptain: true, triggerBaobao: true });
      }
      this.update();
      return card;
    }

    async removeFromHand(p, uid, opts) {
      opts = opts || {};
      const idx = p.hand.findIndex((c) => c.uid === uid);
      if (idx < 0) return null;
      const card = p.hand.splice(idx, 1)[0];
      if (p.heroId === 'chuanzhang' && !opts.skipCaptain) {
        this.log(p.name + ' 失去一张牌，「潮涌」扣除 1 点生命。', 'damage');
        await this.loseHp(p, 1, { type: 'captain', bypass: true });
        this.fx('blood', { player: p.index });
      }
      this.update();
      return card;
    }

    /* ---------------- 出牌 ---------------- */
    cardDef(card) {
      return card.def || CG.CARD_MAP[card.id] || CG.makeVirtualCardDef(card.type || 'armor', card.value || 0);
    }

    totalShield(p) { return Math.max(0, p.armor) + Math.max(0, p.extraShield); }

    computeArmorValue(p, base, bonus) {
      let v = base;
      if (p.heroId === 'jianbi') v += 1;
      if (p.heroId === 'sanyueqi') v += 1;
      if (p.heroId === 'pojia') v -= 1;
      v = Math.max(0, v) + (bonus || 0);
      return Math.max(0, v);
    }

    computeBreakValue(p, base, bonus) {
      let v = base;
      if (p.heroId === 'pojia') v += 2;
      if (p.flags.wolfTurns > 0) v += 2;
      if (p.heroId === 'langren' && p.flags.wolfMode === 'a' && p.hp <= 8) v += 1;
      v = Math.max(0, v) + (bonus || 0);
      return Math.max(0, v);
    }

    computeNormalValue(p, base, bonus) {
      let v = base;
      if (p.heroId === 'jifeng') v += 1;
      if (p.flags.wolfTurns > 0) v += 2;
      if (p.heroId === 'langren' && p.flags.wolfMode === 'a' && p.hp <= 8) v += 1;
      v = Math.max(0, v) + (bonus || 0);
      return Math.max(0, v);
    }

    playability(p, card) {
      const def = this.cardDef(card);
      if (this.state.over) return { ok: false, reason: '对局已结束' };
      if (this.state.phase !== 'play') return { ok: false, reason: '当前不是出牌阶段' };
      if (this.state.current !== p.index) return { ok: false, reason: '当前不是你的回合' };
      if (p.hp <= 0) return { ok: false, reason: '你已倒下' };
      if (p.played >= p.playLimit) return { ok: false, reason: '本回合出牌次数已用尽' };
      const enemy = this.other(p);
      if (!enemy) return { ok: false, reason: '没有目标' };

      if (def.type === 'break') {
        if (this.totalShield(enemy) > 0) return { ok: true, reason: '' };
        if (p.breakAsNormal) return { ok: true, reason: '绝杀余势：作为普通伤害牌打出' };
        return { ok: false, reason: '对方无护甲，不能打出破甲牌' };
      }
      if (def.type === 'damage') {
        if (this.totalShield(enemy) > 0) return { ok: false, reason: '对方有护甲，不能打出普通伤害牌' };
        return { ok: true, reason: '' };
      }
      if (def.type === 'armor') {
        if (p.noArmor) return { ok: false, reason: '绝杀余势：本回合不能使用叠甲牌' };
        return { ok: true, reason: '' };
      }
      if (def.type === 'rest') {
        if (def.id === 'ningshen' && p.noNingshen) return { ok: false, reason: '「快手」生效中，不能使用凝神' };
        return { ok: true, reason: '' };
      }
      return { ok: true, reason: '' };
    }

    async playCard(p, uid, opts) {
      opts = opts || {};
      if (this.state.over) return false;
      const card = p.hand.find((c) => c.uid === uid);
      if (!card) return false;
      const check = this.playability(p, card);
      if (!check.ok) {
        this.log(check.reason, 'warn');
        this.fx('invalid', { reason: check.reason });
        return false;
      }
      const def = this.cardDef(card);

      // 船长失去手牌
      const removed = await this.removeFromHand(p, uid);
      if (!removed) return false;
      p.played += 1;
      this.state.stats.cardsPlayed[p.index] += 1;

      const variant = await this.resolvePlayVariant(p, def, opts);
      let betResult = null;
      if (p.flags.dutuBetActive) {
        betResult = await this.resolveBet(p, def);
        p.flags.dutuBetActive = false;
      }

      this.log(p.name + ' 打出「' + def.name + '」。', 'play');
      this.fx('play', { player: p.index, card: def });
      // 攻击类卡牌留出极短的动画前摇，让攻击特效先于掉血出现；仍然属于打出即结算
      if (def.type === 'break' || def.type === 'damage') await this.wait(150);

      let effective = true;
      if (betResult && !betResult.correct) {
        effective = false;
        this.log('下注失败：牌库顶是「' + betResult.topName + '」，此牌本回合无效。', 'warn');
        this.fx('betFail', { player: p.index, card: betResult.topDef });
      } else if (betResult && betResult.correct) {
        this.log('下注命中！牌库顶是「' + betResult.topName + '」，此牌结算后将追加 1/2 数值结算。', 'skill');
        this.fx('betWin', { player: p.index, card: betResult.topDef });
      }

      if (effective) {
        await this.applyCardEffect(p, def, {
          variant,
          bonus: 0,
          scale: 1,
          isExtra: false,
          sourceCard: card,
        });
        if (await this.checkDeaths()) {
          p.discard.push(card);
          this.update();
          return true;
        }
        // 本轮核心调整：卡牌打出即结算，不再把护甲/伤害留到回合结束
        if (this.hasPending(p)) {
          await this.resolvePending(p);
          if (this.state.over) {
            p.discard.push(card);
            this.update();
            return true;
          }
        }
        if (betResult && betResult.correct) {
          await this.applyCardEffect(p, def, {
            variant,
            bonus: 0,
            scale: 0.5,
            isExtra: true,
            sourceCard: card,
          });
          if (await this.checkDeaths()) {
            p.discard.push(card);
            this.update();
            return true;
          }
          if (this.hasPending(p)) {
            await this.resolvePending(p);
            if (this.state.over) {
              p.discard.push(card);
              this.update();
              return true;
            }
          }
        }
      }

      // 进弃牌堆
      p.discard.push(card);
      this.update();
      if (await this.checkDeaths()) return true;
      await this.wait(220);
      return true;
    }

    async resolvePlayVariant(p, def, opts) {
      if (opts.variant) return opts.variant;
      // 毒奶术士
      if (p.heroId === 'dunai' && (def.id === 'tiaoxi' || def.id === 'huanyu')) {
        const pick = await this.ask(p, {
          kind: 'choose',
          title: '腐乳 · 选择这张回血牌的用法',
          desc: '治疗自己，或对敌方造成等额真实伤害并封锁其一回合回血。',
          options: [
            { value: 'heal', label: '治疗自己', desc: '恢复 ' + def.heal + ' 点生命。' },
            { value: 'curse', label: '腐乳敌方', desc: '造成 ' + def.heal + ' 点真实伤害，并使对方一回合无法回血。' },
          ],
          default: 'heal',
        });
        return { healMode: pick === 'curse' ? 'curse' : 'heal' };
      }
      // 快手怪盗
      if (p.heroId === 'kuaishou' && def.id === 'ningshen') {
        const pick = await this.ask(p, {
          kind: 'choose',
          title: '掠影 · 凝神的用法',
          desc: '正常摸 2 张牌，或改为摸走对方 2 张手牌。',
          options: [
            { value: 'draw', label: '正常摸牌', desc: '额外摸 2 张牌。' },
            { value: 'steal', label: '掠取对方', desc: '改为获得对方随机 2 张手牌。' },
          ],
          default: 'draw',
        });
        return { ningshenMode: pick === 'steal' ? 'steal' : 'draw' };
      }
      return {};
    }

    async resolveBet(p, def) {
      const guess = await this.ask(p, {
        kind: 'type',
        title: '下注 · 猜测牌库顶的类型',
        desc: '猜中：此牌结算后追加 1/2 数值结算；猜错：此牌本回合无效。',
        options: CG.CARD_TYPES.map((t) => ({ value: t, label: CG.TYPE_INFO[t].name })),
        default: 'break',
      });
      const top = p.deck[0];
      if (!top) {
        this.log('牌库已空，下注落空。', 'warn');
        return { correct: false, topName: '无', topDef: null };
      }
      const topDef = this.cardDef(top);
      return {
        correct: topDef.type === guess,
        topName: topDef.name,
        topDef,
        guess,
      };
    }

    async applyCardEffect(p, def, opts) {
      opts = opts || {};
      const scale = opts.scale === undefined ? 1 : opts.scale;
      const bonus = opts.bonus || 0;
      const variant = opts.variant || {};
      const enemy = this.other(p);
      const isExtra = !!opts.isExtra;

      if (def.type === 'armor') {
        const value = this.computeArmorValue(p, def.value, bonus);
        const scaled = Math.max(0, Math.floor(value * scale));
        p.pending.armor += scaled;
        p.pending.label = def.name;
        p.pending.armorCardId = def.id;
        if (!isExtra) p.pending.armorValues.push(scaled);
        p.pending.cards.push({ id: def.id, name: def.name, type: 'armor', value: scaled });
        return;
      }

      if (def.type === 'break' || def.type === 'damage') {
        const treatAsNormal = def.type === 'break' && p.breakAsNormal && this.totalShield(enemy) === 0;
        if (def.type === 'damage') {
          if (this.totalShield(enemy) > 0) {
            this.log('对方已有护甲，普通伤害被挡下。', 'warn');
            return;
          }
        }
        let value;
        let type;
        if (treatAsNormal) {
          value = Math.floor(this.computeBreakValue(p, def.value, bonus) * scale);
          type = 'normal';
          this.log('「绝杀」余势：' + def.name + ' 作为普通伤害牌结算。', 'skill');
        } else if (def.type === 'break') {
          value = Math.floor(this.computeBreakValue(p, def.value, bonus) * scale);
          type = 'break';
        } else {
          value = Math.floor(this.computeNormalValue(p, def.value, bonus) * scale);
          type = 'normal';
        }
        if (type === 'break') p.pending.break += value;
        else p.pending.normal += value;
        p.pending.label = def.name;
        p.pending.cards.push({ id: def.id, name: def.name, type, value });
        if (def.id === 'juesha' && !isExtra) {
          p.flags.armorBanNext = true;
          enemy.flags.breakNormalNext = true;
          this.log('「绝杀」余势：你下回合不能使用叠甲牌；对方下回合的破甲牌可直接当普通伤害牌打出。', 'skill');
          this.fx('juesha', { player: p.index });
        }
        return;
      }

      if (def.type === 'rest') {
        if (def.heal) {
          if (p.heroId === 'dunai' && variant.healMode === 'curse') {
            let value = Math.floor((def.heal + bonus) * scale);
            this.log('「腐乳」：' + def.name + ' 化为诅咒，对 ' + enemy.name + ' 造成 ' + value + ' 点真实伤害。', 'poison');
            this.fx('poison', { player: enemy.index, card: def });
            await this.dealDamage(enemy, value, 'true', { source: p, isSkill: true, isReflect: true });
            if (!isExtra) {
              enemy.healLock = 1;
              this.log(enemy.name + ' 被封锁回血，持续一回合。', 'warn');
            }
            if (await this.checkDeaths()) return;
          } else {
            const value = Math.floor((def.heal + bonus) * scale);
            await this.heal(p, value, { source: 'card' });
          }
          return;
        }
        if (def.draw) {
          let count = Math.floor((def.draw + bonus) * scale);
          if (p.heroId === 'chensiyu') count += Math.floor(1 * scale);
          if (p.heroId === 'kuaishou' && variant.ningshenMode === 'steal') {
            const stealCount = Math.max(1, Math.floor(2 * scale));
            await this.stealCards(p, enemy, stealCount);
          } else {
            await this.drawCards(p, Math.max(0, count));
          }
          return;
        }
      }
    }

    async stealCards(p, enemy, count) {
      const got = [];
      for (let i = 0; i < count; i++) {
        if (!enemy.hand.length) break;
        const idx = Math.floor(this.rng() * enemy.hand.length);
        const card = enemy.hand[idx];
        await this.removeFromHand(enemy, card.uid, { skipCaptain: false });
        await this.gainCard(p, card, { source: 'steal' });
        got.push(card);
      }
      if (got.length) {
        this.log(p.name + ' 从 ' + enemy.name + ' 手中掠取了 ' + got.length + ' 张牌。', 'skill');
        this.fx('steal', { player: p.index, count: got.length });
      } else {
        this.log(enemy.name + ' 没有手牌可被掠取。', 'warn');
      }
      if (await this.checkDeaths()) return;
    }

    /* ---------------- 结算 ---------------- */
    async finishPlayPhase(p) {
      p.flags.dutuBetActive = false;
    }

    /**
     * 玫瑰老师「延授」：弃置的牌在下一回合结束阶段发动。
     * 届时可直接发动，或再延迟一回合并使数值 +2。
     */
    async resolveMeiguiDelay(p) {
      if (this.state.over || p.heroId !== 'meigui' || !p.flags.meiguiDelayed) return;
      const delay = p.flags.meiguiDelayed;
      if (this.state.turnNumber <= delay.createdAtTurn) return;

      const def = delay.virtualDef || CG.CARD_MAP[delay.cardId];
      if (!def) {
        p.flags.meiguiDelayed = null;
        p.flags.meiguiActive = false;
        return;
      }
      const enemy = this.other(p);
      const choice = await this.ask(p, {
        kind: 'choose',
        title: '延授 · 结束阶段',
        desc: '「' + def.name + '」已延迟至今，当前数值加成 +' + delay.bonus + '。',
        options: [
          { value: 'fire', label: '直接发动', desc: '在本次结束阶段立即结算这张牌的效果。' },
          { value: 'wait', label: '继续延迟', desc: '延迟到下一回合结束阶段，此牌数值 +2。' },
        ],
        default: 'fire',
      });
      if (choice === 'wait') {
        delay.bonus += 2;
        delay.createdAtTurn = this.state.turnNumber;
        this.log('「延授」继续延迟「' + def.name + '」，数值 +2（当前 +' + delay.bonus + '）。', 'skill');
        this.fx('delayWait', { player: p.index, bonus: delay.bonus });
        this.update();
        return;
      }

      this.log('「延授」发动延迟的「' + def.name + '」，数值加成 +' + delay.bonus + '。', 'skill');
      this.fx('delayFire', { player: p.index, card: def, bonus: delay.bonus });
      p.flags.meiguiDelayed = null;
      p.flags.meiguiActive = false;
      await this.applyCardEffect(p, def, {
        variant: {},
        bonus: delay.bonus,
        scale: 1,
        isExtra: false,
        sourceCard: null,
      });

      // 延迟牌仍会发动；但若当前目标不满足卡牌条件，只播放发动/状态效果，不造成伤害。
      if (def.type === 'break' && this.totalShield(enemy) === 0 && !p.breakAsNormal) {
        this.log('「延授」：对方无护甲，「' + def.name + '」的破甲效果未能造成伤害。', 'warn');
        p.pending = emptyPending();
      } else if (this.hasPending(p)) {
        await this.resolvePending(p);
      }
      if (await this.checkDeaths()) return;
      this.update();
    }

    hasPending(p) {
      return !!(p.pending && (p.pending.armor > 0 || p.pending.break > 0 || p.pending.normal > 0));
    }

    async resolvePending(p) {
      if (this.state.over) return;
      const enemy = this.other(p);
      const label = p.pending.label ? '「' + p.pending.label + '」' : '';

      // 护甲即时生效
      if (p.pending.armor > 0) {
        p.armor += p.pending.armor;
        if (!p.flags.armorValuesThisTurn) p.flags.armorValuesThisTurn = [];
        if (p.pending.armorValues.length) p.flags.armorValuesThisTurn.push(p.pending.armor);
        if (p.pending.armorCardId) p.flags.lastArmorCardId = p.pending.armorCardId;
        this.log(p.name + ' 获得 ' + p.pending.armor + ' 点护甲' + (label ? '（' + label + '）' : '') + '。', 'armor');
        this.fx('armorGain', { player: p.index, value: p.pending.armor, cardId: p.flags.lastArmorCardId });
      }

      // 伤害加成：浴血是「下一次伤害」；血祭是「下回合所有伤害」的持续加成
      const ranxueTurnBonus = p.flags.ranxueTurnBonus || 0;
      let bonus = p.flags.yuxueNextDamage || 0;
      let breakDmg = p.pending.break + (p.pending.break > 0 ? ranxueTurnBonus : 0);
      let normalDmg = p.pending.normal + (p.pending.normal > 0 ? ranxueTurnBonus : 0);
      if (ranxueTurnBonus > 0 && (p.pending.break > 0 || p.pending.normal > 0)) {
        this.log('「血祭」伤害加成 +' + ranxueTurnBonus + ' 生效。', 'skill');
      }
      if (bonus > 0 && breakDmg > 0) {
        breakDmg += bonus;
        this.log('伤害加成 +' + bonus + ' 生效。', 'skill');
        bonus = 0;
      } else if (bonus > 0 && normalDmg > 0) {
        normalDmg += bonus;
        this.log('伤害加成 +' + bonus + ' 生效。', 'skill');
        bonus = 0;
      }
      p.flags.yuxueNextDamage = bonus > 0 ? bonus : 0;
      if (bonus > 0) this.log('伤害加成保留至下一次伤害。', 'skill');

      if (breakDmg > 0) {
        this.log(p.name + ' 的' + (label || '破甲攻势') + '造成 ' + breakDmg + ' 点破甲伤害。', 'damage');
        await this.dealDamage(enemy, breakDmg, 'break', {
          source: p, fromCard: true, isSkill: false,
        });
        if (await this.checkDeaths()) return;
      }
      if (normalDmg > 0) {
        if (this.totalShield(enemy) > 0) {
          this.log('对方已有护甲，普通伤害未能造成伤害。', 'warn');
        } else {
          this.log(p.name + ' 的' + (label || '普通攻势') + '造成 ' + normalDmg + ' 点普通伤害。', 'damage');
          await this.dealDamage(enemy, normalDmg, 'normal', {
            source: p, fromCard: true, isSkill: false,
          });
          if (await this.checkDeaths()) return;
        }
      }

      p.pending = emptyPending();
      this.update();
      await this.wait(220);
    }

    async dealDamage(target, amount, type, opts) {
      opts = opts || {};
      if (this.state.over) return { hpDamage: 0, absorbed: 0 };
      amount = Math.max(0, Math.floor(amount || 0));
      if (amount <= 0 || target.hp <= 0) return { hpDamage: 0, absorbed: 0 };
      const source = opts.source || null;
      let dmg = amount;
      const guardBefore = this.totalShield(target) > 0;

      // 坚壁守卫减伤
      if (target.heroId === 'jianbi') {
        if (type === 'normal') dmg = Math.max(0, dmg - 1);
        if (type === 'break' && guardBefore) dmg = Math.max(0, dmg - 1);
      }

      let hpDamage = 0;
      let absorbed = 0;
      let direct = 0;

      if (type === 'break') {
        const armor = Math.max(0, target.armor);
        if (source && source.heroId === 'chuanxi' && armor >= 8) {
          direct = Math.ceil(dmg / 2);
          const armorPart = dmg - direct;
          const res = this.absorbShield(target, armorPart);
          absorbed = res.absorbed;
          hpDamage = direct + res.remaining;
          this.log('「裂隙」：穿隙刺客无视一半护甲，' + direct + ' 点伤害直接穿透。', 'skill');
          this.fx('pierce', { player: target.index });
        } else {
          const res = this.absorbShield(target, dmg);
          absorbed = res.absorbed;
          hpDamage = res.remaining;
        }
        if (absorbed > 0) {
          this.log('护盾吸收了 ' + absorbed + ' 点破甲伤害。', 'armor');
          this.fx('armorHit', {
            player: target.index,
            value: absorbed,
            remaining: this.totalShield(target),
            cardId: target.flags.lastArmorCardId,
          });
        }
      } else if (type === 'normal') {
        if (this.totalShield(target) > 0) {
          this.log('「' + target.name + '」仍有护甲，普通伤害未生效。', 'warn');
          hpDamage = 0;
        } else {
          hpDamage = dmg;
        }
      } else {
        hpDamage = dmg;
      }

      const hpBefore = target.hp;
      if (hpDamage > 0) {
        await this.loseHp(target, hpDamage, { type, bypass: true, source });
        this.state.stats.damage[source ? source.index : 1 - target.index] += hpDamage;
      }
      this.fx('hit', {
        player: target.index, type, value: hpDamage, absorbed,
        big: hpDamage >= 8, source: source ? source.index : null,
      });
      this.update();

      // 三月七：护甲未碎反伤
      if (
        target.heroId === 'sanyueqi' && source && source.hp > 0 && !opts.isReflect &&
        opts.fromCard && (type === 'break' || type === 'normal') &&
        guardBefore && this.totalShield(target) > 0 && dmg > 0
      ) {
        const minVal = this.minDamageCardValue(target);
        if (minVal > 0) {
          this.log('「少女的特权」：护甲未碎，三月七对 ' + source.name + ' 造成 ' + minVal + ' 点反伤。', 'skill');
          this.fx('counter', { player: target.index, target: source.index, value: minVal });
          await this.dealDamage(source, minVal, 'true', {
            source: target, isSkill: true, isReflect: true, skipXunqing: true,
          });
          if (await this.checkDeaths()) return { hpDamage, absorbed };
        }
      }

      // 殉情者：1.5 倍并在对方身上回响原伤害
      if (
        target.heroId === 'xunqing' && hpDamage > 0 && source && source.hp > 0 &&
        !opts.skipXunqing && !opts.isReflect && target.hp > 0
      ) {
        const accept = await this.ask(target, {
          kind: 'confirm',
          title: '同殇 · 是否发动？',
          desc: '你本次受到的 ' + hpDamage + ' 点伤害将变为 ' + Math.floor(hpDamage * 1.5) + ' 点，同时使 ' + source.name + ' 受到原伤害 ' + hpDamage + ' 点真实伤害。',
          default: false,
          confirmText: '共赴此伤',
          cancelText: '独自承受',
        });
        if (accept) {
          const extra = Math.floor(hpDamage * 1.5) - hpDamage;
          this.log('「同殇」：' + target.name + ' 将伤痛放大 1.5 倍，并把原伤害回响给 ' + source.name + '。', 'skill');
          this.fx('xunqing', { player: target.index, target: source.index, value: hpDamage });
          if (extra > 0) {
            await this.loseHp(target, extra, { type: 'xunqing', bypass: true, source });
          }
          await this.dealDamage(source, hpDamage, 'true', {
            source: target, isSkill: true, isReflect: true, skipXunqing: true,
          });
        }
      }

      if (hpBefore !== target.hp) this.update();
      return { hpDamage, absorbed };
    }

    absorbShield(target, amount) {
      let remaining = Math.max(0, amount);
      let absorbed = 0;
      if (target.extraShield > 0) {
        const use = Math.min(target.extraShield, remaining);
        target.extraShield -= use;
        remaining -= use;
        absorbed += use;
      }
      if (target.armor > 0 && remaining > 0) {
        const use = Math.min(target.armor, remaining);
        target.armor -= use;
        remaining -= use;
        absorbed += use;
      }
      return { absorbed, remaining };
    }

    minDamageCardValue(p) {
      const vals = p.hand
        .map((c) => this.cardDef(c))
        .filter((d) => d.type === 'break' || d.type === 'damage')
        .map((d) => d.value);
      return vals.length ? Math.min.apply(null, vals) : 0;
    }

    async loseHp(p, amount, opts) {
      opts = opts || {};
      if (this.state.over) return 0;
      amount = Math.max(0, Math.floor(amount || 0));
      if (amount <= 0) return 0;
      const before = p.hp;
      p.hp = CG.clamp(p.hp - amount, 0, p.maxHp);
      const lost = before - p.hp;
      if (lost > 0) {
        this.checkBloodThreshold(before, p.hp);
        this.update();
      }
      return lost;
    }

    checkBloodThreshold(before, after) {
      if (before > 6 && after <= 6) {
        this.players.forEach((q) => {
          if (q.heroId === 'yuxue' && q.hp > 0) {
            q.flags.yuxueNextDamage = (q.flags.yuxueNextDamage || 0) + 2;
            this.log('「血屠」：有人踏入血线，' + q.name + ' 下一次伤害 +2。', 'skill');
            this.fx('bloodlust', { player: q.index });
          }
        });
      }
    }

    /**
     * 燃血行者的自伤：优先被额外护盾/普通护盾承受，溢出部分才扣生命。
     * 返回实际吸收与扣血，便于技能后续按原始数值回复/蓄势。
     */
    async selfDamageThroughShield(p, amount) {
      amount = Math.max(0, Math.floor(amount || 0));
      if (this.state.over || amount <= 0 || p.hp <= 0) return { absorbed: 0, hpLoss: 0 };
      const res = this.absorbShield(p, amount);
      if (res.absorbed > 0) {
        this.log(p.name + ' 的护盾承受了 ' + res.absorbed + ' 点自伤。', 'armor');
        this.fx('armorHit', {
          player: p.index,
          value: res.absorbed,
          remaining: this.totalShield(p),
          cardId: p.flags.lastArmorCardId,
        });
      }
      if (res.remaining > 0) {
        this.log(p.name + ' 承受 ' + res.remaining + ' 点自伤。', 'damage');
        await this.loseHp(p, res.remaining, { type: 'ranxue', bypass: true });
        this.fx('hit', {
          player: p.index,
          type: 'true',
          value: res.remaining,
          absorbed: 0,
          big: res.remaining >= 5,
        });
      }
      this.update();
      return { absorbed: res.absorbed, hpLoss: res.remaining };
    }

    async heal(p, amount, opts) {
      opts = opts || {};
      if (this.state.over) return 0;
      amount = Math.max(0, Math.floor(amount || 0));
      if (amount <= 0 || p.hp <= 0) return 0;
      if (p.healLock > 0) {
        this.log('「' + p.name + '」被封锁回血，本次治疗无效。', 'warn');
        this.fx('healBlocked', { player: p.index });
        return 0;
      }
      const before = p.hp;
      p.hp = CG.clamp(p.hp + amount, 0, p.maxHp);
      const actual = p.hp - before;
      if (actual > 0) {
        this.state.stats.healed[p.index] += actual;
        this.log(p.name + ' 回复 ' + actual + ' 点生命。', 'heal');
        this.fx('heal', { player: p.index, value: actual });
        // 宝宝
        const enemy = this.other(p);
        if (
          enemy && enemy.heroId === 'baobao' && enemy.hp > 0 &&
          enemy.flags.baobaoTurn !== this.state.turnNumber &&
          !opts.fromBaobao
        ) {
          enemy.flags.baobaoTurn = this.state.turnNumber;
          const babyHeal = Math.floor(actual / 2);
          if (babyHeal > 0) {
            this.log('「吃奶奶」：对方回复生命，宝宝也回复 ' + babyHeal + ' 点。', 'skill');
            this.fx('baobao', { player: enemy.index });
            await this.heal(enemy, babyHeal, { fromBaobao: true, triggerBaobao: false });
          }
        }
      }
      this.update();
      return actual;
    }

    /* ---------------- 职业回合技能 ---------------- */
    async sanyueqiTurnStart(p) {
      if (this.state.over) return;
      const wasAttacked = p.attackedLastOpponentTurn;
      p.attackedLastOpponentTurn = false;
      if (p.armor <= 0) return;
      if (wasAttacked) {
        this.log('「可爱即是正义」：三月七上回合被攻击，无法转化护甲牌。', 'skill');
        return;
      }
      const candidates = p.hand.filter((c) => {
        const d = this.cardDef(c);
        return d.type === 'break' || d.type === 'damage';
      });
      if (!candidates.length) return;
      const pick = await this.ask(p, {
        kind: 'card',
        title: '可爱即是正义 · 转化伤害牌',
        desc: '持有护甲且上回合未被攻击，可将 1 张伤害牌转化为等同数值的护甲牌。',
        cards: candidates.slice(),
        default: candidates[0].uid,
        confirmText: '转化',
        cancelText: '跳过',
        allowCancel: true,
      });
      let selected = candidates.find((c) => c.uid === pick);
      if (pick === false || pick === null) {
        this.log('三月七跳过了护甲牌转化。', 'system');
        return;
      }
      if (!selected) selected = candidates[0];
      const def = this.cardDef(selected);
      const value = def.value;
      const removed = await this.removeFromHand(p, selected.uid, { skipCaptain: true });
      if (!removed) return;
      p.discard.push(removed);
      const virtualDef = CG.makeVirtualCardDef('armor', value);
      p.hand.push(createVirtualCard(virtualDef));
      this.log('「可爱即是正义」：将「' + def.name + '」转化为「' + virtualDef.name + '」。', 'skill');
      this.fx('convert', { player: p.index, value, virtualDef });
      this.update();
    }

    async yuyanPeek(p) {
      const enemy = this.other(p);
      if (!enemy || !enemy.hand.length) {
        this.log('「前瞻」：对方没有手牌可查看。', 'skill');
        return;
      }
      this.log('「前瞻」：' + p.name + ' 看到了 ' + enemy.name + ' 的全部手牌（' + enemy.hand.length + ' 张）。', 'skill');
      this.fx('peekAll', { player: p.index, count: enemy.hand.length });
      if (p.index === 0) await this.wait(300);
    }

    /* ---------------- 主动技能 ---------------- */
    activeSkillDefs(p) {
      const out = [];
      const hero = p.hero;
      if (!hero) return out;
      (hero.active || []).forEach((s) => {
        let available = true;
        let reason = '';
        if (p.hp <= 0 || this.state.over) { available = false; reason = '无法行动'; }
        else if (this.state.current !== p.index || this.state.phase !== 'play') { available = false; reason = '仅自己的出牌阶段'; }
        if (s.id === 'chensiyu_draw3' && p.flags.chensiyuUsed) { available = false; reason = '本局已发动'; }
        if (s.id === 'kupai_swap') {
          if (p.flags.kupaiUsed) { available = false; reason = '本局已发动'; }
          else if (p.hp > 4) { available = false; reason = '生命需 ≤ 4'; }
        }
        if (s.id === 'ranxue_new' && p.flags.ranxueNewUsed) { available = false; reason = '本回合已发动'; }
        if (s.id === 'ranxue_blood' && p.flags.ranxueBloodUsed) { available = false; reason = '本回合已发动'; }
        if (s.id === 'ranxue_new' || s.id === 'ranxue_blood') {
          const has = p.hand.some((c) => {
            const d = this.cardDef(c);
            return d.type === 'break' || d.type === 'damage';
          });
          if (!has) { available = false; reason = '手中没有伤害牌'; }
        }
        if (s.id === 'yuyan_destiny' && p.flags.destinyUsed) { available = false; reason = '本局已发动'; }
        if (s.id === 'meigui_delay') {
          if (p.flags.meiguiDelayed || p.flags.meiguiActive) { available = false; reason = '延授持续中'; }
          else if (p.played > 0) { available = false; reason = '出牌后不可发动'; }
          else if (!p.hand.length) { available = false; reason = '手中没有可弃置的牌'; }
        }
        if (s.id === 'dutu_bet' && p.flags.dutuBetUsed) { available = false; reason = '本回合已下注'; }
        if (s.id === 'dutu_bet' && p.flags.dutuBetActive) { available = false; reason = '等待本回合出牌'; }
        out.push(Object.assign({}, s, { available, reason, used: p.flags[s.id + 'Used'] }));
      });
      return out;
    }

    async activateSkill(p, skillId, payload) {
      if (this.state.over) return false;
      if (this.state.current !== p.index || this.state.phase !== 'play') {
        this.log('现在不能发动技能。', 'warn');
        return false;
      }
      const def = (p.hero.active || []).find((s) => s.id === skillId);
      if (!def) return false;
      const state = this.activeSkillDefs(p).find((s) => s.id === skillId);
      if (state && !state.available) {
        this.log('技能不可用：' + state.reason, 'warn');
        return false;
      }

      if (skillId === 'chensiyu_draw3') {
        p.flags.chensiyuUsed = true;
        this.log('沉思语发动「摸三张」。', 'skill');
        this.fx('skill', { player: p.index, name: '摸三张' });
        await this.drawCards(p, 3);
        await this.checkDeaths();
        return true;
      }

      if (skillId === 'kupai_swap') {
        p.flags.kupaiUsed = true;
        const oldHand = p.hand;
        p.hand = p.deck;
        p.deck = this.shuffle(oldHand.slice());
        this.log('「竭泽」：枯牌先知将手牌与牌库互换，生命垂危之际重洗命运。', 'skill');
        this.fx('swap', { player: p.index });
        this.update();
        await this.wait(600);
        return true;
      }

      if (skillId === 'ranxue_new' || skillId === 'ranxue_blood') {
        const candidates = p.hand.filter((c) => {
          const d = this.cardDef(c);
          return d.type === 'break' || d.type === 'damage';
        });
        const pick = await this.ask(p, {
          kind: 'card',
          title: (skillId === 'ranxue_new' ? '新生' : '血祭') + ' · 选择伤害牌',
          desc: '不消耗此牌，对自己造成其数值的伤害。' + (skillId === 'ranxue_new' ? '结束后回复等额生命。' : '下回合获得一半数值的伤害加成。'),
          cards: candidates,
          default: candidates[0] && candidates[0].uid,
        });
        let card = candidates.find((c) => c.uid === pick) || candidates[0];
        if (!card) return false;
        const defc = this.cardDef(card);
        const value = defc.value;
        if (skillId === 'ranxue_new') p.flags.ranxueNewUsed = true;
        else p.flags.ranxueBloodUsed = true;
        this.log('燃血行者发动「' + (skillId === 'ranxue_new' ? '新生' : '血祭') + '」，以「' + defc.name + '」自伤 ' + value + ' 点。', 'skill');
        this.fx('blood', { player: p.index, value });
        await this.selfDamageThroughShield(p, value);
        if (await this.checkDeaths()) return true;
        if (skillId === 'ranxue_new') {
          this.log('「新生」：回复 ' + value + ' 点生命。', 'heal');
          await this.heal(p, value, { source: 'ranxue' });
        } else {
          const bonus = Math.floor(value / 2);
          p.flags.ranxueNextBonus = (p.flags.ranxueNextBonus || 0) + bonus;
          this.log('「血祭」：下回合获得 +' + bonus + ' 伤害加成。', 'skill');
        }
        return true;
      }

      if (skillId === 'yuyan_destiny') {
        const pick = await this.ask(p, {
          kind: 'cardId',
          title: '命定 · 决定对方下一次摸到的牌',
          desc: '若对方牌库中已无此牌，对方将跳过下一次摸牌。',
          cardIds: CG.CARDS.map((c) => c.id),
          default: 'kuaizhan',
          confirmText: '写下命定',
        });
        const id = CG.CARD_MAP[pick] ? pick : 'kuaizhan';
        p.flags.destinyUsed = true;
        this.other(p).flags.destinyCard = id;
        this.log('「命定」：预言家写下命运 —— ' + this.other(p).name + ' 下一次将摸到「' + CG.CARD_MAP[id].name + '」。', 'skill');
        this.fx('destinySet', { player: p.index, card: CG.CARD_MAP[id] });
        this.update();
        return true;
      }

      if (skillId === 'meigui_delay') {
        if (p.played > 0 || !p.hand.length || p.flags.meiguiDelayed) return false;
        const candidates = p.hand.slice();
        const pick = await this.ask(p, {
          kind: 'card',
          title: '延授 · 选择要弃置的牌',
          desc: '弃置这张牌，将其效果延迟到下回合结束阶段。届时可直接发动，或继续延迟一回合并使数值 +2。',
          cards: candidates,
          default: candidates[0].uid,
          allowCancel: true,
        });
        const selected = candidates.find((c) => c.uid === pick);
        if (!selected || pick === false || pick === null) {
          this.log('玫瑰老师取消了延授。', 'system');
          return false;
        }
        const defc = this.cardDef(selected);
        const removed = await this.removeFromHand(p, selected.uid, { skipCaptain: true });
        if (!removed) return false;
        p.discard.push(removed);
        p.flags.meiguiDelayed = {
          cardId: defc.id,
          virtualDef: selected.def || null,
          bonus: 0,
          createdAtTurn: this.state.turnNumber,
        };
        p.flags.meiguiActive = true;
        p.playLimit = 1;
        this.log('「延授」：弃置「' + defc.name + '」，本回合仅可再正常打出 1 张牌，其效果延迟到下回合结束阶段。', 'skill');
        this.fx('delay', { player: p.index, card: defc });
        this.update();
        await this.wait(260);
        return true;
      }

      if (skillId === 'dutu_bet') {
        p.flags.dutuBetUsed = true;
        p.flags.dutuBetActive = true;
        this.log('「下注」：等待本回合下一次出牌，猜测牌库顶类型。', 'skill');
        this.fx('skill', { player: p.index, name: '下注' });
        this.update();
        return true;
      }
      return false;
    }

    /* ---------------- 死亡 / 结束 ---------------- */
    async checkDeaths() {
      if (this.state.over) return true;
      for (let guard = 0; guard < 5; guard++) {
        const dead = this.players.filter((p) => p.hp <= 0);
        if (!dead.length) return false;
        let revivedAny = false;
        for (const p of dead) {
          if (p.heroId === 'dao' && p.hand.length >= 2) {
            const accept = await this.ask(p, {
              kind: 'confirm',
              title: '淬炼 · 是否复活？',
              desc: '弃置 2 张手牌，复活并回到 1 点生命。',
              default: p.index === 1,
              confirmText: '弃牌复活',
              cancelText: '接受死亡',
            });
            if (accept) {
              let picks;
              if (p.index === 0) {
                picks = await this.ask(p, {
                  kind: 'cards',
                  title: '淬炼 · 选择弃置的 2 张牌',
                  desc: '弃置 2 张手牌后复活。',
                  cards: p.hand.slice(),
                  count: 2,
                  min: 2,
                  max: 2,
                });
                if (!Array.isArray(picks)) picks = [];
              } else {
                const sorted = p.hand.slice().sort((a, b) => this.cardDef(a).value - this.cardDef(b).value);
                picks = sorted.slice(0, 2).map((c) => c.uid);
              }
              const actual = [];
              for (const uid of picks.slice(0, 2)) {
                const c = p.hand.find((x) => x.uid === uid);
                if (c) actual.push(c.uid);
              }
              while (actual.length < 2 && p.hand.length > 0) {
                const c = p.hand.find((x) => !actual.includes(x.uid));
                if (!c) break;
                actual.push(c.uid);
              }
              if (actual.length === 2) {
                for (const uid of actual) {
                  const card = await this.removeFromHand(p, uid, { skipCaptain: true });
                  if (card) p.discard.push(card);
                }
                p.hp = 1;
                this.log('「淬炼」：' + p.name + ' 弃置 2 张手牌，从死亡边缘复活并回到 1 点生命。', 'skill');
                this.fx('revive', { player: p.index });
                revivedAny = true;
              }
            }
          }
        }
        if (!revivedAny) break;
      }
      const stillDead = this.players.filter((p) => p.hp <= 0);
      if (!stillDead.length) return false;
      if (stillDead.length === 2) {
        this.endGame(null, '同归于尽');
        return true;
      }
      const winner = this.players.find((p) => p.hp > 0);
      this.endGame(winner ? winner.index : null, '生命归零');
      return true;
    }

    endGame(winnerIndex, reason) {
      if (this.state.over) return;
      this.state.over = true;
      this.state.winner = winnerIndex;
      this.state.phase = 'over';
      this.state.busy = false;
      this.awaitingHuman = false;
      this.state.endedAt = Date.now();
      const text = winnerIndex === null
        ? '对局结束：平局。'
        : '对局结束：' + this.players[winnerIndex].name + ' 获胜！';
      this.log(text, 'win');
      this.update();
      this.fx('gameOver', { winner: winnerIndex, reason });
      this.hooks.onGameOver(this.state, this);
    }

    /* ---------------- 回合结束 ---------------- */
    async concludeTurn(p) {
      if (this.state.over) return;
      this.busy = true;
      this.awaitingHuman = false;
      this.state.phase = 'resolve';
      this.update();
      await this.wait(320);

      await this.finishPlayPhase(p);
      if (this.state.over) return;

      if (p.flags.ranxueNextBonus > 0) {
        // 血祭加成在下一回合开始后生效
        p.flags._ranxueCarry = (p.flags._ranxueCarry || 0) + p.flags.ranxueNextBonus;
        p.flags.ranxueNextBonus = 0;
      }

      // 兜底：正常情况下卡牌已在打出时即时结算
      if (this.hasPending(p)) {
        await this.resolvePending(p);
        if (this.state.over) return;
      }

      // 溯愈医者：行动阶段结束时判定
      if (p.heroId === 'suyu' && p.played <= 1 && p.hp > 0) {
        const amount = p.hp <= 8 ? 2 : 1;
        this.log('「静息」：本回合出牌 ≤ 1，' + p.name + ' 回复 ' + amount + ' 点生命。', 'heal');
        await this.heal(p, amount, { source: 'suyu' });
      }

      this.state.phase = 'end';
      this.update();
      await this.wait(300);

      // 玫瑰老师「延授」在结束阶段发动/继续延迟
      await this.resolveMeiguiDelay(p);
      if (this.state.over) return;

      // 本回合打出的护甲：若撑过对方下回合，下个自己回合开始时转化为额外护盾
      this.recordSurvivalShield(p);

      // 回合结束清理
      p.noArmor = false;
      p.breakAsNormal = false;
      p.noNingshen = false;
      if (p.flags.wolfTurns > 0) {
        p.flags.wolfTurns -= 1;
        if (p.flags.wolfTurns === 0) {
          this.log('「狼化」结束。', 'warn');
          this.fx('wolfEnd', { player: p.index });
        }
      }
      if (p.healLock > 0) p.healLock -= 1;
      p.flags.ranxueTurnBonus = 0;
      p.pending = emptyPending();
      p.flags.dutuBetActive = false;
      this.update();

      if (this.state.over) return;
      const next = 1 - p.index;
      await this.beginTurn(next);
    }

    /* ---------------- 人类行动入口 ---------------- */
    canHumanAct() {
      return (
        !this.state.over &&
        !this.busy &&
        this.state.current === 0 &&
        this.state.phase === 'play' &&
        this.players[0] &&
        this.players[0].hp > 0
      );
    }

    getPlayable(uid) {
      const p = this.players[0];
      const card = p && p.hand.find((c) => c.uid === uid);
      if (!card) return { ok: false, reason: '牌不存在' };
      if (!this.canHumanAct()) return { ok: false, reason: this.busy ? '处理中…' : '现在不能出牌' };
      return this.playability(p, card);
    }

    getSkills() {
      const p = this.players[0];
      if (!p) return [];
      return this.activeSkillDefs(p).map((s) => Object.assign({}, s, {
        available: s.available && this.canHumanAct(),
      }));
    }

    async humanPlayCard(uid, opts) {
      if (!this.canHumanAct()) return false;
      this.busy = true;
      this.awaitingHuman = false;
      this.update();
      try {
        await this.playCard(this.players[0], uid, opts);
      } finally {
        if (!this.state.over) this.busy = false;
        this.awaitingHuman = !this.state.over;
        this.update();
      }
      return true;
    }

    async humanActivateSkill(skillId) {
      if (!this.canHumanAct()) return false;
      this.busy = true;
      this.update();
      try {
        await this.activateSkill(this.players[0], skillId);
      } finally {
        if (!this.state.over) this.busy = false;
        this.update();
      }
      return true;
    }

    async humanEndTurn() {
      if (!this.canHumanAct()) return;
      this.busy = true;
      this.awaitingHuman = false;
      this.update();
      await this.concludeTurn(this.players[0]);
      if (!this.state.over) {
        this.busy = false;
        this.update();
      }
    }

    async aiPlayCard(p, uid, opts) {
      return this.playCard(p, uid, opts || {});
    }

    async aiActivateSkill(p, skillId) {
      return this.activateSkill(p, skillId);
    }

    async aiEndTurn(p) {
      await this.concludeTurn(p);
    }

  }

  // patch beginTurn to apply carry at start
  const _origBeginTurn = Game.prototype.beginTurn;
  Game.prototype.beginTurn = async function (pi) {
    const p = this.players[pi];
    if (p && p.flags && p.flags._ranxueCarry) {
      const carry = p.flags._ranxueCarry;
      p.flags._ranxueCarry = 0;
      p.flags.ranxueTurnBonus = (p.flags.ranxueTurnBonus || 0) + carry;
      this.log('「血祭」余温：' + p.name + ' 本回合所有伤害 +' + carry + '。', 'skill');
    }
    return _origBeginTurn.call(this, pi);
  };

  CG.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
