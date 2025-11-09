export function BookingPage() {
  return (
    <section className="space-y-4" aria-labelledby="booking-heading">
      <div className="space-y-1">
        <h1 id="booking-heading" className="text-xl font-semibold">
          预约体验
        </h1>
        <p className="text-sm text-muted-foreground">
          选择门店、时间段与偏好造型师。后续可接入第三方预约系统。
        </p>
      </div>
      <ol className="space-y-3 text-sm" aria-label="预约流程（占位）">
        <li className="rounded-xl border border-border bg-card/60 p-4">
          <span className="font-medium">1. 选择门店</span>
          <p className="text-xs text-muted-foreground">支持定位附近门店或线上顾问。</p>
        </li>
        <li className="rounded-xl border border-border bg-card/60 p-4">
          <span className="font-medium">2. 选择时间</span>
          <p className="text-xs text-muted-foreground">提供日历选择、提醒与排队管理。</p>
        </li>
        <li className="rounded-xl border border-border bg-card/60 p-4">
          <span className="font-medium">3. 确认联系方式</span>
          <p className="text-xs text-muted-foreground">预留手机号与偏好联系渠道。</p>
        </li>
      </ol>
    </section>
  );
}
