import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface NavItem {
  label: string;
  path: string;
  ariaLabel?: string;
}

interface TopNavProps {
  items: NavItem[];
}

export function TopNav({ items }: TopNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const defaultPath = useMemo(
    () => items.find((item) => item.path === location.pathname)?.path ?? items[0]?.path ?? "/",
    [items, location.pathname]
  );
  const [value, setValue] = useState(defaultPath);

  useEffect(() => {
    setValue(
      items.find((item) => item.path === location.pathname)?.path ?? items[0]?.path ?? "/"
    );
  }, [items, location.pathname]);

  function handleValueChange(newValue: string) {
    setValue(newValue);
    if (newValue !== location.pathname) {
      navigate(newValue);
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <nav
        aria-label="主导航"
        className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4"
      >
        <div className="flex items-center gap-2" aria-label="发色预览 Logo">
          <span className="text-lg font-semibold">Chromatic</span>
          <span className="sr-only">发色预览主页</span>
        </div>
        <Tabs value={value} onValueChange={handleValueChange} className="w-auto max-w-[70%]">
          <TabsList aria-label="页面标签">
            {items.map((item) => (
              <TabsTrigger
                key={item.path}
                value={item.path}
                aria-label={item.ariaLabel ?? item.label}
                aria-current={value === item.path ? "page" : undefined}
              >
                <span className="text-sm font-medium">{item.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </nav>
    </header>
  );
}
