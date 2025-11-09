export function PrivacyPage() {
  return (
    <section className="space-y-4" aria-labelledby="privacy-heading">
      <div className="space-y-1">
        <h1 id="privacy-heading" className="text-xl font-semibold">
          隐私与数据使用
        </h1>
        <p className="text-sm text-muted-foreground">
          说明应用如何处理面部图像、预设数据与收藏记录，正式内容待补充。
        </p>
      </div>
      <article className="space-y-3 text-sm leading-relaxed">
        <p>
          本页面用于展示隐私政策占位。正式版本将包含数据收集范围、用途、保留期限与用户权利说明。
        </p>
        <p>
          当前开发阶段数据仅保存在本地 IndexedDB 中，不会上传至服务器。上线前将补充 Cookie 与第三方服务说明。
        </p>
        <p>
          用户可随时清空本地缓存并导出收藏信息，便于在不同设备间迁移。
        </p>
      </article>
    </section>
  );
}
