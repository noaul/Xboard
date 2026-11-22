<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\ServerGroup;
use App\Models\User;
use App\Services\TrafficResetService;
use App\Utils\Helper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private string $adminBase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Bus::fake();
        admin_setting(['server_ws_enable' => 0]);

        $this->admin = User::query()->create([
            'email' => 'admin@example.com',
            'password' => password_hash('password123', PASSWORD_DEFAULT),
            'uuid' => Helper::guid(true),
            'token' => Helper::guid(),
            'is_admin' => true,
            'created_at' => time(),
            'updated_at' => time(),
        ]);

        $securePath = admin_setting('secure_path', admin_setting('frontend_admin_path', hash('crc32b', config('app.key'))));
        $this->adminBase = '/api/v2/' . $securePath;
    }

    private function makeGroup(string $name): ServerGroup
    {
        $group = new ServerGroup();
        $group->name = $name;
        $group->save();
        return $group;
    }

    private function adminToken(): string
    {
        $response = $this->postJson('/api/v2/passport/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'password123',
        ]);
        $response->assertOk();

        return $response->json('data.auth_data');
    }

    public function test_admin_can_create_user_and_get_working_subscription_link(): void
    {
        $token = $this->adminToken();
        $group = $this->makeGroup('default');
        Server::create([
            'name' => 'node-1',
            'type' => Server::TYPE_VLESS,
            'host' => 'node.example.com',
            'port' => '443',
            'server_port' => 443,
            'rate' => '1',
            'group_ids' => [(string) $group->id],
            'show' => true,
            'protocol_settings' => Server::defaultProtocolSettings(Server::TYPE_VLESS),
        ]);

        $expiredAt = time() + 30 * 86400;
        $response = $this->withHeader('Authorization', $token)->postJson($this->adminBase . '/user/create', [
            'email' => 'Alice@Example.com',
            'password' => 'alice-password',
            'group_id' => $group->id,
            'transfer_enable' => 100 * 1073741824,
            'expired_at' => $expiredAt,
            'device_limit' => 3,
            'remarks' => 'vip',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.email', 'alice@example.com')
            ->assertJsonPath('data.group_id', $group->id);
        $subscribeUrl = $response->json('data.subscribe_url');
        $this->assertNotEmpty($subscribeUrl);

        $user = User::byEmail('alice@example.com')->firstOrFail();
        $this->assertNull($user->plan_id);
        $this->assertSame(100 * 1073741824, (int) $user->transfer_enable);
        $this->assertTrue($user->isAvailable());
        $this->assertNotNull($user->next_reset_at, 'monthly reset should be scheduled without a plan');
        $this->assertStringEndsWith('/s/' . $user->token, $subscribeUrl);

        // 订阅链接无需登录即可访问并返回节点
        $sub = $this->get('/s/' . $user->token);
        $sub->assertOk();
        $this->assertStringContainsString('vless://', base64_decode($sub->getContent()));

        // 用户列表包含新用户及订阅链接
        $list = $this->withHeader('Authorization', $token)->postJson($this->adminBase . '/user/fetch', [
            'filter' => [['id' => 'email', 'value' => 'alice']],
        ]);
        $list->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.subscribe_url', $subscribeUrl);
    }

    public function test_create_rejects_duplicate_email(): void
    {
        $token = $this->adminToken();

        $this->withHeader('Authorization', $token)->postJson($this->adminBase . '/user/create', [
            'email' => 'ADMIN@example.com',
        ])->assertStatus(400);
    }

    public function test_batch_generate_without_plan(): void
    {
        $token = $this->adminToken();
        $group = $this->makeGroup('g');

        $response = $this->withHeader('Authorization', $token)->postJson($this->adminBase . '/user/generate', [
            'email_prefix' => 'trial',
            'email_suffix' => 'example.com',
            'generate_count' => 3,
            'group_id' => $group->id,
            'transfer_enable' => 1073741824,
        ]);

        $response->assertOk()->assertJsonCount(3, 'data');
        $this->assertSame(3, User::where('group_id', $group->id)->where('transfer_enable', 1073741824)->count());
    }

    public function test_admin_cannot_demote_or_delete_self(): void
    {
        $token = $this->adminToken();

        $this->withHeader('Authorization', $token)->postJson($this->adminBase . '/user/update', [
            'id' => $this->admin->id,
            'is_admin' => false,
        ])->assertStatus(400);

        $this->withHeader('Authorization', $token)->postJson($this->adminBase . '/user/destroy', [
            'id' => $this->admin->id,
        ])->assertStatus(400);

        $this->assertTrue($this->admin->fresh()->is_admin);
    }

    public function test_regular_user_cannot_login_or_use_admin_api(): void
    {
        $user = User::query()->create([
            'email' => 'user@example.com',
            'password' => password_hash('password123', PASSWORD_DEFAULT),
            'uuid' => Helper::guid(true),
            'token' => Helper::guid(),
            'created_at' => time(),
            'updated_at' => time(),
        ]);

        $this->postJson('/api/v2/passport/auth/login', [
            'email' => 'user@example.com',
            'password' => 'password123',
        ])->assertStatus(403);

        $token = $user->createToken('t')->plainTextToken;
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson($this->adminBase . '/user/fetch')
            ->assertStatus(403);
    }

    public function test_removed_user_facing_endpoints_are_gone(): void
    {
        $this->get('/')->assertNotFound();
        $this->postJson('/api/v1/passport/auth/register', [])->assertNotFound();
        $this->postJson('/api/v1/passport/auth/forget', [])->assertNotFound();
        $this->getJson('/api/v1/user/info')->assertNotFound();
        $this->getJson('/api/v1/guest/comm/config')->assertNotFound();
        $this->getJson('/api/v1/user/plan/fetch')->assertNotFound();
        $this->getJson('/api/v1/user/ticket/fetch')->assertNotFound();
        $this->getJson($this->adminBase . '/order/fetch')->assertNotFound();
        $this->getJson($this->adminBase . '/ticket/fetch')->assertNotFound();
        $this->getJson($this->adminBase . '/plan/fetch')->assertNotFound();
    }

    public function test_changing_reset_method_recalculates_next_reset_time(): void
    {
        $token = $this->adminToken();
        $this->assertNotNull($this->admin->fresh()->next_reset_at);

        $this->withHeader('Authorization', $token)->postJson($this->adminBase . '/config/save', [
            'reset_traffic_method' => TrafficResetService::RESET_TRAFFIC_NEVER,
        ])->assertOk();

        $this->assertNull($this->admin->fresh()->next_reset_at);
    }

    public function test_admin_panel_page_renders(): void
    {
        $securePath = admin_setting('secure_path', admin_setting('frontend_admin_path', hash('crc32b', config('app.key'))));

        $this->get('/' . $securePath)
            ->assertOk()
            ->assertSee('/assets/admin/app.js', false)
            ->assertSee('"secure_path":"' . $securePath . '"', false);
    }
}
