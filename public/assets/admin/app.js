/*
 * Xboard 精简版管理后台
 * 仅包含：管理员登录、用户管理（含复制订阅链接）、节点 / 权限组 / 路由管理、系统设置。
 * 无需构建，原生 JavaScript 实现。
 */
(function () {
  'use strict';

  const SETTINGS = window.settings || {};
  const API_BASE = '/api/v2';
  const ADMIN_BASE = API_BASE + '/' + SETTINGS.secure_path;
  const TOKEN_KEY = 'xboard_admin_auth';
  const GB = 1073741824;

  const NODE_TYPES = ['shadowsocks', 'vmess', 'vless', 'trojan', 'hysteria', 'tuic', 'anytls', 'socks', 'naive', 'http', 'mieru'];
  const RESET_METHODS = [
    [0, '每月1号重置'],
    [1, '按月重置（以到期日为重置日）'],
    [2, '不重置'],
    [3, '每年1月1日重置'],
    [4, '按年重置（以到期日为重置日）'],
  ];
  const ROUTE_ACTIONS = { block: '禁止访问', direct: '直连', dns: '指定DNS', proxy: '代理' };

  const $app = document.getElementById('app');
  const $modalRoot = document.getElementById('modal-root');
  const $toastRoot = document.getElementById('toast-root');

  // ---------------------------------------------------------------- utils

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    bytes = Number(bytes) || 0;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return (i === 0 ? bytes : bytes.toFixed(2)) + ' ' + units[i];
  }

  function bytesToGB(bytes) {
    const gb = (Number(bytes) || 0) / GB;
    return Math.round(gb * 100) / 100;
  }

  function gbToBytes(gb) {
    if (gb === '' || gb === null || gb === undefined) return null;
    return Math.round(Number(gb) * GB);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function tsToDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function tsToDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return tsToDate(ts) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function dateToTs(value) {
    if (!value) return null;
    const parts = value.split('-').map(Number);
    return Math.floor(new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0).getTime() / 1000);
  }

  function addMonths(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function toast(message, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    $toastRoot.appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 5000 : 2500);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast('已复制到剪贴板', 'success');
    } catch (e) {
      window.prompt('复制失败，请手动复制：', text);
    }
  }

  function formData(form) {
    const data = {};
    form.querySelectorAll('[name]').forEach((el) => {
      const name = el.name;
      if (el.type === 'checkbox') {
        if (el.dataset.multi !== undefined) {
          data[name] = data[name] || [];
          if (el.checked) data[name].push(el.value);
        } else {
          data[name] = el.checked;
        }
      } else {
        data[name] = el.value.trim();
      }
    });
    return data;
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  // ---------------------------------------------------------------- api

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function errorMessage(body, status) {
    if (body && body.errors && typeof body.errors === 'object') {
      const first = Object.values(body.errors)[0];
      if (Array.isArray(first) && first.length) return first[0];
    }
    if (body && body.message) return body.message;
    return '请求失败 (' + status + ')';
  }

  async function request(method, url, data, options) {
    options = options || {};
    const headers = { Accept: 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = token;
    const init = { method, headers };
    if (data !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(data);
    } else if (data && method === 'GET') {
      url += (url.includes('?') ? '&' : '?') + new URLSearchParams(data).toString();
    }
    const res = await fetch(url, init);
    if (options.raw) {
      if (!res.ok) throw new Error('请求失败 (' + res.status + ')');
      return res;
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* ignore */ }
    if (res.status === 401 || (res.status === 403 && url.startsWith(ADMIN_BASE))) {
      clearToken();
      renderLogin();
      throw new Error('登录已失效，请重新登录');
    }
    if (!res.ok) throw new Error(errorMessage(body, res.status));
    return body;
  }

  const api = {
    get: (path, params) => request('GET', ADMIN_BASE + path, params),
    post: (path, data) => request('POST', ADMIN_BASE + path, data || {}),
  };

  async function guard(promise, successMessage) {
    try {
      const result = await promise;
      if (successMessage) toast(successMessage, 'success');
      return result;
    } catch (e) {
      toast(e.message || String(e), 'error');
      throw e;
    }
  }

  // ---------------------------------------------------------------- modal

  function openModal(opts) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal ' + (opts.wide ? 'wide' : '') + '">' +
      '<header><span>' + esc(opts.title) + '</span><button class="close" data-close>&times;</button></header>' +
      '<form class="body" novalidate>' + opts.body + '</form>' +
      '<footer>' +
      (opts.footer !== undefined ? opts.footer :
        '<button type="button" class="btn" data-close>取消</button>' +
        (opts.onSubmit ? '<button type="button" class="btn btn-primary" data-submit>' + esc(opts.submitText || '保存') + '</button>' : '')) +
      '</footer></div>';
    $modalRoot.appendChild(mask);
    const form = mask.querySelector('form');
    const close = () => mask.remove();
    mask.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
    const submitBtn = mask.querySelector('[data-submit]');
    const submit = async () => {
      if (!opts.onSubmit) return;
      submitBtn.disabled = true;
      try {
        const keep = await opts.onSubmit(formData(form), form, close);
        if (keep !== false) close();
      } catch (e) {
        /* error already shown */
      } finally {
        submitBtn.disabled = false;
      }
    };
    if (submitBtn) submitBtn.addEventListener('click', submit);
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    if (opts.onMount) opts.onMount(form, close, mask);
    const first = form.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea');
    if (first) first.focus();
    return { form, close, mask };
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      openModal({
        title: '请确认',
        body: '<p>' + esc(message) + '</p>',
        footer: '<button type="button" class="btn" data-no>取消</button><button type="button" class="btn btn-danger" data-yes>确定</button>',
        onMount(form, close, mask) {
          mask.querySelector('[data-no]').onclick = () => { close(); resolve(false); };
          mask.querySelector('[data-yes]').onclick = () => { close(); resolve(true); };
          mask.querySelector('[data-close]').addEventListener('click', () => resolve(false));
        },
      });
    });
  }

  // ---------------------------------------------------------------- shared data

  const cache = { groups: null, routes: null };

  async function loadGroups(force) {
    if (!cache.groups || force) {
      const res = await api.get('/server/group/fetch');
      cache.groups = res.data || [];
    }
    return cache.groups;
  }

  async function loadRoutes(force) {
    if (!cache.routes || force) {
      const res = await api.get('/server/route/fetch');
      cache.routes = res.data || [];
    }
    return cache.routes;
  }

  function groupOptions(groups, selected) {
    return '<option value="">（不分配）</option>' + groups.map((g) =>
      '<option value="' + g.id + '"' + (String(selected) === String(g.id) ? ' selected' : '') + '>' + esc(g.name) + '</option>'
    ).join('');
  }

  // ---------------------------------------------------------------- login

  function renderLogin() {
    $modalRoot.innerHTML = '';
    $app.innerHTML =
      '<div class="login-wrap"><form class="login-card" id="login-form">' +
      '<h1>' + esc(SETTINGS.title || 'Xboard') + '</h1>' +
      '<p class="muted">管理员登录</p>' +
      '<div class="field"><label>邮箱</label><input type="email" name="email" autocomplete="username" required></div>' +
      '<div class="field"><label>密码</label><input type="password" name="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-primary" type="submit">登录</button>' +
      '</form></div>';
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const data = formData(form);
        const res = await request('POST', API_BASE + '/passport/auth/login', data);
        if (!res.data || !res.data.is_admin) throw new Error('该账户不是管理员');
        setToken(res.data.auth_data);
        localStorage.setItem(TOKEN_KEY + '_email', data.email);
        if (!location.hash || location.hash === '#/') location.hash = '#/users';
        renderShell();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
    form.querySelector('input').focus();
  }

  // ---------------------------------------------------------------- shell

  const PAGES = {
    users: { title: '用户管理', render: renderUsers },
    nodes: { title: '节点管理', render: renderNodes },
    groups: { title: '权限组', render: renderGroups },
    routes: { title: '路由规则', render: renderRoutes },
    settings: { title: '系统设置', render: renderSettings },
  };

  function currentPage() {
    const key = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return PAGES[key] ? key : 'users';
  }

  function renderShell() {
    const page = currentPage();
    $app.innerHTML =
      '<div class="topbar">' +
      '<div class="brand">' + esc(SETTINGS.title || 'Xboard') + '</div>' +
      '<nav>' + Object.keys(PAGES).map((k) =>
        '<a href="#/' + k + '" class="' + (k === page ? 'active' : '') + '">' + PAGES[k].title + '</a>').join('') + '</nav>' +
      '<div class="right"><span class="who">' + esc(localStorage.getItem(TOKEN_KEY + '_email') || '') + '</span>' +
      '<button class="btn btn-sm" id="logout">退出</button></div>' +
      '</div>' +
      '<div class="container" id="page"></div>';
    document.getElementById('logout').onclick = () => {
      clearToken();
      renderLogin();
    };
    PAGES[page].render(document.getElementById('page'));
  }

  window.addEventListener('hashchange', () => {
    if (getToken()) renderShell();
  });

  // ---------------------------------------------------------------- users

  const userState = { page: 1, pageSize: 20, keyword: '', status: '' };

  function userStatus(u) {
    const now = Date.now() / 1000;
    if (u.banned) return '<span class="badge red">已封禁</span>';
    if (u.expired_at && u.expired_at < now) return '<span class="badge yellow">已过期</span>';
    if (u.transfer_enable && (u.u + u.d) >= u.transfer_enable) return '<span class="badge yellow">流量耗尽</span>';
    if (!u.transfer_enable) return '<span class="badge">无流量</span>';
    return '<span class="badge green">正常</span>';
  }

  async function renderUsers(root) {
    root.innerHTML =
      '<div class="card">' +
      '<div class="toolbar">' +
      '<input type="text" id="user-search" placeholder="搜索邮箱" value="' + esc(userState.keyword) + '" style="width:240px">' +
      '<select id="user-status">' +
      '<option value="">全部状态</option><option value="active">正常</option><option value="banned">已封禁</option><option value="expired">已过期</option>' +
      '</select>' +
      '<div class="spacer"></div>' +
      '<button class="btn" id="user-export">导出 CSV</button>' +
      '<button class="btn" id="user-batch">批量生成</button>' +
      '<button class="btn btn-primary" id="user-create">+ 新建用户</button>' +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>ID</th><th>邮箱</th><th>权限组</th><th>流量（已用 / 总量）</th><th>到期时间</th><th>状态</th><th>备注</th><th>操作</th>' +
      '</tr></thead><tbody id="user-tbody"><tr><td colspan="8" class="empty">加载中…</td></tr></tbody></table></div>' +
      '<div class="pagination" id="user-pager"></div>' +
      '</div>';

    root.querySelector('#user-status').value = userState.status;
    root.querySelector('#user-search').addEventListener('input', debounce((e) => {
      userState.keyword = e.target.value.trim();
      userState.page = 1;
      loadUsers();
    }, 350));
    root.querySelector('#user-status').addEventListener('change', (e) => {
      userState.status = e.target.value;
      userState.page = 1;
      loadUsers();
    });
    root.querySelector('#user-create').onclick = () => openUserForm(null);
    root.querySelector('#user-batch').onclick = openBatchGenerate;
    root.querySelector('#user-export').onclick = exportUsers;

    loadGroups().catch(() => {});
    loadUsers();
  }

  function userFilters() {
    const filter = [];
    if (userState.keyword) filter.push({ id: 'email', value: userState.keyword });
    const now = Math.floor(Date.now() / 1000);
    if (userState.status === 'banned') filter.push({ id: 'banned', value: 'eq:1' });
    if (userState.status === 'active') filter.push({ id: 'banned', value: 'eq:0' });
    if (userState.status === 'expired') filter.push({ id: 'expired_at', value: 'lt:' + now });
    return filter;
  }

  async function loadUsers() {
    const tbody = document.getElementById('user-tbody');
    if (!tbody) return;
    let res;
    try {
      res = await guard(api.post('/user/fetch', {
        current: userState.page,
        pageSize: userState.pageSize,
        filter: userFilters(),
      }));
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">加载失败</td></tr>';
      return;
    }
    const users = res.data || [];
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无用户</td></tr>';
    } else {
      tbody.innerHTML = users.map((u) => {
        const used = (u.u || 0) + (u.d || 0);
        const pct = u.transfer_enable ? Math.min(100, used / u.transfer_enable * 100) : 0;
        return '<tr data-id="' + u.id + '">' +
          '<td>' + u.id + '</td>' +
          '<td>' + esc(u.email) + (u.is_admin ? ' <span class="badge blue">管理员</span>' : '') + '</td>' +
          '<td>' + (u.group ? esc(u.group.name) : '<span class="muted">-</span>') + '</td>' +
          '<td class="nowrap">' + formatBytes(used) + ' / ' + formatBytes(u.transfer_enable) +
          '<div class="progress ' + (pct >= 90 ? 'warn' : '') + '"><div style="width:' + pct.toFixed(1) + '%"></div></div></td>' +
          '<td class="nowrap">' + (u.expired_at ? esc(tsToDate(u.expired_at)) : '<span class="muted">长期有效</span>') + '</td>' +
          '<td>' + userStatus(u) + '</td>' +
          '<td>' + esc(u.remarks || '') + '</td>' +
          '<td><div class="actions">' +
          '<button class="btn btn-sm btn-primary" data-act="copy">复制订阅</button>' +
          '<button class="btn btn-sm" data-act="edit">编辑</button>' +
          '<button class="btn btn-sm" data-act="reset-traffic">重置流量</button>' +
          '<button class="btn btn-sm" data-act="reset-secret">重置订阅</button>' +
          '<button class="btn btn-sm" data-act="ban">' + (u.banned ? '解封' : '封禁') + '</button>' +
          '<button class="btn btn-sm btn-danger" data-act="delete">删除</button>' +
          '</div></td></tr>';
      }).join('');
      tbody.querySelectorAll('button[data-act]').forEach((btn) => {
        const id = Number(btn.closest('tr').dataset.id);
        const user = users.find((x) => x.id === id);
        btn.onclick = () => userAction(btn.dataset.act, user);
      });
    }

    const pager = document.getElementById('user-pager');
    const last = res.last_page || 1;
    pager.innerHTML =
      '<span class="muted">共 ' + (res.total || 0) + ' 个用户</span>' +
      '<button class="btn btn-sm" data-p="prev"' + (userState.page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span>' + userState.page + ' / ' + last + '</span>' +
      '<button class="btn btn-sm" data-p="next"' + (userState.page >= last ? ' disabled' : '') + '>下一页</button>' +
      '<select data-p="size">' + [20, 50, 100].map((n) => '<option' + (n === userState.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>';
    pager.querySelector('[data-p=prev]').onclick = () => { userState.page--; loadUsers(); };
    pager.querySelector('[data-p=next]').onclick = () => { userState.page++; loadUsers(); };
    pager.querySelector('[data-p=size]').onchange = (e) => { userState.pageSize = Number(e.target.value); userState.page = 1; loadUsers(); };
  }

  async function userAction(act, user) {
    switch (act) {
      case 'copy':
        copyText(user.subscribe_url);
        break;
      case 'edit':
        openUserForm(user);
        break;
      case 'reset-traffic':
        if (!(await confirmDialog('确定将用户 ' + user.email + ' 的已用流量清零吗？'))) return;
        await guard(api.post('/traffic-reset/reset-user', { user_id: user.id }), '流量已重置');
        loadUsers();
        break;
      case 'reset-secret':
        if (!(await confirmDialog('重置后该用户原订阅链接和 UUID 将失效，确定继续吗？'))) return;
        await guard(api.post('/user/resetSecret', { id: user.id }), '订阅已重置，请重新复制订阅链接');
        loadUsers();
        break;
      case 'ban':
        await guard(api.post('/user/update', { id: user.id, banned: !user.banned }), user.banned ? '已解封' : '已封禁');
        loadUsers();
        break;
      case 'delete':
        if (!(await confirmDialog('确定删除用户 ' + user.email + ' 吗？此操作不可恢复。'))) return;
        await guard(api.post('/user/destroy', { id: user.id }), '已删除');
        loadUsers();
        break;
    }
  }

  function expiryField(value) {
    return '<div class="field"><label>到期时间</label>' +
      '<input type="date" name="expired_date" value="' + esc(value) + '">' +
      '<div class="hint">留空为长期有效 · 快捷：' +
      '<a href="#" data-exp="1">1个月</a> · <a href="#" data-exp="3">3个月</a> · ' +
      '<a href="#" data-exp="6">半年</a> · <a href="#" data-exp="12">1年</a> · <a href="#" data-exp="0">长期</a></div></div>';
  }

  function bindExpiryShortcuts(form) {
    form.querySelectorAll('[data-exp]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const months = Number(a.dataset.exp);
        form.querySelector('[name=expired_date]').value = months ? addMonths(months) : '';
      });
    });
  }

  function intOrNull(v) {
    return v === '' || v === null || v === undefined ? null : parseInt(v, 10);
  }

  async function openUserForm(user) {
    let groups = [];
    try { groups = await loadGroups(); } catch (e) { /* ignore */ }
    const isEdit = !!user;
    const u = user || {};
    const body =
      '<div class="form-grid">' +
      '<div class="field"><label>邮箱 / 账号 *</label><input type="email" name="email" value="' + esc(u.email) + '" required></div>' +
      '<div class="field"><label>密码</label><input type="password" name="password" autocomplete="new-password" placeholder="' +
      (isEdit ? '留空则不修改' : '留空则与邮箱相同') + '"><div class="hint">至少 8 位</div></div>' +
      '<div class="field"><label>权限组</label><select name="group_id">' + groupOptions(groups, u.group_id) + '</select>' +
      '<div class="hint">决定用户可用的节点</div></div>' +
      '<div class="field"><label>总流量 (GB)</label><input type="number" min="0" step="0.01" name="transfer_gb" value="' +
      (isEdit ? bytesToGB(u.transfer_enable) : '') + '" placeholder="例如 100"></div>' +
      expiryField(isEdit ? tsToDate(u.expired_at) : '') +
      '<div class="field"><label>限速 (Mbps)</label><input type="number" min="0" name="speed_limit" value="' + esc(u.speed_limit) + '" placeholder="留空不限速"></div>' +
      '<div class="field"><label>设备数限制</label><input type="number" min="0" name="device_limit" value="' + esc(u.device_limit) + '" placeholder="留空不限制"></div>' +
      (isEdit ?
        '<div class="field"><label>已用流量</label><div>上行 ' + formatBytes(u.u) + ' · 下行 ' + formatBytes(u.d) + '</div></div>' : '<div></div>') +
      '<div class="field full"><label>备注</label><textarea name="remarks" rows="2">' + esc(u.remarks) + '</textarea></div>' +
      '<div class="field full"><label class="check"><input type="checkbox" name="is_admin"' + (u.is_admin ? ' checked' : '') +
      '> 设为管理员（可登录本后台）</label></div>' +
      (isEdit ?
        '<div class="field full"><label>订阅链接</label><div class="sub-link"><input type="text" readonly value="' + esc(u.subscribe_url) + '">' +
        '<button type="button" class="btn" data-copy>复制</button></div></div>' : '') +
      '</div>';

    openModal({
      title: isEdit ? '编辑用户 #' + u.id : '新建用户',
      body,
      submitText: isEdit ? '保存' : '创建',
      onMount(form) {
        bindExpiryShortcuts(form);
        const copyBtn = form.querySelector('[data-copy]');
        if (copyBtn) copyBtn.onclick = () => copyText(u.subscribe_url);
      },
      async onSubmit(data) {
        if (!data.email) {
          toast('请填写邮箱', 'error');
          return false;
        }
        const payload = {
          email: data.email,
          group_id: intOrNull(data.group_id),
          transfer_enable: gbToBytes(data.transfer_gb) || 0,
          expired_at: dateToTs(data.expired_date),
          speed_limit: intOrNull(data.speed_limit),
          device_limit: intOrNull(data.device_limit),
          remarks: data.remarks || null,
          is_admin: !!data.is_admin,
        };
        if (data.password) payload.password = data.password;
        if (isEdit) {
          payload.id = u.id;
          await guard(api.post('/user/update', payload), '已保存');
          loadUsers();
        } else {
          const res = await guard(api.post('/user/create', payload), '用户已创建');
          loadUsers();
          if (res && res.data) showCreatedUser(res.data, data.password || payload.email);
        }
      },
    });
  }

  function showCreatedUser(user, password) {
    openModal({
      title: '用户创建成功',
      body:
        '<div class="field"><label>账号</label><div class="mono">' + esc(user.email) + '</div></div><br>' +
        '<div class="field"><label>密码</label><div class="mono">' + esc(password) + '</div></div><br>' +
        '<div class="field"><label>订阅链接</label><div class="sub-link"><input type="text" readonly value="' + esc(user.subscribe_url) + '">' +
        '<button type="button" class="btn btn-primary" data-copy>复制</button></div></div>',
      footer: '<button type="button" class="btn" data-close>关闭</button>',
      onMount(form) {
        form.querySelector('[data-copy]').onclick = () => copyText(user.subscribe_url);
      },
    });
  }

  async function openBatchGenerate() {
    let groups = [];
    try { groups = await loadGroups(); } catch (e) { /* ignore */ }
    openModal({
      title: '批量生成用户',
      body:
        '<div class="form-grid">' +
        '<div class="field"><label>邮箱前缀</label><input type="text" name="email_prefix" placeholder="留空则随机">' +
        '<div class="hint">填写后生成 前缀_1@后缀、前缀_2@后缀 …</div></div>' +
        '<div class="field"><label>邮箱后缀 *</label><input type="text" name="email_suffix" placeholder="example.com"></div>' +
        '<div class="field"><label>生成数量 *</label><input type="number" min="1" max="500" name="generate_count" value="10"></div>' +
        '<div class="field"><label>密码</label><input type="text" name="password" placeholder="留空则与邮箱相同"></div>' +
        '<div class="field"><label>权限组</label><select name="group_id">' + groupOptions(groups, '') + '</select></div>' +
        '<div class="field"><label>总流量 (GB)</label><input type="number" min="0" step="0.01" name="transfer_gb"></div>' +
        expiryField('') +
        '<div class="field"><label>设备数限制</label><input type="number" min="0" name="device_limit" placeholder="留空不限制"></div>' +
        '</div>',
      submitText: '生成',
      onMount: bindExpiryShortcuts,
      async onSubmit(data) {
        if (!data.email_suffix) {
          toast('请填写邮箱后缀', 'error');
          return false;
        }
        const payload = {
          email_prefix: data.email_prefix || null,
          email_suffix: data.email_suffix,
          generate_count: intOrNull(data.generate_count),
          password: data.password || null,
          group_id: intOrNull(data.group_id),
          transfer_enable: gbToBytes(data.transfer_gb),
          expired_at: dateToTs(data.expired_date),
          device_limit: intOrNull(data.device_limit),
        };
        const res = await guard(api.post('/user/generate', payload), '生成成功');
        loadUsers();
        if (res && Array.isArray(res.data)) showGenerated(res.data);
      },
    });
  }

  function showGenerated(list) {
    const csv = ['账号,密码,到期时间,订阅地址'].concat(list.map((u) =>
      [u.email, u.password, u.expired_at, u.subscribe_url].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','))).join('\n');
    openModal({
      title: '生成结果（共 ' + list.length + ' 个）',
      wide: true,
      body:
        '<div class="table-wrap"><table><thead><tr><th>账号</th><th>密码</th><th>到期</th><th>订阅链接</th><th></th></tr></thead><tbody>' +
        list.map((u, i) => '<tr><td>' + esc(u.email) + '</td><td class="mono">' + esc(u.password) + '</td><td>' + esc(u.expired_at) +
          '</td><td class="mono" style="word-break:break-all">' + esc(u.subscribe_url) + '</td><td><button type="button" class="btn btn-sm" data-i="' + i + '">复制</button></td></tr>').join('') +
        '</tbody></table></div>',
      footer: '<button type="button" class="btn" data-copy-all>复制全部订阅链接</button><button type="button" class="btn" data-csv>下载 CSV</button><button type="button" class="btn btn-primary" data-close>关闭</button>',
      onMount(form, close, mask) {
        form.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => copyText(list[Number(b.dataset.i)].subscribe_url); });
        mask.querySelector('[data-copy-all]').onclick = () => copyText(list.map((u) => u.subscribe_url).join('\n'));
        mask.querySelector('[data-csv]').onclick = () => downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), 'users.csv');
      },
    });
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function exportUsers() {
    try {
      const filter = userFilters();
      const res = await request('POST', ADMIN_BASE + '/user/dumpCSV', filter.length ? { scope: 'filtered', filter } : { scope: 'all' }, { raw: true });
      downloadBlob(await res.blob(), 'users_' + tsToDate(Date.now() / 1000) + '.csv');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------------------------------------------------------------- nodes

  let protocolDefaults = null;

  async function renderNodes(root) {
    root.innerHTML =
      '<div class="card"><div class="toolbar"><span class="muted">节点通过「权限组」分配给用户。对接后端时使用 节点ID + 系统设置中的通讯密钥。</span>' +
      '<div class="spacer"></div><button class="btn btn-primary" id="node-create">+ 添加节点</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID</th><th>名称</th><th>类型</th><th>地址</th><th>权限组</th><th>倍率</th><th>在线</th><th>显示</th><th>操作</th></tr></thead>' +
      '<tbody id="node-tbody"><tr><td colspan="9" class="empty">加载中…</td></tr></tbody></table></div></div>';
    root.querySelector('#node-create').onclick = () => openNodeForm(null);
    loadNodes();
  }

  let nodesCache = [];

  async function loadNodes() {
    const tbody = document.getElementById('node-tbody');
    if (!tbody) return;
    let res;
    try {
      res = await guard(api.get('/server/manage/getNodes'));
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">加载失败</td></tr>';
      return;
    }
    nodesCache = res.data || [];
    if (!nodesCache.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">暂无节点</td></tr>';
      return;
    }
    tbody.innerHTML = nodesCache.map((n) => {
      const status = n.available_status === 2 ? '<span class="badge green">在线</span>' :
        n.available_status === 1 ? '<span class="badge yellow">未推送</span>' : '<span class="badge red">离线</span>';
      return '<tr data-id="' + n.id + '">' +
        '<td>' + n.id + (n.parent_id ? ' <span class="muted">→' + n.parent_id + '</span>' : '') + '</td>' +
        '<td>' + esc(n.name) + '</td>' +
        '<td><span class="badge blue">' + esc(n.type) + '</span></td>' +
        '<td class="mono">' + esc(n.host) + ':' + esc(n.port) + '</td>' +
        '<td>' + (n.groups || []).map((g) => '<span class="badge">' + esc(g.name) + '</span>').join(' ') + '</td>' +
        '<td>' + esc(n.rate) + 'x</td>' +
        '<td>' + status + (n.online ? ' <span class="muted">' + n.online + '人</span>' : '') + '</td>' +
        '<td><label class="check"><input type="checkbox" data-act="show"' + (n.show ? ' checked' : '') + '></label></td>' +
        '<td><div class="actions">' +
        '<button class="btn btn-sm" data-act="edit">编辑</button>' +
        '<button class="btn btn-sm" data-act="copy">复制</button>' +
        '<button class="btn btn-sm btn-danger" data-act="delete">删除</button>' +
        '</div></td></tr>';
    }).join('');
    tbody.querySelectorAll('[data-act]').forEach((el) => {
      const node = nodesCache.find((x) => x.id === Number(el.closest('tr').dataset.id));
      const act = el.dataset.act;
      if (act === 'show') {
        el.onchange = async () => {
          try { await guard(api.post('/server/manage/update', { id: node.id, show: el.checked ? 1 : 0 }), '已更新'); } catch (e) { el.checked = !el.checked; }
        };
        return;
      }
      el.onclick = async () => {
        if (act === 'edit') openNodeForm(node);
        if (act === 'copy') { await guard(api.post('/server/manage/copy', { id: node.id }), '已复制'); loadNodes(); }
        if (act === 'delete') {
          if (!(await confirmDialog('确定删除节点 ' + node.name + ' 吗？'))) return;
          await guard(api.post('/server/manage/drop', { id: node.id }), '已删除');
          loadNodes();
        }
      };
    });
  }

  async function openNodeForm(node) {
    let groups = [], routes = [];
    try {
      [groups, routes] = await Promise.all([loadGroups(), loadRoutes()]);
      if (!protocolDefaults) protocolDefaults = (await api.get('/server/manage/protocolDefaults')).data || {};
    } catch (e) {
      toast(e.message, 'error');
      return;
    }
    const isEdit = !!node;
    const n = node || { type: 'vless', rate: 1, show: true, group_ids: [], route_ids: [] };
    const groupIds = (n.group_ids || []).map(String);
    const routeIds = (n.route_ids || []).map(String);
    const settings = isEdit ? n.protocol_settings : protocolDefaults[n.type];
    const parents = nodesCache.filter((x) => !x.parent_id && (!isEdit || x.id !== n.id));

    const body =
      '<div class="form-grid">' +
      '<div class="field"><label>协议类型 *</label><select name="type"' + (isEdit ? ' disabled' : '') + '>' +
      NODE_TYPES.map((t) => '<option' + (t === n.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      (isEdit ? '<div class="hint">已创建的节点不可修改协议类型</div>' : '') + '</div>' +
      '<div class="field"><label>节点名称 *</label><input type="text" name="name" value="' + esc(n.name) + '"></div>' +
      '<div class="field"><label>连接地址 *</label><input type="text" name="host" value="' + esc(n.host) + '" placeholder="域名或 IP"></div>' +
      '<div class="field"><label>连接端口 *</label><input type="text" name="port" value="' + esc(n.port) + '" placeholder="客户端连接端口，可为端口范围"></div>' +
      '<div class="field"><label>服务端口 *</label><input type="number" name="server_port" value="' + esc(n.server_port) + '" placeholder="后端监听端口"></div>' +
      '<div class="field"><label>流量倍率 *</label><input type="number" step="0.01" min="0" name="rate" value="' + esc(n.rate) + '"></div>' +
      '<div class="field"><label>父节点</label><select name="parent_id"><option value="">（无）</option>' +
      parents.map((p) => '<option value="' + p.id + '"' + (String(n.parent_id) === String(p.id) ? ' selected' : '') + '>' + esc(p.name) + ' #' + p.id + '</option>').join('') +
      '</select><div class="hint">中转/复用其他节点的后端时选择</div></div>' +
      '<div class="field"><label>标签</label><input type="text" name="tags" value="' + esc((n.tags || []).join(',')) + '" placeholder="逗号分隔"></div>' +
      '<div class="field full"><label>权限组</label><div class="check-list">' +
      (groups.length ? groups.map((g) => '<label class="check"><input type="checkbox" data-multi name="group_ids" value="' + g.id + '"' +
        (groupIds.includes(String(g.id)) ? ' checked' : '') + '> ' + esc(g.name) + '</label>').join('') : '<span class="muted">暂无权限组，请先到「权限组」页面创建</span>') +
      '</div></div>' +
      '<div class="field full"><label>路由规则</label><div class="check-list">' +
      (routes.length ? routes.map((r) => '<label class="check"><input type="checkbox" data-multi name="route_ids" value="' + r.id + '"' +
        (routeIds.includes(String(r.id)) ? ' checked' : '') + '> ' + esc(r.remarks) + '</label>').join('') : '<span class="muted">无</span>') +
      '</div></div>' +
      '<div class="field full"><label class="check"><input type="checkbox" name="show"' + (n.show ? ' checked' : '') + '> 在订阅中显示</label></div>' +
      '<div class="field full"><label>协议配置 (JSON)</label><textarea class="code" name="protocol_settings" spellcheck="false">' +
      esc(JSON.stringify(settings || {}, null, 2)) + '</textarea>' +
      '<div class="hint">例如 vless 的 tls: 0=无 1=TLS 2=Reality；network: tcp/ws/grpc/…；切换协议类型会重置为该协议的默认配置</div></div>' +
      '</div>';

    openModal({
      title: isEdit ? '编辑节点 #' + n.id : '添加节点',
      wide: true,
      body,
      onMount(form) {
        const typeSel = form.querySelector('[name=type]');
        typeSel.addEventListener('change', () => {
          form.querySelector('[name=protocol_settings]').value = JSON.stringify(protocolDefaults[typeSel.value] || {}, null, 2);
        });
      },
      async onSubmit(data) {
        let protocolSettings;
        try {
          protocolSettings = JSON.parse(data.protocol_settings || '{}');
        } catch (e) {
          toast('协议配置不是合法的 JSON', 'error');
          return false;
        }
        const payload = Object.assign({}, isEdit ? node : {}, {
          type: isEdit ? n.type : data.type,
          name: data.name,
          host: data.host,
          port: data.port,
          server_port: data.server_port,
          rate: data.rate,
          parent_id: intOrNull(data.parent_id),
          tags: data.tags ? data.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
          group_ids: data.group_ids || [],
          route_ids: data.route_ids || [],
          show: data.show ? 1 : 0,
          protocol_settings: protocolSettings,
        });
        ['groups', 'parent', 'last_check_at', 'last_push_at', 'online', 'is_online', 'available_status', 'cache_key',
          'load_status', 'metrics', 'online_conn', 'created_at', 'updated_at'].forEach((k) => delete payload[k]);
        if (isEdit) payload.id = n.id;
        await guard(api.post('/server/manage/save', payload), '已保存');
        loadNodes();
      },
    });
  }

  // ---------------------------------------------------------------- groups

  async function renderGroups(root) {
    root.innerHTML =
      '<div class="card"><div class="toolbar"><span class="muted">权限组用于把节点分配给用户：用户只能使用其所在权限组内的节点。</span>' +
      '<div class="spacer"></div><button class="btn btn-primary" id="group-create">+ 添加权限组</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID</th><th>名称</th><th>用户数</th><th>节点数</th><th>操作</th></tr></thead>' +
      '<tbody id="group-tbody"><tr><td colspan="5" class="empty">加载中…</td></tr></tbody></table></div></div>';
    root.querySelector('#group-create').onclick = () => openGroupForm(null);
    loadGroupTable();
  }

  async function loadGroupTable() {
    const tbody = document.getElementById('group-tbody');
    let groups;
    try { groups = await guard(loadGroups(true)); } catch (e) { tbody.innerHTML = '<tr><td colspan="5" class="empty">加载失败</td></tr>'; return; }
    if (!groups.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无权限组</td></tr>';
      return;
    }
    tbody.innerHTML = groups.map((g) => '<tr data-id="' + g.id + '"><td>' + g.id + '</td><td>' + esc(g.name) + '</td><td>' +
      (g.users_count || 0) + '</td><td>' + (g.server_count || 0) + '</td><td><div class="actions">' +
      '<button class="btn btn-sm" data-act="edit">编辑</button><button class="btn btn-sm btn-danger" data-act="delete">删除</button></div></td></tr>').join('');
    tbody.querySelectorAll('[data-act]').forEach((b) => {
      const g = groups.find((x) => x.id === Number(b.closest('tr').dataset.id));
      b.onclick = async () => {
        if (b.dataset.act === 'edit') return openGroupForm(g);
        if (!(await confirmDialog('确定删除权限组 ' + g.name + ' 吗？'))) return;
        await guard(api.post('/server/group/drop', { id: g.id }), '已删除');
        loadGroupTable();
      };
    });
  }

  function openGroupForm(group) {
    openModal({
      title: group ? '编辑权限组' : '添加权限组',
      body: '<div class="field"><label>名称 *</label><input type="text" name="name" value="' + esc(group ? group.name : '') + '"></div>',
      async onSubmit(data) {
        await guard(api.post('/server/group/save', group ? { id: group.id, name: data.name } : { name: data.name }), '已保存');
        loadGroupTable();
      },
    });
  }

  // ---------------------------------------------------------------- routes

  async function renderRoutes(root) {
    root.innerHTML =
      '<div class="card"><div class="toolbar"><span class="muted">路由规则下发给节点后端，用于屏蔽或分流特定域名 / IP。</span>' +
      '<div class="spacer"></div><button class="btn btn-primary" id="route-create">+ 添加规则</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID</th><th>备注</th><th>匹配</th><th>动作</th><th>操作</th></tr></thead>' +
      '<tbody id="route-tbody"><tr><td colspan="5" class="empty">加载中…</td></tr></tbody></table></div></div>';
    root.querySelector('#route-create').onclick = () => openRouteForm(null);
    loadRouteTable();
  }

  async function loadRouteTable() {
    const tbody = document.getElementById('route-tbody');
    let routes;
    try { routes = await guard(loadRoutes(true)); } catch (e) { tbody.innerHTML = '<tr><td colspan="5" class="empty">加载失败</td></tr>'; return; }
    if (!routes.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无规则</td></tr>';
      return;
    }
    tbody.innerHTML = routes.map((r) => '<tr data-id="' + r.id + '"><td>' + r.id + '</td><td>' + esc(r.remarks) + '</td><td class="mono">' +
      esc((r.match || []).slice(0, 5).join(', ')) + ((r.match || []).length > 5 ? ' …' : '') + '</td><td>' +
      esc(ROUTE_ACTIONS[r.action] || r.action) + (r.action_value ? ' <span class="muted">' + esc(r.action_value) + '</span>' : '') +
      '</td><td><div class="actions"><button class="btn btn-sm" data-act="edit">编辑</button><button class="btn btn-sm btn-danger" data-act="delete">删除</button></div></td></tr>').join('');
    tbody.querySelectorAll('[data-act]').forEach((b) => {
      const r = routes.find((x) => x.id === Number(b.closest('tr').dataset.id));
      b.onclick = async () => {
        if (b.dataset.act === 'edit') return openRouteForm(r);
        if (!(await confirmDialog('确定删除规则 ' + r.remarks + ' 吗？'))) return;
        await guard(api.post('/server/route/drop', { id: r.id }), '已删除');
        loadRouteTable();
      };
    });
  }

  function openRouteForm(route) {
    const r = route || { action: 'block', match: [] };
    openModal({
      title: route ? '编辑路由规则' : '添加路由规则',
      body:
        '<div class="form-grid">' +
        '<div class="field full"><label>备注 *</label><input type="text" name="remarks" value="' + esc(r.remarks) + '"></div>' +
        '<div class="field full"><label>匹配值 *</label><textarea name="match" rows="6" placeholder="每行一个，例如 domain:example.com、geosite:cn、geoip:private">' +
        esc((r.match || []).join('\n')) + '</textarea></div>' +
        '<div class="field"><label>动作 *</label><select name="action">' + Object.keys(ROUTE_ACTIONS).map((k) =>
          '<option value="' + k + '"' + (k === r.action ? ' selected' : '') + '>' + ROUTE_ACTIONS[k] + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>动作值</label><input type="text" name="action_value" value="' + esc(r.action_value) + '" placeholder="DNS 地址等，可留空"></div>' +
        '</div>',
      async onSubmit(data) {
        const payload = {
          remarks: data.remarks,
          match: data.match.split('\n').map((s) => s.trim()).filter(Boolean),
          action: data.action,
          action_value: data.action_value || null,
        };
        if (route) payload.id = route.id;
        await guard(api.post('/server/route/save', payload), '已保存');
        loadRouteTable();
      },
    });
  }

  // ---------------------------------------------------------------- settings

  function settingInput(key, label, value, opts) {
    opts = opts || {};
    let input;
    if (opts.type === 'bool') {
      return '<div class="field"><label>' + esc(label) + '</label><label class="check"><input type="checkbox" name="' + key + '"' +
        (value ? ' checked' : '') + '> 启用</label>' + (opts.hint ? '<div class="hint">' + opts.hint + '</div>' : '') + '</div>';
    }
    if (opts.options) {
      input = '<select name="' + key + '">' + opts.options.map((o) =>
        '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    } else {
      input = '<input type="' + (opts.type || 'text') + '" name="' + key + '" value="' + esc(value) + '" placeholder="' + esc(opts.placeholder || '') + '">';
    }
    return '<div class="field' + (opts.full ? ' full' : '') + '"><label>' + esc(label) + '</label>' + input +
      (opts.hint ? '<div class="hint">' + opts.hint + '</div>' : '') + '</div>';
  }

  const SETTING_SECTIONS = [
    {
      key: 'site', title: '站点', fields: (c) => [
        settingInput('app_name', '站点名称', c.app_name),
        settingInput('app_url', '站点地址', c.app_url, { placeholder: 'https://example.com', hint: '当前站点的访问地址' }),
        settingInput('subscribe_url', '订阅域名', c.subscribe_url, { placeholder: 'https://sub.example.com', hint: '订阅链接使用的域名，多个用逗号分隔（随机选取）；留空使用当前访问地址' }),
        settingInput('force_https', '强制 HTTPS', c.force_https, { type: 'bool', hint: '在反代后无法识别 HTTPS 时启用' }),
      ],
    },
    {
      key: 'subscribe', title: '订阅', fields: (c) => [
        settingInput('subscribe_path', '订阅路径', c.subscribe_path, { placeholder: 's', hint: '订阅链接形如 /路径/token，修改后旧链接失效' }),
        settingInput('reset_traffic_method', '流量重置方式', c.reset_traffic_method, { options: RESET_METHODS, hint: '对所有用户生效；修改后会重新计算每个用户的下次重置时间' }),
        settingInput('show_info_to_server_enable', '在订阅中显示用户信息', c.show_info_to_server_enable, { type: 'bool', hint: '以节点名的形式显示剩余流量和到期时间' }),
        settingInput('show_protocol_to_server_enable', '节点名称显示协议', c.show_protocol_to_server_enable, { type: 'bool' }),
      ],
    },
    {
      key: 'server', title: '节点通讯', fields: (c) => [
        settingInput('server_token', '通讯密钥', c.server_token, { hint: '节点后端对接使用，至少 16 位' }),
        settingInput('device_limit_mode', '设备限制模式', c.device_limit_mode, { options: [[0, '严格模式'], [1, '宽松模式（同 IP 计为一台）']] }),
        settingInput('server_pull_interval', '节点拉取间隔（秒）', c.server_pull_interval, { type: 'number' }),
        settingInput('server_push_interval', '节点推送间隔（秒）', c.server_push_interval, { type: 'number' }),
        settingInput('server_ws_enable', 'WebSocket 实时同步', c.server_ws_enable, { type: 'bool' }),
        settingInput('server_ws_url', 'WebSocket 地址', c.server_ws_url, { placeholder: '留空自动', hint: '自定义节点 WebSocket 连接地址' }),
      ],
    },
    {
      key: 'safe', title: '安全', fields: (c) => [
        settingInput('secure_path', '后台路径', c.secure_path, { hint: '至少 8 位字母/数字；修改后需用新地址访问后台' }),
        settingInput('safe_mode_enable', '安全模式', c.safe_mode_enable, { type: 'bool', hint: '启用后只允许通过「站点地址」中的域名访问' }),
        settingInput('password_limit_enable', '登录密码错误限制', c.password_limit_enable, { type: 'bool' }),
        settingInput('password_limit_count', '最大错误次数', c.password_limit_count, { type: 'number' }),
        settingInput('password_limit_expire', '锁定时长（分钟）', c.password_limit_expire, { type: 'number' }),
      ],
    },
  ];

  async function renderSettings(root) {
    root.innerHTML = '<div class="card empty">加载中…</div>';
    let config;
    try {
      config = (await guard(api.get('/config/fetch'))).data;
    } catch (e) {
      root.innerHTML = '<div class="card empty">加载失败</div>';
      return;
    }
    root.innerHTML = SETTING_SECTIONS.map((s) =>
      '<form class="card" data-section="' + s.key + '"><h3>' + s.title + '</h3><div class="form-grid">' +
      s.fields(config[s.key] || {}).join('') + '</div>' +
      '<div class="toolbar" style="margin:12px 0 0"><div class="spacer"></div><button type="submit" class="btn btn-primary">保存' + s.title + '设置</button></div></form>'
    ).join('');
    root.querySelectorAll('form[data-section]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = formData(form);
        const oldPath = SETTINGS.secure_path;
        await guard(api.post('/config/save', data), '已保存');
        if (data.secure_path && data.secure_path !== oldPath) {
          toast('后台路径已修改，即将跳转到新地址', 'success');
          setTimeout(() => { location.href = '/' + data.secure_path; }, 1200);
        }
      });
    });
  }

  // ---------------------------------------------------------------- boot

  if (getToken()) {
    if (!location.hash) location.hash = '#/users';
    renderShell();
  } else {
    renderLogin();
  }
})();
