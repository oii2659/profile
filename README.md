# 莫晓诗个人简历

Vue 3 + TypeScript + Vite 项目，使用 `<script setup lang="ts">`，保留原简历的两页布局、楷体、证件照、二维码、移动端适配和 A4 打印。

## 启动

需要 Node.js 20.19+（20.x）或 22.12+。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，默认是 http://127.0.0.1:5173。

## 编译和预览

```sh
npm run build
npm run preview
```

`build` 先执行 Vue / TypeScript 类型检查，再编译到 `dist/`。`preview` 默认地址是 http://127.0.0.1:4173。将 `dist/` 整个目录部署到静态文件服务器即可；请通过 HTTP 访问，不要双击 HTML 使用 file 协议。

## 编辑

- `src/App.vue`：简历正文、结构和打印按钮。
- `src/data/profile.ts`：带类型定义的姓名、年龄、联系方式及求职意向。
- `src/style.css`：桌面、移动端及打印样式。
- `src/assets/`：本地字体、证件照和二维码，不依赖外部 CDN。

点击“打印 / 保存 PDF”，纸张选择 A4、缩放 100%，关闭浏览器页眉和页脚即可得到两页简历。
