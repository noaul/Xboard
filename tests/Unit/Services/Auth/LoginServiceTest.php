<?php

namespace Tests\Unit\Services\Auth;

use App\Models\User;
use App\Services\Auth\LoginService;
use App\Utils\Helper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class LoginServiceTest extends TestCase
{
    use RefreshDatabase;

    private LoginService $service;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        $this->service = app(LoginService::class);
    }

    public function test_admin_can_login(): void
    {
        $admin = $this->createUser('admin@example.com', 'password123', isAdmin: true);

        [$success, $result] = $this->service->login('admin@example.com', 'password123');

        $this->assertTrue($success);
        $this->assertSame($admin->id, $result->id);
    }

    public function test_regular_user_cannot_login(): void
    {
        $this->createUser('user@example.com', 'password123');

        [$success, $result] = $this->service->login('user@example.com', 'password123');

        $this->assertFalse($success);
        $this->assertSame(403, $result[0]);
    }

    public function test_wrong_password_is_rejected(): void
    {
        $this->createUser('admin@example.com', 'password123', isAdmin: true);

        [$success, $result] = $this->service->login('admin@example.com', 'wrong-password');

        $this->assertFalse($success);
        $this->assertSame(400, $result[0]);
    }

    public function test_unknown_email_is_rejected_with_same_error_as_wrong_password(): void
    {
        [$success, $result] = $this->service->login('nobody@example.com', 'password123');

        $this->assertFalse($success);
        $this->assertSame(400, $result[0]);
    }

    public function test_banned_admin_cannot_login(): void
    {
        $this->createUser('admin@example.com', 'password123', isAdmin: true, banned: true);

        [$success, $result] = $this->service->login('admin@example.com', 'password123');

        $this->assertFalse($success);
        $this->assertSame(400, $result[0]);
    }

    private function createUser(string $email, string $password, bool $isAdmin = false, bool $banned = false): User
    {
        return User::query()->create([
            'email' => $email,
            'password' => password_hash($password, PASSWORD_DEFAULT),
            'uuid' => Helper::guid(true),
            'token' => Helper::guid(),
            'is_admin' => $isAdmin,
            'banned' => $banned,
            'created_at' => time(),
            'updated_at' => time(),
        ]);
    }
}
