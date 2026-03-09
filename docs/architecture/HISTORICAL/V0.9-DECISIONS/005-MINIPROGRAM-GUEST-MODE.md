# 微信小程序游客模式设计方案

> 设计既保证用户体验（低权限进入）又确保系统安全（防止滥用）的微信小程序游客模式架构。
>
> 设计日期：2026-02-11

---

## 目录

1. [需求理解](#一需求理解)
2. [技术可行性分析](#二技术可行性分析)
3. [架构设计方案](#三架构设计方案)
4. [安全措施](#四安全措施)
5. [实施检查清单](#五实施检查清单)

---

## 一、需求理解

### 1.1 核心需求

| 需求 | 优先级 | 说明 |
|------|--------|------|
| **低权限进入** | P0 | 用户无需授权即可进入小程序 |
| **游客体验80%功能** | P0 | 体验AI对话、查看行情、创建AI账户（临时） |
| **数据不持久化** | P0 | 游客数据退出即清除 |
| **登录后持久化** | P0 | 授权后将游客数据绑定到正式账户 |
| **防止系统滥用** | P0 | 防止爬虫、刷接口、创建垃圾数据 |
| **自动登录** | P1 | 已授权用户下次自动进入 |

### 1.2 功能分级

```
┌─────────────────────────────────────────────────────────────┐
│                     微信小程序功能分级                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🔓 游客可用功能（无需登录）                                    │
│  ├── 查看行情列表                                              │
│  ├── 查看排行榜                                                │
│  ├── 搜索股票                                                  │
│  ├── 查看AI经理详情（公开数据）                                 │
│  ├── 创建临时AI账户（本地存储）                                 │
│  └── AI对话体验（限制10轮）                                     │
│                                                              │
│  🔐 登录后功能（微信授权）                                      │
│  ├── 持久化AI账户                                              │
│  ├── 真实交易执行                                              │
│  ├── 个人中心                                                  │
│  ├── 历史记录查询                                              │
│  └── 分享功能                                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、技术可行性分析

### 2.1 微信小程序匿名标识

**问题**：不获取用户授权，能否获得唯一标识？

**答案**：

| 标识类型 | 获取方式 | 是否需要授权 | 特点 |
|----------|----------|--------------|------|
| **OpenID** | `wx.login` → 后端换取 | ❌ 不需要 | 同一小程序内唯一，固定不变 |
| **UnionID** | 需要用户授权 | ✅ 需要 | 同一主体下多个小程序唯一 |
| **自定义临时ID** | 后端生成 | ❌ 不需要 | 每次登录可能变化 |

**方案选择**：使用 **OpenID** 作为游客标识

```javascript
// 小程序端
wx.login({
  success: (res) => {
    // res.code 传给后端
    // 后端用code换取openid
  }
});
```

**后端处理**：
```javascript
// 用wx.login的code换取openid
const openid = await wechatService.code2Session(code);
// 不需要用户授权即可获取openid
```

---

### 2.2 数据存储策略

#### 方案对比

| 存储位置 | 游客数据 | 登录后数据 | 特点 |
|----------|----------|------------|------|
| **本地Storage** | ✅ | ❌ | 退出即清除，不安全 |
| **后端临时表** | ✅ | ✅ | 可控制有效期，可绑定 |
| **混合方案** | ✅ | ✅ | 最佳方案 |

**推荐：混合方案**

```
┌─────────────────────────────────────────────────────────────┐
│                     数据存储策略                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  游客模式：                                                   │
│  前端Storage ◄──► Backend临时表（24小时过期）                   │
│       │                    │                                 │
│       │                    └── 限制创建数量                    │
│       │                                                       │
│  登录后：                                                     │
│       └──► Backend正式表（长期存储）                          │
│             │                                                │
│             └── 绑定openid到user_id                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、架构设计方案

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      微信小程序游客模式架构                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐                                              │
│   │  Miniprogram │                                              │
│   │              │                                              │
│   │  ┌──────────┐│                                              │
│   │  │ Storage  ││ 本地缓存（游客AI账户、对话历史）               │
│   │  │ • tempAI ││                                              │
│   │  │ • dialog ││                                              │
│   │  │ • token  ││                                              │
│   │  └──────────┘│                                              │
│   └──────┬───────┘                                              │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────────────────────────────────────────────┐      │
│   │                      Backend                          │      │
│   │  ┌─────────────────────────────────────────────────┐  │      │
│   │  │              认证中间件                          │  │      │
│   │  │  • 公开API白名单（/api/public/*）                │  │      │
│   │  │  • 游客Token验证（临时访问令牌）                  │  │      │
│   │  │  • JWT验证（登录用户）                           │  │      │
│   │  └─────────────────────────────────────────────────┘  │      │
│   │                        │                              │      │
│   │  ┌─────────────────────┼─────────────────────┐       │      │
│   │  │                     │                     │       │      │
│   │  ▼                     ▼                     ▼       │      │
│   │ ┌──────────┐      ┌──────────┐      ┌──────────┐   │      │
│   │ │ Public   │      │ Guest    │      │ Auth     │   │      │
│   │ │ APIs     │      │ APIs     │      │ APIs     │   │      │
│   │ │          │      │          │      │          │   │      │
│   │ │•行情     │      │•临时AI   │      │•真实交易 │   │      │
│   │ │•排行     │      │•对话体验 │      │•个人中心 │   │      │
│   │ │•搜索     │      │•限流控制 │      │•历史记录 │   │      │
│   │ └──────────┘      └──────────┘      └──────────┘   │      │
│   └──────────────────────────────────────────────────────┘      │
│                              │                                   │
│                              ▼                                   │
│   ┌──────────────────────────────────────────────────────┐      │
│   │                    数据库层                           │      │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐   │      │
│   │  │ 正式用户表    │  │ 临时游客表   │  │ 公开数据 │   │      │
│   │  │ • users      │  │ • guest_ai   │  │ • stocks │   │      │
│   │  │ • ai_accounts│  │ • guest_chat │  │ • ranks  │   │      │
│   │  │ • trades     │  │ (24h TTL)    │  │          │   │      │
│   │  └──────────────┘  └──────────────┘  └──────────┘   │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3.2 API分层设计

#### 第一层：公开API（完全无限制）

```yaml
# 无需任何认证
GET  /api/public/market/quotes      # 行情列表
GET  /api/public/market/search      # 股票搜索
GET  /api/public/ranking/:period    # 排行榜（日/周/月）
GET  /api/public/ai-managers/:id    # AI经理公开详情
```

**安全措施**：
- 频率限制：60次/分钟/IP
- 数据脱敏：不包含敏感字段

---

#### 第二层：游客API（需要游客Token）

```yaml
# 需要游客Token（通过wx.login获取）
POST /api/guest/auth/token          # 获取游客访问令牌
POST /api/guest/ai-accounts         # 创建临时AI账户（限制2个）
POST /api/guest/ai-accounts/:id/chat # AI对话（限制10轮/天）
GET  /api/guest/ai-accounts         # 获取临时账户列表
DELETE /api/guest/ai-accounts/:id   # 删除临时账户
POST /api/guest/bind                # 游客数据绑定到正式账户
```

**游客Token机制（智能过期策略）**：

```javascript
// 获取游客Token
POST /api/guest/auth/token
Request: {
  code: string;        // wx.login获取的code
  deviceId: string;    // 设备指纹（可选，用于增强安全）
}
Response: {
  guestToken: string;  // 临时访问令牌
  openid: string;      // 匿名标识（后端返回哈希值）
  expiresIn: number;   // 过期时间（动态：24h或72h）
  hasAIAccount: boolean; // 是否已创建AI账户
}
```

**智能过期策略**：

| 用户状态 | Token有效期 | 清理时间 | 说明 |
|----------|-------------|----------|------|
| **未创建AI账户** | 24小时 | 24小时无访问后清理 | 纯浏览用户，快速回收资源 |
| **已创建AI账户** | 72小时 | 72小时无访问后清理 | 深度体验用户，延长保留期 |
| **已创建且有对话** | 72小时 | 72小时无访问后清理 | 活跃用户，给予充分体验时间 |

**策略优势**：
- 节省资源：纯浏览用户24小时清理
- 提升体验：深度用户72小时保留，避免频繁重新创建AI账户
- 灵活调整：每次访问刷新最后活跃时间

**安全措施**：
- 频率限制：30次/分钟
- 数量限制：最多2个临时AI账户
- 对话限制：10轮/天
- 自动清理：根据用户状态24h或72h清理

---

#### 第三层：认证API（需要JWT）

```yaml
# 需要微信授权后获取的JWT
POST /api/auth/wechat-login         # 微信登录（获取unionId）
POST /api/ai-accounts               # 创建正式AI账户（无限制）
POST /api/trades                    # 执行交易
GET  /api/user/profile              # 个人中心
GET  /api/user/history              # 历史记录
```

---

### 3.3 数据流转流程

#### 场景1：纯游客访问（不创建AI账户）

```
用户进入小程序
    │
    ▼
wx.login()获取code
    │
    ▼
Backend换取openid，生成guestToken（24h过期）
    │
    ▼
浏览行情、排行榜（只读操作）
    │
    ▼
用户退出小程序
    │
    ▼
24小时后无访问 ──► Backend自动清理guest_session数据
```

#### 场景1b：游客创建AI账户（智能延长有效期）

```
用户进入小程序
    │
    ▼
wx.login()获取code
    │
    ▼
Backend生成guestToken（初始24h过期）
    │
    ▼
用户创建临时AI账户
    │
    ▼
Backend调用 extend_guest_expiry()
    │
    ▼
Token有效期延长至72小时！
    │
    ▼
进行AI对话（10轮限制）
    │
    ▼
用户退出小程序
    │
    ▼
72小时后无访问 ──► Backend自动清理数据
    │
    ▼
如果期间用户再次访问 ──► 刷新last_activity_at，保留72小时
```

---

#### 场景2：游客转正式用户（登录绑定）

```
用户已创建临时AI账户（guest模式）
    │
    ▼
点击"登录保存数据"
    │
    ▼
wx.getUserProfile()获取授权
    │
    ▼
Backend创建正式用户
    │
    ▼
【事务开始】数据迁移（原子操作）
    │
    ├── Step 1: 将guest_ai数据迁移到ai_accounts表
    │           └── 生成新的正式账户ID
    │
    ├── Step 2: 将guest_chat迁移到正式chat_history表
    │           └── 更新外键关联
    │
    ├── Step 3: 标记guest_session为"已绑定"
    │           └── status = 'bound'
    │
    ├── Step 4: 立即删除guest_ai和guest_chat临时数据
    │           └── 避免被清理函数误删
    │
    └── Step 5: 记录绑定日志
                └── bind_log表记录openid -> user_id映射
    │
    ▼
【事务提交】
    │
    ▼
返回JWT（长期有效）
    │
    ▼
后续访问使用正式API（/api/ai-accounts）
```

#### 场景2b：绑定后数据保护机制

**关键问题**：用户绑定后，如何确保数据不被误删？

**解决方案**：

```sql
-- 方案：标记+立即删除双保险

-- 1. guest_sessions表增加状态字段
ALTER TABLE guest_sessions ADD COLUMN status VARCHAR(20) DEFAULT 'active';
-- status值：'active'(活跃) | 'expired'(过期) | 'bound'(已绑定)

-- 2. 清理函数只清理未绑定的数据
CREATE OR REPLACE FUNCTION clean_guest_data()
RETURNS TABLE (cleaned_sessions INTEGER, cleaned_accounts INTEGER, cleaned_chats INTEGER)
AS $$
DECLARE
  v_sessions INTEGER;
  v_accounts INTEGER;
  v_chats INTEGER;
BEGIN
  -- 只清理：已过期 且 未绑定 的数据
  WITH deleted_sessions AS (
    DELETE FROM guest_sessions
    WHERE expires_at < NOW()
      AND status != 'bound'  -- ❗关键：排除已绑定的用户
    RETURNING openid_hash
  )
  SELECT COUNT(*) INTO v_sessions FROM deleted_sessions;

  -- 级联删除关联数据（已通过外键ON DELETE CASCADE）
  GET DIAGNOSTICS v_accounts = ROW_COUNT;

  RETURN QUERY SELECT v_sessions, v_accounts, 0;
END;
$$ LANGUAGE plpgsql;

-- 3. 绑定函数（事务保护）
CREATE OR REPLACE FUNCTION bind_guest_to_user(
  p_openid_hash VARCHAR,
  p_user_id INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  new_account_id INTEGER,
  message TEXT
)
AS $$
DECLARE
  v_guest_account RECORD;
  v_new_account_id INTEGER;
BEGIN
  -- 开启事务
  BEGIN
    -- Step 1: 获取游客账户数据
    SELECT * INTO v_guest_account
    FROM guest_ai_accounts
    WHERE openid_hash = p_openid_hash;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, NULL::INTEGER, '游客账户不存在'::TEXT;
      RETURN;
    END IF;

    -- Step 2: 迁移到正式表
    INSERT INTO ai_accounts (user_id, name, config, created_at)
    VALUES (p_user_id, v_guest_account.name, v_guest_account.config, NOW())
    RETURNING id INTO v_new_account_id;

    -- Step 3: 标记为已绑定（防止被清理）
    UPDATE guest_sessions
    SET status = 'bound',
        user_id = p_user_id,  -- 记录绑定的正式用户ID
        bound_at = NOW()
    WHERE openid_hash = p_openid_hash;

    -- Step 4: 删除游客临时数据（立即删除，避免被清理函数误删）
    DELETE FROM guest_chat_history WHERE openid_hash = p_openid_hash;
    DELETE FROM guest_ai_accounts WHERE openid_hash = p_openid_hash;

    -- Step 5: 记录绑定日志
    INSERT INTO guest_bind_logs (openid_hash, user_id, guest_account_id, new_account_id, bound_at)
    VALUES (p_openid_hash, p_user_id, v_guest_account.id, v_new_account_id, NOW());

    -- 提交事务
    RETURN QUERY SELECT TRUE, v_new_account_id, '绑定成功'::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- 回滚事务
    RAISE NOTICE '绑定失败: %', SQLERRM;
    RETURN QUERY SELECT FALSE, NULL::INTEGER, ('绑定失败: ' || SQLERRM)::TEXT;
  END;
END;
$$ LANGUAGE plpgsql;
```

**数据保护检查清单**：

- [ ] **事务保护**：绑定过程使用数据库事务，失败自动回滚
- [ ] **状态标记**：绑定后立即标记status='bound'，清理函数会跳过
- [ ] **立即删除**：绑定成功后立即删除游客临时表数据，不等待定时清理
- [ ] **绑定日志**：记录openid -> user_id映射，便于问题追溯
- [ ] **数据校验**：绑定后校验正式表数据完整性
- [ ] **重复绑定防护**：已绑定用户再次调用返回已有user_id

**用户视角的保证**：

```
用户点击"登录保存"
    │
    ▼
显示"正在保存数据..."
    │
    ▼
【Backend执行绑定事务】
    │
    ├── 迁移数据到正式表 ✅
    ├── 标记游客状态为已绑定 ✅
    ├── 删除临时数据 ✅
    └── 记录绑定日志 ✅
    │
    ▼
显示"保存成功！"
    │
    ▼
用户获得JWT（长期有效）
    │
    ▼
❌ 清理函数不会删除已绑定的数据
✅ 用户数据长期保存（用户可主动删除）
```

---

#### 场景3：已登录用户自动登录

```
用户再次进入小程序
    │
    ▼
Storage中有JWT且未过期
    │
    ▼
直接访问认证API
    │
    ▼
JWT过期？
    │
    ├── YES ──► 静默刷新或重新登录
    │
    └── NO ──► 正常使用
```

---

## 四、安全措施

### 4.1 防止游客接口滥用

| 风险 | 防护措施 |
|------|----------|
| **批量创建游客账户** | 基于openid限制（1个openid = 1个游客身份） |
| **高频访问** | 30次/分钟频率限制 |
| **大量对话消耗Token** | 10轮/天限制，超出后提示登录 |
| **爬虫抓取** | 设备指纹+行为分析，异常请求验证码 |
| **长期占用资源** | 24小时自动清理临时数据 |

---

### 4.2 游客Token安全

```javascript
// 游客Token设计
guestToken = JWT.sign({
  type: 'guest',
  openidHash: md5(openid),  // 不直接暴露openid
  deviceId: deviceId,
  iat: Date.now(),
  exp: Date.now() + 24 * 60 * 60 * 1000  // 24小时过期
}, SECRET);
```

---

### 4.3 数据隔离

```sql
-- 游客会话表（管理游客Token和过期策略）
CREATE TABLE guest_sessions (
  id SERIAL PRIMARY KEY,
  openid_hash VARCHAR(64) NOT NULL UNIQUE,  -- 匿名标识哈希
  guest_token VARCHAR(255),                 -- 游客访问令牌
  has_ai_account BOOLEAN DEFAULT FALSE,     -- 是否已创建AI账户
  status VARCHAR(20) DEFAULT 'active',      -- 状态：'active'|'expired'|'bound'
  user_id INTEGER,                          -- 绑定后的正式用户ID（可为空）
  last_activity_at TIMESTAMP DEFAULT NOW(), -- 最后活跃时间
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours',  -- 动态过期时间
  bound_at TIMESTAMP,                       -- 绑定时间
  INDEX idx_openid (openid_hash),
  INDEX idx_expires (expires_at),           -- 用于自动清理
  INDEX idx_activity (last_activity_at),    -- 用于活跃度统计
  INDEX idx_status (status),                -- 用于区分已绑定用户
  INDEX idx_user (user_id)                  -- 用于反向查询
);

-- 游客AI账户表
CREATE TABLE guest_ai_accounts (
  id SERIAL PRIMARY KEY,
  openid_hash VARCHAR(64) NOT NULL,         -- 关联到guest_sessions
  name VARCHAR(100),
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (openid_hash) REFERENCES guest_sessions(openid_hash) ON DELETE CASCADE,
  INDEX idx_openid (openid_hash)
);

-- 游客对话历史表
CREATE TABLE guest_chat_history (
  id SERIAL PRIMARY KEY,
  openid_hash VARCHAR(64) NOT NULL,
  ai_account_id INTEGER,
  message TEXT,
  role VARCHAR(20),  -- 'user' or 'assistant'
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (openid_hash) REFERENCES guest_sessions(openid_hash) ON DELETE CASCADE,
  INDEX idx_openid (openid_hash),
  INDEX idx_created (created_at)
);

-- 更新过期时间的函数（创建AI账户后调用）
CREATE OR REPLACE FUNCTION extend_guest_expiry(p_openid_hash VARCHAR)
RETURNS void AS $$
BEGIN
  UPDATE guest_sessions
  SET
    has_ai_account = TRUE,
    expires_at = GREATEST(expires_at, NOW() + INTERVAL '72 hours')
  WHERE openid_hash = p_openid_hash;
END;
$$ LANGUAGE plpgsql;

-- 更新最后活跃时间的函数（每次访问调用）
CREATE OR REPLACE FUNCTION update_guest_activity(p_openid_hash VARCHAR)
RETURNS void AS $$
BEGIN
  UPDATE guest_sessions
  SET last_activity_at = NOW()
  WHERE openid_hash = p_openid_hash;
END;
$$ LANGUAGE plpgsql;

-- 智能清理过期数据
CREATE OR REPLACE FUNCTION clean_guest_data()
RETURNS TABLE (
  cleaned_sessions INTEGER,
  cleaned_accounts INTEGER,
  cleaned_chats INTEGER
) AS $$
DECLARE
  v_sessions INTEGER;
  v_accounts INTEGER;
  v_chats INTEGER;
BEGIN
  -- 清理过期会话（级联删除关联的AI账户和对话）
  WITH deleted_sessions AS (
    DELETE FROM guest_sessions
    WHERE expires_at < NOW()
    RETURNING openid_hash
  )
  SELECT COUNT(*) INTO v_sessions FROM deleted_sessions;

  -- 返回清理统计
  SELECT COUNT(*) INTO v_accounts FROM guest_ai_accounts
  WHERE openid_hash NOT IN (SELECT openid_hash FROM guest_sessions);

  SELECT COUNT(*) INTO v_chats FROM guest_chat_history
  WHERE openid_hash NOT IN (SELECT openid_hash FROM guest_sessions);

  RETURN QUERY SELECT v_sessions, v_accounts, v_chats;
END;
$$ LANGUAGE plpgsql;

-- 定时任务：每小时清理
SELECT cron.schedule('clean-guest-data', '0 * * * *', 'SELECT clean_guest_data()');

-- 绑定日志表（用于问题追溯和数据保护）
CREATE TABLE guest_bind_logs (
  id SERIAL PRIMARY KEY,
  openid_hash VARCHAR(64) NOT NULL,
  user_id INTEGER NOT NULL,
  guest_account_id INTEGER,
  new_account_id INTEGER,
  bound_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  INDEX idx_openid (openid_hash),
  INDEX idx_user (user_id),
  INDEX idx_bound_at (bound_at)
);

-- 统计视图：游客活跃度
CREATE VIEW guest_activity_stats AS
SELECT
  COUNT(*) FILTER (WHERE has_ai_account = FALSE AND status = 'active') AS pure_guests,
  COUNT(*) FILTER (WHERE has_ai_account = TRUE AND status = 'active') AS active_guests,
  COUNT(*) FILTER (WHERE status = 'bound') AS bound_guests,
  COUNT(*) FILTER (WHERE last_activity_at > NOW() - INTERVAL '1 hour') AS online_now,
  AVG(EXTRACT(EPOCH FROM (last_activity_at - created_at))/3600) AS avg_session_hours
FROM guest_sessions
WHERE expires_at > NOW() OR status = 'bound';
```

---

## 五、实施检查清单

### Backend开发任务

- [ ] **公开API白名单**
  - [ ] 创建 `/api/public/*` 路由前缀
  - [ ] 配置免JWT认证
  - [ ] 添加频率限制（60次/分钟/IP）

- [ ] **游客认证体系**
  - [ ] 实现 `POST /api/guest/auth/token`（支持动态过期时间）
  - [ ] 实现游客Token验证中间件
  - [ ] 创建guest_sessions表（智能过期策略）
  - [ ] 创建guest_ai_accounts表
  - [ ] 实现extend_guest_expiry()函数（创建AI账户后延长到72h）
  - [ ] 实现update_guest_activity()函数（每次访问刷新活跃时间）
  - [ ] 实现智能清理定时任务（根据has_ai_account判断24h或72h）
  - [ ] 创建guest_activity_stats统计视图

- [ ] **游客功能API**
  - [ ] `POST /api/guest/ai-accounts`（限制2个）
  - [ ] `POST /api/guest/ai-accounts/:id/chat`（限制10轮/天）
  - [ ] `GET /api/guest/ai-accounts`
  - [ ] `DELETE /api/guest/ai-accounts/:id`
  - [ ] `POST /api/guest/bind`（绑定到正式账户）

- [ ] **数据迁移与保护**
  - [ ] 游客数据迁移到正式用户的逻辑
  - [ ] 绑定事务保护机制（原子操作）
  - [ ] 标记已绑定用户状态（status='bound'）
  - [ ] 清理函数排除已绑定用户
  - [ ] 绑定日志记录（便于问题追溯）
  - [ ] 重复绑定防护（幂等性）
  - [ ] 数据一致性校验

### Miniprogram开发任务

- [ ] **游客状态管理**
  - [ ] Pinia store：区分guest和authenticated状态
  - [ ] Storage管理：guestToken、临时AI账户

- [ ] **登录流程**
  - [ ] 引导登录页面设计
  - [ ] "保存数据"提示逻辑
  - [ ] 自动登录（JWT刷新）

- [ ] **体验优化**
  - [ ] 游客功能限制提示（如："登录后可创建更多AI账户"）
  - [ ] 流畅的登录/绑定体验

---

## 六、总结

### 核心设计要点

| 设计决策 | 理由 |
|----------|------|
| **使用openid作为游客标识** | 无需用户授权即可获取，固定不变 |
| **智能过期策略** | 未创建AI账户24h清理，已创建AI账户72h清理 |
| **限制2个临时AI账户** | 防止滥用，同时满足体验需求 |
| **限制10轮对话/天** | 控制Token成本 |
| **自动清理机制** | 每小时检测，根据has_ai_account状态判断 |
| **数据可迁移** | 游客转正式用户无缝衔接 |
| **绑定后数据保护** | 事务保护+状态标记+立即删除三重保险 |
| **活跃时间追踪** | 每次访问刷新last_activity_at |

### 智能过期策略详解

```
用户类型判断逻辑：

用户首次进入 ──► 创建guest_session（expires_at = NOW + 24h）
    │
    ├── 未创建AI账户 ──► 24h后清理
    │
    └── 创建AI账户 ──► 调用extend_guest_expiry()
              │
              ▼
        expires_at = MAX(当前过期时间, NOW + 72h)
              │
              ▼
        72h内再次访问 ──► 刷新last_activity_at
              │
              ▼
        72h无访问 ──► 自动清理
```

**策略优势**：
- 💰 节省资源：纯浏览用户快速回收（24h）
- 😊 提升体验：深度用户充分体验时间（72h）
- 🔄 动态调整：每次访问刷新活跃时间
- 📊 可观测：通过guest_activity_stats视图监控

### 预期效果

- ✅ 用户无需授权即可进入，体验80%功能
- ✅ 纯浏览游客24小时自动清理，节省资源
- ✅ 深度体验游客72小时保留，避免频繁重建AI账户
- ✅ **登录后数据长期保存，不会误删（事务保护+立即删除机制）**
- ✅ 系统有完善的防滥用机制
- ✅ 符合微信小程序最佳实践

### 用户数据安全保证

| 场景 | 数据状态 | 保证 |
|------|----------|------|
| 游客未登录 | 临时存储（24h或72h） | 到期自动清理 |
| 游客点击登录 | 立即迁移到正式表 | **事务保护，不丢失** |
| 登录后 | 长期存储 | **已绑定用户数据不受清理影响** |
| 重复登录 | 已存在正式账户 | 直接返回已有数据 |

---

*文档版本: v1.0*
*设计日期: 2026-02-11*
*维护者: 首席架构师*
