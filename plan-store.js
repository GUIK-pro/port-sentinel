/* ============================================================
 * plan-store.js — 东莞首靠船识别助手 · 进出港计划滚动库
 * ============================================================
 * 基于 localStorage 的进出港计划数据持久层
 *
 * 数据结构：
 *   dgmsa_plans   — 近6月滚动库（Array<PlanRow>）
 *   dgmsa_uploads — 上传历史记录（Array<UploadRecord>）
 *   dgmsa_archive — 超6月归档库（Array<PlanRow>）
 *
 * 首靠判定依据（四字段联合比对）：
 *   船名 + 船舶总吨 + 船长姓名 + 联系方式
 *   任一未匹配 → 视为首靠
 *
 * 暴露 API：
 *   window.PlanStore.ingest(rows)          写入滚动库（去重覆盖）→ {ingested,updated,skipped,total,firstCall,saved}
 *   window.PlanStore.getAll()              获取全部在库数据
 *   window.PlanStore.getStats()            获取统计（KPI）
 *   window.PlanStore.isFirstCall(row)      首靠判定（四字段联合）
 *   window.PlanStore.addUploadRecord(rec)  添加上传记录
 *   window.PlanStore.getUploadHistory()    获取上传历史
 *   window.PlanStore.archive()             归档超6月数据至 dgmsa_archive
 *   window.PlanStore.sigKey(row)           生成四字段联合签名Key
 *   window.PlanStore.seed()               初始化种子数据（库为空时）
 * ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY_PLANS   = 'dgmsa_plans';
  var STORAGE_KEY_UPLOADS = 'dgmsa_uploads';
  var SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~180天
  var STORAGE_KEY_ARCHIVE = 'dgmsa_archive';

  // ============ 存储工具 ============
  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[PlanStore] localStorage 写入失败', e);
      return false;
    }
  }

  // ============ 生成签名Key（四字段联合） ============
  function sigKey(row) {
    var name    = String(row.shipName || row['船名'] || '').trim();
    var gt      = String(row.gt || row['船舶总吨'] || '').replace(/[^\d]/g, '');
    var captain = String(row.captain || row['船长姓名'] || '').trim();
    var phone   = String(row.phone || row['联系方式'] || '').replace(/[\s\-]/g, '');
    return name + '|' + gt + '|' + captain + '|' + phone;
  }

  // ============ 首靠判定 ============
  function isFirstCall(row) {
    var plans = load(STORAGE_KEY_PLANS);
    var key = sigKey(row);
    // 四字段完全匹配才视为"非首靠"
    for (var i = 0; i < plans.length; i++) {
      if (sigKey(plans[i]) === key) return false;
    }
    // 再与 SHIP_LIST mock 数据比对（四字段联合；SHIP_LIST 缺字段时降级为名+船长）
    if (global.SHIP_LIST) {
      var name    = String(row.shipName || row['船名'] || '').trim();
      var gt      = String(row.gt || row['船舶总吨'] || '').replace(/[^\d]/g, '');
      var captain = String(row.captain || row['船长姓名'] || '').trim();
      var phone   = String(row.phone || row['联系方式'] || '').replace(/[\s\-]/g, '');
      for (var j = 0; j < global.SHIP_LIST.length; j++) {
        var s = global.SHIP_LIST[j];
        if (s.name === name && s.captain === captain) {
          // SHIP_LIST 有 gt/phone 时进行四字段比对，缺字段则降级为名+船长
          var sGt    = s.gt    ? String(s.gt).replace(/[^\d]/g, '') : '';
          var sPhone = s.phone ? String(s.phone).replace(/[\s\-]/g, '') : '';
          if ((!sGt || sGt === gt) && (!sPhone || sPhone === phone)) return false;
        }
      }
    }
    return true;
  }

  // ============ 生成行内容指纹（用于内容级去重） ============
  function contentHash(row) {
    var fields = ['shipName','船名','gt','船舶总吨','captain','船长姓名','phone','联系方式',
                  'berth','靠泊码头','shipType','船舶类型','eta','进港时间','etd','离港时间',
                  'date','日期',
                  'maxLength','船舶最大长度','cargo','货物种类','cargoQty','货物数量','bridge','航经水道及最低桥梁'];
    var parts = [];
    for (var i = 0; i < fields.length; i++) {
      var v = row[fields[i]];
      if (v !== undefined && v !== null && v !== '') parts.push(fields[i] + ':' + String(v).trim());
    }
    return parts.join('|');
  }

  // ============ 批量入库（去重 + 覆盖更新） ============
  function ingest(rows) {
    if (!rows || !rows.length) return { ingested: 0, updated: 0, skipped: 0, firstCall: 0, saved: true };
    var plans = load(STORAGE_KEY_PLANS);
    var index = {};
    plans.forEach(function (p, i) { index[sigKey(p)] = i; });

    // 构建已有记录的内容指纹集合（用于完全重复检测）
    var existingHashes = {};
    plans.forEach(function (p) { existingHashes[contentHash(p)] = true; });

    var ingested = 0, updated = 0, skipped = 0, firstCallCount = 0;
    var now = new Date().toISOString();
    // 同批次内去重（同一文件多行内容完全一致只保留一条）
    var batchHashes = {};

    rows.forEach(function (row) {
      var key = sigKey(row);
      var record = {
        shipName:   row.shipName || row['船名'] || '',
        gt:         row.gt || row['船舶总吨'] || '',
        captain:    row.captain || row['船长姓名'] || '',
        phone:      row.phone || row['联系方式'] || '',
        berth:      row.berth || row['靠泊码头'] || '',
        shipType:   row.shipType || row['船舶类型'] || '',
        eta:        row.eta || row['进港时间'] || '',
        etd:        row.etd || row['离港时间'] || '',
        date:       row.date || row['日期'] || '',
        maxLength:  row.maxLength || row['船舶最大长度'] || '',
        cargo:      row.cargo || row['货物种类'] || '',
        cargoQty:   row.cargoQty || row['货物数量'] || '',
        bridge:     row.bridge || row['航经水道及最低桥梁'] || '',
        ingestAt:   now,
      };

      // 内容级去重：与库内已有记录完全一致则跳过
      var hash = contentHash(record);
      if (existingHashes[hash]) {
        skipped++;
        return;
      }
      // 同批次内去重：同一文件内完全重复的行只保留一条
      if (batchHashes[hash]) {
        skipped++;
        return;
      }
      batchHashes[hash] = true;

      if (index.hasOwnProperty(key)) {
        // 同船不同内容 → 覆盖更新，保留原始 ingestAt（首次入库时间不变）
        record.ingestAt = plans[index[key]].ingestAt || now;
        plans[index[key]] = record;
        existingHashes[hash] = true;
        updated++;
      } else {
        // 新船入库，判定首靠（sigKey 不在 index 已证明库内无历史，仅需检查 SHIP_LIST）
        var isFC = true;
        if (global.SHIP_LIST) {
          var fcName    = String(record.shipName).trim();
          var fcGt      = String(record.gt).replace(/[^\d]/g, '');
          var fcCaptain = String(record.captain).trim();
          var fcPhone   = String(record.phone).replace(/[\s\-]/g, '');
          for (var j = 0; j < global.SHIP_LIST.length; j++) {
            var sl = global.SHIP_LIST[j];
            if (sl.name === fcName && sl.captain === fcCaptain) {
              var slGt    = sl.gt    ? String(sl.gt).replace(/[^\d]/g, '') : '';
              var slPhone = sl.phone ? String(sl.phone).replace(/[\s\-]/g, '') : '';
              if ((!slGt || slGt === fcGt) && (!slPhone || slPhone === fcPhone)) { isFC = false; break; }
            }
          }
        }
        if (isFC) firstCallCount++;
        plans.push(record);
        index[key] = plans.length - 1;
        existingHashes[hash] = true;
        ingested++;
      }
    });

    var saved = save(STORAGE_KEY_PLANS, plans);
    return { ingested: ingested, updated: updated, skipped: skipped, total: plans.length, firstCall: firstCallCount, saved: saved };
  }

  // ============ 获取全部在库数据 ============
  function getAll() {
    return load(STORAGE_KEY_PLANS);
  }

  // ============ 获取统计 ============
  function getStats() {
    var plans = load(STORAGE_KEY_PLANS);
    var uploads = load(STORAGE_KEY_UPLOADS);
    var _t = new Date();
    var _p = function (n) { return String(n).padStart(2, '0'); };
    var today = _t.getFullYear() + '-' + _p(_t.getMonth() + 1) + '-' + _p(_t.getDate());

    // 今日上传行数
    var todayRows = 0;
    uploads.forEach(function (u) {
      if (u.time && u.time.slice(0, 10) === today) {
        todayRows += (u.rows || 0);
      }
    });

    // 今日首靠（简化：统计 uploads 中 firstCall 累加）
    var todayFirstCall = 0;
    uploads.forEach(function (u) {
      if (u.time && u.time.slice(0, 10) === today) {
        todayFirstCall += (u.firstCall || 0);
      }
    });

    // 待处理异常
    var todayPending = 0;
    uploads.forEach(function (u) {
      if (u.time && u.time.slice(0, 10) === today) {
        todayPending += (u.pending || 0);
      }
    });

    return {
      totalInStore: plans.length,
      todayRows: todayRows,
      todayFirstCall: todayFirstCall,
      todayPending: todayPending,
      uploadCount: uploads.length,
    };
  }

  // ============ 添加上传记录 ============
  function addUploadRecord(rec) {
    var uploads = load(STORAGE_KEY_UPLOADS);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var t = new Date();
    var record = {
      id: Date.now(),
      file: rec.file || '',
      time: t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()),
      user: rec.user || '',
      rows: rec.rows || 0,
      firstCall: rec.firstCall || 0,
      pending: rec.pending || 0,
      status: (rec.pending > 0) ? 'warn' : 'ok',
      note: (rec.pending > 0) ? (rec.pending + ' 行待修正') : '全部入库',
    };
    uploads.unshift(record); // 最新在前
    // 只保留最近 100 条
    if (uploads.length > 100) uploads = uploads.slice(0, 100);
    save(STORAGE_KEY_UPLOADS, uploads);
    return record;
  }

  // ============ 获取上传历史 ============
  function getUploadHistory(limit) {
    var uploads = load(STORAGE_KEY_UPLOADS);
    return uploads.slice(0, limit || 10);
  }

  // ============ 归档超6月数据 ============
  function archive() {
    var plans = load(STORAGE_KEY_PLANS);
    var cutoff = new Date(Date.now() - SIX_MONTHS_MS).toISOString();
    var kept = [];
    var toArchive = [];
    plans.forEach(function (p) {
      // ingestAt 不存在时降级使用 eta/date 作为时间基准，避免无时间戳记录永久保留
      var anchor = p.ingestAt || p.eta || p.date || '';
      if (anchor && anchor < cutoff) {
        toArchive.push(p);
      } else {
        kept.push(p);
      }
    });
    // 将归档记录转存至 dgmsa_archive（追加模式，不丢失历史）
    if (toArchive.length > 0) {
      var oldArchive = load(STORAGE_KEY_ARCHIVE);
      save(STORAGE_KEY_ARCHIVE, oldArchive.concat(toArchive));
    }
    save(STORAGE_KEY_PLANS, kept);
    return { archived: toArchive.length, remaining: kept.length };
  }

  // ============ 初始化种子数据（如果库为空） ============
  function seed() {
    var plans = load(STORAGE_KEY_PLANS);
    if (plans.length > 0) return; // 已有数据不重复播种

    var pad = function(n){ return String(n).padStart(2,'0'); };
    var fmtDate = function(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
    var fmtTime = function(d,h,m){ return fmtDate(d)+' '+pad(h)+':'+pad(m); };
    var daysAgo = function(n){ return new Date(Date.now() - n*86400000); };

    // 丰富的 Mock 船舶数据（近6个月滚动库）
    var mockShips = [
      { shipName:'粤东莞货2001', gt:'8620', captain:'陈海川', phone:'13800138001', berth:'沙田港 3 号泊位', shipType:'集装箱船', cargo:'电子产品', cargoQty:'1200T', bridge:'虎门大桥', maxLength:'148m' },
      { shipName:'浙海运油19', gt:'12480', captain:'林建峰', phone:'13900139002', berth:'立沙岛 2 号', shipType:'油轮', cargo:'重质燃料油', cargoQty:'5800T', bridge:'虎门大桥', maxLength:'168m' },
      { shipName:'粤穗化工8', gt:'6280', captain:'黄志诚', phone:'13700137003', berth:'立沙岛 1 号', shipType:'化学品船', cargo:'苯乙烯', cargoQty:'3200T', bridge:'虎门大桥', maxLength:'126m' },
      { shipName:'闽安达7', gt:'9850', captain:'张明辉', phone:'13600136004', berth:'麻涌港 A 泊位', shipType:'散货船', cargo:'煤炭', cargoQty:'8600T', bridge:'不适用', maxLength:'156m' },
      { shipName:'粤深蓝118', gt:'4560', captain:'郑伟强', phone:'13500135005', berth:'虎门客运码头', shipType:'客滚船', cargo:'旅客/车辆', cargoQty:'—', bridge:'虎门大桥', maxLength:'112m' },
      { shipName:'粤东莞货3032', gt:'7320', captain:'刘志坚', phone:'13400134006', berth:'沙田港 5 号', shipType:'集装箱船', cargo:'五金制品', cargoQty:'2100T', bridge:'虎门大桥', maxLength:'142m' },
      { shipName:'粤新港货88', gt:'5980', captain:'吴海涛', phone:'13300133007', berth:'新沙港 B 区', shipType:'杂货船', cargo:'钢材', cargoQty:'4500T', bridge:'不适用', maxLength:'130m' },
      { shipName:'沪远洋18', gt:'15800', captain:'周建国', phone:'13200132008', berth:'沙田港 1 号泊位', shipType:'集装箱船', cargo:'机械设备', cargoQty:'6200T', bridge:'虎门大桥', maxLength:'185m' },
      { shipName:'桂平南油6', gt:'3850', captain:'覃文斌', phone:'13100131009', berth:'立沙岛 3 号', shipType:'油轮', cargo:'柴油', cargoQty:'2800T', bridge:'虎门大桥', maxLength:'98m' },
      { shipName:'苏连云港化12', gt:'5420', captain:'王德明', phone:'13000130010', berth:'麻涌港 B 泊位', shipType:'化学品船', cargo:'甲醇', cargoQty:'3100T', bridge:'不适用', maxLength:'118m' },
      { shipName:'粤莞砂288', gt:'2680', captain:'何志强', phone:'13811138011', berth:'新沙港 C 区', shipType:'散货船', cargo:'河砂', cargoQty:'5200T', bridge:'不适用', maxLength:'88m' },
      { shipName:'鲁青岛货206', gt:'11200', captain:'孙鹏飞', phone:'13822138012', berth:'沙田港 2 号泊位', shipType:'集装箱船', cargo:'纺织品', cargoQty:'3800T', bridge:'虎门大桥', maxLength:'172m' },
      { shipName:'粤珠散16', gt:'7650', captain:'陈锦明', phone:'13833138013', berth:'麻涌港 C 泊位', shipType:'散货船', cargo:'粮食', cargoQty:'6100T', bridge:'不适用', maxLength:'148m' },
      { shipName:'琼海油108', gt:'9200', captain:'李明达', phone:'13844138014', berth:'立沙岛 4 号', shipType:'油轮', cargo:'汽油', cargoQty:'4200T', bridge:'虎门大桥', maxLength:'155m' },
      { shipName:'粤穗拖68', gt:'980', captain:'黄耀辉', phone:'13855138015', berth:'沙田港拖轮码头', shipType:'拖轮', cargo:'—', cargoQty:'—', bridge:'不适用', maxLength:'42m' },
      { shipName:'闽鹭化17', gt:'4850', captain:'陈建文', phone:'13866138016', berth:'立沙岛 5 号', shipType:'化学品船', cargo:'丙酮', cargoQty:'2600T', bridge:'虎门大桥', maxLength:'110m' },
      { shipName:'浙甬货2688', gt:'8900', captain:'林忠华', phone:'13877138017', berth:'新沙港 A 区', shipType:'杂货船', cargo:'纸浆', cargoQty:'3400T', bridge:'不适用', maxLength:'145m' },
      { shipName:'粤东渡98', gt:'3200', captain:'李海强', phone:'13888138018', berth:'虎门客运码头 2 号', shipType:'客滚船', cargo:'旅客/车辆', cargoQty:'—', bridge:'虎门大桥', maxLength:'96m' },
      { shipName:'辽大连油39', gt:'18500', captain:'张海涛', phone:'13899138019', berth:'立沙岛 1 号', shipType:'油轮', cargo:'原油', cargoQty:'12000T', bridge:'虎门大桥', maxLength:'198m' },
      { shipName:'粤莞集301', gt:'6800', captain:'邓志光', phone:'13900139020', berth:'沙田港 4 号泊位', shipType:'集装箱船', cargo:'家电', cargoQty:'2800T', bridge:'虎门大桥', maxLength:'136m' },
      { shipName:'冀唐散28', gt:'13500', captain:'赵国栋', phone:'13911139021', berth:'麻涌港 A 泊位', shipType:'散货船', cargo:'铁矿石', cargoQty:'9800T', bridge:'不适用', maxLength:'178m' },
      { shipName:'粤化运66', gt:'4200', captain:'曾伟林', phone:'13922139022', berth:'立沙岛 2 号', shipType:'化学品船', cargo:'硫酸', cargoQty:'2200T', bridge:'虎门大桥', maxLength:'105m' },
      { shipName:'皖芜湖货188', gt:'5600', captain:'刘安平', phone:'13933139023', berth:'新沙港 B 区', shipType:'杂货船', cargo:'建材', cargoQty:'3800T', bridge:'不适用', maxLength:'122m' },
      { shipName:'鄂武汉散09', gt:'8100', captain:'周志强', phone:'13944139024', berth:'麻涌港 B 泊位', shipType:'散货船', cargo:'水泥', cargoQty:'5600T', bridge:'不适用', maxLength:'152m' },
    ];

    var seedPlans = [];
    // 为每条 mock 船生成1~3条不同时间的记录
    for(var i=0; i<mockShips.length; i++){
      var s = mockShips[i];
      var visitCount = 1 + (i % 3); // 1~3 visits
      for(var v=0; v<visitCount; v++){
        var ago = 3 + Math.floor((i*7 + v*23) % 170); // 3~172 days ago
        var d = daysAgo(ago);
        var h = 6 + (i*3 + v*5) % 16;
        var m = (i*17 + v*13) % 60;
        var eta = fmtTime(d, h, m);
        var etd = fmtTime(d, Math.min(h + 6 + (v % 4), 23), m);
        seedPlans.push({
          shipName: s.shipName,
          gt: s.gt,
          captain: s.captain,
          phone: s.phone,
          berth: s.berth,
          shipType: s.shipType,
          eta: eta,
          etd: etd,
          date: fmtDate(d),
          maxLength: s.maxLength,
          cargo: s.cargo,
          cargoQty: s.cargoQty,
          bridge: s.bridge,
          ingestAt: d.toISOString(),
        });
      }
    }

    // 按时间排序（最新在前）
    seedPlans.sort(function(a,b){ return b.ingestAt.localeCompare(a.ingestAt); });
    save(STORAGE_KEY_PLANS, seedPlans);
  }

  // ============ 暴露 API ============
  global.PlanStore = {
    ingest: ingest,
    getAll: getAll,
    getStats: getStats,
    isFirstCall: isFirstCall,
    addUploadRecord: addUploadRecord,
    getUploadHistory: getUploadHistory,
    archive: archive,
    seed: seed,
    sigKey: sigKey,
  };

  // 页面加载时自动播种（可通过 window.__PLANSTORE_NO_SEED = true 禁用，防止污染生产数据）
  if (!global.__PLANSTORE_NO_SEED) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', seed);
    } else {
      seed();
    }
  }

})(window);
