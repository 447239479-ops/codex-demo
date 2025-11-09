import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface BottomActionBarProps {
  label: string;
  onClick?: () => void;
  icon?: ReactNode;
}

export function BottomActionBar({ label, onClick, icon }: BottomActionBarProps) {
  return (
    <footer className="sticky bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
      <div className="mx-auto flex w-full max-w-md">
        <Button
          type="button"
          size="lg"
          className="w-full gap-2 text-base"
          aria-label={label}
          onClick={onClick}
        >
          {icon}
          {label}
        </Button>
      </div>
    </footer>
  );
}
