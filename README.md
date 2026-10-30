# 莫晓诗个人简历

Vue 3 + TypeScript + Vite 简历网站，公开地址为 https://xsmore.cn/ 。网页采用双栏摘要与可展开详情，支持手机阅读和完整 A4 打印。

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

- `src/data/resume.json`：简历正文和个人信息的唯一内容来源，在线后台保存时修改此文件。
- `src/components/ReadingResume.vue`、`src/lib/reading.ts`：从正文生成摘要、项目流程和可展开详情。
- `src/components/ResumeView.vue`：打印简历和后台预览。
- `src/App.vue`：公开网站、后台入口和打印按钮。
- `src/admin/`：站长登录、富文本编辑、留言管理、访问统计。
- `src/style.css`、`src/reading.css`、`src/scan.css`：打印、网页及摘要布局样式。
- `src/assets/`：本地字体和项目二维码。

构建产物 `dist/`、测试输出 `.artifacts/` 和 `test-results/` 可重新生成，不提交到仓库。目录定位和详情展开不改变公开页面地址；旧链接的版本参数与章节锚点会自动清理，后台使用 `/admin`，旧的 `/#/admin` 链接会自动切换到新地址。

点击“打印 / 保存 PDF”，纸张选择 A4、缩放 100%，关闭浏览器页眉和页脚即可得到两页简历。

## 在线站长后台

访问网站的 `/admin`，或点击页面底部“站长管理”。使用 Supabase Auth 邮箱和密码登录，仅 `site_admins` 名单中的账号有管理权限。

- 简历编辑：类似 Word 的富文本正文、个人信息表单、两页预览、撤销/重做、本机草稿恢复与下载。
- 保存并发布：受保护的 Supabase Edge Function 更新 GitHub 的 `src/data/resume.json`，生成提交记录，再由 GitHub Actions 部署。网站更新需要等待部署完成，本地文件需要 `git pull` 才能同步。
- 留言管理：搜索、分页、隐藏/恢复、删除。隐藏留言对普通访客不可见。
- 访问统计：7/30 天访问次数、浏览器会话数、每日趋势、来源及记录列表。数据从启用后开始收集，不能补回过去记录，也不能识别真实姓名。

**首次使用需完成云端配置：[在线后台部署说明](docs/ADMIN_SETUP.md)。** 仓库没有内置管理员密码或 GitHub 写入凭据。未配置发布接口时，后台不会允许覆盖仓库内容；公开简历仍可阅读。

验证命令：

```sh
npm run test:db
npm run test:browser
npm run test:functions
npm run check:functions
npm run build
```

数据库测试在临时 PostgreSQL（PGlite）实例中执行 SQL 和权限检查。浏览器和 Edge Function 测试使用模拟请求，不写真实 Supabase 或 GitHub。Windows 浏览器测试使用已安装的 Chrome，其他系统先执行 `npx playwright install chromium`。后端检查通过 npx 使用 Deno，首次运行需要联网。

## 留言板与 Supabase

留言板独立于简历的两张 A4 页面，打印时隐藏。沿用现有 `public.message` 表的 `id / content / created_at`，不要求迁移旧留言。

- 匿名公开留言，多行输入、1000 字限制、提交结果、网络错误重试与 30 秒发送冷却。
- 每次展示 8 条，按时间和 ID 倒序；查看更多时重新读取已展开范围，避免新增/删除造成分页遗漏。
- Realtime 订阅表变化，以“留言有更新”提示用户刷新，不打断正在阅读的位置。重新连接后也会提示刷新。
- 加载失败与空列表分别呈现；发送失败保留草稿，避免丢失输入；超时后提醒先刷新确认，避免重复提交。
- 招聘和合作通过邮件联系，公开留言不收集私人联系方式。

