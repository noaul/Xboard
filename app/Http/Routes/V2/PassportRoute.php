<?php
namespace App\Http\Routes\V2;

use App\Http\Controllers\V1\Passport\AuthController;
use Illuminate\Contracts\Routing\Registrar;

class PassportRoute
{
    public function map(Registrar $router)
    {
        $router->group([
            'prefix' => 'passport'
        ], function ($router) {
            // 仅保留管理员登录
            $router->post('/auth/login', [AuthController::class, 'login']);
        });
    }
}
