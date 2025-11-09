# 发色预览单页应用

使用 Vite + React + TypeScript + Tailwind CSS + shadcn/ui + Zustand 构建的移动优先发色预览 SPA。

## 开发

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

## 技术栈

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui 组件
- Zustand 全局状态管理
- IndexedDB（基于 `idb` 封装）
- React Router DOM 路由

## 功能概览

- `/`：发色预览，占位上传、相机、调节与对比操作。
- `/presets`：预设/色卡列表占位。
- `/favorites`：收藏夹占位。
- `/stylist`：造型师模式表单占位。
- `/booking`：预约流程占位。
- `/privacy`：隐私说明占位。

移动端优先设计，顶部标签导航和底部操作条均针对 375px 视口进行了优化。
