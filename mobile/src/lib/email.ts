import { authenticatedRequest } from "./api";
export type NotificationResult = {
  delivered?: boolean;
  skipped?: boolean;
  reason?: string;
};
async function notify(body: unknown): Promise<NotificationResult> {
  try {
    return await authenticatedRequest("/api/send-email", body);
  } catch {
    return { skipped: true, reason: "notification_unavailable" };
  }
}
export const sendTransactionEmail = (pairId: string, transactionId: string) =>
  notify({ type: "transaction", pairId, transactionId });
export const sendResolvedEmail = (pairId: string, transactionId: string) =>
  notify({ type: "resolved", pairId, transactionId });
export const sendInviteEmail = (inviteId: string) =>
  notify({ type: "invite", inviteId });
