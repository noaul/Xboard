<?php
namespace App\Http\Routes\V2;

use App\Http\Controllers\V2\Admin\ProfileController;
use Illuminate\Contracts\Routing\Registrar;

class UserRoute
{
    public function map(Registrar $router)
    {
        // 用户前台已移除；管理面板仍会读取当前登录账号信息，故仅对管理员开放
        $router->group([
            'prefix' => 'user',
            'middleware' => 'admin'
        ], function ($router) {
            $router->get('/info', [ProfileController::class, 'info']);
        });
    }
}
