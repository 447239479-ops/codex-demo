export function FavoritesPage() {
  return (
    <section className="space-y-4" aria-labelledby="favorites-heading">
      <div className="space-y-1">
        <h1 id="favorites-heading" className="text-xl font-semibold">
          收藏夹
        </h1>
        <p className="text-sm text-muted-foreground">
          将喜爱的发色方案保存于此，方便快速套用或分享给造型师。
        </p>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground"
      >
        暂无收藏，完成预览后可在预设页面添加。
      </div>
    </section>
  );
}
