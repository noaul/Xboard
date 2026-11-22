<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Plugin\HookManager;
use App\Utils\CacheKey;
use App\Utils\Helper;
use Illuminate\Support\Facades\Cache;

class LoginService
{
    /**
     * 处理管理员登录（本精简版仅管理员可登录）
     *
     * @param string $email 邮箱
     * @param string $password 密码
     * @return array [成功状态, 用户对象或错误信息]
     */
    public function login(string $email, string $password): array
    {
        $email = User::normalizeEmail($email);

        // 检查密码错误限制
        if ((int) admin_setting('password_limit_enable', true)) {
            $passwordErrorCount = (int) Cache::get(CacheKey::get('PASSWORD_ERROR_LIMIT', $email), 0);
            if ($passwordErrorCount >= (int) admin_setting('password_limit_count', 5)) {
                return [
                    false,
                    [
                        429,
                        __('There are too many password errors, please try again after :minute minutes.', [
                            'minute' => admin_setting('password_limit_expire', 60)
                        ])
                    ]
                ];
            }
        }

        $user = User::byEmail($email)->first();
        if (
            !$user
            || !Helper::multiPasswordVerify(
                $user->password_algo,
                $user->password_salt,
                $password,
                $user->password
            )
        ) {
            if ((int) admin_setting('password_limit_enable', true)) {
                $passwordErrorCount = (int) Cache::get(CacheKey::get('PASSWORD_ERROR_LIMIT', $email), 0);
                Cache::put(
                    CacheKey::get('PASSWORD_ERROR_LIMIT', $email),
                    (int) $passwordErrorCount + 1,
                    60 * (int) admin_setting('password_limit_expire', 60)
                );
            }
            return [false, [400, __('Incorrect email or password')]];
        }

        if ($user->banned) {
            return [false, [400, __('Your account has been suspended')]];
        }

        // 用户面板已移除，只有管理员可以登录
        if (!$user->is_admin) {
            return [false, [403, __('Only administrators can sign in')]];
        }

        $user->last_login_at = time();
        $user->save();

        HookManager::call('user.login.after', $user);
        return [true, $user];
    }
}
