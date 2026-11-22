<?php

namespace App\Http\Requests\Admin;

use App\Services\Plugin\HookManager;
use App\Http\Requests\Concerns\NormalizesEmail;
use Illuminate\Foundation\Http\FormRequest;

class UserUpdate extends FormRequest
{
    use NormalizesEmail;
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array
     */
    public function rules()
    {
        $rules = [
            'id' => 'required|integer',
            'email' => 'email:strict|max:64',
            'password' => 'nullable|min:8',
            'transfer_enable' => 'numeric|min:0',
            'expired_at' => 'nullable|integer',
            'banned' => 'bool',
            'group_id' => 'nullable|integer|exists:App\\Models\\ServerGroup,id',
            'is_admin' => 'boolean',
            'u' => 'integer|min:0',
            'd' => 'integer|min:0',
            'remarks' => 'nullable|string',
            'speed_limit' => 'nullable|integer|min:0',
            'device_limit' => 'nullable|integer|min:0'
        ];

        return HookManager::filter('admin.user.update.rules', $rules, $this);
    }

    public function messages()
    {
        $messages = [
            'email.required' => '邮箱不能为空',
            'email.email' => '邮箱格式不正确',
            'transfer_enable.numeric' => '流量格式不正确',
            'expired_at.integer' => '到期时间格式不正确',
            'banned.in' => '是否封禁格式不正确',
            'group_id.integer' => '权限组格式不正确',
            'group_id.exists' => '权限组不存在',
            'is_admin.in' => '是否管理员格式不正确',
            'u.integer' => '上行流量格式不正确',
            'd.integer' => '下行流量格式不正确',
            'password.min' => '密码长度最小8位',
            'speed_limit.integer' => '限速格式不正确',
            'device_limit.integer' => '设备数量格式不正确'
        ];

        return HookManager::filter('admin.user.update.messages', $messages, $this);
    }
}
