begin;

alter table public.app_settings add column if not exists voice_assistant_provider text not null default 'openai-compatible';
alter table public.app_settings add column if not exists voice_assistant_base_url text not null default 'https://api.openai.com/v1';
alter table public.app_settings add column if not exists voice_assistant_api_key_encrypted text;
alter table public.app_settings add column if not exists voice_assistant_model text not null default 'gpt-4o-mini';
alter table public.app_settings add column if not exists voice_assistant_system_prompt text not null default '你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。';
alter table public.app_settings add column if not exists voice_assistant_allow_mutations boolean not null default false;
alter table public.app_settings add column if not exists voice_assistant_default_voice text not null default 'zh-CN-XiaoxiaoNeural';
alter table public.app_settings add column if not exists voice_assistant_configured boolean not null default false;

comment on column public.app_settings.voice_assistant_provider is 'AI voice assistant provider protocol';
comment on column public.app_settings.voice_assistant_base_url is 'HTTPS base URL for the configured AI provider';
comment on column public.app_settings.voice_assistant_api_key_encrypted is 'AES-GCM encrypted provider API key; never returned to clients';
comment on column public.app_settings.voice_assistant_model is 'AI model identifier';
comment on column public.app_settings.voice_assistant_system_prompt is 'System prompt used for voice assistant requests';
comment on column public.app_settings.voice_assistant_allow_mutations is 'Whether confirmed requests may expose non-destructive MCP mutation tools';
comment on column public.app_settings.voice_assistant_default_voice is 'Default Edge TTS voice for assistant replies';
comment on column public.app_settings.voice_assistant_configured is 'Whether database provider values explicitly override environment configuration';

insert into public.app_migrations(version)
values ('app-settings-voice-assistant-v1')
on conflict (version) do update set completed_at = excluded.completed_at;

do $verify$
declare actual integer;
begin
  select count(*) into actual
  from information_schema.columns
  where table_schema = 'public' and table_name = 'app_settings'
    and column_name in (
      'voice_assistant_provider', 'voice_assistant_base_url', 'voice_assistant_api_key_encrypted',
      'voice_assistant_model', 'voice_assistant_system_prompt', 'voice_assistant_allow_mutations',
      'voice_assistant_default_voice', 'voice_assistant_configured'
    );
  if actual <> 8 then raise exception 'voice assistant app_settings columns are incomplete'; end if;
end $verify$;

commit;
