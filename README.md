# 恋爱纪念站（Liquid Glass）

> 苹果风格液态玻璃恋爱纪念站 — 500 张照片不是陈列，而是一段可游走的时间潮汐。

**在线演示**：直接用浏览器打开 `index.html` 即可运行，无需本地服务器。

---

## 📦 快速开始

1. **克隆仓库**（或直接下载 ZIP 解压）
   ```bash
   git clone https://github.com/<你的用户名>/love.git
   cd love
   ```
2. **打开预览**：直接用浏览器打开 `index.html`。
   - 默认数据会显示 25 张示例照片和 8 张轮播图
   - 替换为你自己的照片数据即可

---

## 📸 照片管理

### 目录结构

```
assets/
├── photos/          ← 旅行照片（按城市/出行次数组织子目录）
│   ├── nanjing1/
│   ├── hongkong1/
│   ├── hangzhou2/
│   └── ...
└── lunbo/           ← 首页轮播图（直接放图片文件）
    ├── 1.png
    ├── 2.png
    └── ...
```

### ① 添加旅行照片

1. 把照片放到 `assets/photos/<城市><数字>/` 目录下
2. 文件名建议格式：`YYYY-MM-DD-描述.jpg`（日期会自动提取）

示例：
```
assets/photos/nanjing1/2025-11-29-梧桐大道.jpg
assets/photos/hongkong1/2025-12-19-维多利亚港.jpg
assets/photos/hangzhou2/2026-01-10-西湖边.jpg
```

3. 运行自动导入脚本：
   ```bash
   node scripts/import-photos.js
   ```

4. **实时监听模式**（放新照片自动重建）：
   ```bash
   node scripts/import-photos.js --watch
   ```

导入规则：
- `date`：优先从文件名识别 `YYYY-MM-DD`，识别不到用文件修改日期
- `place`：按文件夹名识别城市，映射 `data/config.js` 中的中文城市名
- `visit`：按文件夹尾号统计出行次数（`foshan1` → 佛山第1次）
- `title`：从文件名清洗生成，清洗后为空则显示"城市记忆 001"

### ② 添加首页轮播图

1. 把图片放到 `assets/lunbo/` 目录
2. 运行导入脚本：
   ```bash
   node scripts/import-lunbo.js
   ```
3. 文件命名无特殊要求，脚本按字母顺序自动排序

---

## ⚙️ 配置说明

### 在一起日期 & 城市列表

编辑 `data/config.js`：

```js
window.LOVE_CONFIG = {
  startDate: "2025-11-15",    // 在一起开始日期
  targetCount: 500,           // 目标照片数（仅用于 mock 数据）
  navAllLabel: "全部足迹",    // 顶部导航"全部"按钮文案
  places: [
    { id: "hongkong", name: "香港" },
    { id: "nanjing", name: "南京" },
    { id: "hangzhou", name: "杭州" },
    // 新增城市只需在这里追加...
  ]
};
```

### 顶部城市筛选

- 由 `data/config.js` 的 `places` 数组驱动
- **新增城市**：只需在 `places` 里追加一项 `{ id: "城市拼音", name: "城市名" }`
- 不需要改 `index.html` 或 `app.js`

### 首页轮播

- 数据文件：`data/lunbo.js`（由 `node scripts/import-lunbo.js` 自动生成）
- 更新轮播图：把新图片放入 `assets/lunbo/` → 重新运行导入脚本

### 旅行照片

- 数据文件：`data/photos.js`（由 `node scripts/import-photos.js` 自动生成）
- 更新照片：把新照片放入 `assets/photos/` 对应目录 → 重新运行导入脚本

---

## 🎨 视觉自定义

### 主题色 & 背景

编辑 `styles.css` 的 `:root` 变量：

```css
:root {
  --bg-0: #dbe8f7;       /* 主背景色 */
  --ink: #0f1f38;        /* 主文字色 */
  --accent: #57a8ff;     /* 强调色（蓝色） */
  --glass: rgba(255, 255, 255, 0.42);  /* 玻璃底色透明度 */
  --radius-xl: 30px;     /* 大圆角 */
}
```

### 字体

当前使用 Google Fonts 的 `Instrument Serif`（标题）和 `Manrope`（正文），在 `index.html` 的 `<head>` 中引入。

如需更换，修改 `<link>` 标签和 CSS 中的 `font-family`。

### 轮播间隔

编辑 `app.js` 中 `startLunboAuto()` 函数的 `5000`（毫秒）：

```js
function startLunboAuto() {
  lunboTimer = setInterval(() => {
    goLunbo((lunboIndex + 1) % lunboPhotos.length);
  }, 5000);  // ← 修改这里的数字，单位毫秒
}
```

---

## 🚀 部署上线

### 方式一：GitHub Pages（推荐）

1. 把代码推送到 GitHub 仓库
2. 仓库设置 → Pages → Source 选择 `main` 分支
3. 访问 `https://<你的用户名>.github.io/love/`

### 方式二：Vercel / Netlify

- 直接导入仓库，零配置部署

### 方式三：本地局域网分享

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .
```

---

## 📋 功能特性

-  苹果风格液态玻璃 UI
- 🌊 时间潮汐（横向游走，不是陈列）
- 🎬 自动叙事模式（自动滚动浏览）
- 🎲 随机时空对照（抽取相隔最远的两张照片）
- ✨ 首页轮播（自动播放 + 手动切换）
- 📍 城市足迹筛选
- ⏱ 实时在一起计时器
- 💎 对照区块滚动抬升 + 折射扫光
- 🖼 图片懒加载

---

## 💡 最佳实践

- 500 张图建议控制单图在 **1800px 长边以内**
- 格式优先 **WebP / AVIF**（体积小、画质好）
- 封面图尽量统一比例（**3:4 或 4:5**），视觉更稳定
- 轮播图建议统一尺寸，避免切换时跳变

---

## 📁 项目结构

```
.
├── index.html           # 入口页面
├── app.js               # 核心逻辑
├── styles.css           # 液态玻璃样式
├── data/
│   ├── config.js        # 全局配置（日期、城市列表）
│   ├── photos.js        # 照片数据（自动生成）
│   └── lunbo.js         # 轮播图数据（自动生成）
├── assets/
│   ├── photos/          # 旅行照片源文件
│   └── lunbo/           # 轮播图源文件
└── scripts/
    ├── import-photos.js # 照片自动导入脚本
    └── import-lunbo.js  # 轮播图自动导入脚本
```

---

## 📄 License

MIT
