"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { parseConversation, type Conversation } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/browser";
import { compareMessages, fetchMessages, mergeMessages, PAGE_SIZE, type Message } from "./messages";

type Status = Conversation["status"];
type Scan = { head: Message; before: Message };
const FALLBACK_MS = 25_000;

export function useChat(id: string, initialStatus: Status) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const statusRef = useRef(initialStatus);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(initialStatus !== "waiting");
  const [syncError, setSyncError] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [online, setOnline] = useState(true);
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const requestScope = useRef<AbortSignal | null>(null);
  const previousPage = useRef<Message | undefined>(undefined);
  const fetchingOlder = useRef(false);
  const merge = useCallback((rows: Message[]) => setMessages(current => mergeMessages(current, rows)), []);
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    const client = createClient();
    const controller = new AbortController();
    requestScope.current = controller.signal;
    let channel: RealtimeChannel | undefined;
    let connecting = false;
    let ready = false;
    let failed = false;
    let revoked = false;
    let running = false;
    let requested = false;
    let lastSuccess = 0;
    let timer: number | undefined;
    let head: Message | undefined;
    let scan: Scan | undefined;
    let subject: string | undefined;

    function loseAccess() {
      if (revoked || controller.signal.aborted) return;
      revoked = true;
      setMessages([]);
      setAccessLost(true);
      setConnected(false);
      controller.abort();
      if (channel) void client.removeChannel(channel);
      router.refresh();
    }

    function schedule(wait = 100) {
      if (controller.signal.aborted || document.visibilityState !== "visible") return;
      requested = true;
      if (running || timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void synchronize();
      }, wait);
    }

    async function synchronize() {
      if (controller.signal.aborted || !navigator.onLine) return;
      running = true;
      requested = false;
      try {
        const { data, error } = await client.rpc("get_conversation", {
          p_conversation_id: id,
        }).abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]));
        if (controller.signal.aborted) return;
        if ((!error && data === null) || error?.code === "42501" || error?.code === "PGRST301") {
          loseAccess();
          return;
        }
        const conversation = error ? null : parseConversation(data);
        if (!conversation || conversation.id !== id) throw new Error("Conversation unavailable");
        if (statusRef.current !== conversation.status) {
          if (statusRef.current === "waiting") setLoading(true);
          statusRef.current = conversation.status;
          setStatus(conversation.status);
          router.refresh();
        }

        if (conversation.status !== "waiting") {
          // Read from the newest message back to the previously reconciled head.
          // Bound work per pass and retain the cursor across passes after outages.
          for (let batch = 0; batch < 4; batch++) {
            const page = await fetchMessages(client, id, controller.signal, scan?.before);
            if (controller.signal.aborted) return;
            const newest = page[0];
            const oldest = page.at(-1);
            merge(page);
            if (!head && !scan) {
              head = newest;
              previousPage.current = oldest;
              setHasOlder(page.length === PAGE_SIZE);
              break;
            }
            if (!scan && !newest && conversation.status !== "active") {
              setMessages([]);
              head = undefined;
              previousPage.current = undefined;
              setHasOlder(false);
              break;
            }
            const first = scan?.head ?? newest;
            if (!first || !oldest || page.length < PAGE_SIZE || (head && compareMessages(oldest, head) <= 0)) {
              if (scan) requested = true; // Check for messages that arrived during the scan.
              if (first) head = first;
              scan = undefined;
              break;
            }
            scan = { head: first, before: oldest };
          }
          if (scan) requested = true;
        }
        failed = false;
        lastSuccess = Date.now();
        setSyncError(false);
      } catch {
        if (!controller.signal.aborted) {
          failed = true;
          setSyncError(true);
        }
      } finally {
        running = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (requested && !failed) schedule(scan ? 350 : 100);
        }
      }
    }

    function resume() {
      setOnline(navigator.onLine);
      if (document.visibilityState === "visible" && navigator.onLine) {
        connect();
        schedule();
      }
    }

    function connect() {
      if (channel || connecting || controller.signal.aborted) return;
      connecting = true;
      void client.realtime.setAuth().then(() => {
        if (controller.signal.aborted) return;
        channel = client.channel(`conversation:${id}`, { config: { private: true } })
          .on("broadcast", { event: "new_message" }, () => schedule())
          .on("broadcast", { event: "conversation_changed" }, () => schedule())
          .subscribe(state => {
            if (controller.signal.aborted) return;
            ready = state === "SUBSCRIBED";
            if (state === "CLOSED") channel = undefined;
            setConnected(ready);
            if (ready) schedule(); // Close the gap between the first read and subscription.
          });
      }).catch(() => schedule()).finally(() => { connecting = false; });
    }

    refreshRef.current = () => schedule();
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    const fallback = window.setInterval(() => {
      if (!ready || failed || scan || Date.now() - lastSuccess >= 60_000) resume();
    }, statusRef.current === "waiting" ? 8000 : FALLBACK_MS);
    resume();

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && subject && session.user.id !== subject)) {
        loseAccess();
      } else if (session) {
        subject = session.user.id;
        if (event === "TOKEN_REFRESHED") schedule();
      }
    });

    return () => {
      controller.abort();
      subscription.unsubscribe();
      if (channel) void client.removeChannel(channel);
      window.clearInterval(fallback);
      window.clearTimeout(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [id, merge, router]);

  async function loadOlder() {
    const signal = requestScope.current;
    if (!signal || signal.aborted || !previousPage.current || fetchingOlder.current) return;
    fetchingOlder.current = true;
    try {
      const page = await fetchMessages(createClient(), id, signal, previousPage.current);
      if (signal.aborted) return;
      previousPage.current = page.at(-1);
      setHasOlder(page.length === PAGE_SIZE);
      merge(page);
    } finally {
      fetchingOlder.current = false;
    }
  }

  return { status, messages, hasOlder, loading, syncError, accessLost, online, connected, refresh, merge, loadOlder };
}
