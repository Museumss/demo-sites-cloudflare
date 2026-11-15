# 演示站合集 · 免费公开使用与 GitHub Fork

本项目面向个人学习、研究和个人网站展示，欢迎通过 GitHub **Fork** 复制到自己的账户后使用。

## 如何 Fork 本项目

1. 登录自己的 GitHub 账户。
2. 打开原项目： https://github.com/Museumss/demo-sites-cloudflare
3. 点击页面右上方的 **Fork**。
4. 在 Fork 页面选择自己的账户，点击 **Create fork**。
5. Fork 完成后，你就拥有自己账户下的一份项目副本，可以继续修改和维护。

**说明：** 本项目不提供 Cloudflare 一键部署按钮。Fork 只是复制 GitHub 项目，不会自动创建 Cloudflare Worker 或 D1 数据库。需要部署到 Cloudflare 时，请在自己的 Fork 仓库中按项目部署教程操作，并使用自己的 Cloudflare 资源和密钥。

## 使用与授权

- 允许个人免费使用、学习、修改，以及通过 GitHub Fork 在自己的账户中维护副本。
- 未经作者书面授权，不得将本项目或其修改版本作为商品出售、收费转售、打包分发，或在其他平台重新发布源码。
- 不得删除或伪造原作者版权声明，不得冒充本项目或其原作者。
- Fork 后的修改由 Fork 使用者自行负责；原作者不对第三方修改版提供维护或担保。
- 本项目按现状提供，不作任何明示或默示担保。

完整授权条款见仓库根目录的 `LICENSE` 文件。若需商业使用、再分发或其他授权，请先联系作者并取得书面许可。

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
