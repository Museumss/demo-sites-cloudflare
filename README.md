# 演示站合集 · Cloudflare 部署包

## 技术结构
- Cloudflare Workers：前后端 API、登录、站点检测、Cron 定时任务
- Cloudflare D1：站点与分页设置数据库
- Workers Static Assets：托管 `public/` 静态页面
- Cron：`0 */12 * * *`，每 12 小时执行一次（UTC）

## 部署前准备
需要 Cloudflare 账号、Node.js/npm。不要把管理员密码写进源码或提交到 Git。

1. 安装依赖：`npm install`
2. 登录 Cloudflare：`npx wrangler login`
3. 创建 D1：`npx wrangler d1 create demo-sites-db`
4. 把命令返回的 database_id 填入 `wrangler.toml`。
5. 初始化表结构：`npx wrangler d1 execute demo-sites-db --remote --file=./schema.sql`
6. 设置管理员密码：`npx wrangler secret put ADMIN_PASSWORD`
7. 设置会话签名密钥：`npx wrangler secret put SESSION_SECRET`（输入至少32位随机字符串）
8. 部署：`npx wrangler deploy`

部署完成后访问 Worker 域名；后台地址为 `/admin.html`。绑定自定义域名可在 Cloudflare Workers & Pages 的域名配置中完成。

## 本地开发
`npm run dev` 启动本地预览。创建本地 D1 后运行：
`npx wrangler d1 execute demo-sites-db --local --file=./schema.sql`

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
CSV 可在表格软件中编辑后另存为 JSON；当前导入接口接收 JSON。导出按钮会生成完整 JSON 备份。

## 页面功能
- 首页：背景图、分类、搜索、响应式卡片、默认每页24条、分页、状态排序、详情弹窗
- 后台：密码登录、增删改、批量 JSON 导入导出、每页数量设置、一键检测
- 自动检测：Cron 每12小时触发；后台手动检测同样更新 `last_checked`、状态和 HTTP 状态码

## 安全与检测说明
- `ADMIN_PASSWORD` 与 `SESSION_SECRET` 必须通过 Wrangler Secrets 设置。
- 管理会话使用 HttpOnly、Secure、SameSite=Strict Cookie，8小时过期。
- 检测请求使用超时并发分批执行；站点 URL 只允许 HTTP/HTTPS，并拒绝常见本机地址。
- 互联网目标可能拒绝自动化请求、要求登录、屏蔽 Cloudflare 或对 HEAD/GET 有特殊限制；检测状态代表从 Worker 发起的 HTTP 可达性，不等同于页面业务功能正常。
- 若公开站点较多，建议在 Cloudflare Dashboard 配置登录 API 的 Rate Limiting/WAF 规则，并定期备份 D1。
- 演示账号密码会以明文存入 D1 并展示给访客；只填写专用、可公开的演示凭据，不要放真实密码。
- 生产环境建议限制检测目标域名或增加 DNS/IP 解析校验，防止恶意管理员添加内网目标。当前版本拒绝常见本机字面地址，但不是完整的企业级 SSRF 防护。

## 自测清单
- `npm run dev` 后访问 `/` 与 `/admin.html`
- 使用设置的 ADMIN_PASSWORD 登录
- 新增一个测试站点并确认首页出现
- 点击卡片查看详情
- 后台执行一键检测，确认状态与最近检测时间更新
- 导出 JSON 后清空/另一个环境导入，核对记录数
- 运行 `npx wrangler deploy` 后，在 Cloudflare Cron Events 查看定时触发记录

注意：此压缩包是可部署源码模板；需要在你的 Cloudflare 账号中创建 D1、配置 Secrets 并部署。当前对话无法替你访问账号完成线上部署，也无法声称已验证你的线上域名。
