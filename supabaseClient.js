/**
 * Supabase 数据表结构（SQL 参考）
 *
 * ```sql
 * create table if not exists public.videos (
 *   id uuid primary key,
 *   title text not null,
 *   stream_id text,
 *   poster text,
 *   level text,
 *   topic text,
 *   requires_pro bool default false
 * );
 *
 * create table if not exists public.subtitles (
 *   id uuid primary key,
 *   video_id uuid references public.videos(id) on delete cascade,
 *   lang text not null,
 *   vtt_url text not null
 * );
 *
 * create table if not exists public.cards (
 *   id uuid primary key,
 *   phrase text not null,
 *   zh text,
 *   note text,
 *   level int default 1,
 *   tags text[]
 * );
 *
 * create table if not exists public.video_cards (
 *   video_id uuid references public.videos(id) on delete cascade,
 *   card_id uuid references public.cards(id) on delete cascade
 * );
 *
 * create table if not exists public.study_notes (
 *   id uuid primary key,
 *   video_id uuid references public.videos(id) on delete cascade,
 *   cue_id text,
 *   kind text,
 *   title text,
 *   body text,
 *   examples jsonb,
 *   tags text[],
 *   cue_text text,
 *   video_title text,
 *   created_at timestamptz default now(),
 *   updated_at timestamptz default now()
 * );
 *
 * create table if not exists public.user_progress (
 *   user_id uuid,
 *   video_id uuid references public.videos(id) on delete cascade,
 *   last_sec numeric,
 *   completed boolean default false,
 *   streak int default 0,
 *   updated_at timestamptz default now()
 * );
 *
 * create table if not exists public.activations (
 *   code text primary key,
 *   is_used bool default false,
 *   plan text,
 *   used_by uuid,
 *   used_at timestamptz
 * );
 *
 * -- RLS 建议（仅供参考，需结合实际需求调整）
 * -- enable row level security on all tables
 * alter table public.videos enable row level security;
 * alter table public.subtitles enable row level security;
 * alter table public.cards enable row level security;
 * alter table public.video_cards enable row level security;
 * alter table public.study_notes enable row level security;
 * alter table public.user_progress enable row level security;
 * alter table public.activations enable row level security;
 * -- 允许登录用户访问自身数据，匿名用户可根据 deviceId 写入进度
 * create policy "progress_owner" on public.user_progress
 *   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
 * create policy "device_progress" on public.user_progress
 *   for insert with check (auth.role() = 'anon');
 * create policy "cards_owner" on public.cards
 *   for all using (auth.uid() is not null) with check (auth.uid() is not null);
 * create policy "videos_public" on public.videos for select using (true);
 * create policy "subtitles_public" on public.subtitles for select using (true);
 * -- 激活码仅能通过 RPC 访问
 * revoke all on table public.activations from anon, authenticated;
 * ```
 */
