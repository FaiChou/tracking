"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddTrackingDialog from "@/components/AddTrackingDialog";
import { useNavbarActions } from "@/components/NavbarActions";

const Navbar = () => {
  const pathname = usePathname();
  const { addAction } = useNavbarActions();
  const isTrackingPage = pathname === "/" || pathname === "/archived";
  const hasAddAction = pathname === "/logistics-companies" || pathname === "/forwarders";

  const navItems = [
    { name: "运单管理", href: "/" },
    { name: "物流公司", href: "/logistics-companies" },
    { name: "货代商", href: "/forwarders" },
    { name: "归档运单", href: "/archived" },
    { name: "scraper", href: "/scraper" },
  ];

  return (
    <header className="border-b">
      <div className="container mx-auto flex min-h-16 flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex shrink-0 items-center">
          <Link href="/" className="font-bold text-lg sm:text-xl">
            运单号管理系统
          </Link>
        </div>
        <nav aria-label="主导航" className="order-last flex w-full items-center gap-4 overflow-x-auto md:order-none md:w-auto lg:gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-primary ${
                pathname === item.href
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isTrackingPage ? <AddTrackingDialog key={pathname} /> : hasAddAction ? (
            <Button
              variant="outline"
              size="icon"
              onClick={addAction?.onClick}
              disabled={!addAction}
              aria-label={addAction?.label || "添加"}
              title={addAction?.label || "添加"}
            >
              <Plus className="h-4 w-4" />
            </Button>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Navbar;
