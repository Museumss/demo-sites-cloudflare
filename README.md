# 演示站合集 · 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Museumss/demo-sites-cloudflare)

点击上方按钮，即可将本项目复制到你自己的 GitHub 账号，并部署到你自己的 Cloudflare 账户。每位部署者应使用自己独立的 Worker、D1 数据库和 Secrets；不会共用作者的站点数据。

## 一键部署步骤

1. 点击上方 **Deploy to Cloudflare**。
2. 登录并授权 GitHub 与 Cloudflare，按页面提示选择自己的账户。
3. 确认项目名称和 D1 资源名称，然后开始部署。Cloudflare 会根据 Wrangler 配置为你的项目创建并绑定独立 D1 数据库。
4. 首次部署会自动执行 `migrations/0001_initial.sql`，初始化站点、设置和浏览量数据表。
5. 部署完成后，打开 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Settings → Variables and Secrets，添加以下两个 **Secret**：
   - `ADMIN_PASSWORD`：你自己的后台登录密码。
   - `SESSION_SECRET`：至少 32 位随机字符串，用于签名登录会话。
6. 保存 Secrets 后重新部署一次，然后访问 Worker 域名；后台入口为 `/admin.html`。

> **重要：** 请勿把真实密码、SESSION_SECRET 或其他密钥提交到 GitHub。此项目部署到每个人自己的 Cloudflare 账户，数据互相独立。

## 技术结构

- Cloudflare Workers：前后端 API、登录、站点检测、Cron 定时任务
- Cloudflare D1：站点与分页设置数据库
- Workers Static Assets：托管 `public/` 静态页面
- Cron：`0 */12 * * *`，每 12 小时执行一次（UTC）

## 本地开发

需要 Node.js/npm。安装依赖后运行：

```bash
npm install
npm run dev
```

本地开发时可按需创建本地 D1 数据库并应用迁移：

```bash
npx wrangler d1 migrations apply DB --local
```

## 导入格式

支持 JSON 文件，结构如下：

```json
{
  "sites": [
    {
      "name": "示例站点",
      "url": "https://example.com",
      "category": "工具",
      "cover": "https://example.com/cover.jpg",
      "description": "项目简介",
      "features": "功能说明",
      "demo_user": "demo",
      "demo_password": "仅供演示的密码",
      "source_url": "https://github.com/example/project"
    }
  ]
}
```

当前导入接口接收 JSON；导出按钮会生成完整 JSON 备份。

## 页面功能

- 首页：背景图、分类、搜索、响应式卡片、默认每页24条、分页、状态排序、详情弹窗
- 后台：密码登录、增删改、批量 JSON 导入导出、每页数量设置、一键检测
- 自动检测：Cron 每12小时触发；后台手动检测同样更新检测状态和时间

## 安全与检测说明

- `ADMIN_PASSWORD` 与 `SESSION_SECRET` 必须通过 Cloudflare Secrets 设置。
- 演示账号密码会以明文存入 D1 并展示给访客；只填写专用、可公开的演示凭据，不要放真实密码。
- 互联网目标可能拒绝自动化请求、要求登录、屏蔽 Cloudflare 或对 HEAD/GET 有特殊限制；检测状态代表从 Worker 发起的 HTTP 可达性，不等同于页面业务功能正常。
- 建议定期导出 JSON 备份数据库内容。

## 自测清单

- 访问 `/` 与 `/admin.html`
- 使用你设置的 `ADMIN_PASSWORD` 登录
- 新增测试站点并确认首页出现
- 点击卡片查看详情
- 后台执行一键检测
- 导出 JSON 备份，确认数据可用
