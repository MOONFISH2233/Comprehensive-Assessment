/**
 * 综测加分项目清单
 *
 * 数据来源：
 *   《国家卓越工程师学院2026下学期学生综合测评奖励加分项目实施细则》
 *   页码标注在每一组上方。
 *
 * 取值原则：学院细则与学校《综合素质测评办法及细则》冲突时，
 * 一律取学院细则（标题写明「2026 下学期」，更新更具体）。
 * 冲突处在 app.js 的 CONFLICTS 里标黄提示学生。
 *
 * mode 说明：
 *   count        逐项问「有没有」，勾上记 unit 分（单项可用 unit 覆盖）
 *   items-grade  逐项问具名比赛，勾上再选获奖等级
 *   grade        整组一屏，可添加多个奖项（级别 + 等次）
 *   honor        整组一屏，按级别 × 角色勾选
 *   pickmax      整组一屏，同一 subgroup 内只取最高分一项
 *   range        整组一屏，分值由评审组认定，学生自填预期值
 *   tier         整组一屏，按区间归档计分
 *   penalty      整组一屏，扣分项
 */

export const YU = {
  D: { key: 'D', name: '德育', desc: '思政活动、荣誉、学生干部、突出事迹' },
  Z: { key: 'Z', name: '智育', desc: '科研创新、专业技能、科技活动、竞赛获奖' },
  T: { key: 'T', name: '体育', desc: '课外锻炼、坚持锻炼、体育比赛' },
  M: { key: 'M', name: '美育', desc: '美育活动、活动组织、文艺比赛' },
  L: { key: 'L', name: '劳育', desc: '宿舍卫生、社会实践、志愿时长、劳育比赛' }
};

// 竞赛 / 五育比赛 / 文艺比赛 / 劳育比赛 共用的一套级别分值（细则 p7–8）
const COMPETITION_LEVELS = [
  { key: 'national', name: '国家级 / 国际级', scores: [6, 5, 4, 3] },
  { key: 'province', name: '省市级',          scores: [4, 3, 2, 1] },
  { key: 'school',   name: '学校级',          scores: [2, 1.5, 1, 0.5] },
  { key: 'college',  name: '学院级',          scores: [2, 0.75, 0.5, 0.25] }
];
const RANK_NAMES = ['一等奖', '二等奖', '三等奖', '优秀奖'];
const EXTRA = { name: '特等奖', bonus: 1 };
const STAMP_NOTE =
  '认章规则：落款章为「重庆大学」或「重庆大学党委」才算学校级，其余落款章一律算学院级。';

/**
 * 生成 PDF 时，每育顶上那行公式里要写的名字。
 * 措辞照抄细则的章节标题 —— 模板里的例子就是这么写的：
 *   「智育加分=科研与创新加分+专业技能加分+参加科技学术活动加分+赛、五育活动比赛成果奖励加分（每项需写出来）」
 * 德育扣分（D-koufen）不列进来：PDF 是加分证明材料，不交自己处分的证明。
 */
export const FORMULA_NAMES = {
  'D-sizheng':     '参加思政教育加分',
  'D-tuchu':       '突出事迹加分',
  'D-rongyu':      '荣誉加分',
  'D-shehui':      '社会服务加分',
  'Z-keyan':       '科研与创新加分',
  'Z-jineng':      '专业技能加分',
  'Z-kejihuodong': '参加科技学术活动加分',
  'Z-jingsai':     '赛、五育活动比赛成果奖励加分',
  'T-duanlian':    '课外体育锻炼活动加分',
  'T-jianchi':     '坚持体育锻炼加分',
  'T-bisai':       '体育比赛获奖加分',
  'M-huodong':     '美育实践或文艺活动加分',
  'M-zuzhi':       '组织美育活动加分',
  'M-bisai':       '文艺比赛获奖加分',
  'L-sushe':       '宿舍文明卫生加分',
  'L-chuangye':    '自主创新创业加分',
  'L-shijian':     '社会实践加分',
  'L-zhiyuan':     '志愿时长加分',
  'L-bisai':       '劳育比赛获奖加分'
};

