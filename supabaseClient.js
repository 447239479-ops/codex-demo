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
 *   topic text
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
    search = ''
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
        .select('id,title,stream_id,poster,level,topic', { count: 'exact' })
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

  global.supabaseManager = manager;
})(window);
