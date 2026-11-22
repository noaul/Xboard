<!DOCTYPE html>
<html lang="zh-CN">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>{{ $title }} - 管理后台</title>
  <link rel="stylesheet" href="/assets/admin/app.css?v={{ $version }}" />
  <script>
    window.settings = {!! json_encode(['title' => $title, 'version' => $version, 'secure_path' => $secure_path], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) !!};
  </script>
</head>

<body>
  <div id="app"></div>
  <div id="modal-root"></div>
  <div id="toast-root"></div>
  <script src="/assets/admin/app.js?v={{ $version }}"></script>
</body>

</html>
