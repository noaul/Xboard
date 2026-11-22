<?php

use App\Services\UpdateService;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| 精简版：已移除用户前台面板，仅保留管理后台入口与订阅地址。
|
*/

// 用户前台已移除，根路径不再提供任何页面
Route::get('/', function () {
    abort(404);
});

Route::get('/' . admin_setting('secure_path', admin_setting('frontend_admin_path', hash('crc32b', config('app.key')))), function () {
    return view('admin', [
        'title' => admin_setting('app_name', 'XBoard'),
        'version' => app(UpdateService::class)->getCurrentVersion(),
        'secure_path' => admin_setting('secure_path', admin_setting('frontend_admin_path', hash('crc32b', config('app.key'))))
    ]);
});

Route::get('/' . (admin_setting('subscribe_path', 's')) . '/{token}', [\App\Http\Controllers\V1\Client\ClientController::class, 'subscribe'])
    ->middleware('client')
    ->name('client.subscribe');
