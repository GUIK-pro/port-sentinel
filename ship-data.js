/* ============================================================
 * 东莞首靠船识别助手 · 船舶 Mock 数据库
 * 用途：指挥台清单 + 详情页 共用同一份船舶数据，按 IMO 索引
 * 暴露：window.SHIP_DB / window.getShipById(id)
 * ============================================================ */
(function () {
  // 工具：根据分数自动推等级
  function lvOf(score, veto) {
    if (veto) return '高';
    if (score >= 60) return '高';
    if (score >= 35) return '中';
    return '低';
  }

  var SHIPS = [
    {
      imo: '9876543', mmsi: '412345678', name: '粤东莞货2001', captain: '陈海川', captainNo: 'NL-0388',
      type: '集装箱船', age: 18, gt: 8620, dwt: 12400, owner: '东莞海运集团', ownerCode: 'DGSSC',
      flag: '中国', flagEmoji: '🇨🇳', eta: '05-12 15:40', berth: '沙田港 3 号泊位',
      score: 68, level: '高', veto: true,
      narrative: '该船在近 6 个月辖区进出港计划库中<span class="text-white mono">未出现</span>记录，触发首靠识别。船龄 18 年 · PSC 历史存在 2 次滞留 · 配员符合率 76% (＜基线 85%)，建议登轮开展专项检查。',
      reportTime: '2026-05-12 14:28',
      metrics: {
        'PSC.detention_count_3y': 2, 'PSC.open_deficiencies': 1,
        'crew.compliance_rate': 76, 'crew.missing_rank': ['大副'], 'crew.non_english_ratio': 30,
        'vessel.age_years': 18, 'vessel.flag_state': 'CN',
        'cert.days_to_expire': 70,
        'AIS.appearance_6m': 0,
        'cargo.imdg_class': null, 'cargo.un_code': 'UN3480',
      },
    },
    {
      imo: '9712345', mmsi: '413098765', name: '浙海运油19', captain: '林建峰', captainNo: 'NL-0421',
      type: '油轮', age: 22, gt: 12480, dwt: 19200, owner: '浙江海运', ownerCode: 'ZJSY',
      flag: '中国', flagEmoji: '🇨🇳', eta: '05-12 16:20', berth: '立沙岛 2 号',
      score: 82, level: '高', veto: true,
      narrative: '该船首次进入辖区，船龄 22 年（已超油轮 20 年阈值），双壳改造记录待核实。配员符合率 71% 触发 VETO，且申报载货为重质燃料油，建议<span class="text-white mono">登轮 + 滞港复检</span>。',
      reportTime: '2026-05-12 14:28',
      metrics: {
        'PSC.detention_count_3y': 3, 'PSC.open_deficiencies': 2,
        'crew.compliance_rate': 71, 'crew.missing_rank': ['轮机长'], 'crew.non_english_ratio': 25,
        'vessel.age_years': 22, 'vessel.flag_state': 'CN',
        'cert.days_to_expire': 200,
        'AIS.appearance_6m': 0,
        'cargo.imdg_class': null, 'cargo.un_code': '',
      },
    },
    {
      imo: '9823456', mmsi: '412567890', name: '粤穗化工8', captain: '黄志诚', captainNo: 'NL-0312',
      type: '化学品船', age: 9, gt: 6280, dwt: 9100, owner: '广州化工运输', ownerCode: 'GZCT',
      flag: '中国', flagEmoji: '🇨🇳', eta: '05-12 17:05', berth: '立沙岛 1 号',
      score: 47, level: '中', veto: false,
      narrative: '该船近 6 个月有 1 次进港记录但泊位不同，触发"准首靠"识别。船龄良好，化学品舱清舱记录齐全，仅个别证书 90 天内到期，建议<span class="text-white mono">书面提醒 + 抽查</span>。',
      reportTime: '2026-05-12 14:28',
      metrics: {
        'PSC.detention_count_3y': 0, 'PSC.open_deficiencies': 0,
        'crew.compliance_rate': 88, 'crew.missing_rank': [], 'crew.non_english_ratio': 20,
        'vessel.age_years': 9, 'vessel.flag_state': 'CN',
        'cert.days_to_expire': 65,
        'AIS.appearance_6m': 1,
        'cargo.imdg_class': 3, 'cargo.un_code': '',
      },
    },
    {
      imo: '9654321', mmsi: '412445566', name: '闽安达7', captain: '张明辉', captainNo: 'NL-0276',
      type: '散货船', age: 14, gt: 9850, dwt: 15600, owner: '福建安达航运', ownerCode: 'FJAD',
      flag: '中国', flagEmoji: '🇨🇳', eta: '05-12 18:30', berth: '麻涌港 A 泊位',
      score: 38, level: '中', veto: false,
      narrative: '该船近 6 个月辖区无记录但船东其他船有 3 次到港，关联画像可参。船龄 14 年接近阈值，PSC 近 3 年 1 次缺陷已整改，建议<span class="text-white mono">常规登轮 + 重点核证书</span>。',
      reportTime: '2026-05-12 14:28',
      metrics: {
        'PSC.detention_count_3y': 1, 'PSC.open_deficiencies': 0,
        'crew.compliance_rate': 90, 'crew.missing_rank': [], 'crew.non_english_ratio': 15,
        'vessel.age_years': 14, 'vessel.flag_state': 'CN',
        'cert.days_to_expire': 240,
        'AIS.appearance_6m': 0,
        'cargo.imdg_class': null, 'cargo.un_code': '',
      },
    },
    {
      imo: '9998877', mmsi: '412223344', name: '粤深蓝118', captain: '郑伟强', captainNo: 'NL-0509',
      type: '客滚船', age: 6, gt: 4560, dwt: 5200, owner: '深蓝航运', ownerCode: 'SLSY',
      flag: '中国', flagEmoji: '🇨🇳', eta: '05-12 19:15', berth: '虎门客运码头',
      score: 32, level: '中', veto: false,
      narrative: '该船首次到虎门客运码头但已在辖区其他码头有规律航次，船龄 6 年技术状态良好。客滚船重点关注消防演练记录与救生设备，建议<span class="text-white mono">常规检查</span>。',
      reportTime: '2026-05-12 14:28',
      metrics: {
        'PSC.detention_count_3y': 0, 'PSC.open_deficiencies': 0,
        'crew.compliance_rate': 92, 'crew.missing_rank': [], 'crew.non_english_ratio': 10,
        'vessel.age_years': 6, 'vessel.flag_state': 'CN',
        'cert.days_to_expire': 360,
        'AIS.appearance_6m': 4,
        'cargo.imdg_class': null, 'cargo.un_code': '',
      },
    },
    {
      imo: '9445566', mmsi: '413334455', name: '粤东莞货3032', captain: '刘志坚', captainNo: 'NL-0188',
      type: '集装箱船', age: 7, gt: 7320, dwt: 10800, owner: '东莞海运集团', ownerCode: 'DGSSC',
      flag: '中国', flagEmoji: '🇨🇳', eta: '05-12 20:50', berth: '沙田港 5 号',
      score: 19, level: '低', veto: false,
      narrative: '该船所属船东在辖区为常客，但本船 MMSI 在近 6 个月辖区进港库未出现，触发首靠识别。船舶状态良好、配员充足，建议<span class="text-white mono">书面备案 · 常规放行</span>。',
      reportTime: '2026-05-12 14:28',
      metrics: {
        'PSC.detention_count_3y': 0, 'PSC.open_deficiencies': 0,
        'crew.compliance_rate': 95, 'crew.missing_rank': [], 'crew.non_english_ratio': 12,
        'vessel.age_years': 7, 'vessel.flag_state': 'CN',
        'cert.days_to_expire': 420,
        'AIS.appearance_6m': 0,
        'cargo.imdg_class': null, 'cargo.un_code': '',
      },
    },
    {
      imo: '9556677', mmsi: '412889900', name: '粤新港货88', captain: '吴海涛', captainNo: 'NL-0344',
      type: '杂货船', age: 11, gt: 5980, dwt: 8400, owner: '新港船务', ownerCode: 'XGSW',
      flag: '中国', flagEmoji: '🇨🇳', eta: '05-12 22:10', berth: '新沙港 B 区',
      score: 14, level: '低', veto: false,
      narrative: '该船船龄 11 年技术状态稳定，船东历史合规良好。本次为辖区首靠，AIS 轨迹完整，证书齐全，建议<span class="text-white mono">书面备案 · 常规放行</span>。',
      reportTime: '2026-05-12 14:28',
      metrics: {
        'PSC.detention_count_3y': 0, 'PSC.open_deficiencies': 0,
        'crew.compliance_rate': 93, 'crew.missing_rank': [], 'crew.non_english_ratio': 18,
        'vessel.age_years': 11, 'vessel.flag_state': 'CN',
        'cert.days_to_expire': 300,
        'AIS.appearance_6m': 1,
        'cargo.imdg_class': null, 'cargo.un_code': '',
      },
    },
  ];

  // 索引化
  var DB = {};
  SHIPS.forEach(function (s) {
    if (!s.level) s.level = lvOf(s.score, s.veto);
    DB[s.imo] = s;
    DB[s.mmsi] = s; // 同时支持 MMSI 索引
  });

  window.SHIP_DB = DB;
  window.SHIP_LIST = SHIPS;

  window.getShipById = function (id) {
    if (!id) return null;
    return DB[String(id)] || null;
  };

  // 从 URL 取 ?id=xxx 或 ?name=xxx
  window.getShipFromUrl = function () {
    try {
      var sp = new URLSearchParams(location.search);
      var id = sp.get('id') || sp.get('imo') || sp.get('mmsi');
      var name = sp.get('name') || sp.get('shipName');

      // 优先按 ID/IMO/MMSI 查询
      var found = id ? DB[String(id)] : null;

      // 按船名查询 SHIP_LIST
      if (!found && name) {
        for (var i = 0; i < SHIPS.length; i++) {
          if (SHIPS[i].name === name) { found = SHIPS[i]; break; }
        }
      }

      // 尝试从 PlanStore 查询（兼容计划库中的船舶）
      if (!found && name && window.PlanStore) {
        try {
          var plans = PlanStore.getAll();
          for (var j = 0; j < plans.length; j++) {
            var p = plans[j];
            if (p.shipName === name) {
              // 构造与 SHIP_LIST 兼容的船舶对象
              found = {
                imo: p.imo || '-',
                mmsi: p.mmsi || '-',
                name: p.shipName,
                captain: p.captain || '',
                captainNo: '',
                type: p.shipType || '未知',
                age: p.buildYear ? Math.max(0, new Date().getFullYear() - parseInt(p.buildYear)) : 0,
                gt: parseInt(p.gt) || 0,
                dwt: parseInt(p.dwt) || 0,
                owner: '',
                ownerCode: '',
                flag: '中国',
                flagEmoji: '🇨🇳',
                eta: p.eta || '',
                berth: p.berth || '',
                score: 0,
                level: '低',
                veto: false,
                narrative: '本船来自计划上传库，详细信息待外部数据源补充。',
                metrics: {}, // RuleEngine.buildMetrics() 会在风险报告页补充
              };
              break;
            }
          }
        } catch (e) {}
      }

      return found || SHIPS[0];
    } catch (e) {
      return SHIPS[0];
    }
  };
})();
