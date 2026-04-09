"use strict";

const fs   = require("fs");
const path = require("path");

const LUNBO_DIR   = path.join(__dirname, "../assets/lunbo");
const OUT_FILE    = path.join(__dirname, "../data/lunbo.js");
const SUPPORTED   = /\.(jpe?g|png|webp|gif|avif)$/i;

function run() {
  if (!fs.existsSync(LUNBO_DIR)) {
    fs.mkdirSync(LUNBO_DIR, { recursive: true });
    console.log(`📁 已创建目录: ${LUNBO_DIR}`);
  }

  const files = fs.readdirSync(LUNBO_DIR)
    .filter(f => SUPPORTED.test(f))
    .sort();

  const photos = files.map((filename, i) => {
    const rawName = filename.replace(/\.\w+$/, "");
    // 去掉日期前缀 (YYYY-MM-DD-)
    const title = rawName.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    return {
      id:    `lunbo-${String(i + 1).padStart(4, "0")}`,
      src:   `assets/lunbo/${filename}`,
      title: title === rawName ? "" : title   // 无日期前缀则不显示 title
    };
  });

  const content = [
    `// 首页轮播图配置，请勿手改。`,
    `// 重新导入请运行: node scripts/import-lunbo.js`,
    `// 生成时间: ${new Date().toISOString()}`,
    `window.LUNBO_PHOTOS = ${JSON.stringify(photos, null, 2)};`,
    ""
  ].join("\n");

  fs.writeFileSync(OUT_FILE, content, "utf-8");
  console.log(`✅ 已导出 ${photos.length} 张轮播图 → ${path.relative(process.cwd(), OUT_FILE)}`);
}

run();
