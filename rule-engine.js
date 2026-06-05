/* ============================================================
 * 东莞首靠船识别助手 · 规则引擎（前端版）
 * --------------------------------------------------------------
 * 输入：
 *   - ship.metrics 扁平指标对象（key 为字段路径，如 "PSC.detention_count_3y"）
 *   - rules        从规则库 localStorage（dgmsa_rules_v1）读取的规则数组
 * 输出：
 *   { score, level, veto, hits:[...], dims:[...] }
 *
 * 规则匹配：仅评估 status==='active' 的规则；未配置 metric 字段视为 0/空
 * 评分：sum(命中规则的 base * weight)；命中任何 veto 规则 → level='高'
 * 阈值：score>=60 → 高 / >=35 → 中 / 其他 → 低
 *
 * 数据源对接：
 *   RuleEngine.evalShip(ship)         原有接口，ship.metrics 已填充
 *   RuleEngine.evalPlanRow(row)       新增，从 PlanStore 记录推导 metrics
 *   RuleEngine.buildMetrics(planRow)  新增，根据计划行 + 历史库构建指标对象
 *   RuleEngine.evalAllPlans()         新增，批量评估 PlanStore 中所有船舶
 *   RuleEngine.registerSource(name,fn) 新增，注册外部数据源（未来对接 API）
 * ============================================================ */
