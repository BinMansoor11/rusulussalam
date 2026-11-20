"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

let dashboardClient: ReturnType<typeof createClient> | undefined;
let dashboardTeardown = Promise.resolve();

export function DashboardMessageRefresh({ topics }: { topics: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!topics) return;
    // Chat and dashboard can briefly overlap during navigation and use the same topic.
    const client = dashboardClient ??= createClient(false);
    const channels: RealtimeChannel[] = [];
    let disposed = false;
    let timer: number | undefined;

    function refresh() {
      if (disposed || timer !== undefined || document.hidden || !navigator.onLine) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!document.hidden && navigator.onLine) router.refresh();
      }, 200);
    }

    void dashboardTeardown.then(() => client.realtime.setAuth()).then(() => {
      if (disposed) return;
      for (const id of topics.split(",")) {
        channels.push(client.channel(`conversation:${id}`, { config: { private: true } })
          .on("broadcast", { event: "new_message" }, refresh)
          .on("broadcast", { event: "conversation_changed" }, refresh)
          .subscribe(status => { if (status === "SUBSCRIBED") refresh(); }));
      }
    }).catch(refresh);

    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const fallback = window.setInterval(refresh, 25_000);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearInterval(fallback);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (channels.length) {
        dashboardTeardown = Promise.allSettled(channels.map(channel => client.removeChannel(channel))).then(() => {});
      }
    };
  }, [router, topics]);

  return null;
}
