# 部署到 Vercel 的参考流程

## 1. 创建项目并配置环境变量
1. 登录 [Vercel](https://vercel.com/)，通过 **New Project → Add Git Repository** 绑定本仓库。
2. 在项目设置的 **Environment Variables** 中新增以下键值（根据实际环境填写）：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_CF_ACCOUNT_ID`
   - `VITE_CF_TOKEN`
3. 如果需要预置 Cloudflare Stream 视频 ID、OpenAI Key 等，也可以在此处追加自定义变量（例如 `VITE_CF_STREAM_ID`、`VITE_OPENAI_KEY`）。

## 2. 运行时如何读取配置
- `index.html` 会优先尝试从 `window.__ENV__` 中读取上述变量；若你使用 Vercel/Vite，则可在构建阶段通过脚本把 `import.meta.env` 注入到该对象，例如：
  ```html
  <script>
    window.__ENV__ = {
      VITE_SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY,
      VITE_CF_ACCOUNT_ID: import.meta.env?.VITE_CF_ACCOUNT_ID,
      VITE_CF_TOKEN: import.meta.env?.VITE_CF_TOKEN
    };
  </script>
  ```
- 页面加载时会使用这些值回填“设置”页面；如果某个变量未提供，则继续使用 localStorage 中已有的设置。

## 3. 构建与部署
- 该项目可以直接作为静态站点部署，无需额外构建命令；保持 **Build & Output Settings → Build Command** 为空即可。
- 如果希望通过 Vite 进行最小打包，可自定义脚本（例如 `npm run build`）并在 Vercel 中配置对应命令，产物放在 `dist/` 后选择静态输出目录。

## 4. CORS 相关注意事项
- **Cloudflare Stream**：确保 Cloudflare 账户的 CORS 规则允许来自你的 Vercel 域名的请求，尤其是 Direct Upload 与 iframe 播放接口。
- **Supabase Storage**：在 Supabase 项目中配置 Storage Policies / CORS，允许前端域名访问公开的 `subtitles` bucket，否则字幕文件会被浏览器拦截。

完成以上步骤后即可在 Vercel 上获得带环境变量的可访问版本。根据需要还可配置自定义域名与 HTTPS 证书，以启用全部 AI 功能。
