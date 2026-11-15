/* ============================================================
 * 我的刀盾 · BLADE & SHIELD
 * data.js — 卡牌、职业与全局常量
 * 所有数值以本文件为唯一来源，UI 与引擎均从这里读取。
 * ============================================================ */
(function (global) {
  'use strict';
  const CG = (global.CG = global.CG || {});

  CG.VERSION = '1.0.0';

  CG.RULES = {
    startHp: 20,
    deckSize: 30,
    drawPerTurn: 2,
    playPerTurn: 2,
    exhaustedDamage: 2,
    maxHand: 99,
  };

  CG.TYPE_INFO = {
    break: { name: '破甲', short: '破', color: '#ff6257', desc: '先削减护甲，溢出伤害扣血；对方无护甲时不可打出。' },
    armor: { name: '叠甲', short: '甲', color: '#63b8ff', desc: '获得护甲，优先抵挡破甲伤害；护盾撑过对方回合后，当前护甲会转化为额外护盾。' },
    damage: { name: '普通伤害', short: '伤', color: '#ffb347', desc: '仅在对方无护甲时可打出，直接造成伤害。' },
    rest: { name: '休整', short: '息', color: '#7ee0a3', desc: '回血或过牌，不受职业被动与必杀影响。' },
  };

  /* ---------------- 卡牌 ----------------
   * 固定 30 张牌库：破甲 8 / 叠甲 7 / 普通伤害 8 / 休整 7
   */
  CG.CARDS = [
    {
      id: 'qingji', name: '轻击', type: 'break', value: 3, count: 3,
      img: 'assets/cards/qingji.webp', short: '造成 3 点破甲值',
      desc: '造成 3 点破甲值。对方无护甲时不可打出。',
    },
    {
      id: 'zhongji', name: '重击', type: 'break', value: 5, count: 3,
      img: 'assets/cards/zhongji.webp', short: '造成 5 点破甲值',
      desc: '造成 5 点破甲值。对方无护甲时不可打出。',
    },
    {
      id: 'juesha', name: '绝杀', type: 'break', value: 10, count: 2,
      img: 'assets/cards/juesha.webp', short: '造成 10 点破甲值',
      desc: '造成 10 点破甲值。下回合自己不可使用叠甲卡；下回合对方破甲卡可直接当普通伤害牌打出。',
      onPlay: 'juesha',
    },
    {
      id: 'qingdun', name: '轻盾', type: 'armor', value: 3, count: 3,
      img: 'assets/cards/qingdun.webp', short: '获得 3 点护甲',
      desc: '获得 3 点护甲。',
    },
    {
      id: 'zhongdun', name: '重盾', type: 'armor', value: 5, count: 2,
      img: 'assets/cards/zhongdun.webp', short: '获得 5 点护甲',
      desc: '获得 5 点护甲。',
    },
    {
      id: 'gujia', name: '固甲', type: 'armor', value: 7, count: 2,
      img: 'assets/cards/gujia.webp', short: '获得 7 点护甲',
      desc: '获得 7 点护甲。',
    },
    {
      id: 'kuaizhan', name: '快斩', type: 'damage', value: 5, count: 4,
      img: 'assets/cards/kuaizhan.webp', short: '造成 5 点普通伤害',
      desc: '造成 5 点普通伤害。仅在对方无护甲时可打出。',
    },
    {
      id: 'mengji', name: '猛击', type: 'damage', value: 7, count: 4,
      img: 'assets/cards/mengji.webp', short: '造成 7 点普通伤害',
      desc: '造成 7 点普通伤害。仅在对方无护甲时可打出。',
    },
    {
      id: 'tiaoxi', name: '调息', type: 'rest', value: 3, count: 3,
      img: 'assets/cards/tiaoxi.webp', short: '恢复 3 点生命',
      desc: '恢复 3 点生命值。不受职业被动与必杀影响。',
      heal: 3,
    },
    {
      id: 'huanyu', name: '缓愈', type: 'rest', value: 5, count: 2,
      img: 'assets/cards/huanyu.webp', short: '恢复 5 点生命',
      desc: '恢复 5 点生命值。不受职业被动与必杀影响。',
      heal: 5,
    },
    {
      id: 'ningshen', name: '凝神', type: 'rest', value: 2, count: 2,
      img: 'assets/cards/ningshen.webp', short: '额外摸 2 张牌',
      desc: '额外摸 2 张牌。不受职业被动与必杀影响。',
      draw: 2,
    },
  ];

  CG.CARD_MAP = Object.fromEntries(CG.CARDS.map((c) => [c.id, c]));

  // 用于随机/图鉴的类型分类（赌徒下注 / 女巫选牌等）
  CG.CARD_TYPES = ['break', 'armor', 'damage', 'rest'];

  /* ---------------- 职业 ----------------
   * hp 为初始/最大生命。skill/passive 文案用于界面展示。
   * portrait / hero 使用已整理到 assets 的 WebP。
   */
  CG.HEROES = [
    {
      id: 'baobao', name: '宝宝', title: '吃奶奶', hp: 20, accent: '#ff9fc0',
      img: 'assets/heroes/baobao.webp', portrait: 'assets/portraits/baobao.webp',
      passiveName: '吃奶奶',
      passive: '当对方回复生命值时，你也回复一半生命值（向下取整），每回合最多触发一次。',
      tags: ['续航', '反制'], difficulty: 1,
      active: [],
    },
    {
      id: 'fanren', name: '凡人', title: '命硬', hp: 30, accent: '#c9c2b4',
      img: 'assets/heroes/fanren.webp', portrait: 'assets/portraits/fanren.webp',
      passiveName: '命硬',
      passive: '初始生命值为 30。',
      tags: ['生存', '新手'], difficulty: 1,
      active: [],
    },
    {
      id: 'chensiyu', name: '沉思语', title: '别吵，我在烧烤', hp: 20, accent: '#ffc45e',
      img: 'assets/heroes/chensiyu.webp', portrait: 'assets/portraits/chensiyu.webp',
      passiveName: '别吵，我在烧烤',
      passive: '使用凝神时额外摸 1 张牌；可随时发动一次「摸 3 张牌」。',
      tags: ['过牌', '爆发'], difficulty: 2,
      active: [{ id: 'chensiyu_draw3', name: '摸三张', desc: '本局限一次，额外摸 3 张牌。', icon: '✦', once: true }],
    },
    {
      id: 'kuaishou', name: '快手怪盗', title: '掠影', hp: 20, accent: '#8b9dff',
      img: 'assets/heroes/kuaishou.webp', portrait: 'assets/portraits/kuaishou.webp',
      passiveName: '掠影',
      passive: '打出凝神牌时，可以改为摸对方 2 张牌。',
      tags: ['偷牌', '节奏'], difficulty: 2,
      active: [],
    },
    {
      id: 'sanyueqi', name: '三月七', title: '少女的特权', hp: 20, accent: '#ff9bd8',
      img: 'assets/heroes/sanyueqi.webp', portrait: 'assets/portraits/sanyueqi.webp',
      passiveName: '少女的特权 / 可爱即是正义',
      passive: '获得的护甲 +1，无法获得额外护甲。持有护甲时被攻击且护甲未被击碎，对伤害来源造成你手中最小数值伤害牌的伤害。若持有护甲时未被攻击，下回合开始时可将 1 张伤害牌转化为等同数值的护甲牌。',
      tags: ['护甲', '反伤'], difficulty: 3,
      active: [],
    },
    {
      id: 'yuxue', name: '浴血狂徒', title: '血屠', hp: 20, accent: '#ff5c5c',
      img: 'assets/heroes/yuxue.webp', portrait: 'assets/portraits/yuxue.webp',
      passiveName: '血屠',
      passive: '所有人血量每次小于等于 6 时，你下一次伤害 +2（可叠加）。',
      tags: ['斩杀', '爆发'], difficulty: 2,
      active: [],
    },
    {
      id: 'kupai', name: '枯牌先知', title: '竭泽', hp: 20, accent: '#b78cff',
      img: 'assets/heroes/kupai.webp', portrait: 'assets/portraits/kupai.webp',
      passiveName: '竭泽',
      passive: '限一次：当你的血量 ≤ 4 时可发动，将你当前的手牌与牌库中的牌互换。',
      tags: ['翻盘', '换牌'], difficulty: 3,
      active: [{ id: 'kupai_swap', name: '竭泽', desc: '血量 ≤ 4 时，将手牌与牌库互换。限一次。', icon: '↺', once: true }],
    },
    {
      id: 'jifeng', name: '疾风猎手', title: '风淬', hp: 20, accent: '#6fe0d2',
      img: 'assets/heroes/jifeng.webp', portrait: 'assets/portraits/jifeng.webp',
      passiveName: '风淬',
      passive: '造成的普通伤害 +1。',
      tags: ['输出'], difficulty: 1,
      active: [],
    },
    {
      id: 'xunqing', name: '殉情者', title: '同殇', hp: 20, accent: '#ff8fa6',
      img: 'assets/heroes/xunqing.webp', portrait: 'assets/portraits/xunqing.webp',
      passiveName: '同殇',
      passive: '受到伤害时，可使自己受到伤害变为 1.5 倍（向下取整），然后使对方同步受到原伤害。',
      tags: ['反制', '高风险'], difficulty: 3,
      active: [],
    },
    {
      id: 'moshushou', name: '魔术手', title: '快手', hp: 20, accent: '#b28cff',
      img: 'assets/heroes/moshushou.webp', portrait: 'assets/portraits/moshushou.webp',
      passiveName: '快手',
      passive: '可以跳过摸牌阶段，且使下回合摸牌阶段少摸 1 张牌；如此本回合可出 3 张牌（且不能是凝神）。',
      tags: ['节奏', '爆发'], difficulty: 2,
      active: [],
    },
    {
      id: 'ranxue', name: '燃血行者', title: '新生 / 血祭', hp: 20, accent: '#e13b55',
      img: 'assets/heroes/ranxue.webp?v=16', portrait: 'assets/portraits/ranxue.webp',
      passiveName: '新生 / 血祭',
      passive: '每回合可各发动一次自伤：选择一张伤害牌，承受其数值的伤害（自伤可被自身护盾承受）且不消耗此牌；【新生】回复等额生命，【血祭】使下回合获得该数值一半（向下取整）的伤害加成。',
      tags: ['自伤', '蓄爆'], difficulty: 3,
      active: [
        { id: 'ranxue_new', name: '新生', desc: '选择一张伤害牌：自伤其数值（可被自身护盾承受），然后回复等额生命。每回合限一次。', icon: '✚' },
        { id: 'ranxue_blood', name: '血祭', desc: '选择一张伤害牌：自伤其数值（可被自身护盾承受），下回合所有伤害获得一半数值的加成。每回合限一次。', icon: '❖' },
      ],
    },
    {
      id: 'jianbi', name: '坚壁守卫', title: '重甲', hp: 20, accent: '#9fb4c8',
      img: 'assets/heroes/jianbi.webp', portrait: 'assets/portraits/jianbi.webp',
      passiveName: '重甲',
      passive: '所有叠甲卡护甲 +1；受到普通伤害 -1，持有护甲时受到破甲卡伤害 -1。',
      tags: ['防御'], difficulty: 1,
      active: [],
    },
    {
      id: 'chuanxi', name: '穿隙刺客', title: '裂隙', hp: 20, accent: '#6ed6ff',
      img: 'assets/heroes/chuanxi.webp', portrait: 'assets/portraits/chuanxi.webp',
      passiveName: '裂隙',
      passive: '对方护甲 ≥ 8 时，破甲卡无视一半护甲。',
      tags: ['破甲', '穿透'], difficulty: 2,
      active: [],
    },
    {
      id: 'suyu', name: '溯愈医者', title: '静息', hp: 20, accent: '#8fe6b5',
      img: 'assets/heroes/suyu.webp', portrait: 'assets/portraits/suyu.webp',
      passiveName: '静息',
      passive: '行动阶段打出的手牌 ≤ 1 时回复 1 点生命；生命 ≤ 8 时改为回复 2 点。',
      tags: ['续航'], difficulty: 1,
      active: [],
    },
    {
      id: 'pojia', name: '破甲战狂', title: '粉碎', hp: 20, accent: '#ff734d',
      img: 'assets/heroes/pojia.webp', portrait: 'assets/portraits/pojia.webp',
      passiveName: '粉碎',
      passive: '破甲牌伤害 +2；叠甲牌护甲 -1。',
      tags: ['破甲', '输出'], difficulty: 1,
      active: [],
    },
    {
      id: 'dunai', name: '毒奶术士', title: '腐乳', hp: 20, accent: '#93d87f',
      img: 'assets/heroes/dunai.webp', portrait: 'assets/portraits/dunai.webp',
      passiveName: '腐乳',
      passive: '你的回血牌可以对其他人打出，造成等额真伤；造成此伤害后，对方一回合无法回血。',
      tags: ['真伤', '封锁'], difficulty: 2,
      active: [],
    },
    {
      id: 'yuyan', name: '预言家', title: '前瞻 / 命定', hp: 20, accent: '#96b7ff',
      img: 'assets/heroes/yuyan.webp?v=16', portrait: 'assets/portraits/yuyan.webp',
      passiveName: '前瞻 / 命定',
      passive: '【前瞻】你可以看到对方的全部手牌。【命定】限一次：对方摸牌前可发动，决定其下一次摸到的牌；若其牌库已无你决定的牌，则视为其跳过摸牌。',
      tags: ['信息', '控制'], difficulty: 3,
      active: [{ id: 'yuyan_destiny', name: '命定', desc: '指定一张牌，成为对方下次摸到的牌；若不存在则对方跳过下次摸牌。限一次。', icon: '◈', once: true }],
    },
    {
      id: 'nvwu', name: '女巫', title: '毒咒', hp: 20, accent: '#c084ff',
      img: 'assets/heroes/nvwu.webp', portrait: 'assets/portraits/nvwu.webp',
      passiveName: '毒咒',
      passive: '游戏开始时选择一种牌型（破甲 / 叠甲 / 普通伤害 / 休整）投毒；对方摸到该牌型的牌时受到 1 点真伤。',
      tags: ['消耗', '真伤'], difficulty: 2,
      active: [],
    },
    {
      id: 'langren', name: '狼人', title: '月嚎', hp: 20, accent: '#d94848',
      img: 'assets/heroes/langren.webp', portrait: 'assets/portraits/langren.webp',
      passiveName: '月嚎',
      passive: '开局二选一：血量 ≤ 8 时伤害 +1；或每次摸牌时可判定：失去 5 点血，若摸到两张相同的牌，展示并对对方造成 15 点真伤，随后进入狼化（出牌上限 +1、所有伤害 +2，持续两回合）。',
      tags: ['赌命', '爆发'], difficulty: 3,
      active: [],
    },
    {
      id: 'dao', name: '刀', title: '淬炼', hp: 20, accent: '#ff9b52',
      img: 'assets/heroes/dao.webp', portrait: 'assets/portraits/dao.webp',
      passiveName: '淬炼',
      passive: '每次死亡时，可以弃置 2 张手牌，复活并回到 1 点生命。',
      tags: ['复活', '韧性'], difficulty: 2,
      active: [],
    },
    {
      id: 'shihuang', name: '拾荒者', title: '开拓', hp: 20, accent: '#d3b083',
      img: 'assets/heroes/shihuang.webp', portrait: 'assets/portraits/shihuang.webp',
      passiveName: '开拓',
      passive: '可以跳过摸牌阶段，并从弃牌堆中选一张已出过的牌。',
      tags: ['回收', '灵活'], difficulty: 2,
      active: [],
    },
    {
      id: 'chuanzhang', name: '船长', title: '潮涌', hp: 20, accent: '#63c7e8',
      img: 'assets/heroes/chuanzhang.webp', portrait: 'assets/portraits/chuanzhang.webp',
      passiveName: '潮涌',
      passive: '每获得一张牌回复 1 点生命；每失去一张牌扣 1 点生命。',
      tags: ['过牌', '自伤'], difficulty: 2,
      active: [],
    },
    {
      id: 'meigui', name: '玫瑰老师', title: '延授', hp: 20, accent: '#ff6f91',
      img: 'assets/heroes/meigui.webp?v=16', portrait: 'assets/portraits/meigui.webp',
      passiveName: '延授',
      passive: '在还未打出卡牌时，选择一张手牌弃置，本回合仅可再正常打出 1 张牌；其效果延迟到下回合结束阶段。届时可直接发动，或继续延迟到下一回合结束阶段并使数值 +2。延授持续期间不可重复发动。',
      tags: ['延迟', '谋略'], difficulty: 3,
      active: [{ id: 'meigui_delay', name: '延授', desc: '未出牌时弃置 1 张手牌，本回合仅可再打出 1 张牌；其效果延迟到下回合结束阶段，可继续延迟一回合并使数值 +2。', icon: '⧗' }],
    },
    {
      id: 'dutu', name: '赌徒', title: '下注', hp: 20, accent: '#d9c66b',
      img: 'assets/heroes/dutu.webp', portrait: 'assets/portraits/dutu.webp',
      passiveName: '下注',
      passive: '每回合限一次，出牌时可下注并猜测牌库顶卡牌的类型。猜中则此牌结算后额外进行 1/2 数值的结算；猜错则此牌无效。',
      tags: ['赌博', '上限'], difficulty: 3,
      active: [{ id: 'dutu_bet', name: '下注', desc: '本回合下一次出牌前猜测牌库顶类型；猜中追加 1/2 结算，猜错此牌无效。', icon: '♠' }],
    },
  ];

  CG.HERO_MAP = Object.fromEntries(CG.HEROES.map((h) => [h.id, h]));
  CG.HERO_BY_NAME = Object.fromEntries(CG.HEROES.map((h) => [h.name, h]));

  /* 正式对局可用职业（24 位；23 号在原设定中缺失，美术中的圣女保留为素材） */
  CG.PLAYABLE_HERO_IDS = CG.HEROES.map((h) => h.id);

  CG.DECK_LIST = CG.CARDS.map((c) => ({ id: c.id, name: c.name, count: c.count, type: c.type }));
  CG.DECK_SIZE = CG.CARDS.reduce((sum, c) => sum + c.count, 0);

  /* 生成一张虚拟卡（三月七转化等） */
  CG.makeVirtualCardDef = function (type, value) {
    if (type === 'armor') {
      return {
        id: 'virtual_armor_' + value,
        name: '护甲·' + value,
        type: 'armor',
        value: value,
        count: 0,
        virtual: true,
        img: 'assets/cards/gujia.webp',
        short: '获得 ' + value + ' 点护甲',
        desc: '由「可爱即是正义」转化而来，获得 ' + value + ' 点护甲。',
      };
    }
    return {
      id: 'virtual_' + type + '_' + value,
      name: '幻牌·' + value,
      type: type,
      value: value,
      count: 0,
      virtual: true,
      img: 'assets/backs/back1.webp',
      short: '',
      desc: '',
    };
  };

  /* 工具 */
  CG.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  CG.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
})(typeof window !== 'undefined' ? window : globalThis);
