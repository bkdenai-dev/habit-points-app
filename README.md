# 🌟 习惯养成积分大冒险 (Habit Points App)

> 一个为孩子（Brayden 健健 🦉 & Kayden 安安 🐯）量身定制的家庭日常行为积分与习惯养成 Web 应用程序。

## 核心设计与经济体
- **计量单位**：纯积分制（PTS），无复杂二元爱心
- **现实汇率**：`1 PTS = SGD $0.01`（100 积分等价 1 新币）
- **每日限额**：所有心愿兑换每人每天最多兑换 1 次（防沉迷熔断机制）
- **架构模式**：Local-First PWA，零服务器依赖，数据实时在浏览器 LocalStorage 持久化，支持一键 JSON 导出与恢复

## 角色与任务体系 (v1.2.1)
- **Brayden (健健 🦉 哥哥 • 探索求知)**：
  - KooBits Math & Chinese 每日挑战分（Challenge Points 1:1 结算）
  - 奥数作业（5分）、New Journey（5分）
  - 钢琴练习（15分钟 5分、30分钟 10分）
  - 榜样兄长勋章（教弟弟汉字、单词、字母、陪读绘本）
  - 自律好习惯（吃饭、洗澡、刷牙、吃蔬菜、吃水果）
- **Kayden (安安 🐯 弟弟 • 启蒙自理)**：
  - 英文绘本（读完一本 1分）、学说新单词（2分）
  - 基础书写（学写数字 1分、字母 1分、新单词 2分、新汉字 2分）
  - 自理好习惯（收玩具、吃饭、洗澡、刷牙、吃蔬菜、吃水果）

## 心愿兑换商城
- 📱 15 分钟屏幕时间：30 PTS（SGD $0.30）
- 🎡 室内游乐场 1 小时券：200 PTS（SGD $2.00）
- 🌊 去水上乐园畅玩：1,000 PTS（SGD $10.00）
- ✈️ 全家出国旅游：5,000 PTS（SGD $50.00）

## 生产环境与账号凭据
- **生产访问地址**：[https://habit-points-app.bkdenai.workers.dev](https://habit-points-app.bkdenai.workers.dev)
- **GitHub 账户**：`bkdenai@gmail.com`
- **Cloudflare 账户**：`bkdenai@gmail.com`

## 快速使用与部署
1. **在线体验**：直接手机或 iPad 访问 [https://habit-points-app.bkdenai.workers.dev](https://habit-points-app.bkdenai.workers.dev)。
2. **本地使用**：直接双击 `index.html` 打开。
3. **局域网共享**：
   ```bash
   python3 -m http.server 8080
   ```
4. **Cloudflare Worker / Pages 更新**：
   - 代码已同步推送到 GitHub `bkdenai-dev/habit-points-app`；
   - 若通过 Cloudflare Worker 直接粘贴代码，可直接复制最新 `index.html`；若通过 Pages 自动构建，GitHub 推送后将自动部署生效。
