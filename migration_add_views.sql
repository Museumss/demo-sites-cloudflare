-- 在现有 D1 数据库执行一次，为单个站点建立浏览量统计表。
-- 网站总访问量保存在现有 settings 表，无需新增列。
CREATE TABLE IF NOT EXISTS site_views (
  site_id INTEGER PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
);
