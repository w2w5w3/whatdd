/* 我的刀盾 · 修正版 — 静态配置（卡牌 / 职业 / 规则）
 * 纯数据文件，同时支持浏览器（window.DD_CONFIG）与 Node 测试（module.exports）。
 */
(function (global) {
  'use strict';

  const CARD_LIST = [
    // 破甲卡（8）
    { id: 'qingji', name: '轻击', type: 'break', value: 3, copies: 3, img: 'assets/cards/qingji.webp', desc: '造成 3 点破甲值。' },
    { id: 'zhongji', name: '重击', type: 'break', value: 5, copies: 3, img: 'assets/cards/zhongji.webp', desc: '造成 5 点破甲值。' },
    { id: 'juesha', name: '绝杀', type: 'break', value: 10, copies: 2, img: 'assets/cards/juesha.webp', desc: '造成 10 点破甲值。下回合自己不可使用叠甲卡；下回合对方破甲卡可当普通伤害牌打出。' },
    // 叠甲卡（7）
    { id: 'qingdun', name: '轻盾', type: 'armor', value: 3, copies: 3, img: 'assets/cards/qingdun.webp', desc: '获得 3 点护甲。' },
    { id: 'zhongdun', name: '重盾', type: 'armor', value: 5, copies: 2, img: 'assets/cards/zhongdun.webp', desc: '获得 5 点护甲。' },
    { id: 'gujia', name: '固甲', type: 'armor', value: 7, copies: 2, img: 'assets/cards/gujia.webp', desc: '获得 7 点护甲。' },
    // 普通伤害卡（8）
    { id: 'kuaizhan', name: '快斩', type: 'normal', value: 5, copies: 4, img: 'assets/cards/kuaizhan.webp', desc: '造成 5 点普通伤害。对方无护甲时才能打出。' },
    { id: 'mengji', name: '猛击', type: 'normal', value: 7, copies: 4, img: 'assets/cards/mengji.webp', desc: '造成 7 点普通伤害。对方无护甲时才能打出。' },
    // 休整功能卡（7）
    { id: 'tiaoxi', name: '调息', type: 'rest', value: 3, copies: 3, img: 'assets/cards/tiaoxi.webp', desc: '恢复 3 点生命值。' },
    { id: 'huanyu', name: '缓愈', type: 'rest', value: 5, copies: 2, img: 'assets/cards/huanyu.webp', desc: '恢复 5 点生命值。' },
    { id: 'ningshen', name: '凝神', type: 'rest', value: 2, copies: 2, img: 'assets/cards/ningshen.webp', desc: '额外摸 2 张牌。' },
  ];

  const CARDS = {};
  CARD_LIST.forEach((c) => { CARDS[c.id] = c; });

  const TYPE_META = {
    break: { label: '破甲', color: '#ff6b57', icon: '⚔' },
    armor: { label: '叠甲', color: '#63b8ff', icon: '🛡' },
    normal: { label: '普伤', color: '#ffb347', icon: '✦' },
    rest: { label: '休整', color: '#6fe0a8', icon: '✚' },
  };

  function fullDeck() {
    const out = [];
    CARD_LIST.forEach((c) => {
      for (let i = 0; i < c.copies; i += 1) out.push(c.id);
    });
    return out;
  }

  const CLASS_LIST = [
    {
      id: 'baobao', name: '宝宝', en: 'Baobao', hp: 20, img: 'assets/characters/baobao.webp',
      accent: '#ff9bc2',
      passiveName: '吃奶奶',
      passiveText: '当对方回复生命值时，你也回复一半生命值（向下取整）。每回合最多触发一次。',
      ultimateName: '奶妈降临', ultimateCost: '弃 1 张手牌',
      ultimateText: '回复 5 点生命值，并摸 1 张牌。',
      tags: ['续航', '反制'],
    },
    {
      id: 'fanren', name: '凡人', en: 'Fanren', hp: 30, img: 'assets/characters/fanren.webp',
      accent: '#d6c6a8',
      passiveName: '命硬',
      passiveText: '初始生命值为 30。',
      ultimateName: '不屈凡躯', ultimateCost: '失去 3 点生命',
      ultimateText: '回复 3 点生命，本回合受到的伤害 -2。',
      tags: ['高血量', '稳健'],
    },
    {
      id: 'chensiyu', name: '沉思语', en: 'Chensiyu', hp: 20, img: 'assets/characters/chensiyu.webp',
      accent: '#f0c26b',
      passiveName: '别吵，我在烧烤',
      passiveText: '使用「凝神」时额外摸 1 张牌；每局一次，可随时额外摸 3 张牌（不计入出牌数）。',
      ultimateName: '灵魂烧烤', ultimateCost: '弃 1 张手牌',
      ultimateText: '摸 3 张牌。',
      tags: ['过牌', '爆发'],
    },
    {
      id: 'kuaishou', name: '快手怪盗', en: 'Swift Thief', hp: 20, img: 'assets/characters/kuaishou.webp',
      accent: '#9b8cff',
      passiveName: '掠影',
      passiveText: '打出「凝神」时，可以改为摸对方 2 张牌。',
      ultimateName: '神偷', ultimateCost: '弃 1 张手牌',
      ultimateText: '随机获得对手 2 张手牌。',
      tags: ['扰乱', '偷牌'],
    },
    {
      id: 'sanyueqi', name: '三月七', en: 'March 7th', hp: 20, img: 'assets/characters/sanyueqi.webp',
      accent: '#ff9ecf',
      passiveName: '少女的特权',
      passiveText: '获得的护甲 +1，无法获得额外护甲。持有护甲时被攻击且护甲未被击碎，对伤害来源造成你手中最小数值伤害牌的伤害。',
      passiveName2: '可爱即是正义',
      passiveText2: '若持有护甲且本回合未被攻击，下回合开始时可将 1 张伤害牌转化为等数值的护甲牌。',
      ultimateName: '可爱审判', ultimateCost: '弃 1 张手牌',
      ultimateText: '获得 6 点护甲（含被动+1），并回复 3 点生命。',
      tags: ['护甲', '反击'],
    },
    {
      id: 'yuxue', name: '浴血狂徒', en: 'Blood Maniac', hp: 20, img: 'assets/characters/yuxue.webp',
      accent: '#ff5b5b',
      passiveName: '血屠',
      passiveText: '所有人血量每次降至小于等于 6 时，你下一次伤害 +2（可叠加）。',
      ultimateName: '狂血', ultimateCost: '自伤 4 点',
      ultimateText: '本回合所有伤害牌 +3。',
      tags: ['愈战愈勇', '爆发'],
    },
    {
      id: 'kupai', name: '枯牌先知', en: 'Withered Oracle', hp: 20, img: 'assets/characters/kupai.webp',
      accent: '#a6a6c8',
      passiveName: '竭泽',
      passiveText: '限一次：当你的血量 ≤ 4 时，可将当前手牌与牌库中的牌互换。',
      ultimateName: '枯木逢春', ultimateCost: '弃 2 张手牌',
      ultimateText: '将弃牌堆洗入牌库，然后摸 3 张牌。',
      tags: ['翻盘', '牌库'],
    },
    {
      id: 'jifeng', name: '疾风猎手', en: 'Wind Hunter', hp: 20, img: 'assets/characters/jifeng.webp',
      accent: '#74d6ff',
      passiveName: '风淬',
      passiveText: '造成的普通伤害 +1。',
      ultimateName: '一箭穿心', ultimateCost: '弃 1 张手牌',
      ultimateText: '对对手造成 6 点普通伤害（无视护甲条件）。',
      tags: ['普伤', '稳定'],
    },
    {
      id: 'xunqing', name: '殉情者', en: 'Lover', hp: 20, img: 'assets/characters/xunqing.webp',
      accent: '#d6b8ff',
      passiveName: '同殇',
      passiveText: '受到伤害时，可令自己受到的伤害变为 1.5 倍（向下取整），然后令对方受到原伤害。可在出牌阶段开关。',
      ultimateName: '生死相许', ultimateCost: '失去当前生命值的一半',
      ultimateText: '对对手造成等量真实伤害。',
      tags: ['反伤', '高风险'],
    },
    {
      id: 'moshushou', name: '魔术手', en: 'Magician', hp: 20, img: 'assets/characters/moshushou.webp',
      accent: '#c084ff',
      passiveName: '快手',
      passiveText: '可跳过摸牌阶段，且下回合摸牌阶段少摸 1 张。若如此，本回合可出 3 张牌（不能是「凝神」）。',
      ultimateName: '终极戏法', ultimateCost: '下回合摸牌 -1',
      ultimateText: '本回合出牌上限 +2，所有伤害牌 +1。',
      tags: ['节奏', '多牌'],
    },
    {
      id: 'ranxue', name: '燃血行者', en: 'Blood Walker', hp: 20, img: 'assets/characters/ranxue.webp',
      accent: '#ff7b6b',
      passiveName: '新生',
      passiveText: '每回合可自伤 1 次，回合结束时回复等额生命值。',
      ultimateName: '血怒', ultimateCost: '失去 3 点生命',
      ultimateText: '摸 2 张牌，本回合所有伤害牌 +2。',
      tags: ['自伤', '爆发'],
    },
    {
      id: 'jianbi', name: '坚壁守卫', en: 'Bulwark', hp: 20, img: 'assets/characters/jianbi.webp',
      accent: '#7db6e8',
      passiveName: '重甲',
      passiveText: '所有叠甲卡护甲 +1；受到普通伤害 -1；持有护甲时受到破甲卡伤害 -1。',
      ultimateName: '绝对壁垒', ultimateCost: '弃 1 张手牌',
      ultimateText: '获得 8 点护甲，本回合受到的伤害 -2。',
      tags: ['防守', '护甲'],
    },
    {
      id: 'chuanxi', name: '穿隙刺客', en: 'Rift Assassin', hp: 20, img: 'assets/characters/chuanxi.webp',
      accent: '#8be0ff',
      passiveName: '裂隙',
      passiveText: '对方护甲 ≥ 8 时，破甲卡无视一半护甲。',
      ultimateName: '无影', ultimateCost: '弃 1 张手牌',
      ultimateText: '本回合破甲伤害无视护甲；摸 1 张牌。',
      tags: ['破甲', '穿透'],
    },
    {
      id: 'suyu', name: '溯愈医者', en: 'Restorer', hp: 20, img: 'assets/characters/suyu.webp',
      accent: '#8ff0c4',
      passiveName: '静息',
      passiveText: '行动阶段打出小于等于 1 张牌时，回复 1 点生命；血量 ≤ 8 时改为回复 2 点。',
      ultimateName: '生命洪流', ultimateCost: '弃 1 张手牌',
      ultimateText: '回复 6 点生命，本回合受到的伤害 -1。',
      tags: ['回复', '节奏'],
    },
    {
      id: 'pojiazhankuang', name: '破甲战狂', en: 'Armor Breaker', hp: 20, img: 'assets/characters/pojiazhankuang.webp',
      accent: '#ff8450',
      passiveName: '粉碎',
      passiveText: '破甲牌伤害 +2；叠甲牌护甲 -1。',
      ultimateName: '破天', ultimateCost: '自伤 3 点',
      ultimateText: '本回合破甲伤害翻倍。',
      tags: ['破甲', '高风险'],
    },
    {
      id: 'dunai', name: '毒奶术士', en: 'Poison Healer', hp: 20, img: 'assets/characters/dunai.webp',
      accent: '#8fda7c',
      passiveName: '腐乳',
      passiveText: '你的回血牌可以对其他人打出并造成等额真实伤害；造成此伤害后，对方 1 回合无法回血。',
      ultimateName: '剧毒奶昔', ultimateCost: '自伤 2 点',
      ultimateText: '对对手造成 5 点真实伤害，并令其下回合无法回血。',
      tags: ['真伤', '封锁'],
    },
    {
      id: 'yuyanjia', name: '预言家', en: 'Seer', hp: 20, img: 'assets/characters/yuyanjia.webp',
      accent: '#a8b4ff',
      passiveName: '前瞻',
      passiveText: '每回合开始时，查看对手 1 张手牌。',
      passiveName2: '命定',
      passiveText2: '限一次：对方摸牌前发动，决定对方下一次摸到的牌；若对方牌库中已无该牌，则其跳过摸牌。',
      ultimateName: '宿命', ultimateCost: '弃 1 张手牌',
      ultimateText: '查看对手所有手牌，摸 2 张牌。',
      tags: ['信息', '控制'],
    },
    {
      id: 'nvwu', name: '女巫', en: 'Witch', hp: 20, img: 'assets/characters/nvwu.webp',
      accent: '#b98cff',
      passiveName: '毒咒',
      passiveText: '游戏开始时对一种牌投毒；对方摸到该牌时受到 1 点真实伤害。',
      ultimateName: '万毒锅', ultimateCost: '失去 3 点生命',
      ultimateText: '对对手造成 4 点真实伤害，自己摸 2 张牌。',
      tags: ['真伤', '消耗'],
    },
    {
      id: 'langren', name: '狼人', en: 'Werewolf', hp: 20, img: 'assets/characters/langren.webp',
      accent: '#c0a0ff',
      passiveName: '月嚎',
      passiveText: '开局二选一：①血量 ≤ 8 时伤害 +1；②每次摸牌时可判定：失去 5 点血，若摸到两张相同的牌，展示并对对方造成 15 点真伤，然后进入「狼化」：出牌上限 +1，所有伤害 +2，持续 2 回合。',
      ultimateName: '满月狂化', ultimateCost: '失去 6 点生命',
      ultimateText: '立即进入「狼化」，持续 2 回合。',
      tags: ['赌博', '爆发'],
    },
    {
      id: 'dao', name: '刀', en: 'Blade', hp: 20, img: 'assets/characters/dao.webp',
      accent: '#ffcf7a',
      passiveName: '淬炼',
      passiveText: '每次死亡时可以弃置 2 张手牌，复活并回到 1 点生命。',
      ultimateName: '断魂', ultimateCost: '弃 2 张手牌',
      ultimateText: '造成 8 点破甲伤害；若对方无护甲，则改为造成 8 点真实伤害。',
      tags: ['复活', '破甲'],
    },
    {
      id: 'shihuangzhe', name: '拾荒者', en: 'Scavenger', hp: 20, img: 'assets/characters/shihuangzhe.webp',
      accent: '#b8a77a',
      passiveName: '开拓',
      passiveText: '可以跳过摸牌阶段，并从弃牌堆中选 1 张已出过的牌。',
      ultimateName: '废土清算', ultimateCost: '弃 1 张手牌',
      ultimateText: '从弃牌堆获得 2 张牌，然后摸 1 张牌。',
      tags: ['回收', '续航'],
    },
    {
      id: 'chuanzhang', name: '船长', en: 'Captain', hp: 20, img: 'assets/characters/chuanzhang.webp',
      accent: '#6fb8c8',
      passiveName: '潮涌',
      passiveText: '每获得 1 张牌回复 1 点生命；每失去 1 张牌失去 1 点生命。',
      ultimateName: '风暴', ultimateCost: '弃 2 张手牌',
      ultimateText: '造成 5 点真实伤害，并回复 5 点生命。',
      tags: ['牌差', '血量'],
    },
  ];

  const CLASSES = {};
  CLASS_LIST.forEach((c) => { CLASSES[c.id] = c; });

  const ULTIMATE_BY_CLASS = {};
  CLASS_LIST.forEach((c) => {
    ULTIMATE_BY_CLASS[c.id] = {
      name: c.ultimateName,
      cost: c.ultimateCost,
      text: c.ultimateText,
    };
  });

  const RULES = [
    {
      title: '基础对局',
      items: [
        '双方初始 20 点生命值、0 点护甲；凡人初始 30 点生命值。',
        '双方共用同一套 30 张固定牌库，各自独立洗牌。',
        '为保证开局流畅，双方起手各摸 3 张（原规则未提及起手，此为修正版补充）。',
        '每回合流程：摸牌 2 张 → 出牌至多 2 张 → 结算护甲与伤害。',
        '双方在同一回合内同时选牌、同时结算；你先锁牌，对手同时锁牌，随后一起揭晓。',
        '伤害牌会先累加数值，最后一起生效。',
        '牌库摸空后进入「枯牌阶段」：从下一回合起，每个牌库为空的角色在回合开始时失去 2 点生命。',
      ],
    },
    {
      title: '卡牌机制',
      items: [
        '破甲卡：先破护甲，剩余伤害扣血；对方无护甲时不可打出。',
        '叠甲卡：增加护甲。护甲只格挡破甲伤害，不会阻止普通伤害牌打出条件之外的效果。',
        '普通伤害卡：对方无护甲时才能打出，伤害直接作用于生命值。',
        '休整卡：回血、过牌，不提供护甲。',
        '若出牌阶段打出至少 2 张叠甲卡，且结算后护甲未被完全击碎，则额外获得「最小叠甲值」的额外护盾。额外护盾不叠加，出现更大值时替换，且优先扣除。',
        '所有增减数值最低为 0。',
      ],
    },
    {
      title: '职业与必杀',
      items: [
        '开局自选 1 个职业，整局不可更换。职业被动常驻、无需费用。',
        '每个职业每局可发动 1 次必杀技，必杀自带代价（弃牌、自伤或负面效果），在出牌阶段使用。',
        '原规则未列出各职业必杀的具体数值，本作按职业定位补全，并在职业详情中标注。',
        '若牌库中已无「命定」指定的牌，则预言家的对手跳过该次摸牌。',
      ],
    },
    {
      title: '胜负与死亡',
      items: [
        '任意一方生命值降至 0 时进入濒死；刀可弃 2 张手牌复活至 1 点生命。',
        '无人复活时，生命值归零的一方失败；双方同时归零则为平局。',
        '「枯牌阶段」失去的生命值无视护甲。',
        '所有真实伤害无视护甲。',
      ],
    },
  ];

  const CONFIG = {
    GAME_NAME: '我的刀盾',
    GAME_SUBTITLE: '修正版 · 双生刀盾',
    VERSION: '1.0.0',
    RULES,
    CARD_LIST,
    CARDS,
    TYPE_META,
    FULL_DECK: fullDeck(),
    CLASS_LIST,
    CLASSES,
    ULTIMATE_BY_CLASS,
    INITIAL_HAND: 3,
    BASE_DRAW: 2,
    BASE_PLAY_LIMIT: 2,
    MAX_HP_DEFAULT: 20,
    WOLF_FORM_TURNS: 2,
  };

  global.DD_CONFIG = CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
