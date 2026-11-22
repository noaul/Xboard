# Xboard

<div align="center">

[![Telegram](https://img.shields.io/badge/Telegram-Channel-blue)](https://t.me/XboardOfficial)
![PHP](https://img.shields.io/badge/PHP-8.2.35+-green.svg)
![MySQL](https://img.shields.io/badge/MySQL-5.7+-blue.svg)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## ✂️ 精简版说明（本分支）

本仓库是 Xboard 的精简版本，只保留「管理员手动开户 + 下发订阅」所需的功能：

**保留**

- 管理后台（全新的轻量页面，无需构建）：管理员登录、用户管理（手动创建 / 批量生成 / 编辑 / 封禁 / 删除 / 重置流量 / 重置订阅 / 导出 CSV / **复制订阅链接**）
- 节点、权限组、路由规则管理，节点后端对接 API（UniProxy / V2 / WebSocket / 机器）
- 订阅地址 `/{subscribe_path}/{token}`、各客户端订阅格式与订阅模板
- 流量统计与按系统设置自动重置流量

**移除**

- 用户前台面板（主题）、用户注册 / 登录 / 找回密码 / 邮件登录、用户端全部 API
- 套餐、订单、支付（含全部支付插件）、优惠券、礼品卡、邀请与佣金
- 工单、知识库、公告、邮件发送与邮件模板、Telegram 机器人、客户端 App 配置接口
- 原 React 管理后台子模块（`public/assets/admin` 现为本仓库自带的轻量后台）

**使用要点**

- 只有 `is_admin` 用户能登录（`/api/v2/passport/auth/login`），普通用户只通过订阅链接使用服务。
- 用户可用节点由其「权限组」决定；流量、到期时间、限速、设备数直接在用户上设置，不再依赖套餐。
- 流量重置方式为全局设置（系统设置 → 订阅 → 流量重置方式），无到期时间的用户按月 / 按年分别在每月 1 号 / 每年 1 月 1 日重置。
- 数据库表结构未删除（旧数据保留，升级可直接执行 `php artisan xboard:update`），只是相关功能代码已移除。
- 官方镜像 `ghcr.io/cedar2025/xboard` 不包含这些改动，请使用本仓库的 `Dockerfile` 自行构建镜像（默认从 `https://github.com/noaul/Xboard` 的 `master` 分支拉取代码，可通过 `--build-arg REPO_URL=... --build-arg BRANCH_NAME=...` 修改），并把 compose 文件中的 `image` 改为自建镜像。

## 📖 Introduction

Xboard is a modern panel system built on Laravel 11, focusing on providing a clean and efficient user experience.

## ✨ Features

- 🚀 Built with Laravel 12 + Octane for significant performance gains
- 🎨 Redesigned admin interface (React + Shadcn UI)
- 📱 Modern user frontend (Vue3 + TypeScript)
- 🐳 Ready-to-use Docker deployment solution
- 🎯 Optimized system architecture for better maintainability

## 🚀 Quick Start

```bash
git clone -b compose --depth 1 https://github.com/cedar2025/Xboard && \
cd Xboard && \
docker compose run -it --rm \
    -e ENABLE_SQLITE=true \
    -e ENABLE_REDIS=true \
    -e ADMIN_ACCOUNT=admin@demo.com \
    xboard php artisan xboard:install && \
docker compose up -d
```

> After installation, visit: http://SERVER_IP:7001  
> ⚠️ Make sure to save the admin credentials shown during installation

## 📖 Documentation

### 🔄 Upgrade Notice
> 🚨 **Important:** This version involves significant changes. Please strictly follow the upgrade documentation and backup your database before upgrading. Note that upgrading and migration are different processes, do not confuse them.

### Development Guides
- [Plugin Development Guide](./docs/en/development/plugin-development-guide.md) - Complete guide for developing XBoard plugins

### Deployment Guides

PHP **8.2.35 or later** is required. Use the latest security patch for your PHP release series. Docker deployments must meet this requirement inside the container.

- [Deploy with 1Panel](./docs/en/installation/1panel.md)
- [Deploy with Docker Compose](./docs/en/installation/docker-compose.md)
- [Deploy with aaPanel](./docs/en/installation/aapanel.md)
- [Deploy with aaPanel + Docker](./docs/en/installation/aapanel-docker.md) (Recommended)

### Migration Guides
- [Migrate from v2board dev](./docs/en/migration/v2board-dev.md)
- [Migrate from v2board 1.7.4](./docs/en/migration/v2board-1.7.4.md)
- [Migrate from v2board 1.7.3](./docs/en/migration/v2board-1.7.3.md)

## 🛠️ Tech Stack

- Backend: Laravel 11 + Octane
- Admin Panel: React + Shadcn UI + TailwindCSS
- User Frontend: Vue3 + TypeScript + NaiveUI
- Deployment: Docker + Docker Compose
- Caching: Redis + Octane Cache

## 📷 Preview
![Admin Preview](./docs/images/admin.png)

![User Preview](./docs/images/user.png)

## ⚠️ Disclaimer

This project is for learning and communication purposes only. Users are responsible for any consequences of using this project.

## ❤️ Support The Project

If this project has helped you, donations are appreciated. They help support ongoing maintenance and would make me very happy.

TRC20: `TLypStEWsVrj6Wz9mCxbXffqgt5yz3Y4XB`

## 🌟 Maintenance Notice

This project is currently under light maintenance. We will:
- Fix critical bugs and security issues
- Review and merge important pull requests
- Provide necessary updates for compatibility

However, new feature development may be limited.

## 🔔 Important Notes

1. Restart required after modifying admin path:
```bash
docker compose restart
```

2. For aaPanel installations, restart the Octane daemon process

## 🤝 Contributing

Issues and Pull Requests are welcome to help improve the project.

## 📈 Star History

[![Stargazers over time](https://starchart.cc/cedar2025/Xboard.svg)](https://starchart.cc/cedar2025/Xboard)