(function (global) {
  const manager = {
    config: { url: '', anonKey: '' },
    client: null
  };

  function createClient(url, anonKey) {
    if (!url || !anonKey) return null;
    const factory = global.supabase?.createClient;
    if (typeof factory !== 'function') {
      console.warn('Supabase SDK 未加载。');
      return null;
    }
    try {
      return factory(url, anonKey, {
        global: { headers: { 'X-Client-Info': 'ai-espanol-web/1.0.0' } }
      });
    } catch (error) {
      console.warn('创建 Supabase 客户端失败', error);
      return null;
    }
  }

  function ensureClient() {
    if (!manager.config.url || !manager.config.anonKey) {
      manager.client = null;
      return null;
    }
    if (!manager.client) {
      manager.client = createClient(manager.config.url, manager.config.anonKey);
    }
    return manager.client;
  }

  manager.setConfig = function setConfig({ url = '', anonKey = '' } = {}) {
    const cleanUrl = typeof url === 'string' ? url.trim() : '';
    const cleanKey = typeof anonKey === 'string' ? anonKey.trim() : '';
    const changed = cleanUrl !== manager.config.url || cleanKey !== manager.config.anonKey;
    manager.config = { url: cleanUrl, anonKey: cleanKey };
    if (changed) {
      manager.client = null;
      ensureClient();
    }
  };

  manager.getConfig = function getConfig() {
    return { ...manager.config };
  };

  manager.getClient = function getClient() {
    return ensureClient();
  };

  manager.isReady = function isReady() {
    return Boolean(ensureClient());
  };

  manager.listVideos = async function listVideos({
    page = 1,
    pageSize = 6,
    topic = '',
    level = '',
    search = '',
    includePro = true
  } = {}) {
    const client = ensureClient();
    if (!client) {
      return { data: [], count: 0, error: new Error('unconfigured') };
    }
    try {
      const from = Math.max((page - 1) * pageSize, 0);
      const to = from + pageSize - 1;
      let query = client
        .from('videos')
        .select('id,title,stream_id,poster,level,topic,requires_pro', { count: 'exact' })
        .order('title', { ascending: true })
        .range(from, to);
      if (topic && topic !== 'all') {
        query = query.eq('topic', topic);
      }
      if (level && level !== 'all') {
        query = query.eq('level', level);
      }
      if (search) {
        query = query.ilike('title', `%${search}%`);
      }
      if (!includePro) {
        query = query.eq('requires_pro', false);
      }
      const { data, error, count } = await query;
      if (error) {
        throw error;
      }
      return { data: data || [], count: typeof count === 'number' ? count : (data || []).length };
    } catch (error) {
      console.warn('加载 Supabase 视频列表失败', error);
      return { data: [], count: 0, error };
    }
  };

  manager.upsertVideo = async function upsertVideo({
    id,
    title,
    stream_id,
    poster,
    level,
    topic,
    requires_pro
  } = {}) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    if (!id || !title) {
      return { error: new Error('invalid_payload') };
    }
    try {
      const payload = {
        id,
        title,
        stream_id: stream_id || null,
        poster: poster || null,
        level: level || null,
        topic: topic || null,
        requires_pro: Boolean(requires_pro)
      };
      const { error } = await client.from('videos').upsert(payload, { onConflict: 'id' });
      if (error) {
        throw error;
      }
      return { success: true };
    } catch (error) {
      console.warn('写入 Supabase 视频失败', error);
      return { error };
    }
  };

  manager.fetchSubtitles = async function fetchSubtitles(videoId) {
    const client = ensureClient();
    if (!client || !videoId) {
      return { data: [], error: new Error('unconfigured') };
    }
    try {
      const { data, error } = await client
        .from('subtitles')
        .select('id,lang,vtt_url')
        .eq('video_id', videoId)
        .order('lang', { ascending: true });
      if (error) {
        throw error;
      }
      return { data: data || [] };
    } catch (error) {
      console.warn('加载 Supabase 字幕失败', error);
      return { data: [], error };
    }
  };

  manager.fetchStudyNotes = async function fetchStudyNotes(videoId) {
    const client = ensureClient();
    if (!client || !videoId) {
      return { data: [], error: new Error('unconfigured') };
    }
    try {
      const { data, error } = await client
        .from('study_notes')
        .select('id,video_id,cue_id,kind,title,body,examples,tags,updated_at,created_at,cue_text,video_title')
        .eq('video_id', videoId)
        .order('updated_at', { ascending: false, nullsFirst: false });
      if (error) {
        throw error;
      }
      return { data: data || [] };
    } catch (error) {
      console.warn('加载 Supabase 精读卡失败', error);
      return { data: [], error };
    }
  };

  manager.uploadSubtitleFile = async function uploadSubtitleFile(path, file, contentType = 'text/vtt') {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    if (!path || !file) {
      return { error: new Error('invalid_payload') };
    }
    try {
      const bucket = client.storage.from('subtitles');
      const { error } = await bucket.upload(path, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: contentType || 'text/vtt'
      });
      if (error) {
        throw error;
      }
      const { data } = bucket.getPublicUrl(path);
      return { data: { path, publicUrl: data?.publicUrl || data?.public_url || null } };
    } catch (error) {
      console.warn('上传 Supabase 字幕失败', error);
      return { error };
    }
  };

  manager.upsertSubtitleRecord = async function upsertSubtitleRecord({ id, video_id, lang, vtt_url } = {}) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    if (!id || !video_id || !lang || !vtt_url) {
      return { error: new Error('invalid_payload') };
    }
    try {
      const payload = { id, video_id, lang, vtt_url };
      const { error } = await client.from('subtitles').upsert(payload, { onConflict: 'id' });
      if (error) {
        throw error;
      }
      return { success: true };
    } catch (error) {
      console.warn('写入 Supabase 字幕记录失败', error);
      return { error };
    }
  };

  manager.signInWithOtp = async function signInWithOtp(email, options = {}) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    if (!email) {
      return { error: new Error('invalid_email') };
    }
    try {
      const payload = {
        email,
        options: {}
      };
      if (options.emailRedirectTo) {
        payload.options.emailRedirectTo = options.emailRedirectTo;
      }
      const { data, error } = await client.auth.signInWithOtp(payload);
      if (error) {
        throw error;
      }
      return { data: data || null };
    } catch (error) {
      console.warn('发送 Supabase 登录邮件失败', error);
      return { error };
    }
  };

  manager.getUser = async function getUser() {
    const client = ensureClient();
    if (!client) {
      return { data: null, error: new Error('unconfigured') };
    }
    try {
      return await client.auth.getUser();
    } catch (error) {
      console.warn('获取 Supabase 用户失败', error);
      return { data: null, error };
    }
  };

  manager.onAuthStateChange = function onAuthStateChange(callback) {
    const client = ensureClient();
    if (!client || typeof callback !== 'function') {
      return () => {};
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      try {
        callback(event, session);
      } catch (error) {
        console.warn('处理 Supabase Auth 事件失败', error);
      }
    });
    return () => {
      try {
        data?.subscription?.unsubscribe?.();
      } catch (error) {
        console.warn('取消 Supabase 订阅失败', error);
      }
    };
  };

  manager.updateUserMetadata = async function updateUserMetadata(metadata = {}) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    try {
      const { data, error } = await client.auth.updateUser({ data: metadata });
      if (error) {
        throw error;
      }
      return { data: data || null };
    } catch (error) {
      console.warn('更新用户元数据失败', error);
      return { error };
    }
  };

  manager.redeemActivation = async function redeemActivation(code) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    if (!code) {
      return { error: new Error('invalid_code') };
    }
    try {
      const { data, error } = await client.rpc('redeem_activation', { code });
      if (error) {
        throw error;
      }
      return { data: data || null };
    } catch (error) {
      console.warn('兑换激活码失败', error);
      return { error };
    }
  };

  manager.upsertProgress = async function upsertProgress({
    userId,
    videoId,
    lastSec = 0,
    completed = false,
    updatedAt,
    streak
  } = {}) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    if (!userId || !videoId) {
      return { error: new Error('missing_identifiers') };
    }
    try {
      const payload = {
        user_id: userId,
        video_id: videoId,
        last_sec: Number.isFinite(lastSec) ? Number(lastSec) : 0,
        completed: Boolean(completed),
        updated_at: updatedAt || new Date().toISOString()
      };
      if (Number.isFinite(streak)) {
        payload.streak = Math.max(0, Math.floor(streak));
      }
      const { error } = await client
        .from('user_progress')
        .upsert(payload, { onConflict: 'user_id,video_id' });
      if (error) {
        throw error;
      }
      return { success: true };
    } catch (error) {
      console.warn('写入 Supabase 学习进度失败', error);
      return { error };
    }
  };

  manager.upsertCard = async function upsertCard({
    id,
    phrase,
    zh,
    note,
    level,
    tags
  } = {}) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    if (!id || !phrase) {
      return { error: new Error('invalid_payload') };
    }
    try {
      const payload = {
        id,
        phrase,
        zh: zh || null,
        note: note || null,
        level: Number.isFinite(level) ? Number(level) : null,
        tags: Array.isArray(tags) ? tags : null
      };
      const { error } = await client.from('cards').upsert(payload, { onConflict: 'id' });
      if (error) {
        throw error;
      }
      return { success: true };
    } catch (error) {
      console.warn('写入 Supabase 词卡失败', error);
      return { error };
    }
  };

  manager.requestDirectUploadViaFunction = async function requestDirectUploadViaFunction(body = {}) {
    const client = ensureClient();
    if (!client) {
      return { error: new Error('unconfigured') };
    }
    try {
      const { data, error } = await client.functions.invoke('cf_direct_upload', { body });
      if (error) {
        throw error;
      }
      return { data: data || null };
    } catch (error) {
      console.warn('调用 cf_direct_upload 函数失败', error);
      return { error };
    }
  };

  global.supabaseManager = manager;
})(window);
