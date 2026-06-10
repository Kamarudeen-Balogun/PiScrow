export type UserReputation = {
  userId: string;
  piUsername: string;
  verifiedBadge: boolean;
  verificationRequestedAt?: string;
  payoutReady: boolean;
  payoutReadinessConfirmedAt?: string;
  successfulTrades: number;
  disputedTrades: number;
  cancelledTrades: number;
  buyCount: number;
  sellCount: number;
  trustScore: number;
};

export type TelegramLinkStatus = {
  configured: boolean;
  linked: boolean;
  botUsername: string;
  notificationsEnabled: boolean;
  telegramUsername?: string;
  maskedChatId?: string;
  linkedAt?: string;
  lastDeliveryAt?: string;
  lastDeliveryError?: string;
};
