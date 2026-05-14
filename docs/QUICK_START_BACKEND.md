# 🚀 Backend 集成快速参考

## ✅ 当前状态

```
Backend: ✅ 已启用
URL:     https://api-gateway-production-b656.up.railway.app
模式:    Hybrid (Backend → arti-data → OpenBB)
认证:    ⚠️  未配置 (fallback 到 OpenBB 工作正常)
```

---

## 🎯 立即可用的命令

```bash
# 无需认证，立即可用
arti scan AAPL           # 技术扫描 (Hybrid)
arti quick-scan NVDA     # 快速研判
arti quote TSLA          # 实时行情
arti market              # 市场概览
arti history AAPL -d 30  # 历史数据
```

---

## 🔐 启用完整功能 (需要 JWT)

### Step 1: 获取 Token

从浏览器控制台:
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log(session.access_token);
```

### Step 2: 配置

```bash
# 方式 A: 环境变量
export ARTI_AUTH_TOKEN="eyJhbGci..."

# 方式 B: CLI 登录
arti login --token <token>
```

### Step 3: 测试

```bash
arti full AAPL   # 全景研报 (30 Credits)
arti deep TSLA   # 深度研报 (100 Credits)
```

---

## 🛠️ 快速工具

```bash
# 检查 Backend 状态
./scripts/check-backend.sh

# 查看配置
arti config list | grep backend

# 测试连接
curl https://api-gateway-production-b656.up.railway.app/health
```

---

## 📚 完整文档

- [BACKEND_READY.md](./BACKEND_READY.md) — 完整集成报告
- [BACKEND_SYNC_COMPLETED.md](./BACKEND_SYNC_COMPLETED.md) — 技术细节
- [BACKEND_ENABLED.md](./BACKEND_ENABLED.md) — 启用指南

---

✅ **Backend 已就绪，享受 AI 投研！**
