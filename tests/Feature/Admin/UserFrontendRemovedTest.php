<?php

namespace Tests\Feature\Admin;

use App\Models\Plan;
use App\Models\Server;
use App\Models\ServerGroup;
use App\Models\User;
use App\Utils\Helper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class UserFrontendRemovedTest extends TestCase
{
    use RefreshDatabase;

    private string $securePath;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Bus::fake();
        admin_setting(['server_ws_enable' => 0]);
        $this->securePath = admin_setting('secure_path', admin_setting('frontend_admin_path', hash('crc32b', config('app.key'))));
    }

    private function makeUser(string $email, bool $isAdmin = false, array $extra = []): User
    {
        return User::query()->create(array_merge([
            'email' => $email,
            'password' => password_hash('password123', PASSWORD_DEFAULT),
            'uuid' => Helper::guid(true),
            'token' => Helper::guid(),
            'is_admin' => $isAdmin,
            'created_at' => time(),
            'updated_at' => time(),
        ], $extra));
    }

    public function test_user_frontend_and_self_service_endpoints_are_gone(): void
    {
        $this->get('/')->assertNotFound();
        $this->postJson('/api/v1/passport/auth/register', [])->assertNotFound();
        $this->postJson('/api/v1/passport/auth/forget', [])->assertNotFound();
        $this->postJson('/api/v1/passport/comm/sendEmailVerify', [])->assertNotFound();
        $this->getJson('/api/v1/guest/comm/config')->assertNotFound();
        $this->getJson('/api/v1/guest/plan/fetch')->assertNotFound();
        $this->postJson('/api/v1/guest/payment/notify/EPay/abc')->assertNotFound();
        $this->getJson('/api/v1/user/info')->assertNotFound();
        $this->postJson('/api/v1/user/order/save')->assertNotFound();
        $this->getJson('/api/v2/user/info')->assertStatus(403);
    }

    public function test_only_admin_can_login(): void
    {
        $this->makeUser('user@example.com');
        $this->makeUser('admin@example.com', true);

        $this->postJson('/api/v2/passport/auth/login', ['email' => 'user@example.com', 'password' => 'password123'])
            ->assertStatus(403);
        $this->postJson('/api/v2/passport/auth/login', ['email' => 'admin@example.com', 'password' => 'password123'])
            ->assertOk()->assertJsonPath('data.is_admin', true);
    }

    public function test_admin_features_remain_available(): void
    {
        $this->makeUser('admin@example.com', true);
        $token = $this->postJson('/api/v2/passport/auth/login', ['email' => 'admin@example.com', 'password' => 'password123'])
            ->json('data.auth_data');
        $base = '/api/v2/' . $this->securePath;

        foreach (['/plan/fetch', '/order/fetch', '/coupon/fetch', '/ticket/fetch', '/knowledge/fetch', '/notice/fetch', '/payment/fetch', '/server/manage/getNodes', '/server/machine/fetch', '/stat/getOverride', '/user/fetch', '/config/fetch'] as $path) {
            $this->withHeader('Authorization', $token)->getJson($base . $path)->assertOk();
        }

        $this->withHeader('Authorization', $token)->getJson('/api/v2/user/info')
            ->assertOk()->assertJsonPath('data.email', 'admin@example.com');

        $this->get('/' . $this->securePath)->assertOk()->assertSee('/assets/admin/', false);
    }

    public function test_subscription_link_still_works_for_plan_user(): void
    {
        $group = new ServerGroup();
        $group->name = 'default';
        $group->save();

        $plan = new Plan();
        $plan->forceFill([
            'group_id' => $group->id,
            'transfer_enable' => 100,
            'name' => 'internal',
            'show' => false,
            'sell' => false,
            'renew' => false,
            'sort' => 1,
        ])->save();

        Server::create([
            'name' => 'node-1',
            'type' => Server::TYPE_VLESS,
            'host' => 'node.example.com',
            'port' => '443',
            'server_port' => 443,
            'rate' => '1',
            'group_ids' => [(string) $group->id],
            'show' => true,
        ]);

        $user = $this->makeUser('alice@example.com', false, [
            'plan_id' => $plan->id,
            'group_id' => $group->id,
            'transfer_enable' => 100 * 1073741824,
            'expired_at' => time() + 86400 * 30,
        ]);

        $response = $this->get('/s/' . $user->token);
        $response->assertOk();
        $this->assertStringContainsString('vless://', base64_decode($response->getContent()));
    }
}
