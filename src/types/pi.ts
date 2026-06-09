export type PiUser = {
  uid: string;
  username: string;
};

export type PiAuthResult = {
  accessToken: string;
  user: PiUser;
};

export type PiPaymentDTO = {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  status?: {
    developer_approved?: boolean;
    transaction_verified?: boolean;
    developer_completed?: boolean;
    cancelled?: boolean;
  };
  transaction?: {
    txid: string;
    verified: boolean;
    _link?: string;
  };
};

export type PiPaymentData = {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
};

type PiAuthenticateCallbacks = {
  onIncompletePaymentFound?: (payment: PiPaymentDTO) => void;
};

type PiPaymentCallbacks = {
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment?: PiPaymentDTO) => void;
};

export type PiBrowserSDK = {
  init: (config: { version: "2.0"; sandbox?: boolean }) => void | Promise<void>;
  authenticate: (
    scopes: string[],
    onIncompletePaymentFound: PiAuthenticateCallbacks["onIncompletePaymentFound"],
  ) => Promise<PiAuthResult | PiUser>;
  createPayment: (
    paymentData: PiPaymentData,
    callbacks: PiPaymentCallbacks,
  ) => void;
};

declare global {
  interface Window {
    Pi?: PiBrowserSDK;
  }
}
