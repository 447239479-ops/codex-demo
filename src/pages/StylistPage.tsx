export function StylistPage() {
  return (
    <section className="space-y-4" aria-labelledby="stylist-heading">
      <div className="space-y-1">
        <h1 id="stylist-heading" className="text-xl font-semibold">
          造型师模式
        </h1>
        <p className="text-sm text-muted-foreground">
          与顾客共享实时预览，记录调配方案、备注发质和维护建议。
        </p>
      </div>
      <form className="space-y-3" aria-label="造型师记录（占位）">
        <label className="block space-y-1">
          <span className="text-sm font-medium">顾客昵称</span>
          <input
            type="text"
            placeholder="输入顾客昵称"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-required="false"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">调色备注</span>
          <textarea
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="记录染剂比例、停留时间等"
            aria-required="false"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          表单仅为占位，稍后将与 IndexedDB 同步以支持离线记录。
        </p>
      </form>
    </section>
  );
}
