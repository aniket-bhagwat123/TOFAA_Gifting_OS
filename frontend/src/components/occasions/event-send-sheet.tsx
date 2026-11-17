"use client";

import { useMemo } from "react";
import { useTenantId } from "@/components/gift-requests/shared";
import { SendGiftDialog, type SendGiftTarget } from "@/components/recipients/send-gift-dialog";
import type { UpcomingEvent } from "./shared";

/** One recipient's birthday, anniversary or event. It opens the same Send gift dialog as the People and Groups screens. */
export function EventSendSheet({ item, onClose, onSent }: { item: UpcomingEvent | null; onClose: () => void; onSent: () => void }) {
  const { tenantId } = useTenantId();
  const target = useMemo<SendGiftTarget | null>(() => item && {
    title: item.title, people: [{ id: item.recipientId, name: item.recipientName ?? "Recipient" }], wholeGroup: false,
    event: { eventId: item.eventId, recipientId: item.recipientId, name: item.title }, date: item.date,
  }, [item]);
  if (!tenantId) return null;
  return <SendGiftDialog target={target} tenantId={tenantId} onClose={onClose} onSent={onSent} />;
}
