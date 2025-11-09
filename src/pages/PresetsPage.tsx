import { Link } from "react-router-dom";

export function PresetsPage() {
  return (
    <section className="space-y-4" aria-labelledby="presets-heading">
      <div className="space-y-1">
        <h1 id="presets-heading" className="text-xl font-semibold">
          发色预设
        </h1>
        <p className="text-sm text-muted-foreground">
          浏览热门色卡、质感组合和造型师推荐，支持收藏至个人库。
        </p>
      </div>
      <ul className="space-y-3" aria-label="预设列表（占位）">
        {Array.from({ length: 4 }).map((_, index) => (
          <li
            key={index}
            className="rounded-xl border border-border bg-card/60 p-4"
            role="article"
          >
            <h2 className="text-base font-medium">预设方案 {index + 1}</h2>
            <p className="text-xs text-muted-foreground">
              包含色系、光泽、质地等信息。可稍后替换为真实数据。
            </p>
          </li>
        ))}
      </ul>
      <Link className="text-sm font-medium text-primary" to="/favorites">
        查看已收藏预设
      </Link>
    </section>
  );
}
