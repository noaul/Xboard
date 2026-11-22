<?php

namespace App\Http\Controllers\V1\Passport;

use App\Http\Controllers\Controller;
use App\Http\Requests\Passport\AuthLogin;
use App\Services\Auth\LoginService;
use App\Services\AuthService;

class AuthController extends Controller
{
    public function __construct(protected LoginService $loginService)
    {
    }

    /**
     * 管理员登录
     */
    public function login(AuthLogin $request)
    {
        [$success, $result] = $this->loginService->login(
            $request->input('email'),
            $request->input('password')
        );

        if (!$success) {
            return $this->fail($result);
        }

        $authService = new AuthService($result);
        return $this->success($authService->generateAuthData());
    }
}
