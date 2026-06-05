/* ============================================================
 * 东莞首靠船识别助手 · 数据源适配层
 * --------------------------------------------------------------
 * 用途：为 RuleEngine 注入外部实时数据源，替代默认值
 *
 * 支持的数据源（待对接）：
 *   1. PSC 数据库 — PSC.detention_count_3y, PSC.open_deficiencies
 *   2. 船员证书系统 — crew.compliance_rate, crew.missing_rank, cert.days_to_expire
 *   3. AIS 数据服务 — AIS.appearance_6m（6个月内船舶出现次数）
 *   4. 货种危险品申报 — cargo.imdg_class, cargo.un_code
 *   5. 船舶登记数据库 — vessel.age_years, vessel.flag_state
 *
 * 使用方法：
 *   <script src="rule-engine.js"></script>
 *   <script src="data-sources.js"></script>  ← 本文件
 *
 * 数据源函数签名：
 *   RuleEngine.registerSource('源名称', function(planRow){
 *     // planRow 为 PlanStore 中的一条记录
 *     // 返回：metrics 对象 或 Promise<metrics 对象>
 *     return { 'PSC.detention_count_3y': 2, ... };
 *   });
 *
 * 开发调试：
 *   RuleEngine.getSourceStatus()  → { sources:[...], planStore:true/false, rulesInStorage:N }
 * ============================================================ */
(function () {
  if (!window.RuleEngine) {
    console.warn('[data-sources] RuleEngine 未加载，请先引入 rule-engine.js');
    return;
  }

  // ============================================================
  //  1. PSC 数据库适配器（示例）
  // --------------------------------------------------------------
  //  当前：Mock 数据（油轮/散货船默认 1 次滞留记录，其他 0）
  //  对接后：fetch('/api/psc/query?shipName=xxx') → { detention_count_3y, open_deficiencies }
  // ============================================================
  RuleEngine.registerSource('psc_mock', function (row) {
    var shipType = (row.shipType || row['船舶类型'] || '').toLowerCase();
    // 油轮/散货船历史滞留率较高（仅为示例）
    var detentionCount = 0;
    if (/油|tanker/.test(shipType))       detentionCount = 1;
    else if (/散货|bulk/.test(shipType))  detentionCount = 1;
    return {
      'PSC.detention_count_3y': detentionCount,
      'PSC.open_deficiencies': 0,
    };
  });

  // ============================================================
  //  2. 船员证书适配器（示例）
  // --------------------------------------------------------------
  //  当前：默认全部符合（100%），证书 365 天
  //  对接后：fetch('/api/crew/certificate?shipName=xxx') → { compliance_rate, missing_rank, days_to_expire }
  // ============================================================
  RuleEngine.registerSource('crew_mock', function (row) {
    // 首靠船（AIS 0 次）默认证书有效期更短（示例逻辑）
    return {
      'crew.compliance_rate': 100,
      'crew.missing_rank': [],
      'cert.days_to_expire': 365,
    };
  });

  // ============================================================
  //  3. AIS 历史数据适配器（基于 PlanStore 推算）
  // --------------------------------------------------------------
  //  当前：从 PlanStore.getAll() 统计同船名历史记录
  //  对接后：fetch('/api/ais/history?shipName=xxx&months=6') → { appearance_6m }
  //  说明：此适配已在 rule-engine.js 的 buildMetrics() 中内联实现，此处仅为接口预留
  // ============================================================
  // 无需额外注册，rule-engine.js 已内联处理

  // ============================================================
  //  4. 货种危险品适配器
  // --------------------------------------------------------------
  //  当前：从船舶类型/货物种类字段推断 IMDG 等级
  //  对接后：fetch('/api/cargo/imdg?shipName=xxx') → { imdg_class, un_code }
  //  说明：此适配已在 rule-engine.js 的 buildMetrics() 中内联实现
  // ============================================================
  // 无需额外注册，rule-engine.js 已内联处理

  // ============================================================
  //  5. 真实 API 对接模板（待启用）
  // --------------------------------------------------------------
  //  取消注释以下代码并替换 API_BASE_URL 为真实地址
  // ============================================================
  /*
  var API_BASE_URL = 'http://your-backend-api:8080/api';

  RuleEngine.registerSource('psc_api', function (row) {
    var shipName = row.shipName || row['船名'] || '';
    return fetch(API_BASE_URL + '/psc/query?shipName=' + encodeURIComponent(shipName))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        return {
          'PSC.detention_count_3y': data.detention_count_3y || 0,
          'PSC.open_deficiencies':  data.open_deficiencies  || 0,
        };
      })
      .catch(function () {
        return { 'PSC.detention_count_3y': 0, 'PSC.open_deficiencies': 0 };
      });
  });

  RuleEngine.registerSource('crew_api', function (row) {
    var shipName = row.shipName || row['船名'] || '';
    return fetch(API_BASE_URL + '/crew/certificate?shipName=' + encodeURIComponent(shipName))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        return {
          'crew.compliance_rate': data.compliance_rate || 100,
          'crew.missing_rank':    data.missing_rank   || [],
          'cert.days_to_expire':  data.days_to_expire || 365,
        };
      })
      .catch(function () { return {}; });
  });

  RuleEngine.registerSource('ais_api', function (row) {
    var shipName = row.shipName || row['船名'] || '';
    return fetch(API_BASE_URL + '/ais/history?shipName=' + encodeURIComponent(shipName) + '&months=6')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        return { 'AIS.appearance_6m': data.appearance_count || 0 };
      })
      .catch(function () { return {}; });
  });
  */

  // ============================================================
  //  异步评估方法（支持 Promise 数据源）
  // --------------------------------------------------------------
  //  RuleEngine.evalPlanRowAsync(planRow)
  //  返回 Promise<{ score, level, veto, hits, dims, ship }>
  // ============================================================
  RuleEngine.evalPlanRowAsync = function (planRow) {
    var self = this;
    // 先获取基础 metrics（同步数据源）
    var metrics = this.buildMetrics(planRow);

    // 收集异步数据源结果
    var asyncPromises = [];
    Object.keys(this._sources).forEach(function (name) {
      try {
        var result = self._sources[name](planRow);
        if (result && typeof result.then === 'function') {
          asyncPromises.push(
            result.then(function (extra) {
              if (extra) Object.keys(extra).forEach(function (k) { metrics[k] = extra[k]; });
            }).catch(function () {})
          );
        }
      } catch (e) {}
    });

    // 等待所有异步数据源完成后再评估
    return Promise.all(asyncPromises).then(function () {
      var fakeShip = {
        name:    planRow.shipName || planRow['船名'] || '',
        metrics: metrics,
      };
      var result = self.evalShip(fakeShip);
      result.ship = {
        name:     fakeShip.name,
        captain:  planRow.captain  || planRow['船长姓名'] || '',
        gt:       planRow.gt       || planRow['船舶总吨'] || '',
        berth:    planRow.berth    || planRow['靠泊码头'] || '',
        shipType: planRow.shipType || planRow['船舶类型'] || '',
        eta:      planRow.eta      || planRow['进港时间'] || '',
        etd:      planRow.etd      || planRow['离港时间'] || '',
      };
      return result;
    });
  };

  console.log('[data-sources] 已注册 Mock 数据源：psc_mock, crew_mock');
  console.log('[data-sources] RuleEngine.getSourceStatus():', RuleEngine.getSourceStatus());
})();
