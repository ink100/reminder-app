"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/reminders",
    label: "提醒",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    href: "/todos",
    label: "待办",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/notification-center",
    label: "通知",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m8-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/push-ledger",
    label: "台账",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6h6v6m-8 4h10a2 2 0 002-2V7.414a2 2 0 00-.586-1.414L15 2.586A2 2 0 0013.586 2H7a2 2 0 00-2 2v15a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/medicines",
    label: "药品",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m7-8.5V19a2 2 0 01-2 2H7a2 2 0 01-2-2V6.5A2.5 2.5 0 017.5 4h9A2.5 2.5 0 0119 6.5z" />
      </svg>
    ),
  },
  {
    href: "/images",
    label: "文件",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    href: "/license-key",
    label: "密匙",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    href: "/voice",
    label: "语音",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.75a6 6 0 006-6v-1.5m-12 1.5a6 6 0 006 6m0 0v3.75m-3.75 0h7.5M12 15a3 3 0 003-3V5.25a3 3 0 10-6 0V12a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    href: "/ssl",
    label: "SSL",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    href: "/bot",
    label: "Bot",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "设置",
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const primaryItems = navItems.slice(0, 4);
const moreItems = navItems.slice(4);
const moreDialogId = "mobile-more-navigation-dialog";
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();
  const [openAtPath, setOpenAtPath] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreOpen = openAtPath === pathname;

  useEffect(() => {
    if (!moreOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const moreTrigger = moreTriggerRef.current;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const initialFocus =
      dialog?.querySelector<HTMLElement>('[aria-current="page"]') ?? closeButtonRef.current;
    initialFocus?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenAtPath(null);
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getClientRects().length > 0);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalBodyOverflow;
      moreTrigger?.focus();
    };
  }, [moreOpen]);

  const moreIsActive = moreItems.some((item) => matchesPath(pathname, item.href));

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="关闭更多导航"
            className="absolute inset-0 size-full bg-slate-950/40"
            onClick={() => setOpenAtPath(null)}
          />
          <section
            id={moreDialogId}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="更多导航"
            className="absolute inset-x-2 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[min(70dvh,28rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl min-[360px]:inset-x-4"
          >
            <div className="mb-2 flex min-h-11 items-center justify-between px-2">
              <h2 className="font-semibold text-slate-900">更多</h2>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="关闭更多导航"
                className="flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                onClick={() => setOpenAtPath(null)}
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const isActive = matchesPath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpenAtPath(null)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden" aria-label="主导航">
        <div className="grid grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)] pt-1">
          {primaryItems.map((item) => {
            const isActive = matchesPath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] transition-colors",
                  isActive ? "text-blue-600" : "text-slate-500"
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            ref={moreTriggerRef}
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreDialogId}
            aria-label="打开更多导航"
            onClick={() => setOpenAtPath(pathname)}
            className={cn(
              "flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] transition-colors",
              moreIsActive || moreOpen ? "text-blue-600" : "text-slate-500"
            )}
          >
            <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
            <span>更多</span>
          </button>
        </div>
      </nav>
    </>
  );
}