(function () {
  var RULES_KEY = 'dgmsa_rules_v1';
  var DIM_META = {
    'PSC':   { k:'psc',   bg:'#FEE2E2', fg:'#DC2626', max:25, label:'PSC 历史' },
    '配员':  { k:'crew',  bg:'#450A0A', fg:'#FCA5A5', max:25, label:'配员 / 证书' },
    '证书':  { k:'crew',  bg:'#450A0A', fg:'#FCA5A5', max:25, label:'配员 / 证书' },
    '船龄':  { k:'age',   bg:'#FEF3C7', fg:'#B45309', max:20, label:'船龄 / 技术' },
    '船籍':  { k:'flag',  bg:'#E6F7F4', fg:'#00A896', max:15, label:'船籍 / 船东' },
    '船东':  { k:'flag',  bg:'#E6F7F4', fg:'#00A896', max:15, label:'船籍 / 船东' },
    '货种':  { k:'cargo', bg:'#E0E7FF', fg:'#4338CA', max:15, label:'货种 / 航线' },
    '航线':  { k:'cargo', bg:'#E0E7FF', fg:'#4338CA', max:15, label:'货种 / 航线' },
    'AIS':   { k:'cargo', bg:'#E0E7FF', fg:'#4338CA', max:15, label:'货种 / 航线' },
    '报告':  { k:'report', bg:'#FFF7ED', fg:'#C2410C', max:20, label:'报告合规' },
  };

  function loadRulesFromStorage() {
    try {
      var raw = localStorage.getItem(RULES_KEY);
      if (!raw) return null;
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }

  // 解析值：去 % / 解析数字 / 解析数组 [a,b]
  function parseValue(raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw).trim();
    if (s === '') return '';
    // 数组
    if (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']') {
      return s.slice(1, -1).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    }
    // 百分号
    if (/%$/.test(s)) {
      var n = parseFloat(s);
      return isNaN(n) ? s : n;
    }
    // 纯数字
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return s;
  }

  function compare(actual, op, expectedRaw) {
    var expected = parseValue(expectedRaw);

    if (op === 'IN') {
      var arr = Array.isArray(expected) ? expected : [expected];
      if (Array.isArray(actual)) {
        return actual.some(function (a) { return arr.indexOf(String(a)) >= 0; });
      }
      return arr.indexOf(String(actual)) >= 0;
    }

    // 数值比较：actual / expected 都尽量转 number
    var an = (typeof actual === 'number') ? actual : parseFloat(actual);
    var en = (typeof expected === 'number') ? expected : parseFloat(expected);
    var bothNum = !isNaN(an) && !isNaN(en);

    switch (op) {
      case '=':  return bothNum ? an === en : String(actual) === String(expected);
      case '!=': return bothNum ? an !== en : String(actual) !== String(expected);
      case '>':  return bothNum && an > en;
      case '<':  return bothNum && an < en;
      case '>=': return bothNum && an >= en;
      case '<=': return bothNum && an <= en;
      default:   return false;
    }
  }

  function matchRule(rule, metrics) {
    if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0) return false;
    // 全部条件 AND（V1 只支持 AND，组合开关为后续保留）
    return rule.conditions.every(function (c) {
      var actual = metrics ? metrics[c.f] : undefined;
      // 字段缺失：数值视为 0，数组视为空
      if (actual === undefined) {
        actual = /count|rate|years|days|appearance|class|deficiencies|ratio|hours/i.test(c.f) ? 0 : '';
      }
      return compare(actual, c.op, c.v);
    });
  }

  // 把命中规则展开为 hits + dims 聚合
  function evalShip(ship, rules) {
    var allRules = rules || loadRulesFromStorage() || [];
    var metrics = (ship && ship.metrics) || {};
    var hits = [];
    var hasVeto = false;
    var totalScore = 0;

    allRules.forEach(function (r) {
      if (r.status !== 'active') return;
      if (!matchRule(r, metrics)) return;
      var score = (Number(r.base) || 0) * (Number(r.weight) || 0);
      totalScore += score;
      if (r.veto) hasVeto = true;
      hits.push({
        id: r.id,
        name: r.name,
        dim: r.dim,
        weight: Number(r.weight) || 0,
        base: Number(r.base) || 0,
        score: Math.round(score * 10) / 10,
        veto: !!r.veto,
        reason: explainHit(r, metrics),
        source: r.dim + ' · 规则库 ' + (r.updated || ''),
      });
    });

    // 按分数从高到低排序
    hits.sort(function (a, b) {
      if (a.veto !== b.veto) return a.veto ? -1 : 1;
      return b.score - a.score;
    });

    var rounded = Math.round(totalScore);
    var level = hasVeto ? '高' : (rounded >= 60 ? '高' : rounded >= 35 ? '中' : '低');

    // 维度聚合（用于 dims 区块）
    var byKey = {};
    hits.forEach(function (h) {
      var meta = DIM_META[h.dim] || { k: 'other', bg: '#F1F5F9', fg: '#64748b', max: 10, label: h.dim };
      var k = meta.k;
      if (!byKey[k]) {
        byKey[k] = {
          k: k, name: meta.label, bg: meta.bg, fg: meta.fg, max: meta.max,
          score: 0, notes: [],
        };
      }
      byKey[k].score = Math.round((byKey[k].score + h.score) * 10) / 10;
      byKey[k].notes.push(h.name);
    });
    var dims = Object.keys(byKey).map(function (k) {
      var d = byKey[k];
      return { k: d.k, name: d.name, bg: d.bg, fg: d.fg, max: d.max, score: Math.min(d.score, d.max), note: d.notes.slice(0, 2).join(' · ') };
    });

    return {
      score: rounded,
      level: level,
      veto: hasVeto,
      hits: hits,
      dims: dims,
      ruleCount: allRules.length,
      activeCount: allRules.filter(function (r) { return r.status === 'active'; }).length,
    };
  }

  // 把命中规则中关键的命中条件转成可读文案
  function explainHit(rule, metrics) {
    if (!rule.conditions || rule.conditions.length === 0) return rule.name;
    return rule.conditions.map(function (c) {
      var raw = metrics ? metrics[c.f] : undefined;
      var v = (raw === undefined || raw === null || raw === '') ? '—' :
              (Array.isArray(raw) ? raw.join(',') : String(raw));
      return c.f + ' ' + c.op + ' ' + c.v + '（实测 ' + v + '）';
    }).join(' · ');
  }

  window.RuleEngine = {
    evalShip: evalShip,
    loadRulesFromStorage: loadRulesFromStorage,

    // ===== 新增：数据源适配与 PlanStore 对接 =====

    // 外部数据源注册表
    _sources: {},

    /**
     * 注册外部数据源（如 PSC 数据库、船员证书系统等）
     * fn(planRow) => Promise<metricsPartials> 或 metricsPartials
     * 例如：RuleEngine.registerSource('psc', row => fetch('/api/psc/'+row.shipName).then(...))
     */
    registerSource: function (name, fn) {
      this._sources[name] = fn;
    },

    /**
     * 从 PlanStore 行构建 metrics 对象
     * 策略：
     *   - 优先从已注册的外部数据源拉取
     *   - 再从 PlanStore 历史出现次数推算 AIS.appearance_6m
     *   - 其余字段按船舶类型/货物种类推断合理默认值
     */
    buildMetrics: function (planRow) {
      var m = {
        // PSC 历史（默认无滞留记录，待外部数据源覆盖）
        'PSC.detention_count_3y': 0,
        'PSC.open_deficiencies': 0,
        // 船员配员（默认符合，待外部数据源覆盖）
        'crew.compliance_rate': 100,
        'crew.missing_rank': [],
        'crew.non_english_ratio': 0,
        // 船龄/技术（默认 10 年，待外部数据源覆盖）
        'vessel.age_years': 10,
        'vessel.flag_state': 'CN',
        // 证书（默认 365 天）
        'cert.days_to_expire': 365,
        // AIS 6月出现次数（关键：从 PlanStore 历史记录推算）
        'AIS.appearance_6m': 0,
        // 货种/危险品
        'cargo.imdg_class': null,
        'cargo.un_code': '',
        // DG-MSA-2603 报告合规（提前报告小时数，默认 999 = 合规）
        'report.hours_before_eta': 999,
      };

      // 从 PlanStore 推算 AIS 6月出现次数（同船名历史记录越多→风险越低）
      if (window.PlanStore) {
        try {
          var allPlans = PlanStore.getAll();
          var shipName = (planRow.shipName || planRow['船名'] || '').trim();
          var captain  = (planRow.captain  || planRow['船长姓名'] || '').trim();
          var appearances = 0;
          allPlans.forEach(function (p) {
            if (p.shipName === shipName || (captain && p.captain === captain)) {
              appearances++;
            }
          });
          m['AIS.appearance_6m'] = Math.max(0, appearances - 1); // 减去本次入库
        } catch (e) {}
      }

      // 按船舶类型推断危险品等级
      var shipType = (planRow.shipType || planRow['船舶类型'] || '').toLowerCase();
      var cargo    = (planRow.cargo    || planRow['货物种类'] || '').toLowerCase();
      if (/油|tanker/.test(shipType) || /原油|成品油|柴油|汽油/.test(cargo)) {
        m['cargo.imdg_class'] = 3;
      } else if (/化学|chem/.test(shipType) || /化学/.test(cargo)) {
        m['cargo.imdg_class'] = 3;
      } else if (/液化|lng|lpg|气/.test(shipType) || /液化/.test(cargo)) {
        m['cargo.imdg_class'] = 2;
      }

      // 按船型推断船龄默认值（老旧船型默认较高）
      if (/散货|bulk/.test(shipType))       m['vessel.age_years'] = 12;
      else if (/油|tanker/.test(shipType))  m['vessel.age_years'] = 14;
      else if (/化学|chem/.test(shipType))  m['vessel.age_years'] = 11;
      else if (/集装箱|container/.test(shipType)) m['vessel.age_years'] = 9;
      else if (/客|passenger|滚装/.test(shipType)) m['vessel.age_years'] = 8;

      // ===== DG-MSA-2603 报告合规性计算 =====
      // 计算报告时间(ingestAt)与进港时间(eta)的小时差
      // < 24h = 逾期报告，触发风险规则
      var ingestAt = planRow.ingestAt || planRow['入库时间'] || '';
      var etaRaw   = planRow.eta || planRow['进港时间'] || '';
      if (ingestAt && etaRaw) {
        var ingestTs = new Date(ingestAt).getTime();
        // 尝试解析 ETA（支持 "2026-05-12 15:40" 或 ISO 格式）
        var etaStr = String(etaRaw).replace(/[年月]/g, '-').replace(/[日]/g, ' ').trim();
        var etaTs = new Date(etaStr).getTime();
        if (!isNaN(ingestTs) && !isNaN(etaTs) && etaTs > ingestTs) {
          m['report.hours_before_eta'] = Math.round((etaTs - ingestTs) / 3600000 * 10) / 10;
        } else if (!isNaN(ingestTs) && !isNaN(etaTs) && etaTs <= ingestTs) {
          // 报告时间晚于 ETA，严重逾期
          m['report.hours_before_eta'] = 0;
        }
      }
      // 如果没有 ingestAt，取当前时间作为报告时间计算
      else if (etaRaw) {
        var nowTs = Date.now();
        var etaStr2 = String(etaRaw).replace(/[年月]/g, '-').replace(/[日]/g, ' ').trim();
        var etaTs2 = new Date(etaStr2).getTime();
        if (!isNaN(etaTs2) && etaTs2 > nowTs) {
          m['report.hours_before_eta'] = Math.round((etaTs2 - nowTs) / 3600000 * 10) / 10;
        } else {
          m['report.hours_before_eta'] = 0;
        }
      }

      // 调用已注册的外部数据源（同步部分）
      var self = this;
      Object.keys(this._sources).forEach(function (name) {
        try {
          var extra = self._sources[name](planRow);
          // 支持同步返回或 Promise（异步结果会在 evalPlanRowAsync 中处理）
          if (extra && typeof extra.then !== 'function') {
            Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
          }
        } catch (e) {}
      });

      return m;
    },

    /**
     * 对 PlanStore 的一条记录执行规则评估（同步版）
     * 返回：{ score, level, veto, hits, dims, ship:{...} }
     */
    evalPlanRow: function (planRow) {
      var metrics = this.buildMetrics(planRow);
      var fakeShip = {
        name:   planRow.shipName || planRow['船名'] || '',
        metrics: metrics,
      };
      var result = evalShip(fakeShip);
      result.ship = {
        name:    fakeShip.name,
        captain: planRow.captain || planRow['船长姓名'] || '',
        gt:      planRow.gt || planRow['船舶总吨'] || '',
        berth:   planRow.berth || planRow['靠泊码头'] || '',
        shipType: planRow.shipType || planRow['船舶类型'] || '',
        eta:     planRow.eta || planRow['进港时间'] || '',
        etd:     planRow.etd || planRow['离港时间'] || '',
      };
      return result;
    },

    /**
     * 批量评估 PlanStore 中所有船舶（今日）
     * 返回：[ { score, level, veto, hits, dims, ship } ... ]
     */
    evalAllPlans: function (dateStr) {
      if (!window.PlanStore) return [];
      var all = PlanStore.getAll();
      var today = dateStr || new Date().toISOString().slice(0, 10);
      // 可选过滤：仅今日入库
      var target = all.filter(function (p) {
        return !dateStr || (p.ingestAt && p.ingestAt.slice(0, 10) === today);
      });
      // 去重（同名船长只取最新一次）
      var seen = {};
      var unique = [];
      target.forEach(function (p) {
        var key = (p.shipName || '') + '|' + (p.captain || '');
        if (!seen[key]) { seen[key] = true; unique.push(p); }
      });
      var self = this;
      return unique.map(function (row) {
        return self.evalPlanRow(row);
      });
    },

    /**
     * 数据源连接状态（调试用）
     */
    getSourceStatus: function () {
      return {
        sources: Object.keys(this._sources),
        planStore: !!window.PlanStore,
        rulesInStorage: (loadRulesFromStorage() || []).length,
      };
    },
  };
})();
