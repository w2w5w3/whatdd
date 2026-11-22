/* ============================================================
 * 我的刀盾 · BLADE & SHIELD
 * ui.js — 界面、交互、动效与移动端体验
 * ============================================================ */
(function (global) {
  'use strict';
  const CG = (global.CG = global.CG || {});

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const ICONS = {
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 5.6a5.4 5.4 0 00-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 00-7.6 7.6L12 21l8.8-7.8a5.4 5.4 0 000-7.6z"/></svg>',
    deck: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="16" rx="1.6"/><path d="M4 7v12.5"/><path d="M8.5 8h7"/></svg>',
    discard: '<svg viewBox="0 0 24 24"><path d="M5 8h14M9 8V5h6v3M7 8l1 11h8l1-11"/><path d="M10.5 11v5M13.5 11v5"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.4 4.4L19 7"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    sword: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9-3 1 1-3 9-9z"/><path d="M4 20l5-5"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 3c1.5 4-3 5.2-3 9a3 3 0 006 0c0-1.6-1-2.8-1-4 3 1.5 5 4 5 7a7 7 0 01-14 0c0-5 5-7 7-12z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10.5v6"/><circle cx="12" cy="7.2" r=".9" fill="currentColor" stroke="none"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  };

  // 攻击动画配置：颜色、刀光、冲击环、是否投射武器等均对应卡面风格
  const ATTACK_FX = {
    qingji: {
      color: '#ff7a6e',
      slashes: [
        { angle: -28, width: 1.25, thick: 3, delay: 0, offset: -5 },
        { angle: 22, width: 0.95, thick: 2, delay: 55, offset: 9 },
      ],
      rings: 1,
    },
    zhongji: {
      color: '#ff5a3c',
      size: 1.12,
      slashes: [
        { angle: -33, width: 1.5, thick: 8, delay: 0, offset: -7 },
        { angle: 23, width: 1.05, thick: 3, delay: 55, offset: 10 },
      ],
      rings: 2,
      burst: true,
    },
    juesha: {
      color: '#e22542',
      size: 1.28,
      slashes: [
        { angle: -38, width: 1.72, thick: 10, delay: 0, offset: -9 },
        { angle: 35, width: 1.6, thick: 8, delay: 40, offset: 9 },
        { angle: -3, width: 1.4, thick: 3, delay: 90, offset: 0 },
      ],
      rings: 3,
      burst: true,
      vignette: true,
    },
    kuaizhan: {
      color: '#7ee8ff',
      slashes: [
        { angle: -8, width: 1.42, thick: 2, delay: 80, offset: 0 },
        { angle: 6, width: 1.12, thick: 2, delay: 120, offset: 7 },
      ],
      rings: 1,
      projectile: true,
    },
    mengji: {
      color: '#ffb05c',
      size: 1.12,
      slashes: [
        { angle: -24, width: 1.55, thick: 6, delay: 0, offset: -5 },
        { angle: 27, width: 1.22, thick: 4, delay: 55, offset: 7 },
      ],
      rings: 3,
      burst: true,
      orb: true,
    },
  };

  const SHIELD_COLORS = {
    qingdun: '#7ccbff',
    zhongdun: '#4f8ef7',
    gujia: '#e4c16d',
  };

  const UI = {
    screen: 'menu',
    playerHeroId: 'sanyueqi',
    enemyHeroId: null,
    tab: 'player',
    game: null,
    pendingAsk: null,
    overlay: null,
    lastHandUids: new Set(),
    lastHandCount: 0,
    handScroll: 0,
    selectedUid: null,
    lastTapUid: null,
    lastTapAt: 0,
    lastTurnNumber: 0,
    resultShown: false,
    codexTab: 'rules',
    muted: false,

    init() {
      CG.Audio.init();
      this.muted = CG.Audio.muted;
      this.enemyHeroId = this.randomHero(this.playerHeroId);

      // 菜单
      $('#btn-play').addEventListener('click', () => {
        CG.Audio.resume();
        CG.Audio.play('click');
        this.openSelect();
      });
      $('#btn-menu-rules').addEventListener('click', () => this.openCodex('rules'));
      $('#btn-menu-codex').addEventListener('click', () => this.openCodex('cards'));
      $('#btn-menu-sound').addEventListener('click', () => this.toggleSound());
      $('#btn-select-rules').addEventListener('click', () => this.openCodex('rules'));
      $('#btn-select-back').addEventListener('click', () => this.showScreen('menu'));
      $('#btn-random-hero').addEventListener('click', () => this.randomCurrent());
      $('#btn-start-battle').addEventListener('click', () => this.startGame());
      $('#btn-current-detail')?.addEventListener('click', () => this.openSelectDetail());
      $('#slot-player').addEventListener('click', () => this.switchTab('player'));
      $('#slot-enemy').addEventListener('click', () => this.switchTab('enemy'));

      $$('.select-tab').forEach((btn) => {
        btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
      });

      // 战斗
      $('#btn-battle-back').addEventListener('click', () => this.openPause());
      $('#btn-battle-log').addEventListener('click', () => this.openBattleLog());
      $('#btn-battle-sound').addEventListener('click', () => this.toggleSound());
      $('#btn-end-turn').addEventListener('click', () => this.endTurn());
      $('#btn-battle-log')?.addEventListener('click', () => {});

      // 全局委托：手牌、英雄格、技能、牌堆、立绘
      document.addEventListener('click', (e) => {
        const heroTile = e.target.closest('.hero-tile');
        if (heroTile && this.screen === 'select') {
          this.pickHero(heroTile.dataset.heroId);
          return;
        }
        const cardInfo = e.target.closest('[data-card-info]');
        if (cardInfo && this.game && this.screen === 'battle') {
          this.openCardSheet(Number(cardInfo.dataset.cardInfo));
          return;
        }
        const handCard = e.target.closest('.hand-card');
        if (handCard && this.game && this.screen === 'battle') {
          this.handleHandCardClick(Number(handCard.dataset.uid), e);
          return;
        }
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;
        if (action === 'hero-info') {
          this.openHeroInfo(Number(actionEl.dataset.player));
        } else if (action === 'skill') {
          this.useSkill(actionEl.dataset.skill);
        } else if (action === 'pile') {
          this.openPile(actionEl.dataset.pile);
        } else if (action === 'peek-hand') {
          this.openEnemyHandPeek();
        } else if (action === 'fox-info') {
          this.openFoxInfo(Number(actionEl.dataset.player));
        } else if (action === 'dismiss') {
          this.closeOverlay();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.pendingAsk) return;
          if (this.overlay && this.overlay.dismissible) this.closeOverlay();
          return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && this.screen === 'battle') {
          if (e.target.closest && e.target.closest('[data-card-info]')) return;
          const handCard = e.target.closest && e.target.closest('.hand-card');
          if (handCard && !e.repeat) {
            e.preventDefault();
            this.tryPlayCard(Number(handCard.dataset.uid));
          }
        }
      });

      this.updateSoundButtons();
      this.renderSelect();
      this.showScreen('menu');
      this.setAmbient('assets/portraits/meigui.webp');
    },

    /* ---------------- 屏幕 ---------------- */
    showScreen(name) {
      this.screen = name;
      ['menu', 'select', 'battle'].forEach((s) => {
        const el = document.getElementById('screen-' + s);
        if (!el) return;
        el.classList.toggle('hidden', s !== name);
        el.scrollTop = 0;
      });
      if (name === 'menu') {
        this.setAmbient('assets/portraits/meigui.webp');
        $('#ambient-art').style.opacity = '';
      } else if (name === 'select') {
        this.updateSelectUI();
      } else if (name === 'battle') {
        const enemy = this.game && this.game.players[1];
        this.setAmbient(enemy ? enemy.hero.portrait : 'assets/portraits/meigui.webp', true);
      }
      this.closeOverlay();
    },

    setAmbient(url, battle) {
      const art = $('#ambient-art');
      if (art) {
        art.style.backgroundImage = url ? `url("${url}")` : 'none';
        art.style.opacity = '';
      }
      if (battle) {
        const screen = $('#screen-battle');
        if (screen) screen.style.setProperty('--battle-art', `url("${url}")`);
      }
    },

    randomHero(exclude) {
      const pool = CG.HEROES.filter((h) => h.id !== exclude);
      return pool[Math.floor(Math.random() * pool.length)].id;
    },

    /* ---------------- 主菜单交互 ---------------- */
    openSelect() {
      // AI 对手每次进入选择页都重新随机，避免一直沿用上一次的“女巫”等角色
      this.rollEnemyHero();
      this.renderSelect();
      this.showScreen('select');
      this.updateSelectUI();
    },

    rollEnemyHero() {
      const previous = this.enemyHeroId;
      const pool = CG.HEROES.filter((h) => h.id !== this.playerHeroId && h.id !== previous);
      const fallback = CG.HEROES.filter((h) => h.id !== this.playerHeroId);
      const source = pool.length ? pool : fallback;
      if (!source.length) return;
      this.enemyHeroId = source[Math.floor(Math.random() * source.length)].id;
    },

    switchTab(tab) {
      this.tab = tab;
      $$('.select-tab').forEach((b) => {
        const active = b.dataset.tab === tab;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this.updateSelectUI();
      CG.Audio.play('click');
    },

    pickHero(heroId) {
      if (!CG.HERO_MAP[heroId]) return;
      if (this.tab === 'player') this.playerHeroId = heroId;
      else this.enemyHeroId = heroId;
      CG.Audio.play('click');
      this.updateSelectUI();
    },

    randomCurrent() {
      this.pickHero(this.randomHero(this.tab === 'player' ? this.enemyHeroId : this.playerHeroId));
      CG.Audio.play('draw');
    },

    openSelectDetail() {
      const id = this.tab === 'player' ? this.playerHeroId : this.enemyHeroId;
      if (id) this.openHeroInfoById(id, false);
    },

    renderSelect() {
      const grid = $('#hero-grid');
      if (!grid) return;
      grid.innerHTML = CG.HEROES.map((h) => {
        const accent = h.accent || '#d5b371';
        return `<button class="hero-tile" data-hero-id="${esc(h.id)}" style="--accent:${accent}" aria-label="${esc(h.name)} · ${esc(h.title)}">
          <img src="${esc(h.portrait)}" alt="" draggable="false" />
          <span class="hero-tile__accent"></span>
          <span class="hero-tile__check">${ICONS.check}</span>
          <span class="hero-tile__meta">
            <span class="hero-tile__name">${esc(h.name)}</span>
            <span class="hero-tile__title">${esc(h.title)}</span>
          </span>
        </button>`;
      }).join('');
      this.updateSelectUI();
    },

    updateSelectUI() {
      if (!this.playerHeroId) this.playerHeroId = 'sanyueqi';
      if (!this.enemyHeroId) this.enemyHeroId = this.randomHero(this.playerHeroId);
      const ph = CG.HERO_MAP[this.playerHeroId];
      const eh = CG.HERO_MAP[this.enemyHeroId];
      if (!ph || !eh) return;

      $$('.hero-tile').forEach((tile) => {
        const id = tile.dataset.heroId;
        tile.classList.toggle('is-selected', this.tab === 'player' ? id === this.playerHeroId : id === this.enemyHeroId);
        tile.classList.toggle('is-other', (this.tab === 'player' && id === this.enemyHeroId) || (this.tab === 'enemy' && id === this.playerHeroId));
      });
      $('#tab-player-name').textContent = ph.name;
      $('#tab-enemy-name').textContent = eh.name;
      $('#slot-player-img').src = ph.portrait;
      $('#slot-player-name').textContent = ph.name;
      $('#slot-enemy-img').src = eh.portrait;
      $('#slot-enemy-name').textContent = eh.name;
      this.renderHeroDetail(this.tab === 'player' ? ph : eh);
      this.setAmbient((this.tab === 'player' ? ph : eh).portrait);
    },

    renderHeroDetail(hero) {
      const box = $('#hero-detail');
      if (!box || !hero) return;
      const pips = Array.from({ length: 3 }, (_, i) => `<span class="pip ${i < (hero.difficulty || 1) ? 'on' : ''}"></span>`).join('');
      const active = (hero.active || []).map((s) => `<div class="hero-detail__skill"><strong>${esc(s.name)}</strong><p>${esc(s.desc)}</p></div>`).join('');
      box.innerHTML = `
        <div class="hero-detail__top">
          <img class="hero-detail__portrait" src="${esc(hero.portrait)}" alt="" />
          <div>
            <div class="hero-detail__name">${esc(hero.name)}</div>
            <div class="hero-detail__title">${esc(hero.title)}</div>
            <div class="hero-detail__tags">${(hero.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          </div>
        </div>
        <div class="hero-detail__section">
          <h4>被动 · ${esc(hero.passiveName)}</h4>
          <p class="hero-detail__passive">${esc(hero.passive)}</p>
        </div>
        ${active ? `<div class="hero-detail__section"><h4>主动</h4>${active}</div>` : ''}
        <div class="hero-detail__difficulty">难度 ${pips}</div>
      `;
    },

    /* ---------------- 开始对局 ---------------- */
    async startGame() {
      if (!this.playerHeroId || !this.enemyHeroId) return;
      if (this.game && !this.game.state.over) {
        // 防止重复点击
        return;
      }
      CG.Audio.resume();
      CG.Audio.play('play');
      this.resultShown = false;
      this.lastHandUids = new Set();
      this.lastHandCount = 0;
      this.handScroll = 0;
      this.selectedUid = null;
      this.lastTapUid = null;
      this.lastTapAt = 0;
      this.lastTurnNumber = 0;
      this.showScreen('battle');
      const root = $('#battle-root');
      if (root) root.style.opacity = '';
      const hooks = {
        onUpdate: () => this.renderBattle(),
        onLog: () => {},
        onFx: (name, data, game) => this.playFx(name, data, game),
        onGameOver: (state, game) => this.showResult(state, game),
        ask: (spec) => this.ask(spec),
        delay: (ms) => CG.sleep(this.fast ? 0 : ms),
      };
      const game = new CG.Game({
        playerHeroId: this.playerHeroId,
        enemyHeroId: this.enemyHeroId,
        hooks,
        fast: false,
      });
      this.game = game;
      this.renderBattle();
      try {
        await game.start();
      } catch (err) {
        console.error(err);
        this.toast('对局启动失败：' + (err && err.message ? err.message : err), 'danger', 5000);
      }
    },

    rematch() {
      this.closeOverlay();
      if (this.game) {
        this.game.state.over = true;
        this.game.state.busy = true;
      }
      this.game = null;
      this.startGame();
    },

    leaveBattle(toSelect) {
      this.closeOverlay();
      if (this.game) {
        this.game.state.over = true;
        this.game.state.busy = true;
        this.game = null;
      }
      this.pendingAsk = null;
      this.selectedUid = null;
      this.lastTapUid = null;
      $('#modal-layer').classList.add('hidden');
      $('#modal-layer').innerHTML = '';
      this.resultShown = false;
      if (toSelect) this.openSelect();
      else this.showScreen('menu');
    },

    /* ---------------- 战斗渲染 ---------------- */
    renderBattle() {
      const game = this.game;
      if (!game || this.screen !== 'battle') return;
      const st = game.state;
      if (!st.players.length) return;

      $('#turn-number').textContent = '第 ' + st.turnNumber + ' 回合';
      const phase = st.phase;
      $$('#phase-track .phase-step').forEach((el) => {
        const p = el.dataset.phase;
        let active = false;
        let done = false;
        if (phase === 'start' || phase === 'draw') { active = p === 'draw'; }
        else if (phase === 'play') { active = p === 'play'; done = p === 'draw'; }
        else if (phase === 'resolve' || phase === 'end') { active = p === 'resolve'; done = p === 'draw' || p === 'play'; }
        el.classList.toggle('is-active', active);
        el.classList.toggle('is-done', done);
      });

      this.renderCombatant(st.players[1], true);
      this.renderCombatant(st.players[0], false);
      this.renderArena();
      this.renderHand();
      this.renderPiles();
      this.updateEndButton();

      if (st.turnNumber !== this.lastTurnNumber && !st.over) {
        this.lastTurnNumber = st.turnNumber;
        this.showTurnSplash(st.current === 0 ? '你的回合' : '对方回合', st.current === 0 ? 'YOUR TURN' : 'OPPONENT TURN');
        CG.Audio.play('turn');
      }
    },

    renderCombatant(p, enemy) {
      const zone = enemy ? $('#enemy-zone') : $('#player-zone');
      if (!zone) return;
      const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
      const accent = p.hero.accent || '#d5b371';
      const armor = p.armor || 0;
      const extra = p.extraShield || 0;
      const statuses = this.statusChips(p);
      const skills = !enemy ? this.skillButtons(p) : '';
      const handBacks = enemy ? this.enemyHand(p) : '';
      const hasShield = armor + extra > 0;
      const shieldColor = this.shieldColorForPlayer(p);
      zone.style.setProperty('--accent', accent);
      zone.style.setProperty('--shield-color', shieldColor);
      zone.classList.toggle('has-shield', hasShield);
      zone.classList.toggle('has-extra-shield', extra > 0);
      zone.innerHTML = `
        <button class="portrait-btn" data-action="hero-info" data-player="${p.index}" aria-label="查看 ${esc(p.name)} 的职业信息">
          <img src="${esc(p.hero.portrait)}" alt="${esc(p.name)}" draggable="false" />
        </button>
        <div class="combatant__body">
          <div class="combatant__head">
            <div class="combatant__name"><h3>${esc(p.name)}</h3><span>${esc(p.hero.title)}</span></div>
            <div class="combatant__hp-text"><b>${p.hp}</b><span> / ${p.maxHp}</span></div>
          </div>
          <div class="hp-bar ${hpPct <= 30 ? 'is-low' : ''}"><i style="width:${hpPct}%"></i></div>
          <div class="guard-row">
            <span class="guard guard--armor" style="${armor ? '' : 'opacity:.42'}" title="护甲">${ICONS.shield}${armor}</span>
            ${extra > 0 ? `<span class="guard guard--extra" title="额外护盾，优先扣除">${ICONS.spark}额外 ${extra}</span>` : ''}
            ${p.heroId === 'xunlianshi' ? `<button class="fox-chip" data-action="fox-info" data-player="${p.index}" title="查看火狐狸详情"><img src="assets/summons/huohuli.webp" alt="火狐狸" draggable="false" /><b>${p.flags.foxDamage || 1}</b></button>` : ''}
            ${statuses}
          </div>
          ${skills ? `<div class="combatant__skills-row"><div class="skill-dock">${skills}</div></div>` : ''}
        </div>
        ${handBacks}
        ${hasShield ? `<div class="guard-aura" aria-hidden="true"></div>` : ''}
      `;
    },

    shieldColorForCard(cardId) {
      if (!cardId) return '#6db8ff';
      if (String(cardId).indexOf('virtual_armor') === 0) return SHIELD_COLORS.gujia;
      return SHIELD_COLORS[cardId] || '#6db8ff';
    },

    shieldColorForPlayer(p) {
      if (!p) return '#6db8ff';
      return this.shieldColorForCard(p.flags && p.flags.lastArmorCardId);
    },

    statusChips(p) {
      const out = [];
      const push = (text, cls) => out.push(`<span class="status-chip ${cls || ''}">${esc(text)}</span>`);
      if (p.noArmor) push('禁甲', 'status-chip--bad');
      if (p.breakAsNormal) push('破甲→普伤', 'status-chip--good');
      if (p.noNingshen) push('禁凝神', 'status-chip--bad');
      if (p.flags.wolfTurns > 0) push('狼化 +2伤 · ' + p.flags.wolfTurns + '回合', 'status-chip--purple');
      if (p.heroId === 'langren' && p.flags.wolfMode === 'a' && p.hp <= 8 && p.flags.wolfTurns <= 0) push('嗜血 +1伤', 'status-chip--bad');
      if (p.flags.yuxueNextDamage > 0) push('伤害 +' + p.flags.yuxueNextDamage, 'status-chip--bad');
      if (p.flags.ranxueTurnBonus > 0) push('血祭 +' + p.flags.ranxueTurnBonus + '伤害', 'status-chip--purple');
      if (p.flags.ranxueNextBonus > 0) push('血祭蓄势 +' + p.flags.ranxueNextBonus, 'status-chip--purple');
      if (p.healLock > 0) push('禁疗', 'status-chip--bad');
      if (p.nextDrawPenalty > 0) push('少摸 1', 'status-chip--bad');
      if (p.flags.meiguiDelayed) push('延授 +' + p.flags.meiguiDelayed.bonus + ' · 待发动', 'status-chip--purple');
      if (p.flags.dutuBetActive) push('已下注', 'status-chip--good');
      if (p.flags.destinyCard) push('命定 · ' + CG.CARD_MAP[p.flags.destinyCard].name, 'status-chip--purple');
      if (p.flags.poisonType && p.index === 0) push('毒咒 · ' + CG.TYPE_INFO[p.flags.poisonType].name, 'status-chip--purple');
      if (p.index === 1 && p.heroId === 'nvwu') push('毒咒已布', 'status-chip--purple');
      if (p.index === 0 && p.heroId === 'yuyan') push('前瞻 · 全知', 'status-chip--good');
      if (p.index === 0 && p.heroId === 'heike') push('骇入 · 情报', 'status-chip--good');
      if (p.heroId === 'shengnv' && p.flags.blessingBonus > 0) push('赐福 +' + p.flags.blessingBonus, 'status-chip--good');
      if (p.flags.blindedTurn) push('致盲 · 禁牌', 'status-chip--bad');
      if (p.heroId === 'suyu' && p.flags.suyuAwakened) push('静息 · 回复2', 'status-chip--good');
      if (p.heroId === 'sanyueqi' && (p.armor > 0 || p.extraShield > 0)) push('护甲反伤', 'status-chip--good');
      if (p.heroId === 'xunqing') push('同殇待发', 'status-chip--bad');
      if (p.flags.chensiyuUsed) push('摸三已用', '');
      return out.slice(0, 7).join('');
    },

    skillButtons(p) {
      if (!this.game) return '';
      const skills = this.game.getSkills();
      let html = '';
      skills.forEach((s) => {
        html += `<button class="skill-btn" data-action="skill" data-skill="${esc(s.id)}" ${s.available ? '' : 'disabled'} title="${esc(s.reason || s.desc)}"><i>${esc(s.icon || '✦')}</i>${esc(s.name)}</button>`;
      });
      html += `<button class="skill-btn skill-btn--more" data-action="hero-info" data-player="0"><i>${ICONS.info}</i>职业</button>`;
      return html;
    },

    enemyHand(p) {
      const count = p.hand.length;
      const show = Math.min(count, 8);
      const viewer = this.game && this.game.players[0];
      const reveal = viewer && viewer.heroId === 'yuyan';
      const intel = viewer && viewer.heroId === 'heike';
      if (reveal) {
        const cards = p.hand.slice(0, show).map((card) => {
          const def = this.game.cardDef(card);
          return `<img class="mini-face" src="${esc(def.img)}" alt="${esc(def.name)}" title="${esc(def.name)}" draggable="false" />`;
        }).join('');
        return `<button class="enemy-hand enemy-hand--revealed" data-action="peek-hand" aria-label="前瞻：查看对方全部 ${count} 张手牌" title="前瞻：查看对方全部手牌">
          <span class="enemy-hand__stack">${cards}</span>
          <span class="enemy-hand__count"><b>${count}</b> 手牌</span>
          <span class="peek-eye" aria-hidden="true">${ICONS.eye}</span>
        </button>`;
      }
      let backs = '';
      for (let i = 0; i < show; i++) backs += `<span class="mini-back"></span>`;
      return `<div class="enemy-hand"><div class="enemy-hand__stack">${backs}</div><div class="enemy-hand__count"><b>${count}</b> 手牌</div>${intel ? `<button class="peek-eye peek-eye--btn" data-action="peek-hand" aria-label="查看对方牌库情报" title="骇入：查看对方牌库剩余数量">${ICONS.eye}</button>` : ''}</div>`;
    },

    renderArena() {
      const game = this.game;
      const st = game.state;
      const p = st.players[st.current];
      if (!p) return;
      const over = st.over;
      const arena = $('#arena-center');
      if (!arena) return;
      const turnText = over ? '棋局已定' : (st.current === 0 ? '你的回合' : '对手的回合');
      const remain = Math.max(0, p.playLimit - p.played);
      let phaseText = '';
      if (over) phaseText = '余烬落定';
      else if (st.phase === 'play') phaseText = '出牌阶段 · 双击出牌 · 立即结算 · 还可出 ' + remain + ' 张';
      else if (st.phase === 'resolve' || st.phase === 'end') phaseText = '回合收尾 · 持续效果与状态结算';
      else if (st.phase === 'draw') phaseText = '摸牌阶段';
      else phaseText = '回合开始';
      const badges = [];
      if (p.flags.dutuBetActive) badges.push(`<span class="queue-badge queue-badge--normal">下注待揭</span>`);
      if (st.phase === 'play' && !over) badges.push(`<span class="queue-badge queue-badge--armor">即时结算</span>`);
      arena.innerHTML = `
        <div class="arena-turn ${st.current === 1 && !over ? 'is-enemy' : ''}">${turnText}</div>
        <div class="arena-phase">${phaseText}</div>
        ${badges.length ? `<div class="queue-badges">${badges.join('')}</div>` : ''}
        <div class="arena-piles"><span>牌库 <b>${p.deck.length}</b></span><span>弃牌 <b>${p.discard.length}</b></span>${st.exhausted ? '<span style="color:#ffb0a7">枯牌阶段</span>' : ''}</div>
      `;

      const ticker = $('#battle-ticker');
      if (ticker) {
        const logs = st.log.slice(-3).reverse();
        ticker.innerHTML = logs.map((l) => `<div class="ticker-line" data-tone="${esc(l.tone)}">${esc(l.text.length > 72 ? l.text.slice(0, 72) + '…' : l.text)}</div>`).join('');
      }
    },

    renderHand() {
      const game = this.game;
      if (!game) return;
      const p = game.players[0];
      const hand = $('#hand');
      if (!hand || !p) return;
      const oldScroll = hand.scrollLeft || 0;
      const oldCount = this.lastHandCount;
      const canAct = game.canHumanAct();
      const cards = p.hand;

      // 选中牌可能在出牌/弃牌后离开手牌
      if (this.selectedUid && !cards.some((c) => c.uid === this.selectedUid)) {
        this.selectedUid = null;
        this.lastTapUid = null;
      }

      // 先移除已经不在手牌中的节点，保留其余 DOM（避免阶段刷新导致卡图闪烁）
      const desired = new Set(cards.map((c) => String(c.uid)));
      Array.from(hand.children).forEach((el) => {
        if (el.classList.contains('hand-card') && !desired.has(String(el.dataset.uid))) el.remove();
        if (el.classList.contains('hand-empty')) el.remove();
      });

      if (!cards.length) {
        if (!hand.querySelector('.hand-empty')) {
          hand.innerHTML = '<div class="hand-empty">手中无牌 · 静候下一回合</div>';
        }
        hand.classList.remove('is-centered');
        this.lastHandUids = new Set();
        this.lastHandCount = 0;
        this.updateHandHint();
        return;
      }

      cards.forEach((card, i) => {
        const def = game.cardDef(card);
        const info = CG.TYPE_INFO[def.type] || CG.TYPE_INFO.rest;
        let el = hand.querySelector(`.hand-card[data-uid="${card.uid}"]`);
        if (!el) {
          el = document.createElement('div');
          el.className = 'hand-card is-new';
          el.dataset.uid = String(card.uid);
          el.setAttribute('role', 'button');
          el.tabIndex = 0;
          el.style.setProperty('--delay', (i * 0.03) + 's');
          el.innerHTML = `
            <img src="${esc(def.img)}" alt="${esc(def.name)}" draggable="false" />
            <span class="hand-card__type"></span>
            <button class="hand-card__info" type="button" data-card-info="${esc(card.uid)}" aria-label="查看「${esc(def.name)}」详情">${ICONS.info}</button>
          `;
          el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true });
          // 兜底：动画事件未触发时也要清理，避免后续状态更新重复闪烁
          setTimeout(() => el.classList.remove('is-new'), 700);
        }
        const check = canAct ? game.getPlayable(card.uid) : { ok: false, reason: '' };
        // 对手回合/动画结算期间只禁用交互，不改变卡面亮度，避免阶段切换造成“闪烁”观感
        const disabled = game.state.over || (canAct && !check.ok);
        el.classList.toggle('is-disabled', disabled);
        el.classList.toggle('is-playable', canAct && !disabled);
        el.classList.toggle('is-selected', this.selectedUid === card.uid);
        el.style.setProperty('--type-color', info.color);
        el.setAttribute('aria-label', `${def.name}：${def.short}。单击选中，双击立即打出。`);
        el.setAttribute('aria-pressed', this.selectedUid === card.uid ? 'true' : 'false');
        el.title = `${def.name} · ${def.short}`;
        const typeEl = el.querySelector('.hand-card__type');
        if (typeEl) typeEl.textContent = info.short;
        const infoEl = el.querySelector('.hand-card__info');
        if (infoEl) infoEl.dataset.cardInfo = String(card.uid);

        let lockEl = el.querySelector('.hand-card__lock');
        if (canAct && disabled) {
          if (!lockEl) {
            lockEl = document.createElement('span');
            lockEl.className = 'hand-card__lock';
            el.appendChild(lockEl);
          }
          lockEl.textContent = this.shortReason(check.reason);
        } else if (lockEl) {
          lockEl.remove();
        }

        const atIndex = hand.children[i];
        if (atIndex !== el) hand.insertBefore(el, atIndex || null);
      });

      this.lastHandUids = new Set(cards.map((c) => c.uid));
      this.lastHandCount = cards.length;
      requestAnimationFrame(() => {
        if (!hand) return;
        hand.classList.toggle('is-centered', hand.scrollWidth <= hand.clientWidth + 2);
        if (cards.length > oldCount) hand.scrollLeft = hand.scrollWidth;
        else hand.scrollLeft = Math.min(oldScroll, hand.scrollWidth);
      });
      this.updateHandHint();
    },

    updateHandHint() {
      const game = this.game;
      const hint = $('#hand-hint');
      if (!hint || !game) return;
      const p = game.players[0];
      hint.classList.remove('has-selection');
      if (game.state.over) hint.innerHTML = '对局已结束';
      else if (game.state.current === 1) hint.innerHTML = '对手行动中 · 请稍候';
      else if (game.busy) hint.innerHTML = '处理中…';
      else if (game.canHumanAct() && p.flags.blindedTurn) {
        hint.innerHTML = '致盲 · 本回合无法出牌，可直接结束回合';
      }
      else if (game.canHumanAct()) {
        const remain = p.playLimit - p.played;
        let extra = '';
        if (p.flags.dutuBetActive) extra = ' · 已下注';
        else if (p.noNingshen) extra = ' · 禁凝神';
        hint.innerHTML = `剩余 <b>${remain}</b> 张 · 双击出牌${extra}`;
      } else hint.innerHTML = '';
    },

    handleHandCardClick(uid, event) {
      if (!this.game || !this.game.canHumanAct()) return;
      const now = Date.now();
      if (this.lastTapUid === uid && now - this.lastTapAt < 500) {
        this.lastTapUid = null;
        this.lastTapAt = 0;
        this.tryPlayCard(uid);
        return;
      }
      this.lastTapUid = uid;
      this.lastTapAt = now;
      this.selectedUid = uid;
      CG.Audio.play('click');
      this.updateHandSelection();
    },

    updateHandSelection() {
      const hand = $('#hand');
      if (!hand) return;
      $$('.hand-card', hand).forEach((el) => {
        const isSelected = Number(el.dataset.uid) === Number(this.selectedUid);
        if (isSelected) el.classList.remove('is-new');
        el.classList.toggle('is-selected', isSelected);
        el.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
      this.updateHandHint();
    },

    async tryPlayCard(uid) {
      if (!this.game || !this.game.canHumanAct()) return;
      const p = this.game.players[0];
      const card = p.hand.find((c) => c.uid === Number(uid));
      if (!card) return;
      const check = this.game.getPlayable(uid);
      if (!check.ok) {
        CG.Audio.play('error');
        this.toast(check.reason || '现在无法打出这张牌', 'danger', 1800);
        this.updateHandHint();
        return;
      }
      this.selectedUid = null;
      this.lastTapUid = null;
      this.updateHandSelection();
      CG.Audio.play('play');
      try {
        await this.game.humanPlayCard(uid, {});
      } catch (err) {
        console.error(err);
        this.toast('出牌失败：' + (err && err.message ? err.message : err), 'danger', 2600);
      }
    },

    shortReason(reason) {
      if (!reason) return '';
      const map = [
        ['对方无护甲', '需护甲'],
        ['对方有护甲', '需无甲'],
        ['出牌次数', '次数用尽'],
        ['不能使用叠甲牌', '禁甲'],
        ['不能使用凝神', '禁凝神'],
        ['不是你的回合', '非你回合'],
        ['对局已结束', '已结束'],
        ['当前不是出牌阶段', '等待阶段'],
        ['处理中', '处理中'],
      ];
      for (const [needle, text] of map) if (reason.includes(needle)) return text;
      return reason.length > 10 ? reason.slice(0, 10) : reason;
    },

    renderPiles() {
      const game = this.game;
      if (!game) return;
      const p = game.players[0];
      const box = $('#piles');
      if (!box || !p) return;
      box.innerHTML = `
        <button class="pile-btn" data-action="pile" data-pile="deck">${ICONS.deck}<span>牌库</span><b>${p.deck.length}</b></button>
        <button class="pile-btn" data-action="pile" data-pile="discard">${ICONS.discard}<span>弃牌</span><b>${p.discard.length}</b></button>
        <span class="pile-btn" style="cursor:default" title="当前手牌数量">${ICONS.info}<span>手牌</span><b>${p.hand.length}</b></span>
      `;
    },

    updateEndButton() {
      const game = this.game;
      const btn = $('#btn-end-turn');
      if (!btn || !game) return;
      const st = game.state;
      const can = game.canHumanAct();
      let label = '结束回合';
      let sub = '进入收尾';
      if (st.over) { label = '对局结束'; sub = '余烬落定'; }
      else if (st.current === 1) { label = '对手回合'; sub = '等待对手'; }
      else if (game.busy) { label = '处理中'; sub = '请稍候'; }
      btn.innerHTML = `<span>${label}</span><small>${sub}</small>`;
      btn.disabled = !can;
      btn.classList.toggle('is-pulse', can && (st.players[0].played >= st.players[0].playLimit));
    },

    /* ---------------- 人类操作 ---------------- */
    async endTurn() {
      if (!this.game || !this.game.canHumanAct()) return;
      CG.Audio.play('click');
      this.selectedUid = null;
      this.lastTapUid = null;
      this.updateHandSelection();
      this.lastTurnNumber = this.game.state.turnNumber;
      try {
        await this.game.humanEndTurn();
      } catch (err) {
        console.error(err);
        this.toast('结束回合失败：' + (err && err.message ? err.message : err), 'danger', 2600);
      }
      this.lastTurnNumber = this.game.state.turnNumber;
    },

    async useSkill(skillId) {
      if (!this.game || !this.game.canHumanAct()) return;
      const p = this.game.players[0];
      const state = this.game.activeSkillDefs(p).find((s) => s.id === skillId);
      const skill = (p.hero.active || []).find((s) => s.id === skillId);
      if (!state || !skill) return;
      if (!state.available) {
        this.toast(state.reason || '技能现在不可用', 'danger', 1800);
        return;
      }
      this.closeOverlay();
      CG.Audio.play('click');
      const body = `
        <div class="skill-confirm">
          <div class="skill-confirm__icon">${esc(skill.icon || '✦')}</div>
          <div class="skill-confirm__text">
            <strong>${esc(skill.name)}</strong>
            <p>${esc(skill.desc)}</p>
          </div>
        </div>
        <p class="skill-confirm__note">发动后将立即进入技能结算，是否确认？</p>`;
      this.openModal({
        title: '确认发动 · ' + skill.name,
        eyebrow: 'SKILL CONFIRM',
        body,
        dismissible: true,
        footer: '<button class="btn btn--ghost" data-skill-cancel>取消</button><button class="btn btn--primary" data-skill-confirm>确认发动</button>',
        onMount: (root) => {
          root.querySelector('[data-skill-cancel]').addEventListener('click', () => this.closeOverlay());
          root.querySelector('[data-skill-confirm]').addEventListener('click', async () => {
            if (!this.game || !this.game.canHumanAct()) {
              this.toast('当前无法发动技能', 'danger');
              this.closeOverlay();
              return;
            }
            const now = this.game.activeSkillDefs(this.game.players[0]).find((s) => s.id === skillId);
            if (!now || !now.available) {
              this.toast(now ? now.reason : '技能现在不可用', 'danger');
              this.closeOverlay();
              return;
            }
            this.closeOverlay();
            CG.Audio.play('skill');
            try {
              await this.game.humanActivateSkill(skillId);
            } catch (err) {
              console.error(err);
              this.toast('技能发动失败：' + (err && err.message ? err.message : err), 'danger', 2600);
            }
          });
        },
      });
    },

    async playCardWithVariant(uid, variant) {
      if (!this.game || !this.game.canHumanAct()) return;
      this.closeOverlay();
      CG.Audio.play('play');
      try {
        await this.game.humanPlayCard(uid, variant ? { variant } : {});
      } catch (err) {
        console.error(err);
      }
    },

    /* ---------------- 卡牌详情 ---------------- */
    openCardSheet(uid) {
      const game = this.game;
      if (!game) return;
      uid = Number(uid);
      const p = game.players[0];
      const card = p.hand.find((c) => c.uid === uid);
      if (!card) return;
      const def = game.cardDef(card);
      const info = CG.TYPE_INFO[def.type];
      const check = game.getPlayable(uid);
      const calc = this.cardCalc(def, p);
      const enemy = game.players[1];
      let variantButtons = '';
      if (check.ok && game.canHumanAct()) {
        if (p.heroId === 'dunai' && (def.id === 'tiaoxi' || def.id === 'huanyu')) {
          variantButtons = `
            <button class="btn btn--primary" data-card-play="heal">治疗自己</button>
            <button class="btn btn--ghost" data-card-play="curse">腐乳敌方</button>`;
        } else if (p.heroId === 'kuaishou' && def.id === 'ningshen') {
          variantButtons = `
            <button class="btn btn--primary" data-card-play="draw">摸 2 张</button>
            <button class="btn btn--ghost" data-card-play="steal">掠取对方 2 张</button>`;
        } else {
          variantButtons = `<button class="btn btn--primary" data-card-play="normal">打出此牌</button>`;
        }
      }
      const hints = [];
      if (p.flags.meiguiDelayed) hints.push('「延授」已延迟一张牌，将在下回合结束阶段选择发动。');
      if (p.flags.dutuBetActive) hints.push('已下注：出牌后将猜测牌库顶类型。');
      if (def.type === 'break' && game.totalShield(enemy) === 0 && p.breakAsNormal) hints.push('「绝杀」余势：可作为普通伤害牌打出。');
      if (p.heroId === 'sanyueqi' && def.type === 'armor') hints.push('「少女的特权」使护甲 +1。');
      if (p.heroId === 'jianbi' && def.type === 'armor') hints.push('「重甲」使护甲 +1。');
      if (p.heroId === 'pojia' && def.type === 'armor') hints.push('「粉碎」使叠甲牌护甲 -1。');
      if (p.heroId === 'pojia' && def.type === 'break') hints.push('「粉碎」使破甲伤害 +2。');
      if (p.heroId === 'jifeng' && def.type === 'damage') hints.push('「风淬」使普通伤害 +1。');

      const body = `
        <div class="card-sheet">
          <div class="card-sheet__art"><img src="${esc(def.img)}" alt="${esc(def.name)}" /></div>
          <div class="card-sheet__info">
            <span class="card-sheet__type" style="--type-color:${info.color}">${esc(info.name)}</span>
            <h3 class="card-sheet__name">${esc(def.name)}</h3>
            <p class="card-sheet__desc">${esc(def.desc || def.short)}</p>
            <div class="card-sheet__calc">${calc}</div>
            ${check.ok ? '' : `<div class="card-sheet__reason">${esc(check.reason)}</div>`}
            <div class="card-sheet__actions">${variantButtons}<button class="btn btn--ghost" data-dismiss>取消</button></div>
            ${hints.length ? `<p class="sheet-hint">${hints.map(esc).join('<br>')}</p>` : ''}
          </div>
        </div>`;
      this.openModal({
        title: '卡牌 · ' + def.name,
        eyebrow: 'YOUR HAND',
        body,
        wide: true,
        dismissible: true,
        onMount: (root) => {
          $$('[data-card-play]', root).forEach((btn) => {
            btn.addEventListener('click', () => {
              const kind = btn.dataset.cardPlay;
              let variant;
              if (kind === 'heal' || kind === 'curse') variant = { healMode: kind };
              else if (kind === 'draw' || kind === 'steal') variant = { ningshenMode: kind };
              this.playCardWithVariant(uid, variant);
            });
          });
        },
      });
    },

    cardCalc(def, p) {
      const game = this.game;
      const enemy = game.players[1];
      const ranxueBonus = p.flags.ranxueTurnBonus || 0;
      if (def.type === 'armor') {
        const bless = p.heroId === 'shengnv' ? (p.flags.blessingBonus || 0) : 0;
        let v = game.computeArmorValue(p, def.value, bless);
        return `打出后立即获得 <b>${v}</b> 点护甲。${p.heroId === 'sanyueqi' ? '三月七无法获得额外护甲。' : '若到下个自己回合开始时护盾未被击碎，当前护甲全部转化为等量额外护盾，普通护甲清零；额外护盾在再下一个自己回合开始时消散。'}${bless ? ` 赐福加成 +${bless}。` : ''}`;
      }
      if (def.type === 'break') {
        let v = game.computeBreakValue(p, def.value, 0);
        let t = `打出后立即造成 <b>${v}</b> 点破甲伤害（先削减护甲）。`;
        if (ranxueBonus > 0) t += ` 血祭加成 +${ranxueBonus}，实际 ${v + ranxueBonus} 点。`;
        if (p.heroId === 'chuanxi' && enemy && enemy.armor >= 8) t += '「裂隙」将无视一半护甲。';
        return t;
      }
      if (def.type === 'damage') {
        let v = game.computeNormalValue(p, def.value, 0);
        let t = `打出后立即造成 <b>${v}</b> 点普通伤害（目标须无护甲）。`;
        if (ranxueBonus > 0) t += ` 血祭加成 +${ranxueBonus}，实际 ${v + ranxueBonus} 点。`;
        return t;
      }
      const bless = p.heroId === 'shengnv' ? (p.flags.blessingBonus || 0) : 0;
      if (def.heal) return `恢复 <b>${def.heal + bless}</b> 点生命。治疗不受职业被动与必杀影响。${bless ? ` 赐福加成 +${bless}。` : ''}`;
      if (def.draw) {
        let n = def.draw + bless + (p.heroId === 'chensiyu' ? 1 : 0);
        return `额外摸 <b>${n}</b> 张牌${p.heroId === 'kuaishou' ? '；也可改为掠取对方 2 张手牌' : ''}。`;
      }
      return '查看卡牌效果。';
    },

    /* ---------------- 弹层基础设施 ---------------- */
    openModal(opts) {
      const layer = $('#modal-layer');
      if (!layer) return;
      this.overlay = { dismissible: !!opts.dismissible };
      layer.classList.remove('hidden');
      layer.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal ${opts.wide ? 'modal--wide' : ''} ${opts.codex ? 'modal--codex' : ''} ${opts.sheet ? 'modal--sheet' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || '对话框')}">
          ${opts.dismissible ? `<button class="icon-btn modal__close" data-dismiss aria-label="关闭">${ICONS.close}</button>` : ''}
          <div class="modal__head">
            ${opts.eyebrow ? `<div class="modal__eyebrow">${esc(opts.eyebrow)}</div>` : ''}
            <h2 class="modal__title">${opts.title || ''}</h2>
            ${opts.desc ? `<p class="modal__desc">${opts.desc}</p>` : ''}
            ${opts.headExtra || ''}
          </div>
          <div class="modal__body">${opts.body || ''}</div>
          ${opts.footer ? `<div class="modal__foot">${opts.footer}</div>` : ''}
        </div>`;
      $$('[data-dismiss]', layer).forEach((btn) => btn.addEventListener('click', () => {
        if (this.pendingAsk) return;
        this.closeOverlay();
      }));
      if (opts.onMount) opts.onMount(layer, this);
      requestAnimationFrame(() => {
        const first = layer.querySelector('button:not([disabled]), [tabindex]');
        if (first) first.focus({ preventScroll: true });
      });
    },

    closeOverlay() {
      if (this.pendingAsk) return;
      const layer = $('#modal-layer');
      if (layer) {
        layer.classList.add('hidden');
        layer.innerHTML = '';
      }
      this.overlay = null;
    },

    ask(spec) {
      return new Promise((resolve) => {
        this.pendingAsk = { spec, resolve };
        this.renderAsk(spec);
      });
    },

    finishAsk(value) {
      const pending = this.pendingAsk;
      this.pendingAsk = null;
      const layer = $('#modal-layer');
      if (layer) {
        layer.classList.add('hidden');
        layer.innerHTML = '';
      }
      this.overlay = null;
      if (pending) pending.resolve(value);
    },

    renderAsk(spec) {
      const layer = $('#modal-layer');
      if (!layer) return;
      layer.classList.remove('hidden');
      let body = '';
      let footer = '';
      const kind = spec.kind || 'confirm';
      if (kind === 'confirm') {
        body = `<div class="modal__desc" style="margin:0">${esc(spec.desc || '')}</div>`;
        footer = `
          <button class="btn btn--ghost" data-ask-no>${esc(spec.cancelText || '取消')}</button>
          <button class="btn btn--primary" data-ask-yes>${esc(spec.confirmText || '确认')}</button>`;
      } else if (kind === 'choose') {
        body = `<div class="ask-options">${(spec.options || []).map((o, i) => `
          <button class="ask-option" data-ask-value="${esc(o.value)}">
            <span class="ask-option__icon">${esc(o.icon || String(i + 1).padStart(2, '0'))}</span>
            <span><strong>${esc(o.label)}</strong>${o.desc ? `<p>${esc(o.desc)}</p>` : ''}</span>
          </button>`).join('')}</div>`;
      } else if (kind === 'type') {
        body = `<div class="type-grid">${(spec.options || []).map((o) => {
          const info = CG.TYPE_INFO[o.value] || { color: '#d5b371', short: '?' };
          return `<button class="type-option" data-ask-value="${esc(o.value)}" style="--type-color:${info.color}">
            <span class="type-option__badge" style="background:${info.color}">${esc(info.short)}</span>
            <span><strong>${esc(o.label)}</strong><span>${esc(info.desc)}</span></span>
          </button>`;
        }).join('')}</div>`;
      } else if (kind === 'card') {
        const hidden = !!spec.hidden;
        body = `<div class="card-pick-grid">${(spec.cards || []).map((c) => {
          if (hidden) {
            return `<button class="card-pick" data-ask-card="${esc(c.uid)}" aria-label="未知手牌"><img src="assets/backs/back1.webp" alt="未知手牌" /><span class="card-pick__name">未知手牌</span></button>`;
          }
          const def = c.def || CG.CARD_MAP[c.id];
          if (!def) return '';
          return `<button class="card-pick" data-ask-card="${esc(c.uid)}" aria-label="${esc(def.name)}"><img src="${esc(def.img)}" alt="${esc(def.name)}" /><span class="card-pick__name">${esc(def.name)}</span></button>`;
        }).join('')}</div><div class="pick-hint">${hidden ? '点击一张牌背以选择' : '点击一张牌以选择'}</div>
        ${spec.allowCancel ? '<div class="modal__foot" style="border:0;background:none;padding:14px 0 0"><button class="btn btn--ghost" data-ask-no>跳过</button></div>' : ''}`;
      } else if (kind === 'cards') {
        body = `<div class="card-pick-grid" id="ask-card-grid">${(spec.cards || []).map((c) => {
          const def = c.def || CG.CARD_MAP[c.id];
          if (!def) return '';
          return `<button class="card-pick" data-multi-card="${esc(c.uid)}" aria-label="${esc(def.name)}"><img src="${esc(def.img)}" alt="${esc(def.name)}" /><span class="card-pick__check">${ICONS.check}</span><span class="card-pick__name">${esc(def.name)}</span></button>`;
        }).join('')}</div><div class="pick-count">已选择 <b id="ask-pick-count">0</b> / ${spec.count || 1}</div>`;
        footer = `<button class="btn btn--primary" id="ask-multi-confirm" disabled>确认选择</button>`;
      } else if (kind === 'cardId') {
        const ids = spec.cardIds || CG.CARDS.map((c) => c.id);
        body = `<div class="card-pick-grid">${ids.map((id) => {
          const def = CG.CARD_MAP[id];
          if (!def) return '';
          return `<button class="card-pick" data-ask-cardid="${esc(id)}"><img src="${esc(def.img)}" alt="${esc(def.name)}" /><span class="card-pick__name">${esc(def.name)} · ${esc(def.short)}</span></button>`;
        }).join('')}</div><div class="pick-hint">点击一张牌以选择</div>`;
      }
      layer.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal ${kind === 'cardId' || kind === 'cards' ? 'modal--wide' : ''}" role="dialog" aria-modal="true">
          <div class="modal__head">
            ${spec.eyebrow ? `<div class="modal__eyebrow">${esc(spec.eyebrow)}</div>` : '<div class="modal__eyebrow">抉择</div>'}
            <h2 class="modal__title">${esc(spec.title || '做出选择')}</h2>
            ${spec.desc && kind !== 'confirm' ? `<p class="modal__desc">${esc(spec.desc)}</p>` : ''}
          </div>
          <div class="modal__body">${body}</div>
          ${footer ? `<div class="modal__foot">${footer}</div>` : ''}
        </div>`;
      this.overlay = { dismissible: false };

      if (kind === 'confirm') {
        layer.querySelector('[data-ask-yes]').addEventListener('click', () => {
          CG.Audio.play('click');
          this.finishAsk(true);
        });
        layer.querySelector('[data-ask-no]').addEventListener('click', () => {
          CG.Audio.play('click');
          this.finishAsk(false);
        });
      } else if (kind === 'choose' || kind === 'type') {
        $$('[data-ask-value]', layer).forEach((btn) => {
          btn.addEventListener('click', () => {
            CG.Audio.play('click');
            this.finishAsk(btn.dataset.askValue);
          });
        });
      } else if (kind === 'card') {
        $$('[data-ask-card]', layer).forEach((btn) => {
          btn.addEventListener('click', () => {
            CG.Audio.play('click');
            this.finishAsk(Number(btn.dataset.askCard));
          });
        });
        layer.querySelector('[data-ask-no]')?.addEventListener('click', () => {
          CG.Audio.play('click');
          this.finishAsk(false);
        });
      } else if (kind === 'cardId') {
        $$('[data-ask-cardid]', layer).forEach((btn) => {
          btn.addEventListener('click', () => {
            CG.Audio.play('click');
            this.finishAsk(btn.dataset.askCardid);
          });
        });
      } else if (kind === 'cards') {
        const selected = new Set();
        const max = spec.max || spec.count || 1;
        const countEl = $('#ask-pick-count');
        const confirm = $('#ask-multi-confirm');
        const sync = () => {
          countEl.textContent = selected.size;
          confirm.disabled = selected.size !== (spec.count || 1);
          $$('[data-multi-card]', layer).forEach((el) => el.classList.toggle('is-selected', selected.has(el.dataset.multiCard)));
        };
        $$('[data-multi-card]', layer).forEach((btn) => {
          btn.addEventListener('click', () => {
            const uid = Number(btn.dataset.multiCard);
            if (selected.has(uid)) selected.delete(uid);
            else if (selected.size < max) selected.add(uid);
            CG.Audio.play('click');
            sync();
          });
        });
        confirm.addEventListener('click', () => {
          if (selected.size !== (spec.count || 1)) return;
          CG.Audio.play('click');
          this.finishAsk(Array.from(selected));
        });
      }
      requestAnimationFrame(() => {
        const first = layer.querySelector('[data-ask-value], [data-ask-card], [data-ask-cardid], [data-ask-yes]');
        if (first) first.focus({ preventScroll: true });
      });
    },

    /* ---------------- 职业信息 ---------------- */
    openHeroInfo(playerIndex) {
      if (!this.game) return;
      const p = this.game.players[playerIndex];
      if (!p) return;
      this.openHeroModal(p.hero, playerIndex === 0);
    },

    openHeroInfoById(id, inBattle) {
      const hero = CG.HERO_MAP[id];
      if (!hero) return;
      this.openHeroModal(hero, !!inBattle);
    },

    openHeroModal(hero, inBattle) {
      const game = this.game;
      const p = game ? game.players[0] : null;
      const isOwn = inBattle && p && p.heroId === hero.id;
      const skills = isOwn ? this.roleActiveSkills(p) : hero.active || [];
      const activeHtml = (skills.length ? skills : []).map((s) => {
        const disabled = s.available === false;
        return `<div class="hero-detail__skill">
          <strong>${esc(s.name)}</strong>
          <p>${esc(s.desc)}</p>
          ${isOwn && this.game ? `<button class="btn btn--ghost" style="min-height:36px;padding:0 14px;margin-top:8px" data-hero-skill="${esc(s.id)}" ${disabled ? 'disabled' : ''}>${disabled ? esc(s.reason || '暂不可用') : '发动'}</button>` : ''}
        </div>`;
      }).join('');
      const body = `
        <div class="card-sheet">
          <div class="card-sheet__art"><img src="${esc(hero.img)}" alt="${esc(hero.name)}" /></div>
          <div class="card-sheet__info">
            <span class="card-sheet__type" style="--type-color:${esc(hero.accent)}">${esc(hero.title)}</span>
            <h3 class="card-sheet__name">${esc(hero.name)}</h3>
            <p class="card-sheet__desc">${esc(hero.passive)}</p>
            ${activeHtml}
            <div class="card-sheet__actions" style="margin-top:16px"><button class="btn btn--ghost" data-dismiss>收起</button></div>
          </div>
        </div>`;
      this.openModal({
        title: '职业 · ' + hero.name,
        eyebrow: '契约者档案',
        body,
        wide: true,
        dismissible: true,
        onMount: (root) => {
          $$('[data-hero-skill]', root).forEach((btn) => {
            btn.addEventListener('click', () => this.useSkill(btn.dataset.heroSkill));
          });
        },
      });
    },

    roleActiveSkills(p) {
      if (!this.game) return p.hero.active || [];
      return this.game.activeSkillDefs(p);
    },

    /* ---------------- 牌堆 / 记录 / 暂停 ---------------- */
    openPile(kind) {
      if (!this.game) return;
      const p = this.game.players[0];
      if (!p) return;
      if (kind === 'hero') {
        this.openHeroInfo(0);
        return;
      }
      if (kind === 'deck') {
        const cards = p.deck;
        const body = cards.length
          ? `<p class="codex__intro">牌库剩余 <b style="color:var(--gold-2)">${cards.length}</b> 张，顺序隐藏。</p><div class="pile-grid">${cards.map(() => `<div class="card-pick"><img src="assets/backs/back1.webp" alt="牌背" /></div>`).join('')}</div>`
          : '<div class="pile-empty">牌库已空</div>';
        this.openModal({ title: '牌库', eyebrow: 'DECK', body, dismissible: true, wide: true });
      } else {
        const cards = p.discard;
        const body = cards.length
          ? `<p class="codex__intro">弃牌堆共 <b style="color:var(--gold-2)">${cards.length}</b> 张。拾荒者可以从这里回收一张牌。</p><div class="card-pick-grid">${cards.map((c) => {
            const d = this.game.cardDef(c);
            return `<div class="card-pick" title="${esc(d.name)}"><img src="${esc(d.img)}" alt="${esc(d.name)}" /><span class="card-pick__name">${esc(d.name)}</span></div>`;
          }).join('')}</div>`
          : '<div class="pile-empty">弃牌堆空空如也</div>';
        this.openModal({ title: '弃牌堆', eyebrow: 'DISCARD', body, dismissible: true, wide: true });
      }
    },

    openFoxInfo(playerIndex) {
      if (!this.game) return;
      const p = this.game.players[playerIndex] || this.game.players[0];
      if (!p || p.heroId !== 'xunlianshi') return;
      const damage = p.flags.foxDamage || 1;
      const fed = p.flags.foxFed || 0;
      const body = `<div class="fox-detail">
        <div class="fox-detail__art"><img src="assets/summons/huohuli-card.webp" alt="火狐狸" /></div>
        <div>
          <div class="fox-detail__name">火狐狸</div>
          <div class="fox-detail__stats">
            <span>本局伤害<b>${damage}</b></span>
            <span>已投喂<b>${fed}</b></span>
          </div>
          <p>【火花】结束阶段对对方造成 ${damage} 点伤害（优先破甲）。</p>
          <p>结束阶段可连续投喂手牌；每累计投喂 2 张，本局伤害永久 +1。</p>
        </div>
      </div>`;
      this.openModal({ title: '火狐狸 · 培育', eyebrow: 'FIRE FOX', body, dismissible: true, wide: true });
    },

    openEnemyHandPeek() {
      if (!this.game) return;
      const me = this.game.players[0];
      const enemy = this.game.players[1];
      if (!me || !enemy || !['yuyan', 'heike'].includes(me.heroId)) return;
      const isHacker = me.heroId === 'heike';
      const hand = isHacker ? '' : (enemy.hand.length
        ? `<div class="card-pick-grid">${enemy.hand.map((card) => {
            const def = this.game.cardDef(card);
            return `<div class="card-pick" title="${esc(def.name)}"><img src="${esc(def.img)}" alt="${esc(def.name)}" /><span class="card-pick__name">${esc(def.name)}</span></div>`;
          }).join('')}</div>`
        : '<div class="pile-empty">对方没有手牌</div>');
      let deck = '';
      if (isHacker) {
        const counts = {};
        enemy.deck.forEach((card) => {
          const def = this.game.cardDef(card);
          counts[def.id] = (counts[def.id] || 0) + 1;
        });
        deck = `<div class="codex__intro">对方牌库剩余数量（看不到具体手牌）：</div><div class="deck-intel">${CG.CARDS.map((c) => `<span><b>${esc(c.name)}</b><i>${counts[c.id] || 0}</i></span>`).join('')}</div>`;
      }
      const body = `<p class="codex__intro">${isHacker ? '「骇入」：你只能看到对方牌库剩余数量，以及对方摸牌时的一张提示。' : '「前瞻」：对方当前全部手牌，共 <b style="color:var(--gold-2)">' + enemy.hand.length + '</b> 张。'}</p>${hand}${deck}`;
      this.openModal({ title: isHacker ? '骇入 · 牌库情报' : '前瞻 · 对方手牌', eyebrow: isHacker ? 'HACK' : 'FORESIGHT', body, dismissible: true, wide: true });
    },

    openBattleLog() {
      if (!this.game) return;
      const logs = this.game.state.log;
      const body = `<div class="log-modal__list">${logs.map((l) => `<div class="log-line" data-tone="${esc(l.tone)}"><b>${l.turn > 0 ? 'T' + l.turn : '—'}</b><span>${esc(l.text)}</span></div>`).join('')}</div>`;
      this.openModal({ title: '战斗记录', eyebrow: 'BATTLE LOG', body, dismissible: true, wide: true });
      requestAnimationFrame(() => {
        const list = $('.modal__body');
        if (list) list.scrollTop = list.scrollHeight;
      });
    },

    openPause() {
      if (!this.game || this.game.state.over) {
        this.showScreen('menu');
        return;
      }
      const body = `<div class="ask-options">
        <button class="ask-option" data-pause="resume"><span class="ask-option__icon">▷</span><span><strong>继续对局</strong><p>回到牌桌。</p></span></button>
        <button class="ask-option" data-pause="rules"><span class="ask-option__icon">?</span><span><strong>玩法说明</strong><p>查看回合、护甲与伤害规则。</p></span></button>
        <button class="ask-option" data-pause="log"><span class="ask-option__icon">≡</span><span><strong>战斗记录</strong><p>回顾本局发生的一切。</p></span></button>
        <button class="ask-option" data-pause="surrender"><span class="ask-option__icon">×</span><span><strong>认输并退出</strong><p>放弃本局，回到主菜单。</p></span></button>
      </div>`;
      this.openModal({
        title: '暂停', eyebrow: 'PAUSE', body, dismissible: true,
        onMount: (root) => {
          $$('[data-pause]', root).forEach((btn) => {
            btn.addEventListener('click', () => {
              const action = btn.dataset.pause;
              if (action === 'resume') this.closeOverlay();
              else if (action === 'rules') this.openCodex('rules', true);
              else if (action === 'log') this.openBattleLog();
              else if (action === 'surrender') this.confirmSurrender();
            });
          });
        },
      });
    },

    confirmSurrender() {
      this.openModal({
        title: '认输并退出？', eyebrow: 'SURRENDER', desc: '当前对局进度将不会保留。',
        body: '<div class="modal__desc" style="margin:0">确认后返回主菜单，可以重新选择职业再战。</div>',
        dismissible: true,
        footer: '<button class="btn btn--ghost" data-no>再想想</button><button class="btn btn--primary" data-yes>确认退出</button>',
        onMount: (root) => {
          root.querySelector('[data-no]').addEventListener('click', () => this.closeOverlay());
          root.querySelector('[data-yes]').addEventListener('click', () => this.leaveBattle(false));
        },
      });
    },

    /* ---------------- 图鉴 / 规则 ---------------- */
    openCodex(tab, keepBattle) {
      this.codexTab = tab || 'rules';
      const headExtra = `<div class="modal__tabs">
        <button class="modal-tab ${this.codexTab === 'rules' ? 'is-active' : ''}" data-codex-tab="rules">对局规则</button>
        <button class="modal-tab ${this.codexTab === 'cards' ? 'is-active' : ''}" data-codex-tab="cards">卡牌图鉴</button>
        <button class="modal-tab ${this.codexTab === 'heroes' ? 'is-active' : ''}" data-codex-tab="heroes">职业图鉴</button>
      </div>`;
      this.openModal({
        title: '刀盾典籍',
        eyebrow: 'CODEX',
        desc: '一切契约，皆有代价。',
        codex: true,
        dismissible: true,
        headExtra,
        body: `<div class="codex" id="codex-body">${this.codexContent(this.codexTab)}</div>`,
        onMount: (root) => {
          $$('[data-codex-tab]', root).forEach((btn) => {
            btn.addEventListener('click', () => {
              this.codexTab = btn.dataset.codexTab;
              $$('[data-codex-tab]', root).forEach((b) => b.classList.toggle('is-active', b.dataset.codexTab === this.codexTab));
              $('#codex-body').innerHTML = this.codexContent(this.codexTab);
              CG.Audio.play('click');
            });
          });
        },
      });
    },

    codexContent(tab) {
      if (tab === 'cards') {
        const groups = ['break', 'armor', 'damage', 'rest'];
        return `<p class="codex__intro">双方使用同一套 30 张固定牌库：破甲 8 张、叠甲 7 张、普通伤害 8 张、休整 7 张。</p>
          <div class="card-codex-list">${groups.map((type) => {
            const info = CG.TYPE_INFO[type];
            const cards = CG.CARDS.filter((c) => c.type === type);
            return `<section class="card-type-group">
              <h4 style="color:${info.color}">${esc(info.name)} <em>共 ${cards.reduce((s, c) => s + c.count, 0)} 张</em></h4>
              <div class="codex-cards">${cards.map((c) => `<div class="codex-card"><b>×${c.count}</b><img src="${esc(c.img)}" alt="${esc(c.name)}" /><span>${esc(c.name)} · ${esc(c.short)}</span></div>`).join('')}</div>
              <p style="color:var(--muted);font-size:10px;margin-top:6px">${esc(info.desc)}</p>
            </section>`;
          }).join('')}</div>`;
      }
      if (tab === 'heroes') {
        return `<p class="codex__intro">对局前自选 1 个职业，整局不可更换。所有职业被动均为无费被动，不占出牌次数；共 24 位契约者。</p>
          <div class="hero-codex-list">${CG.HEROES.map((h) => `<div class="hero-codex-row">
            <img src="${esc(h.portrait)}" alt="${esc(h.name)}" />
            <div><strong>${esc(h.name)}</strong><em>${esc(h.title)} · 生命 ${h.hp}</em><p>${esc(h.passive)}</p></div>
          </div>`).join('')}</div>`;
      }
      return `<p class="codex__intro">双方初始 20 点生命、0 点护甲、0 张手牌（凡人初始 30 点生命）。每局使用同一套 30 张固定牌库。每张手牌打出后立即结算，不再等到回合结束。</p>
        <div class="rule-flow">
          <div class="rule-step"><b>01</b><strong>摸牌阶段</strong><p>固定摸 2 张牌。部分职业可跳过或改变摸牌。</p></div>
          <div class="rule-step"><b>02</b><strong>出牌阶段</strong><p>最多打出 2 张牌。每张牌打出的瞬间即结算护甲、伤害与治疗。</p></div>
          <div class="rule-step"><b>03</b><strong>回合收尾</strong><p>处理溯愈、延授、狼化、禁疗等持续效果，然后交给对手。</p></div>
        </div>
        <div class="rule-block"><h4>伤害与护甲</h4><ul>
          <li><b>破甲卡</b>：打出后立即先削护甲，溢出伤害扣血；对方无护甲时不可打出。</li>
          <li><b>叠甲卡</b>：打出后立即增加护甲，只格挡破甲伤害。若到下个自己回合开始时护盾未被击碎，当前护甲全部转化为等量额外护盾，普通护甲清零；额外护盾优先扣除，并在再下一个自己回合开始时消散。三月七无法获得额外护盾。</li>
          <li><b>普通伤害卡</b>：仅在对方无护甲时可打出，打出后立即扣血。</li>
          <li><b>休整卡</b>：回血或过牌立即生效，不增加护甲，不受职业被动与必杀影响。</li>
          <li>所有增减数值最低为 0，不会出现负收益。</li>
        </ul></div>
        <div class="rule-block"><h4>枯牌阶段</h4><p>若有一方将牌库摸空，对局进入枯牌阶段：此后每人回合开始时，固定失去 2 点生命。该效果无视护甲。</p></div>
        <div class="rule-block"><h4>绝杀余势</h4><p>打出绝杀后：你下回合不可使用叠甲卡；对方下回合的破甲卡可直接当作普通伤害牌打出。</p></div>
        <div class="rule-block"><h4>操作提示</h4><ul>
          <li>单击手牌选中并查看选中动画，双击（500ms 内两次点击）立即打出。</li>
          <li>卡牌右上角的「i」可查看完整卡面与动态数值；技能发动前会弹出二次确认。</li>
          <li>伤害与护甲在打出的瞬间生效，屏幕中央会显示「即时结算」提示。</li>
          <li>所有选择型技能与反应都会弹出确认窗；AI 对手会自动做决定。</li>
          <li>手机端支持纵向握持、横向握持和安全区域适配。</li>
        </ul></div>`;
    },

    /* ---------------- 结算 / 结果 ---------------- */
    showResult(state, game) {
      if (this.resultShown) return;
      this.resultShown = true;
      const toastLayer = $('#toast-layer');
      if (toastLayer) toastLayer.innerHTML = '';
      const player = state.players[0];
      const enemy = state.players[1];
      const win = state.winner === 0;
      const draw = state.winner === null;
      const title = draw ? '平 局' : win ? '契 约 达 成' : '余 烬 熄 灭';
      const sub = draw ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT';
      const stats = state.stats;
      const turns = state.turnNumber;
      const body = `
        <div class="result">
          <div class="result__mark">${draw ? ICONS.spark : win ? ICONS.flame : ICONS.sword}</div>
          <div class="result__title">${title}</div>
          <div class="result__sub">${sub}</div>
          <div class="result__versus">
            <img src="${esc(player.hero.portrait)}" alt="${esc(player.name)}" />
            <span>${esc(player.name)} <b style="color:var(--muted-2)">VS</b> ${esc(enemy.name)}</span>
            <img src="${esc(enemy.hero.portrait)}" alt="${esc(enemy.name)}" />
          </div>
          <div class="result__stats">
            <div class="result__stat"><b>${turns}</b><span>回合数</span></div>
            <div class="result__stat"><b>${stats.damage[0]}</b><span>你造成的伤害</span></div>
            <div class="result__stat"><b>${stats.healed[0]}</b><span>你回复的生命</span></div>
            <div class="result__stat"><b>${stats.cardsPlayed[0]}</b><span>你打出的牌</span></div>
            <div class="result__stat"><b>${stats.damage[1]}</b><span>对手伤害</span></div>
            <div class="result__stat"><b>${player.hp} / ${player.maxHp}</b><span>剩余生命</span></div>
          </div>
          <div class="result__actions">
            <button class="btn btn--primary" data-result="rematch">再来一局</button>
            <button class="btn btn--ghost" data-result="select">更换职业</button>
            <button class="btn btn--ghost" data-result="menu">主菜单</button>
          </div>
        </div>`;
      this.openModal({
        title: '', eyebrow: 'RESULT', body, dismissible: false,
        onMount: (root) => {
          $$('[data-result]', root).forEach((btn) => {
            btn.addEventListener('click', () => {
              const action = btn.dataset.result;
              if (action === 'rematch') this.rematch();
              else if (action === 'select') this.leaveBattle(true);
              else this.leaveBattle(false);
            });
          });
        },
      });
      CG.Audio.play(win ? 'win' : draw ? 'turn' : 'lose');
    },

    /* ---------------- 特效与提示 ---------------- */
    playFx(name, data, game) {
      if (name === 'humanTurn') return;
      const soundMap = {
        play: 'play', hit: data && data.big ? 'heavy' : 'hit', armorGain: 'armor', heal: 'heal',
        poison: 'poison', blood: 'hit', skill: 'skill', invalid: 'error', extraShield: 'armor',
        extraShieldConvert: 'armor', extraShieldExpire: 'shieldBreak',
        glare: 'heavy', blind: 'poison', summon: 'skill', fox: 'hit', foxFeed: 'skill', bless: 'armor',
        hackDraw: 'draw', hackSuccess: 'skill', hackFail: 'error', pojie: 'heavy', suyuAwake: 'heal',
        counter: 'hit', revive: 'win', exhausted: 'poison', juesha: 'heavy', wolf: 'heavy',
        armorHit: 'shieldBreak', pierce: 'hit', delayFire: 'skill', betWin: 'skill', betFail: 'error',
      };
      if (name === 'draw') { if (data && data.player === 0) CG.Audio.play('draw'); return; }
      if (soundMap[name]) CG.Audio.play(soundMap[name]);

      if (name === 'play' && data && data.card) {
        this.showCastCard(data.card);
        if (data.card.type === 'break' || data.card.type === 'damage') {
          this.showAttackFx(data.card, data.player);
        }
        return;
      }
      if (name === 'hit') {
        const el = this.portraitOf(data.player);
        const rect = el ? el.getBoundingClientRect() : null;
        if (rect) {
          if (data.absorbed > 0 && data.value === 0) {
            this.floatText(rect, '格挡 ' + data.absorbed, 'is-armor');
          } else if (data.value > 0) {
            this.floatText(rect, '-' + data.value, data.type === 'true' ? 'is-true' : '');
          }
          // 血量实际减少时震动；大伤害强震 + 闪屏，小伤害轻震
          if (data.value > 0) {
            this.shakeScreen(data.big || data.value >= 5);
            if (data.big) this.flashScreen();
          }
        }
        return;
      }
      if (name === 'heal') {
        const el = this.portraitOf(data.player);
        if (el) this.floatText(el.getBoundingClientRect(), '+' + data.value, 'is-heal');
        return;
      }
      if (name === 'armorGain' || name === 'extraShield') {
        const el = this.portraitOf(data.player);
        if (el) this.floatText(el.getBoundingClientRect(), '+' + data.value + ' 甲', 'is-armor');
        this.showShieldCastFx(data.player, data.cardId);
        return;
      }
      if (name === 'extraShieldConvert') {
        const el = this.portraitOf(data.player);
        if (el) this.floatText(el.getBoundingClientRect(), '余盾 +' + data.value, 'is-armor');
        this.showShieldCastFx(data.player, data.cardId);
        if (data.player === 0) this.toast('余盾：护盾未被击碎，转化为 ' + data.value + ' 点额外护盾', 'skill', 2400);
        return;
      }
      if (name === 'extraShieldExpire') {
        if (data.player === 0) this.toast('余盾：额外护盾消散', 'warn', 1800);
        return;
      }
      if (name === 'glare') {
        this.flashScreen('rgba(220,255,230,0.72)');
        this.toast('「极耀」：强光闪过，对方下回合无法出牌', 'skill', 2400);
        return;
      }
      if (name === 'blind') {
        if (data.player === 0) this.toast('你被强光闪瞎，本回合无法出牌', 'warn', 2200);
        return;
      }
      if (name === 'summon') {
        this.toast('「培育」：火狐狸加入战场', 'skill', 2000);
        return;
      }
      if (name === 'bless') {
        this.toast('「赐福」：非伤害牌数值永久 +1（当前 +' + data.value + '）', 'skill', 2200);
        return;
      }
      if (name === 'fox') {
        this.toast('火狐狸扑击：' + data.value + ' 点伤害', 'damage', 1600);
        return;
      }
      if (name === 'foxFeed') {
        this.toast(data.gained
          ? '火狐狸吞噬手牌，伤害永久 +1（当前 ' + data.value + '）'
          : '火狐狸吞噬手牌（累计 ' + data.fed + ' 张），再投喂 1 张提升伤害', 'skill', 2200);
        return;
      }
      if (name === 'hackDraw') {
        if (data.player === 0 && data.card) this.toast('骇入 · 对方摸到了「' + data.card.name + '」', 'skill', 2200);
        return;
      }
      if (name === 'hackSuccess') {
        this.toast('骇入成功：' + (data.card ? data.card.name : '手牌') + ' 已自动打出', 'skill', 2200);
        return;
      }
      if (name === 'hackFail') {
        this.toast('骇入失败：猜错了', 'warn', 1600);
        return;
      }
      if (name === 'pojie') {
        this.toast('「破垒」：护甲破碎，追加 1 点伤害并摸牌', 'skill', 1800);
        return;
      }
      if (name === 'suyuAwake') {
        this.toast('「静息」觉醒：此后每回合出牌 ≤1 张时回复 2 点生命', 'skill', 2600);
        return;
      }
      if (name === 'armorHit') {
        this.showShieldHitFx(data.player, data.cardId, data.remaining);
        return;
      }
      if (name === 'counter' || name === 'xunqing') {
        const el = this.portraitOf(data.target);
        if (el) this.floatText(el.getBoundingClientRect(), '-' + data.value, 'is-true');
        this.shakeScreen(false);
        this.toast(name === 'counter' ? '少女的特权 · 反伤 ' + data.value : '同殇 · 伤害回响 ' + data.value, 'skill');
        return;
      }
      if (name === 'poison') {
        const el = this.portraitOf(data.player);
        if (el) this.floatText(el.getBoundingClientRect(), '毒 -1', 'is-true');
        this.shakeScreen(false);
        return;
      }
      if (name === 'blood') {
        this.shakeScreen(false);
        return;
      }
      if (name === 'exhaust') {
        const el = this.portraitOf(data.player);
        if (el) this.floatText(el.getBoundingClientRect(), '-2 枯牌', 'is-true');
        this.shakeScreen(false);
        return;
      }
      if (name === 'skill') {
        if (data && data.name) this.toast('发动 · ' + data.name, 'skill');
        return;
      }
      if (name === 'juesha') { this.showSplash('绝 杀', 'JUE SHA'); this.toast('绝杀余势：下回合禁甲，对方破甲可当普伤', 'danger', 2600); return; }
      if (name === 'wolf') { this.showSplash('月 嚎', 'MOON HOWL'); this.flashScreen(); this.toast('狼化：出牌上限 +1，所有伤害 +2，持续两回合', 'danger', 3000); return; }
      if (name === 'betWin') { this.showSplash('下注命中', 'DOUBLE OR NOTHING'); return; }
      if (name === 'betFail') { this.showSplash('下注落空', 'THE HOUSE WINS'); return; }
      if (name === 'exhausted') { this.showSplash('枯 牌', 'EXHAUSTED'); this.toast('进入枯牌阶段：每人回合开始失去 2 点生命', 'danger', 3000); return; }
      if (name === 'revive') { this.showSplash('淬 炼 重 生', 'REVIVE'); this.toast('弃置 2 张手牌，复活回到 1 点生命', 'skill'); return; }
      if (name === 'swap') { this.showSplash('竭 泽', 'SWAP'); return; }
      if (name === 'delayFire') { this.showSplash('延 授 发 动', 'DELAYED'); return; }
      if (name === 'delayWait') { this.toast('延授：此牌再 +2，下回合结束阶段发动', 'skill'); return; }
      if (name === 'invalid') { if (data && data.reason) this.toast(data.reason, 'danger', 1800); return; }
      if (name === 'peekAll') {
        if (data && data.player === 0) this.toast('前瞻 · 对方全部手牌已显示（' + data.count + ' 张）', 'skill', 2200);
        return;
      }
      if (name === 'peek') {
        if (data && data.player === 0 && data.card) this.toast('前瞻 · 对方手牌：「' + data.card.name + '」', 'skill', 2600);
        return;
      }
      if (name === 'destiny') { this.toast('命定生效：对方摸到了被指定的牌', 'skill'); return; }
      if (name === 'convert') { this.toast('伤害牌已转化为 ' + data.value + ' 点护甲牌', 'skill'); return; }
      if (name === 'steal') { this.toast('掠取对方 ' + data.count + ' 张手牌', 'skill'); return; }
      if (name === 'baobao') { this.toast('吃奶奶：宝宝也回复了生命', 'skill'); return; }
      if (name === 'bloodlust') { this.toast('血屠：下一次伤害 +2', 'danger'); return; }
      if (name === 'healBlocked') { this.toast('回血被封锁', 'danger'); return; }
    },

    combatantOf(playerIndex) {
      return document.querySelector(`.combatant[data-player="${playerIndex}"]`);
    },

    portraitOf(playerIndex) {
      return document.querySelector(`.combatant[data-player="${playerIndex}"] .portrait-btn`);
    },

    showAttackFx(card, playerIndex) {
      const cfg = ATTACK_FX[card.id];
      if (!cfg) return;
      const layer = $('#fx-layer');
      const target = this.portraitOf(1 - playerIndex);
      const source = this.portraitOf(playerIndex);
      if (!layer || !target) return;
      const tr = target.getBoundingClientRect();
      const sr = source ? source.getBoundingClientRect() : null;
      const cx = tr.left + tr.width / 2;
      const cy = tr.top + tr.height / 2;
      const baseWidth = Math.max(128, Math.min(250, window.innerWidth * 0.3)) * (cfg.size || 1);

      const fx = document.createElement('div');
      fx.className = 'attack-fx attack-fx--' + card.id + (cfg.vignette ? ' is-vignette' : '');
      fx.style.setProperty('--attack-color', cfg.color);
      layer.appendChild(fx);

      // 投射型攻击：快斩从出牌者飞向目标
      if (cfg.projectile && sr) {
        const sx = sr.left + sr.width / 2;
        const sy = sr.top + sr.height / 2;
        const dx = cx - sx;
        const dy = cy - sy;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const blade = document.createElement('span');
        blade.className = 'attack-projectile';
        blade.style.left = sx + 'px';
        blade.style.top = sy + 'px';
        blade.style.setProperty('--attack-angle', angle + 'deg');
        fx.appendChild(blade);
        if (blade.animate) {
          blade.animate([
            { opacity: 0, transform: `translate(0px, 0px) rotate(${angle}deg) scaleX(0.2)` },
            { opacity: 1, transform: `translate(${dx * 0.35}px, ${dy * 0.35}px) rotate(${angle}deg) scaleX(1)` },
            { opacity: 0, transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg) scaleX(1.1)` },
          ], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
        }
      }

      // 刀光：不同卡面有不同数量、角度、粗细
      (cfg.slashes || []).forEach((s) => {
        const el = document.createElement('i');
        el.className = 'attack-slash';
        el.style.left = cx + 'px';
        el.style.top = (cy + (s.offset || 0)) + 'px';
        el.style.width = Math.round(baseWidth * s.width) + 'px';
        el.style.height = s.thick + 'px';
        el.style.setProperty('--attack-angle', s.angle + 'deg');
        el.style.animationDelay = (s.delay || 0) + 'ms';
        fx.appendChild(el);
      });

      // 冲击环
      for (let i = 0; i < (cfg.rings || 0); i++) {
        const ring = document.createElement('span');
        ring.className = 'attack-ring';
        ring.style.left = cx + 'px';
        ring.style.top = cy + 'px';
        ring.style.animationDelay = (i * 70) + 'ms';
        fx.appendChild(ring);
      }

      if (cfg.burst) {
        const burst = document.createElement('span');
        burst.className = 'attack-burst';
        burst.style.left = cx + 'px';
        burst.style.top = cy + 'px';
        fx.appendChild(burst);
      }
      if (cfg.orb) {
        const orb = document.createElement('span');
        orb.className = 'attack-orb';
        orb.style.left = cx + 'px';
        orb.style.top = cy + 'px';
        fx.appendChild(orb);
      }

      setTimeout(() => fx.remove(), 1150);
    },

    showShieldCastFx(playerIndex, cardId) {
      const layer = $('#fx-layer');
      const zone = this.combatantOf(playerIndex);
      if (!layer || !zone) return;
      const rect = zone.getBoundingClientRect();
      const color = this.shieldColorForCard(cardId);
      const el = document.createElement('div');
      el.className = 'shield-cast';
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      el.style.setProperty('--shield-color', color);
      layer.appendChild(el);
      setTimeout(() => el.remove(), 980);
    },

    showShieldHitFx(playerIndex, cardId, remaining) {
      const layer = $('#fx-layer');
      const zone = this.combatantOf(playerIndex);
      if (!layer || !zone) return;
      const rect = zone.getBoundingClientRect();
      const color = this.shieldColorForCard(cardId);
      const el = document.createElement('div');
      el.className = 'shield-hit' + (typeof remaining === 'number' && remaining <= 0 ? ' is-break' : '');
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      el.style.setProperty('--shield-color', color);
      layer.appendChild(el);
      setTimeout(() => el.remove(), 620);
    },

    floatText(rect, text, cls) {
      const layer = $('#fx-layer');
      if (!layer || !rect) return;
      const el = document.createElement('div');
      el.className = 'float-num ' + (cls || '');
      el.style.left = (rect.left + rect.width / 2) + 'px';
      el.style.top = (rect.top + rect.height * 0.36) + 'px';
      el.innerHTML = text;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    },

    showCastCard(def) {
      const layer = $('#fx-layer');
      if (!layer || !def) return;
      const el = document.createElement('div');
      el.className = 'fx-cast';
      el.innerHTML = `<img src="${esc(def.img)}" alt="" />`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    },

    showSplash(main, sub) {
      const layer = $('#fx-layer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'fx-skip';
      el.textContent = main;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 900);
    },

    showTurnSplash(main, sub) {
      const layer = $('#fx-layer');
      if (!layer) return;
      layer.querySelectorAll('.turn-splash').forEach((e) => e.remove());
      const el = document.createElement('div');
      el.className = 'turn-splash is-show';
      el.innerHTML = `<strong>${esc(main)}</strong><span>${esc(sub)}</span>`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1900);
    },

    shakeScreen(strong) {
      const battle = $('#battle-root');
      if (!battle) return;
      const cls = strong ? 'fx-shake' : 'fx-shake-soft';
      battle.classList.remove('fx-shake', 'fx-shake-soft');
      void battle.offsetWidth;
      battle.classList.add(cls);
      setTimeout(() => battle.classList.remove(cls), strong ? 500 : 340);
    },

    flashScreen(color) {
      const layer = $('#fx-layer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'fx-flash';
      if (color) el.style.background = color;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 500);
    },

    toast(text, type, ms) {
      const layer = $('#toast-layer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'toast' + (type === 'skill' ? ' toast--skill' : type === 'danger' ? ' toast--danger' : '');
      el.textContent = text;
      layer.appendChild(el);
      while (layer.children.length > 3) layer.firstChild.remove();
      setTimeout(() => {
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 320);
      }, ms || 2200);
    },

    toggleSound() {
      this.muted = CG.Audio.toggle();
      this.updateSoundButtons();
      if (!this.muted) this.toast('声音已开启', '', 1200);
      else this.toast('声音已关闭', '', 1200);
    },

    updateSoundButtons() {
      const html = this.muted ? ICONS.soundOff : ICONS.soundOn;
      ['#btn-menu-sound', '#btn-battle-sound'].forEach((sel) => {
        const btn = $(sel);
        if (btn) {
          btn.innerHTML = html;
          btn.classList.toggle('is-muted', this.muted);
          btn.setAttribute('aria-label', this.muted ? '开启声音' : '关闭声音');
        }
      });
    },
  };

  CG.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
