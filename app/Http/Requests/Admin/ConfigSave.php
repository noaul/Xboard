<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class ConfigSave extends FormRequest
{
    const RULES = [
        // site
        'force_https' => '',
        'app_name' => '',
        'app_url' => 'nullable|url',
        'subscribe_url' => 'nullable',
        // subscribe
        'reset_traffic_method' => 'in:0,1,2,3,4',
        'show_info_to_server_enable' => '',
        'show_protocol_to_server_enable' => '',
        'subscribe_path' => 'nullable|regex:/^[\w\/-]+$/',
        // server
        'server_token' => 'nullable|min:16',
        'server_pull_interval' => 'integer',
        'server_push_interval' => 'integer',
        'device_limit_mode' => 'integer',
        'server_ws_enable' => 'boolean',
        'server_ws_url' => 'nullable|url',
        // safe
        'safe_mode_enable' => 'boolean',
        'secure_path' => 'min:8|regex:/^[\w-]*$/',
        'password_limit_enable' => 'boolean',
        'password_limit_count' => 'integer',
        'password_limit_expire' => 'integer',
        // subscribe templates
        'subscribe_template_singbox' => 'nullable',
        'subscribe_template_clash' => 'nullable',
        'subscribe_template_clashmeta' => 'nullable',
        'subscribe_template_stash' => 'nullable',
        'subscribe_template_surge' => 'nullable',
        'subscribe_template_surfboard' => 'nullable'
    ];
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array
     */
    public function rules()
    {
        return self::RULES;
    }

    public function messages()
    {
        // illiteracy prompt
        return [
            'app_url.url' => '站点URL格式不正确，必须携带http(s)://',
            'server_token.min' => '通讯密钥长度必须大于16位',
            'secure_path.min' => '后台路径长度最小为8位',
            'secure_path.regex' => '后台路径只能为字母或数字',
            'subscribe_path.regex' => '订阅路径只能包含字母、数字、下划线、短横线或斜杠',
        ];
    }
}
