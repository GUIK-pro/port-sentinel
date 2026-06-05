# DESIGN.md — 首靠船风险识别系统 设计规范 V1.0

> **品牌定名**：HARBOR SENTINEL · 港哨  
> **适用**：东莞海事局 · 首靠船风险识别平台（面向执法人员内部监管系统）

---

## 1. 品牌基调（Design Language）

| 维度 | 选择 | 理由 |
|:---|:---|:---|
| **性格** | 严肃 · 数据驱动 · 海事权威 | 政务监管系统，需可信、可读、可追溯 |
| **灵感源** | 控制中心仪表盘 × 编辑型信息图 × 海图 | 拒绝 SaaS 化"Dashboard 甜腻感" |
| **禁用** | 神经紫渐变、霓虹光晕、纯黑、Inter、3列卡片重复、emoji | AI-slop 信号，降低专业感 |

---

## 2. 色板（Palette — Calibrated, Single-Accent）

### 中性轴（Zinc/Slate 冷中性）
| Token | HEX | 用途 |
|:---|:---|:---|
| `--bg-base` | `#f7f8fa` | 全局底色（非纯白，降低疲劳） |
| `--bg-card` | `#ffffff` | 卡片 / 容器底 |
| `--bg-elevated` | `#fafbfc` | 浮层背景 |
| `--border-hair` | `rgba(15,23,42,0.06)` | 1px 发丝线 |
| `--border-soft` | `rgba(15,23,42,0.10)` | 分组线 |
| `--text-primary` | `#0b1220` | 标题（Off-black，禁用 #000） |
| `--text-secondary` | `#475569` | 正文 |
| `--text-tertiary` | `#94a3b8` | 辅助 / 占位 |

### 品牌主色（Naval Deep + Electric Teal）
| Token | HEX | 用途 |
|:---|:---|:---|
| `--brand-deep` | `#0a1f44` | 品牌深蓝（Logo/ 顶栏 / 按钮） |
| `--brand-ink` | `#142c5c` | 深蓝次级 |
| `--accent` | `#00A896` | 电青（CTA / 选中态 / 链接） |
| `--accent-soft` | `#E6F7F4` | Accent 浅背景 |

### 风险语义色（Traffic Light · Desaturated）
| Token | HEX | 用途 |
|:---|:---|:---|
| `--risk-low` | `#059669` | 🟢 低风险（Emerald，非草绿） |
| `--risk-mid` | `#D97706` | 🟡 中风险（Amber，非亮黄） |
| `--risk-high` | `#DC2626` | 🔴 高风险（Rose，非血红） |
| `--risk-veto` | `#7F1D1D` | ⚫ 一票否决提醒（Dark Rose） |

> **禁用**：`#FF0000`、`#00FF00`、任何 >80% 饱和度的纯色。

---

## 3. 字体（Typography — Dashboard-Grade）

| 用途 | 字体栈 | 规则 |
|:---|:---|:---|
| **显示 / 标题** | `"Geist", "HarmonyOS Sans SC", "PingFang SC", sans-serif` | `tracking-tight` / `leading-none` |
| **正文** | `"Geist", "HarmonyOS Sans SC", "PingFang SC", sans-serif` | `leading-relaxed` / `max-w-[65ch]` |
| **数字 / 代码** | `"Geist Mono", "JetBrains Mono", ui-monospace` | **所有 KPI、IMO、MMSI、分值必须 Mono** |

**字号阶（Type Scale）**：
```
display-lg: 48px / 52px / -0.02em    页面级主标题
display-md: 36px / 40px / -0.02em    区域标题
title-lg:   22px / 28px / -0.01em    卡片标题
title-md:   16px / 22px              次级标题
body:       14px / 22px              正文
caption:    12px / 16px / +0.02em    标签 / 辅助（小字 +tracking）
mono-kpi:   32px / 36px Mono          KPI 大数字
mono-sm:    12px / 16px Mono          IMO / MMSI / 分值
```

**严格禁用**：Serif 字体、Inter、oversized H1（≥72px）、文字渐变。

---

## 4. 栅格与空间（Layout System）

### 栅格
- 最大容器宽：`max-w-[1440px]`，外边距 `px-6 md:px-10`
- 栅格：12 列，`gap-6`（24px）
- **Bento 2.0 改良**：Row 1 = 4 列等分 KPI；Row 2 = 8+4 分割；Row 3 = 4+4+4

### 间距阶（Spacing Scale）
```
xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · 2xl 48 · 3xl 72
```

### 容器形态
- **大容器圆角**：`rounded-[20px]`
- **按钮圆角**：`rounded-[10px]`
- **标签圆角**：`rounded-[6px]`
- **圆形指示**：`rounded-full`（8px / 10px 直径 dot）

### 阴影（Diffusion Shadow Only）
```css
--shadow-card:   0 1px 2px rgba(11,18,32,0.04), 0 16px 32px -18px rgba(11,18,32,0.08);
--shadow-modal:  0 24px 56px -20px rgba(11,18,32,0.18);
--shadow-inset:  inset 0 1px 0 rgba(255,255,255,0.6);
```