本地复制 `.env.example` 为 `.env.local` 并填写 Supabase 项目 URL 和 publishable / anon key。GitHub Actions 使用仓库 Secrets `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。这些前端环境变量会进入构建产物，**不能填写 service_role 或 secret key**。未配置时简历仍可访问，留言板显示邮件联系入口。

### 数据库配置（一次性）

在 Supabase 项目的 SQL Editor 中审阅并运行 `supabase/guestbook.sql`。脚本保留现有数据，启用 RLS，限制访客只能读取展示字段、插入留言正文，添加后端长度/非空校验和排序索引，并将表加入 Realtime 发布。已有违规旧留言不会阻止脚本执行，新留言必须通过校验。

此脚本将 `public.message` 视为专用的公开匿名留言表，并撤销 `public / anon / authenticated` 的表级权限后重新授予匿名访客必要权限。如果该表还服务于其他页面或登录用户，先合并它们的权限需求。既有自定义策略、列级授权及可写 RPC 不会被脚本删除，需在 Dashboard 检查是否还有其他写入途径。不要把私信或联系方式存入这张公开表。Realtime 状态“已连接”仅表示频道已连接；是否收到表变化还取决于 publication 配置。

在站长后台或 Dashboard 的 Table Editor 管理留言。当前为直接发布，不包含发布前审核。前端 30 秒冷却只减少误操作，**不是服务器防刷机制**。若出现垃圾留言，下一步应接入 Edge Function + CAPTCHA + 服务端限流，并撤销匿名直接插入权限。Supabase Auth 用于站长登录，普通访客无需登录。

### 上线核对

1. 执行数据库脚本，在两个浏览器窗口打开网站；一边发布，另一边应出现更新提示。
2. 检查空白或超过 1000 字的内容不能通过数据库校验，匿名身份没有更新/删除权限。
3. 用 Dashboard 删除一条测试留言，刷新页面确认结果；断网时应保留输入并显示错误。
4. 推送到 `main` 后由 `.github/workflows/static.yml` 构建并部署 GitHub Pages。

## 自定义访问域名

当前部署平台是 **GitHub Pages**，域名是 `https://xsmore.cn/`。Supabase 提供登录、留言、访问统计及简历发布接口。

域名在域名注册商购买，例如阿里云、腾讯云、Cloudflare Registrar 或 Namecheap；不是在 Supabase 购买。Supabase 的 Custom Domains 是 API 的自定义域名，本项目不需要购买这项功能。

建议选一个长期使用的个人域名，比如 `你的名字.com`，将 `www.你的域名` 或 `resume.你的域名` 绑定到这个简历，以后换部署平台也可以保留链接。购买前核对可注册状态和续费价格。

1. 在 GitHub 账号 Settings → Pages 中验证域名所有权，按提示添加 TXT 记录。
2. 在仓库 Settings → Pages → Custom domain 填入你选择的完整域名并保存。
3. 在注册商的 DNS 管理中，为 `www` 或 `resume` 添加 CNAME，目标为 **`oii2659.github.io`**，不带 `https://` 或 `/profile/`。若要用根域名，按 GitHub 官方文档配置 A/AAAA 或受支持的 ALIAS/ANAME 记录。
4. 等待 GitHub DNS 检查和证书签发完成，再启用 Enforce HTTPS。使用 Cloudflare DNS 时，初次配置可先保持 DNS only，避免代理干扰验证。
5. 此仓库使用自定义 Actions 工作流部署，在仓库 Pages 设置绑定域名即可，不依赖构建产物中的 CNAME 文件。Vite 使用 `base: '/'` 服务于自定义域名根路径，构建时生成首页及 `admin/index.html`，确保后台直接访问和刷新正常。

更换前端域名时，需同步更新保存接口的 `ALLOWED_ORIGINS`，并核对 Supabase Auth 的 Site URL 和允许回调地址；Supabase 项目 URL、数据库和留言无需迁移。

官方参考：[GitHub 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)、[验证域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)、[Supabase Custom Domains](https://supabase.com/docs/guides/platform/custom-domains)。
