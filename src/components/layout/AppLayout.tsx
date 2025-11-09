import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { TopNav, type NavItem } from "@/components/navigation/TopNav";
import { BottomActionBar } from "@/components/layout/BottomActionBar";
import { Sparkles } from "lucide-react";

const navItems: NavItem[] = [
  { label: "预览", path: "/" },
  { label: "预设", path: "/presets" },
  { label: "收藏", path: "/favorites" },
  { label: "造型师", path: "/stylist" },
  { label: "预约", path: "/booking" },
  { label: "隐私", path: "/privacy" }
];

interface AppLayoutProps {
  actionLabel?: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
}

export function AppLayout({ actionLabel = "立即体验", actionIcon, onAction }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopNav items={navItems} />
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-24 pt-6"
        tabIndex={-1}
        aria-live="polite"
      >
        <Outlet />
      </main>
      <BottomActionBar
        label={actionLabel}
        onClick={onAction}
        icon={actionIcon ?? <Sparkles aria-hidden="true" className="h-5 w-5" />}
      />
    </div>
  );
}