禁止：neon glow、>40px blur、box-shadow text。

---

## 5. 组件规范（Component Specs）

### 5.1 顶栏（App Bar）
- 高 `64px`，固定 `sticky top-0 z-40`
- 背景 `#0a1f44`（品牌深蓝），文字 `#f7f8fa`
- 左：Logo 标（6字"东莞海事·港哨"）+ 系统版本 tag
- 中：全局查询（IMO / MMSI / 船名 / 船长，tab 切换字段）
- 右：通知铃铛（高风险告警 breathing dot）· 用户胶囊

### 5.2 侧栏导航（Rail Nav）
- 宽 `72px`（图标模式），悬停展开 `240px`
- 一级入口：首页（仪表板）/ 风险查询 / 日报看板 / 规则库 / Nanobot / 归档
- 选中态：左侧 3px Accent 色描边 + 图标填充

### 5.3 数据卡（Data Card）
- 容器：`bg-white rounded-[20px] border border-[rgba(15,23,42,0.06)] p-7`
- 标题：`title-lg` + 右上角 `action` 区
- **VISUAL_DENSITY=7**：数据行用 `divide-y` 代替嵌套卡

### 5.4 风险等级徽章（Risk Badge）
```
🟢 低风险  bg: #ECFDF5  text: #059669  border: #A7F3D0
🟡 中风险  bg: #FFFBEB  text: #B45309  border: #FCD34D
🔴 高风险  bg: #FEF2F2  text: #B91C1C  border: #FCA5A5
⚫ 否决   bg: #450A0A  text: #FECACA  border: transparent
```
形态：`rounded-[6px] px-2.5 py-1 text-[12px] font-medium tracking-wide uppercase`

### 5.5 KPI 数据块（不加卡框）
- 纯 divide-x / border-t，数字 Mono 字体 32px，标签 caption 灰色
- 趋势箭头：▲ `#059669` / ▼ `#DC2626`（SVG 而非 emoji）

### 5.6 表格（Table）
- 行高 `48px`，表头 `uppercase tracking-wide` + 灰度文字
- 奇偶条纹**禁用**，改用 hover `bg-slate-50`
- 排序指示器：双箭头 SVG，选中变深蓝

### 5.7 按钮（Button）
```
Primary:    bg:#0a1f44  text:#fff  hover: ink / active: -translate-y-[1px]
Accent:     bg:#00A896  text:#fff
Ghost:      border:#0a1f44/15%  text:#0a1f44
Danger:     bg:#DC2626  text:#fff
```
高度 `40px`，字号 14，圆角 10，`transition-all duration-200 cubic-bezier(0.16,1,0.3,1)`

---

## 6. 动效规范（Motion · Restrained）

| 场景 | 动效 | 时长 / 缓动 |
|:---|:---|:---|
| 页面切换 | 8px 下入 + 透明度 | 320ms `cubic-bezier(0.16,1,0.3,1)` |
| 卡片进场 | `stagger` 80ms 序列 | 同上 |
| 新增高风险船只（实时） | breathing dot + 柔光波纹 | 2.4s 无限 |
| KPI 数字 | tween 计数动画 | 600ms ease-out |
| 按钮 active | `-translate-y-[1px] scale-[0.99]` | 120ms |

**禁用**：bouncy overshoot >=10%、parallax、cursor trail、自定义 cursor、magnetic button（政务系统不适用）。

---

## 7. 图表规范（Charts — ECharts Only）

- 配色：Naval Deep `#0a1f44` 主 / Accent Teal `#00A896` 辅 / 风险三色
- 背景：`transparent`
- 网格线：`rgba(15,23,42,0.06)` dash
- 字体：图表字体与 UI 一致
- **雷达图**（风险四维）：半径 125，显示分值标签 Mono
- **仪表盘**（风险总分 0-120）：宽带，带 tick，指针 Deep Navy
- **环形图**（等级分布）：内外半径 70/95，中心 KPI 数字 Mono

---

## 8. 信息层级（Info Hierarchy · Dashboard Cockpit）

1. **优先层级**：高风险告警 > 当日首靠船数 > 查询入口 > 历史趋势
2. **视觉重量**：色彩承载风险，字体承载数据，位置承载优先级
3. **FBI 原则**：F(首屏)→B(一层下滚)→I(详情钻取)

---

## 9. 无障碍（A11y）

- 所有可交互元素最小点击区 `44×44px`
- 文字最小 12px，对比度 AA 4.5:1
- 禁止纯色彩传达状态，必须配图标 + 文案

---

## 10. 技术落地栈

- **原型 / MVP**：原生 HTML + TailwindCSS CDN + Alpine.js + ECharts（与现有 `首靠船风险报告.html` 保持一致，海事内网直接部署）
- **升级路径**：后续可封装为 Next.js 15 + React 19 + Tailwind v4 + shadcn/ui（需自定义圆角/色板）

---

> 本规范随系统迭代而演进。所有新增页面 / 组件**必须**引用本文档的 tokens，禁止随意新增色值、圆角与阴影。
