CREATE TABLE IF NOT EXISTS sites (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 url TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT '其他',
 cover TEXT,
 description TEXT,
 features TEXT,
 demo_user TEXT,
 demo_password TEXT,
 source_url TEXT,
 status TEXT NOT NULL DEFAULT 'unknown',
 http_status INTEGER,
 last_checked TEXT,
 response_ms INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_sites_category ON sites(category);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO settings(key,value) VALUES('page_size','24');

CREATE TABLE IF NOT EXISTS site_views (
 site_id INTEGER PRIMARY KEY,
 views INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
);