export const CATALOG = [

  /* ==================== 德育 ==================== */

  // 细则 p1「（3）参加思政教育加分（上限0.6）」
  {
    id: 'D-sizheng',
    yu: 'D',
    title: '思政教育活动',
    note: '每参加 1 次加 0.1 分，累计不超过 0.6 分。',
    cap: 0.6,
    mode: 'count',
    unit: 0.1,
    items: [
      { id: 'D-sz-1', name: '马院思政2026年春季学期微电影（短视频）展示活动' },
      { id: 'D-sz-2', name: '心存幸福，逐梦前行心理辅导会' },
      { id: 'D-sz-3', name: '“讲党史故事”演讲比赛' },
      { id: 'D-sz-4', name: '参加书香红岩世界读书日活动' },
      { id: 'D-sz-5', name: '参与重大第十二届国防教育月系列活动' },
      { id: 'D-sz-6', name: '重庆市中华魂征文比赛' },
      { id: 'D-sz-7', name: '参加“长征精神”主题巡回宣讲活动' }
    ]
  },

  // 细则 p1「（2）突出事迹加分」
  {
    id: 'D-tuchu',
    yu: 'D',
    title: '突出事迹',
    note: '见义勇为、拾金不昧、抢险救灾、疫情防控等方面有突出表现。需个人申请、学院领导小组认定。',
    cap: null,
    mode: 'range',
    options: [
      { id: 'D-tc-1', name: '见义勇为 / 拾金不昧 / 抢险救灾 / 疫情防控等突出事迹',
        src: '在见义勇为、拾金不昧、抢险救灾、疫情防控等方面有突出表现的',
        min: 2.5, max: 7.5 }
    ]
  },

  // 细则 p2「（4）荣誉加分」
  {
    id: 'D-rongyu',
    yu: 'D',
    title: '荣誉',
    note: '同一集体或个人获同一类型各级别荣誉称号，按最高加分计分一次。',
    cap: null,
    mode: 'honor',
    levels: [
      { key: 'national', name: '国家级', leader: 4, member: 2,   individual: 4 },
      { key: 'province', name: '省部级', leader: 3, member: 1.5, individual: 3 },
      { key: 'school',   name: '学校级', leader: 2, member: 1,   individual: 2 },
      { key: 'college',  name: '学院级', leader: 1, member: 0.5, individual: 1 }
    ],
    examples: '学校级含：五四评优优秀团体、先进班集体、雷锋月学雷锋先进个人、' +
              '五四评优先进个人、团校校级优秀个人、运动会精神文明奖、运动会单项获奖、' +
              '返校宣讲校级获奖、百子挂职社会实践优秀个人、优秀共青团员。' +
              '学院级含：卓越助教奖。省部级含：重庆爱心心理委员。'
  },

  // 细则 p2–3「（5）社会服务加分」
  {
    id: 'D-shehui',
    yu: 'D',
    title: '社会服务（学生干部）',
    note: '任职半年及以上才加分。寝室长、楼长不加分。分值由评审组按实际工作情况认定。',
    cap: 2.5,
    mode: 'range',
    options: [
      { id: 'D-sh-1', name: '团总支副书记，学生会主席，科协主席，青协主席，年级助管，党支部委员等', min: 0.5, max: 2.5 },
      { id: 'D-sh-2', name: '学生会副主席，科协副主席，青协副主席等', min: 0.5, max: 2.0 },
      { id: 'D-sh-3', name: '团总支，学生会，科协，青协部长等', min: 0.5, max: 1.5 },
      { id: 'D-sh-4', name: '团总支，学生会，科协，青协副部长等', min: 0.5, max: 1.0 },
      { id: 'D-sh-5', name: '团总支，学生会，科协，青协干事等', min: 0.5, max: 1.0 },
      { id: 'D-sh-6', name: '各班班长、团支书', min: 0.5, max: 2.5 },
      { id: 'D-sh-7', name: '各班班委', min: 0.5, max: 1.0 },
      { id: 'D-sh-8', name: '在校学生会 / 校团委等校一级社团 / 实验室 / 交创任学生干部',
        src: '在校学生会，校团委等校一级社团，实验室或者交创（有相关证明资料，公章）任学生干部',
        min: 0.5, max: 1.0, proofNote: '必须是任职考核盖章证明' },
      { id: 'D-sh-9', name: '国旗班', src: '国旗班',
        min: 0.5, max: 0.5, proofNote: '必须是任职考核盖章证明' }
    ]
  },

  // 细则 p3–4「德育扣分项目」
  {
    id: 'D-koufen',
    yu: 'D',
    title: '德育扣分',
    note: '如实填写。本页只在你手机上计算，不会上传到任何地方。',
    cap: null,
    mode: 'penalty',
    options: [
      { id: 'D-kf-1', name: '不假离校，无故缺课、缺席集体活动、年级大会，晚归、不归，节假日无故未按时返校',
        src: '不假离校，无故缺课、缺席集体活动、年级大会', unit: 0.1, unitLabel: '次' },
      { id: 'D-kf-2', name: '学院通报批评', flat: 1.5 },
      { id: 'D-kf-3', name: '学校通报批评', flat: 2.5 },
      { id: 'D-kf-4', name: '警告', flat: 4 },
      { id: 'D-kf-5', name: '严重警告', flat: 6 },
      { id: 'D-kf-6', name: '记过', flat: 8 },
      { id: 'D-kf-7', name: '留校察看', flat: 10 },
      { id: 'D-kf-8', name: '其它违规行为（如宿舍抽烟、熬夜打游戏等）',
        src: '有其它违规行为，如在宿舍抽烟、熬夜打游戏等', unit: 0.1, unitLabel: '次' }
    ]
  },

  /* ==================== 智育 ==================== */

  // 细则 p4「（1）科研与创新加分」
  {
    id: 'Z-keyan',
    yu: 'Z',
    title: '科研与创新',
    note: '完成（获奖）单位须为重庆大学。专利、论文按细则计分。',
    cap: null,
    mode: 'grade',
    dachuang: [
      { key: 'national', name: '国家级大学生创新创业训练计划', scores: { '优': 6, '良': 5, '合格': 4 } },
      { key: 'province', name: '省部级大学生创新创业训练计划', scores: { '优': 4, '良': 3, '合格': 2 } },
      { key: 'school',   name: '校级大学生科研训练计划',       scores: { '优': 2, '良': 1, '合格': 0.5 } }
    ],
    dachuangExtra: { name: '明月班项目获种子轮融资', score: 6 },
    patent: [
      { key: 'invention', name: '发明专利', score: 2 },
      { key: 'utility',   name: '实用新型专利', score: 1 }
    ],
    paper: [
      { key: 'sci',   name: '在 SCI / EI / SSCI 收录的期刊上发表论文', score: 6 },
      { key: 'cssci', name: '在 CSSCI / CSCD 收录的期刊或核心期刊上发表论文', score: 3 }
    ],
    paperNote: '论文加分需为第一作者（含指导老师为第一作者、学生为第二作者）。' +
               '核心期刊认定参照北京大学图书馆最新版《中文核心期刊要目总览》。'
  },

  // 细则 p5「（2）专业技能加分」
  {
    id: 'Z-jineng',
    yu: 'Z',
    title: '专业技能',
    note: '同一类型、类别的考试，只加最高分一次。驾照不加分。',
    cap: null,
    mode: 'pickmax',
    subgroups: [
      {
        id: 'Z-jn-waiyu', name: '外语水平',
        options: [
          { id: 'Z-jn-cet6ex', name: '六级优秀（≥500 分）', src: '六级≥500 分', score: 1.5 },
          { id: 'Z-jn-intl',   name: 'GRE≥270 / TOFEL≥90 / IELTS≥7', src: 'GRE≥270', score: 1.5 },
          { id: 'Z-jn-cet6',   name: '六级通过', score: 1 },
          { id: 'Z-jn-cet4ex', name: '四级优秀（≥560 分）', src: '四级≥560 分', score: 1 },
          { id: 'Z-jn-cet4',   name: '四级通过', score: 0.5 }
        ]
      },
      {
        id: 'Z-jn-jsj', name: '全国计算机等级考试',
        options: [
          { id: 'Z-jn-ncre4', name: '四级合格', score: 1.5 },
          { id: 'Z-jn-ncre3', name: '三级合格', score: 1 },
          { id: 'Z-jn-ncre2', name: '二级合格', score: 0.5 }
        ]
      },
      {
        id: 'Z-jn-zige', name: '专业技能资格证书',
        options: [
          { id: 'Z-jn-cert', name: '劳动技术鉴定部门颁发或行业认定的专业技能资格证书', score: 0.5 }
        ]
      },
      {
        id: 'Z-jn-pth', name: '普通话水平测试',
        options: [
          { id: 'Z-jn-pth1a', name: '一级甲等', src: '一甲', score: 0.5 },
          { id: 'Z-jn-pth1b', name: '一级乙等', src: '一乙', score: 0.4 },
          { id: 'Z-jn-pth2a', name: '二级甲等', src: '二甲', score: 0.3 },
          { id: 'Z-jn-pth2b', name: '二级乙等', src: '二乙', score: 0.2 },
          { id: 'Z-jn-pth3a', name: '三级甲等', src: '三甲', score: 0.1 },
          { id: 'Z-jn-pth3b', name: '三级乙等', src: '三乙', score: 0.05 }
        ]
      }
    ]
  },

  // 细则 p6–7「（3）参加科技学术活动加分」
  {
    id: 'Z-kejihuodong',
    yu: 'Z',
    title: '科技学术活动',
    note: '每参加 1 项加 0.1 分，累计不超过 0.6 分。' +
          '细则未列出的讲座、报告会可在此组末尾用「其他」自填。',
    cap: 0.6,
    mode: 'count',
    unit: 0.1,
    items: [
      { id: 'Z-kj-1',  name: 'Robocon 机器人大赛' },
      { id: 'Z-kj-2',  name: 'Robotac 机器人大赛' },
      { id: 'Z-kj-3',  name: '参加 RoboMaster 机甲大师联盟赛（重庆站）' },
      { id: 'Z-kj-4',  name: 'RMUA 机甲大师人工智能挑战赛' },
      { id: 'Z-kj-5',  name: '全国大学生智能车竞赛' },
      { id: 'Z-kj-6',  name: '睿抗（raicom）机器人比赛' },
      { id: 'Z-kj-7',  name: '结构设计大赛' },
      { id: 'Z-kj-8',  name: '参加飞行器大赛' },
      { id: 'Z-kj-9',  name: '参加华为软件精英挑战赛' },
      { id: 'Z-kj-10', name: '美国大学生数学建模大赛' },
      { id: 'Z-kj-11', name: '国家数模大赛' },
      { id: 'Z-kj-12', name: '计算机设计大赛' },
      { id: 'Z-kj-13', name: '“中国软件杯”大学生软件设计大赛' },
      { id: 'Z-kj-14', name: '数据性能测试大赛' },
      { id: 'Z-kj-15', name: '智能货柜商品交易视频挑战赛' },
      { id: 'Z-kj-16', name: '第三届筑梦蓝天重庆大学飞行器设计大赛' },
      { id: 'Z-kj-17', name: '大学生创新创业大赛' },
      { id: 'Z-kj-18', name: '挑战杯' },
      { id: 'Z-kj-19', name: '互联网+' },
      { id: 'Z-kj-20', name: 'ICAN 创新创业大赛' },
      { id: 'Z-kj-21', name: '中国国际大学生创新大赛' },
      { id: 'Z-kj-22', name: '重庆市大学生创新方法大赛' },
      { id: 'Z-kj-23', name: '重庆大学第十三届“树声前锋杯”创新创业大赛决赛' },
      { id: 'Z-kj-24', name: '节能减排社会实践与科技竞赛' },
      { id: 'Z-kj-25', name: '全国大学生核➕X 科创赛道' },
      { id: 'Z-kj-26', name: '上海 AWE 展会' },
      { id: 'Z-kj-27', name: '参与重庆宠物展' },
      { id: 'Z-kj-28', name: '参与宁波家电展' },
      { id: 'Z-kj-29', name: '参与上海亚宠电子消费展' },
      { id: 'Z-kj-30', name: '参加重庆南开两江中学科技节参展' },
      { id: 'Z-kj-31', name: '用户场景洞察讲座' },
      { id: 'Z-kj-32', name: 'E 来 I 去朋辈引领系列活动' },
      { id: 'Z-kj-33', name: '参加“创客论坛，聚力智启山城”讲座' },
      { id: 'Z-kj-34', name: '参加两江创业学长分享讲座' },
      { id: 'Z-kj-35', name: '参加智元 AIMA 开发者社区城市行重庆站' },
      { id: 'Z-kj-36', name: '“师兄师姐去哪了”就业分享活动' },
      { id: 'Z-kj-37', name: '参加第十一届青年科技创新人才会议' },
      // 细则原文写的是 BuliderUp（拼写有误），这里保留原文写法，便于与评审组核对
      { id: 'Z-kj-38', name: '明月湖 AdventureX BuliderUp 会' },
      { id: 'Z-kj-39', name: '参加腾讯企鹅虾友高校擂台赛（重庆站）' },
      { id: 'Z-kj-40', name: '参加 2026 腾讯云城市峰会' },
      { id: 'Z-kj-41', name: '参加第十一届 RoboMaster 青年工程师大会' },
      { id: 'Z-kj-42', name: '第二届世界机器人运动会' },
      { id: 'Z-kj-43', name: '弘深科创沙龙' },
      { id: 'Z-kj-44', name: '2026 年重庆高新区全国科普月活动暨第六届西部科学城科技节' },
      { id: 'Z-kj-45', name: '第 28 届“外研社·国才杯”全国大学生英语辩论赛' },
      { id: 'Z-kj-46', name: '用英语讲好中国故事活动' },
      { id: 'Z-kj-47', name: '参加学校辩论活动' },
      { id: 'Z-kj-48', name: 'SRTP 结业证书' },
      { id: 'Z-kj-49', name: '无线电台操作技术验证证书' },
      { id: 'Z-kj-50', name: '50 万种子轮证明' }
    ]
  },

  // 细则 p7–8「（4）赛、五育活动比赛成果奖励加分」
  {
    id: 'Z-jingsai',
    yu: 'Z',
    title: '竞赛获奖',
    note: '同一项目参加同一类型不同级别竞赛获多个奖项的，按最高加分计分一次。' +
          '评奖不分等级时按名次计：第 1 名按一等奖，第 2、3 名按二等奖，' +
          '第 4–6 名按三等奖，第 7 名及以后按优秀奖。',
    cap: null,
    mode: 'grade',
    rankNames: RANK_NAMES,
    levels: COMPETITION_LEVELS,
    extra: EXTRA,
    stampNote: STAMP_NOTE
  },

  /* ==================== 体育 ==================== */

  // 细则 p9「课外体育锻炼活动」
  {
    id: 'T-duanlian',
    yu: 'T',
    title: '课外体育锻炼活动',
    note: '参加未获奖的，每项加 0.1 分，累计不超过 0.6 分。',
    cap: 0.6,
    mode: 'count',
    unit: 0.1,
    items: [
      { id: 'T-dl-1',  name: '参加比亚迪校园跑' },
      { id: 'T-dl-2',  name: '重庆大学慧动青春小众体育比赛' },
      { id: 'T-dl-3',  name: '学院三河村徒步' },
      { id: 'T-dl-4',  name: '参加学院趣味运动会' },
      { id: 'T-dl-5',  name: '参加侗族哆毽' },
      { id: 'T-dl-6',  name: '参加少数民族运动会活动' },
      { id: 'T-dl-7',  name: '学校的阳光六十分活动' },
      { id: 'T-dl-8',  name: '观看重大杯学院足球比赛' },
      { id: 'T-dl-9',  name: '春季运动会方阵' },
      { id: 'T-dl-10', name: '体育文化节' },
      { id: 'T-dl-11', name: '学校运动会拉拉队' },
      { id: 'T-dl-12', name: '观看 2025-2026 学年研究生足球联赛总决赛' },
      { id: 'T-dl-13', name: '参加卓工院明月湖足球友谊赛' }
    ]
  },

  // 细则 p9「坚持体育锻炼，养成习惯」
  {
    id: 'T-jianchi',
    yu: 'T',
    title: '坚持体育锻炼',
    note: '需提供相关证明，限一次加分。',
    cap: null,
    mode: 'range',
    options: [
      { id: 'T-jc-1', name: '坚持体育锻炼，积极带动同学养成体育锻炼习惯（需学院领导小组认定）',
        src: '坚持体育锻炼，积极带动同学养成体育锻炼习惯',
        min: 0.1, max: 1 }
    ]
  },

  // 细则 p9「体育比赛」
  {
    id: 'T-bisai',
    yu: 'T',
    title: '体育比赛获奖',
    note: '本组只填【获了奖】的比赛，凭获奖证明加分。' +
          '只参赛、没拿名次的，去「课外体育锻炼活动」组，参加一项就有 0.1 分。',
    cap: null,
    mode: 'items-grade',
    items: [
      { id: 'T-bs-1',  name: '春季运动会' },
      { id: 'T-bs-2',  name: '重大杯羽毛球赛' },
      { id: 'T-bs-3',  name: '参加重庆大学校运动会' },
      { id: 'T-bs-4',  name: '学院趣味运动会' },
      { id: 'T-bs-5',  name: '广播体操比赛' },
      { id: 'T-bs-6',  name: '参加赛力斯羽毛球交流赛' },
      { id: 'T-bs-7',  name: '参加重大杯足球赛' },
      { id: 'T-bs-8',  name: '卓越工程师学院乒乓球杯' },
      { id: 'T-bs-9',  name: '重庆大学乒乓球校赛' },
      { id: 'T-bs-10', name: '参加卓工台球赛' },
      { id: 'T-bs-11', name: '参加卓工杯篮球赛' }
    ],
    rankNames: RANK_NAMES,
    levels: COMPETITION_LEVELS,
    extra: EXTRA,
    stampNote: STAMP_NOTE,
    pickHint: '以下项目多为校运动会、学院球赛级别，请在选择级别前确认奖状落款章。',
    doubleCountNote:
      '如果你只是参赛、没拿名次，本组一项都不该填 —— 回到上一组「课外体育锻炼活动」，' +
      '参加一项就有 0.1 分。「春季运动会方阵」「参加学院趣味运动会」在那组里都有。' +
      '同一场比赛不要两处都报。'
  },

  /* ==================== 美育 ==================== */

  // 细则 p10–11「积极参加美育实践或文艺活动」
  {
    id: 'M-huodong',
    yu: 'M',
    title: '美育实践活动',
    note: '每参加 1 项加 0.1 分，累计不超过 0.6 分。需提供参与证明。',
    cap: 0.6,
    mode: 'count',
    unit: 0.1,
    items: [
      { id: 'M-hd-1',  name: '“智汇重大•创想青春”校园文化创意大赛' },
      { id: 'M-hd-2',  name: '“以香传情手作暖心”DIY 活动' },
      { id: 'M-hd-3',  name: '参加湖畔之梦毕业音乐会' },
      { id: 'M-hd-4',  name: '参演卓木鸟音乐节' },
      { id: 'M-hd-5',  name: '重庆市第十二届中华经典诵写讲大赛' },
      { id: 'M-hd-6',  name: '重庆大学第六届校园舞蹈大赛比赛' },
      { id: 'M-hd-7',  name: '“科创向未来”六一主题活动' },
      { id: 'M-hd-8',  name: '525 游园会' },
      { id: 'M-hd-9',  name: '参与拍摄重庆大学毕业宣传片' },
      { id: 'M-hd-10', name: '参加“我把重庆的春天寄给你”书信活动' },
      { id: 'M-hd-11', name: '参加草地狂想曲音乐会' },
      { id: 'M-hd-12', name: '观看“骏鸣山河”民族器乐专场音乐会' },
      { id: 'M-hd-13', name: '观看话剧《国士》' },
      { id: 'M-hd-14', name: '观看音卅四方第 34 届校园歌手大赛比赛' },
      { id: 'M-hd-15', name: '参加二十四节气活动' },
      { id: 'M-hd-16', name: '重庆大学“蓝莓摇滚节”' },
      { id: 'M-hd-17', name: '匠心·愈心——木作体验·心流时光' },
      { id: 'M-hd-18', name: '参加 vivo 中国摄影大赛' },
      { id: 'M-hd-19', name: '参加粘土艺造 DIY 活动' },
      { id: 'M-hd-20', name: '参加“墨韵蕉林，书韵校园”书法比赛' },
      { id: 'M-hd-21', name: '参演重庆大学 26 级迎新晚会' },
      { id: 'M-hd-22', name: '参加校园端午艺术竞技活动' },
      { id: 'M-hd-23', name: '参加科学城校区端午节暨毕业美食节' },
      { id: 'M-hd-24', name: '参加学校荣耀草坪音乐节' },
      { id: 'M-hd-25', name: '参加学校“巫山云，嘉陵月”三峡文库系列展览' }
    ]
  },

  // 细则 p10–11「积极组织美育活动」
  {
    id: 'M-zuzhi',
    yu: 'M',
    title: '美育活动组织者',
    note: '校级、院级活动参与组织者、表演者一次加 0.1 分，主要组织者一次加 0.1 分。需相应证明材料。',
    cap: 1.0,
    mode: 'range',
    options: [
      { id: 'M-zz-1', name: '担任上述美育活动的组织者 / 表演者（需学院领导小组认定）',
        src: '担任上述活动组织者',
        min: 0.1, max: 1 }
    ]
  },

  // 细则 p11「参加文艺比赛」
  {
    id: 'M-bisai',
    yu: 'M',
    title: '文艺比赛获奖',
    note: '参照竞赛获奖的分值标准。',
    cap: null,
    mode: 'grade',
    rankNames: RANK_NAMES,
    levels: COMPETITION_LEVELS,
    extra: EXTRA,
    stampNote: STAMP_NOTE
  },

  /* ==================== 劳育 ==================== */

  // 细则 p11–12「宿舍文明卫生」
  {
    id: 'L-sushe',
    yu: 'L',
    title: '宿舍文明卫生',
    note: '每获得 1 次加 0.1 分，累计不超过 0.5 分。',
    cap: 0.5,
    mode: 'count',
    unit: 0.1,
    items: [
      { id: 'L-ss-1', name: '五星级寝室' },
      { id: 'L-ss-2', name: '卫生流动红旗' }
    ]
  },

  // 细则 p11「自主创新创业」
  {
    id: 'L-chuangye',
    yu: 'L',
    title: '自主创新创业',
    note: '需提供相关证明材料，不重复加分。',
    cap: null,
    mode: 'range',
    options: [
      { id: 'L-cy-1', name: '在校期间进行自主创新创业（需学院领导小组认定）',
        src: '在校期间进行自主创新创业的',
        min: 0.1, max: 1 }
    ]
  },

  // 细则 p12「积极社会实践」
  {
    id: 'L-shijian',
    yu: 'L',
    title: '社会实践',
    note: '均需盖章证明，累计不超过 0.6 分。注意：已加志愿时长的社会实践不参加此项加分。',
    cap: 0.6,
    mode: 'count',
    unit: 0.1,
    items: [
      { id: 'L-sj-1',  name: '暑期社会实践' },
      { id: 'L-sj-2',  name: '参加英国访学' },
      { id: 'L-sj-3',  name: '湖南强国智造旅行' },
      { id: 'L-sj-4',  name: '参加返校宣讲答辩' },
      { id: 'L-sj-5',  name: '参加重庆大学第八届“名企行”' },
      { id: 'L-sj-6',  name: '重庆大学一日岗位体验活动' },
      { id: 'L-sj-7',  name: '参加重庆大学新加坡访学' },
      { id: 'L-sj-8',  name: '校园卫士平安前锋活动义诊' },
      { id: 'L-sj-9',  name: '参与支教活动' },
      { id: 'L-sj-10', name: '参加学校慕尼黑工业大学访学' },
      { id: 'L-sj-11', name: '参加“我们需要表达和共鸣系列活动第一期”' },
      { id: 'L-sj-12', name: '参加重庆大学“泥好荷花”劳育活动' },
      { id: 'L-sj-13', name: '参加植树节种树' },
      { id: 'L-sj-14', name: '暑假实习（如明月湖、深圳科创学院、陕汽、DJI 等）', unit: 0.15 },
      { id: 'L-sj-15', name: '助教（如明月湖、交创青少年夏令营、卓工夏令营、深圳科创营、宁波基地、珠峰计划、树人小学社团课等）', unit: 0.15 }
    ]
  },

  // 细则 p13「志愿时长」
  {
    id: 'L-zhiyuan',
    yu: 'L',
    title: '志愿时长',
    note: '必须提供完整的志愿时长截图（要能看到总时长数字）。',
    cap: 0.3,
    mode: 'tier',
    unit: '小时',
    // 区间取法依据细则原文：「10-20 小时（含 20 小时）→0.1」「20-30 小时（含 30 小时）→0.2」
    // 即 20 小时属于 0.1 档、30 小时属于 0.2 档，所以边界必须含在上限里
    tiers: [
      { min: 0,  max: 10,       score: 0,   label: '不足 10 小时', maxExclusive: true },
      { min: 10, max: 20,       score: 0.1, label: '10–20 小时（含 20）' },
      { min: 20, max: 30,       score: 0.2, label: '20–30 小时（含 30）' },
      { min: 30, max: Infinity, score: 0.3, label: '30 小时以上' }
    ]
  },

  // 细则 p13「劳育比赛」
  {
    id: 'L-bisai',
    yu: 'L',
    title: '劳育比赛获奖',
    note: '参照竞赛获奖的分值标准。',
    cap: null,
    mode: 'grade',
    rankNames: RANK_NAMES,
    levels: COMPETITION_LEVELS,
    extra: EXTRA,
    stampNote: STAMP_NOTE
  }
];
