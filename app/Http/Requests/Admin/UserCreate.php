<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\NormalizesEmail;
use Illuminate\Foundation\Http\FormRequest;

class UserCreate extends FormRequest
{
    use NormalizesEmail;

    public function rules()
    {
        return [
            'email' => 'required|email:strict|max:64',
            'password' => 'nullable|string|min:8',
            'group_id' => 'nullable|integer|exists:App\\Models\\ServerGroup,id',
            'transfer_enable' => 'nullable|integer|min:0',
            'expired_at' => 'nullable|integer',
            'speed_limit' => 'nullable|integer|min:0',
            'device_limit' => 'nullable|integer|min:0',
            'remarks' => 'nullable|string',
            'is_admin' => 'nullable|boolean',
        ];
    }

    public function messages()
    {
        return [
            'email.required' => '邮箱不能为空',
            'email.email' => '邮箱格式不正确',
            'email.max' => '邮箱长度不能超过64个字符',
            'password.min' => '密码长度最小8位',
            'group_id.exists' => '权限组不存在',
            'transfer_enable.integer' => '流量格式不正确',
            'expired_at.integer' => '到期时间格式不正确',
            'speed_limit.integer' => '限速格式不正确',
            'device_limit.integer' => '设备数量格式不正确',
        ];
    }
}
