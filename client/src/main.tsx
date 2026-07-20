import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { isDevBypassEnabled } from "./devBypass";
import "./index.css";

if (isDevBypassEnabled()) {
  console.info("[DevBypass] Auth & feed mock enabled — set VITE_DEV_BYPASS_AUTH=false to disable");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ข้อมูลยัง "fresh" อยู่ 30 วินาที — ไม่ refetch อัตโนมัติเมื่อกลับมาหน้าเดิม
      staleTime: 30_000,
      // เก็บ cache ไว้ 5 นาทีหลัง component unmount — กลับมาหน้าเดิมเห็นข้อมูลเดิมทันที
      gcTime: 5 * 60_000,
      // แสดงข้อมูลเก่าขณะ refetch อยู่เบื้องหลัง (ไม่ให้หน้าจอว่างเปล่า)
      placeholderData: (prev: unknown) => prev,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (isDevBypassEnabled()) return;
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[PWA] Service Worker registered", reg.scope))
      .catch((err) => console.warn("[PWA] Service Worker registration failed", err));
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
