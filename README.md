# Xboard

<div align="center">

[![Telegram](https://img.shields.io/badge/Telegram-Channel-blue)](https://t.me/XboardOfficial)
![PHP](https://img.shields.io/badge/PHP-8.2.35+-green.svg)
![MySQL](https://img.shields.io/badge/MySQL-5.7+-blue.svg)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## 本分支与上游的差异

本分支面向「管理员开户、用户只用订阅链接」的场景：**管理后台与上游完全一致，只移除了用户前台和用户自助功能**。对照基线为上游 `cedar2025/Xboard` 的 `master` 提交 `d826a3b`。

| 范围 | 上游 | 本分支 |
| --- | --- | --- |
| 管理后台 | 独立 React 管理后台（子模块） | **不变**。仍使用原版后台，所有菜单和功能保留：套餐、订单、优惠券、礼品卡、工单、知识库、公告、支付配置、邮件、统计、主题、插件、节点与机器管理等 |
| 用户前台 | 用户面板主题，根路径 `/` 显示前台 | 根路径 `/` 返回 404，不再提供用户面板。主题文件保留，仅为兼容后台的主题设置 |
| 登录与注册 | 用户可注册、登录、找回密码、邮件链接登录 | 只有管理员可以登录（`/api/v*/passport/auth/login`，普通用户返回 403）。注册、找回密码、邮件链接登录、发送邮箱验证码均已移除 |
| 用户接口 | `/api/v1/user/*`：下单、支付、工单、邀请、流量记录等 | 全部移除。`/api/v2/user/info` 仅保留给管理后台读取当前管理员信息，只允许管理员访问 |
| 访客接口 | 套餐列表、站点配置、支付回调、Telegram webhook | 只保留 Telegram webhook（用于管理员通知等）。套餐列表、站点配置和支付回调已移除 |
| 订阅 | 订阅链接与各客户端格式 | **保留**。`/s/{token}`（路径可在后台修改）和 `/api/v1/client/subscribe?token={token}` 均可用 |
| 节点对接 | UniProxy、V2、WebSocket、机器 | 保留，不变 |

### 管理员如何开户并交付订阅

1. 在「权限组」建组，在「节点管理」把节点加入该组。
2. 在「套餐管理」建一个套餐，选择权限组并设置流量、限速等。套餐只作为内部模板使用，用户看不到，无需开启售卖。
3. 在「用户管理」创建用户，选择套餐并设置到期时间；也可以创建后再编辑流量、到期时间等。
4. 在用户列表的操作菜单中复制订阅链接，交给用户导入客户端。

### 需要注意

- **在线支付不可用。** 支付回调接口已移除，即使后台配置了支付方式，用户也无法下单付款。订单只能由管理员在后台手动分配或标记为已支付。
- **用户侧功能不可用。** 工单、公告、知识库、邀请等后台页面仍可使用，但用户没有前台可以查看或提交，工单不会再有新的用户提交。
- **邮件中的前台链接会 404。** 到期、流量提醒等邮件仍会发送，如果邮件模板里有指向站点前台的链接，需要自行修改模板。
- **数据库不变。** 本分支没有新增或删除任何迁移，可从上游直接切换：先备份数据库和 `.env`，再执行 `php artisan xboard:update`。

## Docker Compose 快速安装

以下为全新安装示例，使用 SQLite 和容器内的 Redis。仓库自带的 Compose 示例仍引用上游镜像，下面的命令会在本地 `compose.yaml` 中改用自行构建的本分支镜像。Dockerfile 默认从 `noaul/Xboard` 远端的 `master` 拉取应用源码，构建其他分支时可指定 `REPO_URL` 与 `BRANCH_NAME`。

```bash
git clone --branch master --depth 1 https://github.com/noaul/Xboard.git
cd Xboard
touch .env
sed 's|ghcr.io/cedar2025/xboard:latest|xboard-noaul:local|g' compose.sample.yaml > compose.yaml
docker build --build-arg CACHEBUST="$(git rev-parse HEAD)" -t xboard-noaul:local .
docker compose run --rm -e ENABLE_SQLITE=true -e ENABLE_REDIS=true \
  -e ADMIN_ACCOUNT=admin@example.com xboard php artisan xboard:install
docker compose up -d
```

将示例邮箱换成自己的地址，保存安装命令输出的管理员密码和后台路径。默认端口为 `7001`，访问地址为 `http://服务器地址:7001/后台路径`。修改后台路径或订阅路径后，Docker 部署可执行 `docker compose restart xboard` 重新加载路由。运行环境为 PHP 8.2.35+、Laravel 12、Octane 和 Redis。

### 上游参考资料

以下文档沿用上游示例，涉及仓库、分支和应用镜像时请使用本页快速安装中的对应值。

- [Docker Compose](docs/en/installation/docker-compose.md) · [1Panel](docs/en/installation/1panel.md) · [aaPanel](docs/en/installation/aapanel.md) · [aaPanel + Docker](docs/en/installation/aapanel-docker.md)
- [从 V2Board dev 迁移](docs/en/migration/v2board-dev.md) · [从 1.7.4 迁移](docs/en/migration/v2board-1.7.4.md) · [从 1.7.3 迁移](docs/en/migration/v2board-1.7.3.md)
- [插件开发指南](docs/en/development/plugin-development-guide.md)

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

For native aaPanel installations, restart the Octane daemon after changing the admin or subscription path.

## 🤝 Contributing

Issues and Pull Requests are welcome to help improve the project.

## 📈 Star History

[![Stargazers over time](https://starchart.cc/cedar2025/Xboard.svg)](https://starchart.cc/cedar2025/Xboard)
