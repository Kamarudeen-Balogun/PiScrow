"use client";

import {
  AlertTriangle,
  Bell,
  CirclePlay,
  Copy,
  X,
  CheckCircle2,
  Heart,
  Home,
  Languages,
  LockKeyhole,
  Mail,
  RefreshCcw,
  ShieldCheck,
  LoaderCircle,
  ShoppingBag,
  Tag,
  UserCircle,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AdminDesk,
  BuyerDesk,
  ProfileDesk,
  PublicLedger,
  SellerDesk,
  SellerPostPanel,
} from "@/components/piscrow-workspaces";
import { TradeChatModal } from "@/components/trade-chat-modal";
import { VerifiedUsername } from "@/components/verified-username";
import {
  demoChatMessages,
  demoChatRooms,
  demoEvents,
  demoInterests,
  demoTrades,
  demoUser,
} from "@/lib/demo-data";
import {
  calculateBuyerTotal,
  calculatePlatformFee,
} from "@/lib/fees";
import { supportedLanguages, type LanguageCode } from "@/lib/language";
import {
  piEscrowMemo,
  piscrowPaymentProduct,
} from "@/lib/pi-payment-product";
import {
  authenticateWithPiBrowser,
  initializePiSdk,
  resolvePiAuthMessage,
  waitForPiSdk,
} from "@/lib/pi-browser-helpers";
import {
  buildDemoProfile,
  buildDemoReviewForTrade,
  buildDemoReviewRecommendations,
  buildDemoVerificationRequests,
  createEvent,
  interestErrorMessage,
  isTerminal,
  normalizeUsername,
  reviewActionLabel,
  toneFromNotificationType,
} from "@/lib/piscrow-ui-helpers";
import { buildDeliveryDueAt } from "@/lib/trade-deadlines";
import {
  canRequestVerifiedBadge,
  VERIFIED_BADGE_MIN_COMPLETED_TRADES,
} from "@/lib/reputation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { formatTestPi } from "@/lib/trade-state";
import {
  createTradeInterestSchema,
  createTradeSchema,
  confirmReceiptSchema,
  disputeSchema,
  feedbackSchema,
  tradeChatMessageSchema,
} from "@/lib/validation";
import type { PiPaymentDTO, PiUser } from "@/types/pi";
import type { TelegramLinkStatus, UserReputation } from "@/types/profile";
import type { TradeReviewRecommendation } from "@/types/review";
import type {
  Trade,
  TradeChatMessage,
  TradeChatRoom,
  TradeEvent,
  TradeHandoffCodeSummary,
  TradeInterest,
  TradePaymentSummary,
  TradeStatus,
} from "@/types/trade";

type ViewMode = "market" | "sell" | "ledger" | "profile" | "admin";
type SessionUser = PiUser & {
  id?: string;
  isAdmin?: boolean;
};

type TradePayload = {
  trades: Trade[];
  interests: TradeInterest[];
  events: TradeEvent[];
};

type PublicLedgerPayload = Pick<TradePayload, "trades" | "events"> & {
  stale?: boolean;
  staleAt?: string;
};

type HandoffCodePayload = TradePayload & {
  handoffCode?: TradeHandoffCodeSummary;
  code?: string;
};

type HandoffVerifyPayload = TradePayload & {
  outcome?: "completed" | "review_required" | "already_reviewing";
  message?: string;
};

type ProfilePayload = {
  profile: UserReputation;
  telegram?: TelegramLinkStatus;
};

type VerificationQueuePayload = {
  requests: UserReputation[];
};

type ReviewRecommendationsPayload = {
  recommendations: TradeReviewRecommendation[];
};

type ChatPayload = {
  trades?: Trade[];
  interests?: TradeInterest[];
  events?: TradeEvent[];
  room: TradeChatRoom;
  messages: TradeChatMessage[];
};

type AppNotice = {
  id: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warning";
  persistent?: boolean;
  expiresAt?: number;
};

const publicLedgerCacheKey = "piscrow-public-ledger-cache-v1";

type BlockingAction = {
  title: string;
  body: string;
};

type ConfirmAction = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "warning" | "danger";
  onConfirm: () => void;
};

type ConsentState = "checking" | "pending" | "accepted" | "rejected";
type AuthMessageKey =
  | "initial"
  | "demo"
  | "consentAccepted"
  | "consentRejected"
  | "checkingConsent"
  | "acceptConsentRequired"
  | "preparing"
  | "sdkReady"
  | "piSdkUnavailable"
  | "loginTimeout"
  | "accessTokenMissing";
type AuthMessageState = {
  key?: AuthMessageKey;
  text?: string;
};
type FeedbackStatus = {
  tone: "success" | "warning";
  message: string;
} | null;

const handoffCodeCacheStorageKey = "piscrow-handoff-code-cache-v1";

type SavedNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
};

const nextPublicSandbox =
  process.env.NEXT_PUBLIC_PI_SANDBOX === undefined
    ? true
    : process.env.NEXT_PUBLIC_PI_SANDBOX === "true";

const consentStorageKey = "piscrow-consent-v1";
const languageStorageKey = "piscrow-language-v1";
const piSessionStorageKey = "piscrow-pi-session-v2";
const telegramLinkStateStorageKey = "piscrow-telegram-link-v1";
const consentVersion = "2026-06-07";
const nextPublicMaintenanceEnabled =
  process.env.NEXT_PUBLIC_PISCROW_MAINTENANCE_ENABLED === "true";
const nextPublicMaintenanceMessage =
  process.env.NEXT_PUBLIC_PISCROW_MAINTENANCE_MESSAGE?.trim() ||
  "PiScrow is receiving updates. The app remains online, but some actions may be slower than usual.";
const workspaceFallbackSyncIntervalMs = 60_000;
const activeChatRefreshIntervalMs = 5_000;
const realtimeSyncChannelName = "piscrow-app-sync";

function createClientId(prefix: string) {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${randomPart}`;
}

function readStoredConsentState(): ConsentState {
  if (typeof window === "undefined") {
    return "pending";
  }

  try {
    const stored = window.localStorage.getItem(consentStorageKey);
    const parsed = stored
      ? (JSON.parse(stored) as { status?: ConsentState; version?: string })
      : null;

    if (parsed?.version !== consentVersion) {
      return "pending";
    }

    return parsed.status === "accepted" || parsed.status === "rejected"
      ? parsed.status
      : "pending";
  } catch {
    return "pending";
  }
}

function readStoredHandoffCodeCache() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(handoffCodeCacheStorageKey);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, { code: string; expiresAt?: string }>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    window.localStorage.removeItem(handoffCodeCacheStorageKey);
    return {};
  }
}

const viewIcons: Record<ViewMode, typeof Home> = {
  market: ShoppingBag,
  sell: Tag,
  ledger: Home,
  profile: UserCircle,
  admin: LockKeyhole,
};

const defaultTelegramStatus: TelegramLinkStatus = {
  configured: false,
  linked: false,
  botUsername: "PiScrow_bot",
  notificationsEnabled: false,
};

type StoredPiSession = {
  accessToken: string;
  user: SessionUser;
  savedAt: string;
};

type StoredTelegramLinkState = {
  awaitingLink: boolean;
  savedAt: string;
};

function readStoredJson<T>(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore local storage failures in strict browser modes.
  }
}

function removeStoredJson(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore local storage failures in strict browser modes.
  }
}

function readStoredPiSession() {
  const stored = readStoredJson<StoredPiSession>(piSessionStorageKey);

  if (!stored?.accessToken || !stored.user?.username || !stored.user?.uid) {
    return null;
  }

  return stored;
}

function readStoredTelegramLinkState() {
  const stored = readStoredJson<StoredTelegramLinkState>(
    telegramLinkStateStorageKey,
  );

  return stored?.awaitingLink ? stored : null;
}

function formatHeaderPi(amount: number) {
  return `π ${amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

const appCopy: Record<
  LanguageCode,
  {
    language: string;
    testnetBadge: string;
    heroTitle: string;
    heroBody: string;
    session: string;
    notConnected: string;
    connect: string;
    connected: string;
    connecting: string;
    connectPiAccount: string;
    privateWorkspace: string;
    signInTitle: string;
    signInBody: string;
    loginDemo: string;
    consentRequired: string;
    consentTitle: string;
    consentBody: string;
    consentCards: string[];
    readRules: string;
    checkingConsent: string;
    loginDisabled: string;
    agreeBeforeLogin: string;
    rejectedBody: string;
    consentBlockBody: string;
    agreeContinue: string;
    reject: string;
    maintenanceNotice: string;
    appStaysOnline: string;
    demoWorkspace: string;
    demoBody: string;
    exitDemo: string;
    footerDisclaimer: string;
    rulesLink: string;
    workspace: string;
    menu: string;
    workspaceMenu: string;
    closeWorkspaceMenu: string;
    current: string;
    network: string;
    testnet: string;
    metrics: {
      openOffers: string;
      activeValue: string;
      disputes: string;
    };
    views: Record<ViewMode, { label: string; description: string }>;
    auth: Record<AuthMessageKey, string>;
    notices: {
      consentAcceptedTitle: string;
      consentAcceptedBody: string;
      loginBlockedTitle: string;
      loginBlockedBody: string;
      consentRequiredTitle: string;
      piSdkTitle: string;
      connectionFailedTitle: string;
      connectedTitle: string;
      connectedBody: string;
      signedIn: (username: string) => string;
      connectedNoToken: (username: string) => string;
    };
  }
> = {
  en: {
    language: "Language",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "Sellers post public or private Pi testnet offers, buyers submit interest, and the selected buyer funds escrow-style trades with a transparent platform fee.",
    session: "Session",
    notConnected: "Not connected",
    connect: "Connect",
    connected: "Connected",
    connecting: "Connecting",
    connectPiAccount: "Connect Pi account",
    privateWorkspace: "Private Pi workspace",
    signInTitle: "Sign in with Pi Browser to post offers or show buyer interest.",
    signInBody:
      "Public listings and activity stay visible for transparency. Admin review tools only appear for approved developer usernames.",
    loginDemo: "Login with demo data",
    consentRequired: "Consent required",
    consentTitle: "Review PiScrow rules before connecting your Pi account.",
    consentBody:
      "PiScrow uses your Pi username, Pi UID, trade details, location labels, proof uploads, notifications, and dispute activity to run a transparent Pi Testnet escrow-style workflow.",
    consentCards: [
      "Testnet only. PiScrow does not custody Mainnet Pi.",
      "Proof images may be reviewed by the seller, buyer, and admin.",
      "Public ledger activity is shown for marketplace transparency.",
      "Admins can review release-ready or disputed trades before release or cancellation.",
    ],
    readRules: "Read full rules, privacy, and agreements",
    checkingConsent: "Checking saved consent...",
    loginDisabled: "Pi login is disabled.",
    agreeBeforeLogin: "Agree before Pi login.",
    rejectedBody:
      "You rejected the agreement on this browser. You can read the rules again and agree when you are ready.",
    consentBlockBody:
      "Rejecting blocks Pi login and protected trading actions until you agree to the rules and consent terms.",
    agreeContinue: "Agree and continue",
    reject: "Reject",
    maintenanceNotice: "Maintenance notice",
    appStaysOnline: "App stays online",
    demoWorkspace: "Demo workspace",
    demoBody:
      "Demo data runs locally in this browser. It does not connect to Pi Browser, Supabase writes, or real testnet payments.",
    exitDemo: "Exit demo",
    footerDisclaimer:
      "PiScrow is a Pi Testnet/Sandbox app and does not custody Mainnet Pi.",
    rulesLink: "Rules, privacy, and consent",
    workspace: "Workspace",
    menu: "Menu",
    workspaceMenu: "Workspace menu",
    closeWorkspaceMenu: "Close workspace menu",
    current: "Current",
    network: "Network",
    testnet: "Testnet",
    metrics: {
      openOffers: "Open offers",
      activeValue: "Active value",
      disputes: "Disputes",
    },
    views: {
      market: {
        label: "Buyer",
        description: "Browse seller offers, submit interest, and fund selected trades.",
      },
      sell: {
        label: "Seller",
        description: "Post offers, compare buyer responses, and manage delivery.",
      },
      ledger: {
        label: "Ledger",
        description: "Transparent trade activity across PiScrow testnet.",
      },
      profile: {
        label: "Profile",
        description: "Track your trust score, trade history, and badge status.",
      },
      admin: {
        label: "Admin",
        description: "Resolve disputed trades from approved Pi usernames.",
      },
    },
    auth: {
      initial: "Connect with Pi Browser to start using PiScrow.",
      demo: "Local demo mode is active. Use Pi Browser for real-user testing.",
      consentAccepted: "Consent accepted. Connect with Pi Browser to continue.",
      consentRejected: "Consent rejected. Pi login is disabled until you agree.",
      checkingConsent: "PiScrow is still checking your consent status.",
      acceptConsentRequired:
        "Accept PiScrow rules and privacy consent before connecting a Pi account.",
      preparing: "Preparing Pi Browser login...",
      sdkReady: "Pi SDK found. Approve the Pi Browser sign-in request to continue.",
      piSdkUnavailable:
        "Pi SDK is not available on this page yet. If you are inside Pi Browser, refresh PiScrow from the Pi Browser app page and try again. In other browsers, use demo data.",
      loginTimeout:
        "Pi login did not finish. Stay inside Pi Browser, approve the request, and try again.",
      accessTokenMissing:
        "Pi Browser connected your username but did not return a valid access token. Try connecting again.",
    },
    notices: {
      consentAcceptedTitle: "Consent accepted",
      consentAcceptedBody: "PiScrow login is now enabled for this browser.",
      loginBlockedTitle: "Login blocked",
      loginBlockedBody:
        "You need to accept PiScrow rules and privacy consent before connecting a Pi account.",
      consentRequiredTitle: "Consent required",
      piSdkTitle: "Pi SDK unavailable",
      connectionFailedTitle: "Connection failed",
      connectedTitle: "Pi account connected",
      connectedBody: "Your PiScrow workspace is ready.",
      signedIn: (username) => `Signed in as @${username}.`,
      connectedNoToken: (username) =>
        `Connected as @${username}, but Pi Browser did not return an access token.`,
    },
  },
  es: {
    language: "Idioma",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "Vendedores publican ofertas publicas o privadas en Pi testnet, compradores muestran interes y el comprador elegido financia la operacion con una tarifa transparente.",
    session: "Sesion",
    notConnected: "No conectado",
    connect: "Conectar",
    connected: "Conectado",
    connecting: "Conectando",
    connectPiAccount: "Conectar cuenta Pi",
    privateWorkspace: "Espacio privado Pi",
    signInTitle: "Inicia sesion con Pi Browser para publicar ofertas o mostrar interes.",
    signInBody:
      "Las ofertas y la actividad publica siguen visibles para transparencia. Las herramientas admin solo aparecen para usuarios aprobados.",
    loginDemo: "Entrar con demo",
    consentRequired: "Consentimiento requerido",
    consentTitle: "Revisa las reglas de PiScrow antes de conectar tu cuenta Pi.",
    consentBody:
      "PiScrow usa tu usuario Pi, UID, detalles de operaciones, ubicacion, pruebas, notificaciones y disputas para operar un flujo transparente en Pi Testnet.",
    consentCards: [
      "Solo testnet. PiScrow no custodia Mainnet Pi.",
      "Las pruebas pueden ser revisadas por vendedor, comprador y admin.",
      "El libro publico muestra actividad para transparencia.",
      "Los admins revisan disputas antes de liberar o cancelar.",
    ],
    readRules: "Leer reglas, privacidad y acuerdos",
    checkingConsent: "Comprobando consentimiento...",
    loginDisabled: "El login Pi esta desactivado.",
    agreeBeforeLogin: "Acepta antes de iniciar sesion.",
    rejectedBody:
      "Rechazaste el acuerdo en este navegador. Puedes leer las reglas y aceptar cuando estes listo.",
    consentBlockBody:
      "Rechazar bloquea el acceso Pi y las acciones protegidas de comercio hasta que aceptes las reglas y el consentimiento.",
    agreeContinue: "Aceptar y continuar",
    reject: "Rechazar",
    maintenanceNotice: "Aviso de mantenimiento",
    appStaysOnline: "La app sigue online",
    demoWorkspace: "Demo",
    demoBody:
      "Los datos demo corren localmente. No conectan con Pi Browser, Supabase ni pagos reales de testnet.",
    exitDemo: "Salir de demo",
    footerDisclaimer: "PiScrow es una app Pi Testnet/Sandbox y no custodia Mainnet Pi.",
    rulesLink: "Reglas, privacidad y consentimiento",
    workspace: "Area",
    menu: "Menu",
    workspaceMenu: "Menu de areas",
    closeWorkspaceMenu: "Cerrar menu",
    current: "Actual",
    network: "Red",
    testnet: "Testnet",
    metrics: { openOffers: "Ofertas", activeValue: "Valor activo", disputes: "Disputas" },
    views: {
      market: { label: "Comprador", description: "Explora ofertas, muestra interes y financia operaciones elegidas." },
      sell: { label: "Vendedor", description: "Publica ofertas, compara respuestas y gestiona entregas." },
      ledger: { label: "Libro", description: "Actividad transparente de PiScrow testnet." },
      profile: { label: "Perfil", description: "Consulta confianza, historial e insignia." },
      admin: { label: "Admin", description: "Resuelve disputas de usuarios aprobados." },
    },
    auth: {
      initial: "Conecta con Pi Browser para usar PiScrow.",
      demo: "Modo demo local activo. Usa Pi Browser para pruebas reales.",
      consentAccepted: "Consentimiento aceptado. Conecta con Pi Browser.",
      consentRejected: "Consentimiento rechazado. Login Pi desactivado hasta aceptar.",
      checkingConsent: "PiScrow esta comprobando tu consentimiento.",
      acceptConsentRequired: "Acepta reglas y privacidad antes de conectar tu cuenta Pi.",
      preparing: "Preparando login de Pi Browser...",
      sdkReady: "SDK de Pi encontrado. Aprueba la solicitud en Pi Browser.",
      piSdkUnavailable: "El SDK de Pi no esta disponible. Si estas en Pi Browser, refresca PiScrow desde la pagina de la app e intenta de nuevo. En otros navegadores usa demo.",
      loginTimeout: "El login Pi no termino. Permanece en Pi Browser y aprueba la solicitud.",
      accessTokenMissing: "Pi Browser conecto tu usuario pero no devolvio token valido. Intenta de nuevo.",
    },
    notices: {
      consentAcceptedTitle: "Consentimiento aceptado",
      consentAcceptedBody: "Login PiScrow habilitado.",
      loginBlockedTitle: "Login bloqueado",
      loginBlockedBody: "Debes aceptar reglas y privacidad antes de conectar Pi.",
      consentRequiredTitle: "Consentimiento requerido",
      piSdkTitle: "SDK Pi no disponible",
      connectionFailedTitle: "Conexion fallida",
      connectedTitle: "Cuenta Pi conectada",
      connectedBody: "Tu espacio PiScrow esta listo.",
      signedIn: (username) => `Sesion iniciada como @${username}.`,
      connectedNoToken: (username) => `Conectado como @${username}, pero sin token valido.`,
    },
  },
  fr: {
    language: "Langue",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "Les vendeurs publient des offres Pi testnet publiques ou privees, les acheteurs repondent, puis l'acheteur choisi finance la transaction avec des frais transparents.",
    session: "Session",
    notConnected: "Non connecte",
    connect: "Connecter",
    connected: "Connecte",
    connecting: "Connexion",
    connectPiAccount: "Connecter le compte Pi",
    privateWorkspace: "Espace Pi prive",
    signInTitle: "Connectez-vous avec Pi Browser pour publier ou repondre aux offres.",
    signInBody:
      "Les offres et activites publiques restent visibles. Les outils admin n'apparaissent qu'aux utilisateurs approuves.",
    loginDemo: "Utiliser la demo",
    consentRequired: "Consentement requis",
    consentTitle: "Consultez les regles PiScrow avant de connecter votre compte Pi.",
    consentBody:
      "PiScrow utilise votre nom Pi, UID, details d'echange, lieux, preuves, notifications et litiges pour un flux transparent sur Pi Testnet.",
    consentCards: [
      "Testnet uniquement. PiScrow ne garde pas de Mainnet Pi.",
      "Les preuves peuvent etre vues par vendeur, acheteur et admin.",
      "Le registre public assure la transparence.",
      "Les admins examinent les litiges avant liberation ou annulation.",
    ],
    readRules: "Lire les regles, confidentialite et accords",
    checkingConsent: "Verification du consentement...",
    loginDisabled: "Connexion Pi desactivee.",
    agreeBeforeLogin: "Acceptez avant la connexion Pi.",
    rejectedBody: "Vous avez refuse l'accord. Vous pouvez relire les regles et accepter plus tard.",
    consentBlockBody: "Refuser bloque la connexion Pi et les actions de trading protegees tant que vous n'avez pas accepte les regles et le consentement.",
    agreeContinue: "Accepter et continuer",
    reject: "Refuser",
    maintenanceNotice: "Avis de maintenance",
    appStaysOnline: "L'app reste en ligne",
    demoWorkspace: "Espace demo",
    demoBody: "Les donnees demo restent locales et n'utilisent ni Pi Browser, ni Supabase, ni paiements reels.",
    exitDemo: "Quitter la demo",
    footerDisclaimer: "PiScrow est une app Pi Testnet/Sandbox et ne garde pas de Mainnet Pi.",
    rulesLink: "Regles, confidentialite et consentement",
    workspace: "Espace",
    menu: "Menu",
    workspaceMenu: "Menu espace",
    closeWorkspaceMenu: "Fermer le menu",
    current: "Actuel",
    network: "Reseau",
    testnet: "Testnet",
    metrics: { openOffers: "Offres", activeValue: "Valeur active", disputes: "Litiges" },
    views: {
      market: { label: "Acheteur", description: "Parcourir les offres, repondre et financer les transactions choisies." },
      sell: { label: "Vendeur", description: "Publier des offres, comparer les reponses et gerer la livraison." },
      ledger: { label: "Registre", description: "Activite transparente sur PiScrow testnet." },
      profile: { label: "Profil", description: "Voir score de confiance, historique et badge." },
      admin: { label: "Admin", description: "Resoudre les litiges des comptes approuves." },
    },
    auth: {
      initial: "Connectez-vous avec Pi Browser pour utiliser PiScrow.",
      demo: "Mode demo local actif. Utilisez Pi Browser pour les tests reels.",
      consentAccepted: "Consentement accepte. Connectez Pi Browser.",
      consentRejected: "Consentement refuse. Connexion Pi desactivee.",
      checkingConsent: "PiScrow verifie votre consentement.",
      acceptConsentRequired: "Acceptez les regles et la confidentialite avant de connecter Pi.",
      preparing: "Preparation de la connexion Pi Browser...",
      sdkReady: "SDK Pi trouve. Approuvez la demande dans Pi Browser.",
      piSdkUnavailable: "Le SDK Pi n'est pas disponible. Dans Pi Browser, actualisez PiScrow depuis la page de l'app. Sinon utilisez la demo.",
      loginTimeout: "La connexion Pi n'a pas termine. Restez dans Pi Browser et approuvez la demande.",
      accessTokenMissing: "Pi Browser a connecte votre nom mais sans token valide. Reessayez.",
    },
    notices: {
      consentAcceptedTitle: "Consentement accepte",
      consentAcceptedBody: "Connexion PiScrow activee.",
      loginBlockedTitle: "Connexion bloquee",
      loginBlockedBody: "Acceptez les regles avant de connecter Pi.",
      consentRequiredTitle: "Consentement requis",
      piSdkTitle: "SDK Pi indisponible",
      connectionFailedTitle: "Connexion echouee",
      connectedTitle: "Compte Pi connecte",
      connectedBody: "Votre espace PiScrow est pret.",
      signedIn: (username) => `Connecte en tant que @${username}.`,
      connectedNoToken: (username) => `Connecte comme @${username}, mais sans token valide.`,
    },
  },
  pt: {
    language: "Idioma",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "Vendedores publicam ofertas publicas ou privadas no Pi testnet, compradores mostram interesse e o comprador escolhido financia a troca com taxa transparente.",
    session: "Sessao",
    notConnected: "Nao conectado",
    connect: "Conectar",
    connected: "Conectado",
    connecting: "Conectando",
    connectPiAccount: "Conectar conta Pi",
    privateWorkspace: "Espaco Pi privado",
    signInTitle: "Entre com Pi Browser para publicar ofertas ou mostrar interesse.",
    signInBody: "Ofertas e atividade publica ficam visiveis. Admin aparece apenas para usuarios aprovados.",
    loginDemo: "Entrar com demo",
    consentRequired: "Consentimento necessario",
    consentTitle: "Revise as regras da PiScrow antes de conectar sua conta Pi.",
    consentBody: "PiScrow usa usuario Pi, UID, detalhes, locais, provas, notificacoes e disputas para um fluxo transparente na Pi Testnet.",
    consentCards: [
      "Somente testnet. PiScrow nao custodia Mainnet Pi.",
      "Provas podem ser revisadas por vendedor, comprador e admin.",
      "O livro publico mostra atividade para transparencia.",
      "Admins revisam disputas antes de liberar ou cancelar.",
    ],
    readRules: "Ler regras, privacidade e acordos",
    checkingConsent: "Verificando consentimento...",
    loginDisabled: "Login Pi desativado.",
    agreeBeforeLogin: "Aceite antes do login Pi.",
    rejectedBody: "Voce rejeitou o acordo neste navegador. Pode ler as regras e aceitar quando quiser.",
    consentBlockBody: "Rejeitar bloqueia o login Pi e as acoes protegidas de trading ate voce aceitar as regras e o consentimento.",
    agreeContinue: "Aceitar e continuar",
    reject: "Rejeitar",
    maintenanceNotice: "Aviso de manutencao",
    appStaysOnline: "App continua online",
    demoWorkspace: "Demo",
    demoBody: "Dados demo rodam localmente e nao usam Pi Browser, Supabase ou pagamentos reais.",
    exitDemo: "Sair da demo",
    footerDisclaimer: "PiScrow e um app Pi Testnet/Sandbox e nao custodia Mainnet Pi.",
    rulesLink: "Regras, privacidade e consentimento",
    workspace: "Area",
    menu: "Menu",
    workspaceMenu: "Menu de areas",
    closeWorkspaceMenu: "Fechar menu",
    current: "Atual",
    network: "Rede",
    testnet: "Testnet",
    metrics: { openOffers: "Ofertas", activeValue: "Valor ativo", disputes: "Disputas" },
    views: {
      market: { label: "Comprador", description: "Veja ofertas, mostre interesse e financie trocas escolhidas." },
      sell: { label: "Vendedor", description: "Publique ofertas, compare respostas e gerencie entrega." },
      ledger: { label: "Livro", description: "Atividade transparente na PiScrow testnet." },
      profile: { label: "Perfil", description: "Acompanhe confianca, historico e badge." },
      admin: { label: "Admin", description: "Resolva disputas de usuarios aprovados." },
    },
    auth: {
      initial: "Conecte com Pi Browser para usar PiScrow.",
      demo: "Modo demo local ativo. Use Pi Browser para testes reais.",
      consentAccepted: "Consentimento aceito. Conecte com Pi Browser.",
      consentRejected: "Consentimento rejeitado. Login Pi desativado.",
      checkingConsent: "PiScrow esta verificando seu consentimento.",
      acceptConsentRequired: "Aceite regras e privacidade antes de conectar Pi.",
      preparing: "Preparando login Pi Browser...",
      sdkReady: "SDK Pi encontrado. Aprove a solicitacao no Pi Browser.",
      piSdkUnavailable: "SDK Pi indisponivel. Se estiver no Pi Browser, atualize PiScrow pela pagina do app. Em outros navegadores use demo.",
      loginTimeout: "Login Pi nao terminou. Fique no Pi Browser e aprove a solicitacao.",
      accessTokenMissing: "Pi Browser conectou seu usuario, mas sem token valido. Tente novamente.",
    },
    notices: {
      consentAcceptedTitle: "Consentimento aceito",
      consentAcceptedBody: "Login PiScrow ativado.",
      loginBlockedTitle: "Login bloqueado",
      loginBlockedBody: "Aceite regras e privacidade antes de conectar Pi.",
      consentRequiredTitle: "Consentimento necessario",
      piSdkTitle: "SDK Pi indisponivel",
      connectionFailedTitle: "Conexao falhou",
      connectedTitle: "Conta Pi conectada",
      connectedBody: "Seu espaco PiScrow esta pronto.",
      signedIn: (username) => `Conectado como @${username}.`,
      connectedNoToken: (username) => `Conectado como @${username}, mas sem token valido.`,
    },
  },
  ar: {
    language: "اللغة",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "ينشر البائعون عروض Pi testnet عامة أو خاصة، ويقدم المشترون اهتمامهم، ثم يمول المشتري المختار الصفقة برسوم واضحة.",
    session: "الجلسة",
    notConnected: "غير متصل",
    connect: "اتصال",
    connected: "متصل",
    connecting: "جار الاتصال",
    connectPiAccount: "ربط حساب Pi",
    privateWorkspace: "مساحة Pi الخاصة",
    signInTitle: "سجل الدخول عبر Pi Browser لنشر العروض أو إظهار الاهتمام.",
    signInBody: "تبقى العروض والنشاط العام مرئية للشفافية. أدوات الإدارة تظهر فقط للحسابات المعتمدة.",
    loginDemo: "الدخول بالعرض التجريبي",
    consentRequired: "الموافقة مطلوبة",
    consentTitle: "راجع قواعد PiScrow قبل ربط حساب Pi.",
    consentBody: "يستخدم PiScrow اسم مستخدم Pi و UID وتفاصيل الصفقة والموقع والإثباتات والإشعارات والنزاعات لتشغيل مسار شفاف على Pi Testnet.",
    consentCards: [
      "Testnet فقط. PiScrow لا يحتفظ بعملة Mainnet Pi.",
      "قد يراجع البائع والمشتري والمشرف صور الإثبات.",
      "يظهر السجل العام النشاط للشفافية.",
      "يراجع المشرفون النزاعات قبل التحرير أو الإلغاء.",
    ],
    readRules: "قراءة القواعد والخصوصية والاتفاقيات",
    checkingConsent: "جار فحص الموافقة...",
    loginDisabled: "تسجيل Pi معطل.",
    agreeBeforeLogin: "وافق قبل تسجيل Pi.",
    rejectedBody: "رفضت الاتفاق في هذا المتصفح. يمكنك قراءة القواعد والموافقة لاحقا.",
    consentBlockBody: "الرفض يمنع تسجيل Pi وإجراءات التداول المحمية حتى توافق على القواعد وشروط الموافقة.",
    agreeContinue: "موافقة ومتابعة",
    reject: "رفض",
    maintenanceNotice: "تنبيه صيانة",
    appStaysOnline: "التطبيق متاح",
    demoWorkspace: "وضع تجريبي",
    demoBody: "بيانات العرض التجريبي محلية ولا تتصل ب Pi Browser أو Supabase أو مدفوعات حقيقية.",
    exitDemo: "الخروج من التجربة",
    footerDisclaimer: "PiScrow تطبيق Pi Testnet/Sandbox ولا يحتفظ بعملة Mainnet Pi.",
    rulesLink: "القواعد والخصوصية والموافقة",
    workspace: "المساحة",
    menu: "القائمة",
    workspaceMenu: "قائمة المساحات",
    closeWorkspaceMenu: "إغلاق القائمة",
    current: "الحالي",
    network: "الشبكة",
    testnet: "Testnet",
    metrics: { openOffers: "العروض", activeValue: "القيمة النشطة", disputes: "النزاعات" },
    views: {
      market: { label: "مشتري", description: "تصفح عروض البائعين وأرسل اهتمامك ومول الصفقات المختارة." },
      sell: { label: "بائع", description: "انشر العروض وقارن ردود المشترين وأدر التسليم." },
      ledger: { label: "السجل", description: "نشاط شفاف عبر PiScrow testnet." },
      profile: { label: "الملف", description: "تابع الثقة والسجل وحالة الشارة." },
      admin: { label: "إدارة", description: "حل النزاعات للحسابات المعتمدة." },
    },
    auth: {
      initial: "اتصل ب Pi Browser لاستخدام PiScrow.",
      demo: "الوضع التجريبي المحلي نشط. استخدم Pi Browser للاختبار الحقيقي.",
      consentAccepted: "تم قبول الموافقة. اتصل ب Pi Browser.",
      consentRejected: "تم رفض الموافقة. تسجيل Pi معطل حتى توافق.",
      checkingConsent: "PiScrow يفحص حالة الموافقة.",
      acceptConsentRequired: "اقبل القواعد والخصوصية قبل ربط حساب Pi.",
      preparing: "جار تحضير تسجيل Pi Browser...",
      sdkReady: "تم العثور على Pi SDK. وافق على طلب تسجيل الدخول.",
      piSdkUnavailable: "Pi SDK غير متاح هنا. إذا كنت داخل Pi Browser فحدث PiScrow من صفحة التطبيق وحاول مرة أخرى. في المتصفحات الأخرى استخدم demo.",
      loginTimeout: "لم يكتمل تسجيل Pi. ابق داخل Pi Browser ووافق على الطلب.",
      accessTokenMissing: "اتصل Pi Browser باسمك لكنه لم يرجع رمز وصول صالح. حاول مرة أخرى.",
    },
    notices: {
      consentAcceptedTitle: "تم قبول الموافقة",
      consentAcceptedBody: "تم تفعيل تسجيل PiScrow.",
      loginBlockedTitle: "تسجيل محظور",
      loginBlockedBody: "يجب قبول القواعد والخصوصية قبل ربط Pi.",
      consentRequiredTitle: "الموافقة مطلوبة",
      piSdkTitle: "Pi SDK غير متاح",
      connectionFailedTitle: "فشل الاتصال",
      connectedTitle: "تم ربط حساب Pi",
      connectedBody: "مساحة PiScrow جاهزة.",
      signedIn: (username) => `تم تسجيل الدخول كـ @${username}.`,
      connectedNoToken: (username) => `تم الاتصال كـ @${username} لكن بدون رمز صالح.`,
    },
  },
  hi: {
    language: "भाषा",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "Seller public ya private Pi testnet offers post karte hain, buyers interest bhejte hain, aur selected buyer transparent fee ke saath trade fund karta hai.",
    session: "Session",
    notConnected: "Connected nahi",
    connect: "Connect",
    connected: "Connected",
    connecting: "Connecting",
    connectPiAccount: "Pi account connect karein",
    privateWorkspace: "Private Pi workspace",
    signInTitle: "Offers post karne ya buyer interest dikhane ke liye Pi Browser se sign in karein.",
    signInBody: "Public listings aur activity transparency ke liye visible rehti hai. Admin tools sirf approved usernames ko dikhte hain.",
    loginDemo: "Demo data se login",
    consentRequired: "Consent zaroori hai",
    consentTitle: "Pi account connect karne se pehle PiScrow rules review karein.",
    consentBody: "PiScrow Pi username, UID, trade details, location labels, proof uploads, notifications aur disputes ka use transparent Pi Testnet workflow ke liye karta hai.",
    consentCards: [
      "Sirf testnet. PiScrow Mainnet Pi custody nahi karta.",
      "Proof images seller, buyer aur admin dekh sakte hain.",
      "Public ledger transparency ke liye activity dikhata hai.",
      "Admins release-ready ya disputed trades release ya cancel se pehle review karte hain.",
    ],
    readRules: "Rules, privacy aur agreements padhein",
    checkingConsent: "Saved consent check ho raha hai...",
    loginDisabled: "Pi login disabled hai.",
    agreeBeforeLogin: "Pi login se pehle agree karein.",
    rejectedBody: "Aapne agreement reject kiya. Ready hone par rules padhkar agree kar sakte hain.",
    consentBlockBody: "Reject karne se Pi login aur protected trading actions tab tak block rahenge jab tak aap rules aur consent accept nahi karte.",
    agreeContinue: "Agree aur continue",
    reject: "Reject",
    maintenanceNotice: "Maintenance notice",
    appStaysOnline: "App online rahegi",
    demoWorkspace: "Demo workspace",
    demoBody: "Demo data browser me local chalta hai. Pi Browser, Supabase writes ya real testnet payments se connect nahi hota.",
    exitDemo: "Demo se exit",
    footerDisclaimer: "PiScrow Pi Testnet/Sandbox app hai aur Mainnet Pi custody nahi karta.",
    rulesLink: "Rules, privacy aur consent",
    workspace: "Workspace",
    menu: "Menu",
    workspaceMenu: "Workspace menu",
    closeWorkspaceMenu: "Menu band karein",
    current: "Current",
    network: "Network",
    testnet: "Testnet",
    metrics: { openOffers: "Open offers", activeValue: "Active value", disputes: "Disputes" },
    views: {
      market: { label: "Buyer", description: "Seller offers browse karein, interest bhejein aur selected trades fund karein." },
      sell: { label: "Seller", description: "Offers post karein, buyer responses compare karein aur delivery manage karein." },
      ledger: { label: "Ledger", description: "PiScrow testnet ki transparent activity." },
      profile: { label: "Profile", description: "Trust score, trade history aur badge status track karein." },
      admin: { label: "Admin", description: "Approved Pi usernames ke release-ready ya disputed trades review karein." },
    },
    auth: {
      initial: "PiScrow use karne ke liye Pi Browser se connect karein.",
      demo: "Local demo mode active hai. Real testing ke liye Pi Browser use karein.",
      consentAccepted: "Consent accepted. Pi Browser se connect karein.",
      consentRejected: "Consent rejected. Agree hone tak Pi login disabled hai.",
      checkingConsent: "PiScrow consent status check kar raha hai.",
      acceptConsentRequired: "Pi account connect karne se pehle rules aur privacy accept karein.",
      preparing: "Pi Browser login prepare ho raha hai...",
      sdkReady: "Pi SDK mil gaya. Pi Browser sign-in request approve karein.",
      piSdkUnavailable: "Pi SDK is page par available nahi hai. Agar Pi Browser me hain, app page se refresh karke try karein. Dusre browsers me demo use karein.",
      loginTimeout: "Pi login complete nahi hua. Pi Browser me rahkar request approve karein.",
      accessTokenMissing: "Pi Browser ne username connect kiya, par valid access token nahi mila. Dobara try karein.",
    },
    notices: {
      consentAcceptedTitle: "Consent accepted",
      consentAcceptedBody: "PiScrow login enabled hai.",
      loginBlockedTitle: "Login blocked",
      loginBlockedBody: "Pi connect karne se pehle rules aur privacy accept karein.",
      consentRequiredTitle: "Consent required",
      piSdkTitle: "Pi SDK unavailable",
      connectionFailedTitle: "Connection failed",
      connectedTitle: "Pi account connected",
      connectedBody: "Aapka PiScrow workspace ready hai.",
      signedIn: (username) => `@${username} ke roop me signed in.`,
      connectedNoToken: (username) => `@${username} connect hua, par valid token nahi mila.`,
    },
  },
  id: {
    language: "Bahasa",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "Penjual membuat penawaran Pi testnet publik atau privat, pembeli mengirim minat, lalu pembeli terpilih mendanai transaksi dengan biaya transparan.",
    session: "Sesi",
    notConnected: "Belum terhubung",
    connect: "Hubungkan",
    connected: "Terhubung",
    connecting: "Menghubungkan",
    connectPiAccount: "Hubungkan akun Pi",
    privateWorkspace: "Ruang Pi privat",
    signInTitle: "Masuk dengan Pi Browser untuk membuat penawaran atau menunjukkan minat.",
    signInBody: "Daftar dan aktivitas publik tetap terlihat. Alat admin hanya muncul untuk username pengembang yang disetujui.",
    loginDemo: "Masuk dengan demo",
    consentRequired: "Persetujuan diperlukan",
    consentTitle: "Tinjau aturan PiScrow sebelum menghubungkan akun Pi.",
    consentBody: "PiScrow memakai username Pi, UID, detail transaksi, label lokasi, bukti, notifikasi, dan sengketa untuk alur Pi Testnet yang transparan.",
    consentCards: [
      "Hanya testnet. PiScrow tidak menyimpan Mainnet Pi.",
      "Bukti dapat ditinjau penjual, pembeli, dan admin.",
      "Ledger publik menampilkan aktivitas untuk transparansi.",
      "Admin meninjau sengketa sebelum rilis atau pembatalan.",
    ],
    readRules: "Baca aturan, privasi, dan persetujuan",
    checkingConsent: "Memeriksa persetujuan...",
    loginDisabled: "Login Pi dinonaktifkan.",
    agreeBeforeLogin: "Setujui sebelum login Pi.",
    rejectedBody: "Anda menolak persetujuan di browser ini. Anda dapat membaca aturan dan menyetujui saat siap.",
    consentBlockBody: "Menolak memblokir login Pi dan aksi trading yang dilindungi sampai Anda menyetujui aturan dan persetujuan.",
    agreeContinue: "Setuju dan lanjut",
    reject: "Tolak",
    maintenanceNotice: "Pemberitahuan pemeliharaan",
    appStaysOnline: "Aplikasi tetap online",
    demoWorkspace: "Ruang demo",
    demoBody: "Data demo berjalan lokal di browser ini dan tidak terhubung ke Pi Browser, Supabase, atau pembayaran nyata.",
    exitDemo: "Keluar demo",
    footerDisclaimer: "PiScrow adalah app Pi Testnet/Sandbox dan tidak menyimpan Mainnet Pi.",
    rulesLink: "Aturan, privasi, dan persetujuan",
    workspace: "Ruang",
    menu: "Menu",
    workspaceMenu: "Menu ruang",
    closeWorkspaceMenu: "Tutup menu",
    current: "Aktif",
    network: "Jaringan",
    testnet: "Testnet",
    metrics: { openOffers: "Penawaran", activeValue: "Nilai aktif", disputes: "Sengketa" },
    views: {
      market: { label: "Pembeli", description: "Lihat penawaran, kirim minat, dan danai transaksi terpilih." },
      sell: { label: "Penjual", description: "Buat penawaran, bandingkan respons, dan kelola pengiriman." },
      ledger: { label: "Ledger", description: "Aktivitas transparan di PiScrow testnet." },
      profile: { label: "Profil", description: "Pantau skor kepercayaan, riwayat, dan badge." },
      admin: { label: "Admin", description: "Selesaikan sengketa dari akun Pi yang disetujui." },
    },
    auth: {
      initial: "Hubungkan dengan Pi Browser untuk memakai PiScrow.",
      demo: "Mode demo lokal aktif. Gunakan Pi Browser untuk pengujian nyata.",
      consentAccepted: "Persetujuan diterima. Hubungkan Pi Browser.",
      consentRejected: "Persetujuan ditolak. Login Pi nonaktif sampai Anda setuju.",
      checkingConsent: "PiScrow sedang memeriksa status persetujuan.",
      acceptConsentRequired: "Setujui aturan dan privasi sebelum menghubungkan akun Pi.",
      preparing: "Menyiapkan login Pi Browser...",
      sdkReady: "Pi SDK ditemukan. Setujui permintaan login di Pi Browser.",
      piSdkUnavailable: "Pi SDK belum tersedia di halaman ini. Jika di Pi Browser, segarkan PiScrow dari halaman app lalu coba lagi. Di browser lain gunakan demo.",
      loginTimeout: "Login Pi belum selesai. Tetap di Pi Browser dan setujui permintaan.",
      accessTokenMissing: "Pi Browser menghubungkan username tetapi tidak mengembalikan token valid. Coba lagi.",
    },
    notices: {
      consentAcceptedTitle: "Persetujuan diterima",
      consentAcceptedBody: "Login PiScrow diaktifkan.",
      loginBlockedTitle: "Login diblokir",
      loginBlockedBody: "Setujui aturan dan privasi sebelum menghubungkan Pi.",
      consentRequiredTitle: "Persetujuan diperlukan",
      piSdkTitle: "Pi SDK tidak tersedia",
      connectionFailedTitle: "Koneksi gagal",
      connectedTitle: "Akun Pi terhubung",
      connectedBody: "Ruang PiScrow siap.",
      signedIn: (username) => `Masuk sebagai @${username}.`,
      connectedNoToken: (username) => `Terhubung sebagai @${username}, tetapi tanpa token valid.`,
    },
  },
  zh: {
    language: "语言",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "卖家发布公开或私密 Pi testnet 报价，买家表达兴趣，卖家选择一名买家后由其支付含透明费用的交易金额。",
    session: "会话",
    notConnected: "未连接",
    connect: "连接",
    connected: "已连接",
    connecting: "连接中",
    connectPiAccount: "连接 Pi 账号",
    privateWorkspace: "Pi 私有工作区",
    signInTitle: "使用 Pi Browser 登录，以发布报价或表达买家兴趣。",
    signInBody: "公开列表和活动保持可见以保证透明。管理员工具仅对已批准账号显示。",
    loginDemo: "使用演示数据登录",
    consentRequired: "需要同意",
    consentTitle: "连接 Pi 账号前请查看 PiScrow 规则。",
    consentBody: "PiScrow 使用你的 Pi 用户名、UID、交易详情、位置标签、凭证、通知和争议活动来运行透明的 Pi Testnet 流程。",
    consentCards: [
      "仅限 testnet。PiScrow 不托管 Mainnet Pi。",
      "凭证图片可能由卖家、买家和管理员查看。",
      "公开账本显示市场活动以保持透明。",
      "管理员会在释放或取消前审查争议交易。",
    ],
    readRules: "阅读完整规则、隐私和协议",
    checkingConsent: "正在检查同意状态...",
    loginDisabled: "Pi 登录已禁用。",
    agreeBeforeLogin: "登录 Pi 前请先同意。",
    rejectedBody: "你已在此浏览器拒绝协议。准备好后可重新阅读并同意。",
    consentBlockBody: "拒绝后会阻止 Pi 登录和受保护的交易操作，直到你同意规则和同意条款。",
    agreeContinue: "同意并继续",
    reject: "拒绝",
    maintenanceNotice: "维护通知",
    appStaysOnline: "应用保持在线",
    demoWorkspace: "演示工作区",
    demoBody: "演示数据仅在本浏览器本地运行，不连接 Pi Browser、Supabase 或真实 testnet 支付。",
    exitDemo: "退出演示",
    footerDisclaimer: "PiScrow 是 Pi Testnet/Sandbox 应用，不托管 Mainnet Pi。",
    rulesLink: "规则、隐私和同意",
    workspace: "工作区",
    menu: "菜单",
    workspaceMenu: "工作区菜单",
    closeWorkspaceMenu: "关闭菜单",
    current: "当前",
    network: "网络",
    testnet: "Testnet",
    metrics: { openOffers: "开放报价", activeValue: "活跃价值", disputes: "争议" },
    views: {
      market: { label: "买家", description: "浏览卖家报价、表达兴趣并为选中的交易付款。" },
      sell: { label: "卖家", description: "发布报价、比较买家回复并管理交付。" },
      ledger: { label: "账本", description: "PiScrow testnet 的透明活动。" },
      profile: { label: "资料", description: "查看信任分、交易历史和徽章状态。" },
      admin: { label: "管理", description: "处理已批准账号的争议交易。" },
    },
    auth: {
      initial: "请使用 Pi Browser 连接以开始使用 PiScrow。",
      demo: "本地演示模式已启用。真实测试请使用 Pi Browser。",
      consentAccepted: "已同意。请连接 Pi Browser。",
      consentRejected: "已拒绝同意。Pi 登录已禁用，直到你同意。",
      checkingConsent: "PiScrow 正在检查你的同意状态。",
      acceptConsentRequired: "连接 Pi 账号前请同意规则和隐私条款。",
      preparing: "正在准备 Pi Browser 登录...",
      sdkReady: "已找到 Pi SDK。请在 Pi Browser 中批准登录请求。",
      piSdkUnavailable: "此页面尚未提供 Pi SDK。如果你在 Pi Browser 中，请从应用页面刷新 PiScrow 后重试。其他浏览器请使用演示数据。",
      loginTimeout: "Pi 登录未完成。请留在 Pi Browser 并批准请求。",
      accessTokenMissing: "Pi Browser 已连接用户名，但未返回有效访问令牌。请重试。",
    },
    notices: {
      consentAcceptedTitle: "已同意",
      consentAcceptedBody: "PiScrow 登录已启用。",
      loginBlockedTitle: "登录被阻止",
      loginBlockedBody: "连接 Pi 前请同意规则和隐私。",
      consentRequiredTitle: "需要同意",
      piSdkTitle: "Pi SDK 不可用",
      connectionFailedTitle: "连接失败",
      connectedTitle: "Pi 账号已连接",
      connectedBody: "你的 PiScrow 工作区已准备好。",
      signedIn: (username) => `已以 @${username} 登录。`,
      connectedNoToken: (username) => `已连接为 @${username}，但没有有效令牌。`,
    },
  },
  pcm: {
    language: "Language",
    testnetBadge: "Pi Testnet / Sandbox",
    heroTitle: "PiScrow",
    heroBody:
      "Sellers fit post public or private Pi testnet offers, buyers go show interest, and the buyer wey seller choose go fund escrow-style trade with clear platform fee.",
    session: "Session",
    notConnected: "No connect",
    connect: "Connect",
    connected: "Connected",
    connecting: "Connecting",
    connectPiAccount: "Connect Pi account",
    privateWorkspace: "Private Pi workspace",
    signInTitle: "Sign in with Pi Browser to post offers or show buyer interest.",
    signInBody:
      "Public listings and activity still dey show for transparency. Admin review tools go show only for approved developer usernames.",
    loginDemo: "Enter with demo data",
    consentRequired: "Consent needed",
    consentTitle: "Read PiScrow rules before you connect your Pi account.",
    consentBody:
      "PiScrow uses your Pi username, Pi UID, trade details, location labels, proof uploads, notifications, and dispute activity to run transparent Pi Testnet escrow-style workflow.",
    consentCards: [
      "Na testnet only. PiScrow no dey hold Mainnet Pi.",
      "Seller, buyer, and admin fit review proof images.",
      "Public ledger activity dey show for marketplace transparency.",
      "Admins fit review release-ready or disputed trades before release or cancellation.",
    ],
    readRules: "Read full rules, privacy, and agreement",
    checkingConsent: "Dey check saved consent...",
    loginDisabled: "Pi login don disable.",
    agreeBeforeLogin: "Agree before Pi login.",
    rejectedBody:
      "You reject the agreement for this browser. You fit read the rules again and agree when you ready.",
    consentBlockBody:
      "If you reject, Pi login and protected trading actions go block until you agree to the rules and consent terms.",
    agreeContinue: "Agree and continue",
    reject: "Reject",
    maintenanceNotice: "Maintenance notice",
    appStaysOnline: "App still dey online",
    demoWorkspace: "Demo workspace",
    demoBody:
      "Demo data dey run local for this browser. E no connect to Pi Browser, Supabase writes, or real testnet payments.",
    exitDemo: "Exit demo",
    footerDisclaimer:
      "PiScrow na Pi Testnet/Sandbox app and e no dey hold Mainnet Pi.",
    rulesLink: "Rules, privacy, and consent",
    workspace: "Workspace",
    menu: "Menu",
    workspaceMenu: "Workspace menu",
    closeWorkspaceMenu: "Close workspace menu",
    current: "Current",
    network: "Network",
    testnet: "Testnet",
    metrics: {
      openOffers: "Open offers",
      activeValue: "Active value",
      disputes: "Disputes",
    },
    views: {
      market: {
        label: "Buy",
        description: "Check seller offers, show interest, and fund selected trades.",
      },
      sell: {
        label: "Sell",
        description: "Post offers, compare buyer responses, and manage delivery.",
      },
      ledger: {
        label: "Explore",
        description: "Transparent trade activity across PiScrow testnet.",
      },
      profile: {
        label: "Profile",
        description: "Track trust score, trade history, and badge status.",
      },
      admin: {
        label: "Admin",
        description: "Review release-ready or disputed trades from approved Pi usernames.",
      },
    },
    auth: {
      initial: "Connect with Pi Browser to start using PiScrow.",
      demo: "Local demo mode dey active. Use Pi Browser for real-user testing.",
      consentAccepted: "Consent accepted. Connect with Pi Browser to continue.",
      consentRejected: "Consent rejected. Pi login go stay disabled until you agree.",
      checkingConsent: "PiScrow still dey check your consent status.",
      acceptConsentRequired:
        "Accept PiScrow rules and privacy consent before you connect Pi account.",
      preparing: "Dey prepare Pi Browser login...",
      sdkReady: "Pi SDK dey available. Approve the Pi Browser sign-in request to continue.",
      piSdkUnavailable:
        "Pi SDK never show for this page yet. If you dey inside Pi Browser, refresh PiScrow from the app page and try again. For other browsers, use demo data.",
      loginTimeout:
        "Pi login no finish. Stay inside Pi Browser, approve the request, and try again.",
      accessTokenMissing:
        "Pi Browser connect your username but no return valid access token. Try again.",
    },
    notices: {
      consentAcceptedTitle: "Consent accepted",
      consentAcceptedBody: "PiScrow login now dey enabled for this browser.",
      loginBlockedTitle: "Login blocked",
      loginBlockedBody:
        "You need to accept PiScrow rules and privacy consent before connecting Pi account.",
      consentRequiredTitle: "Consent needed",
      piSdkTitle: "Pi SDK no available",
      connectionFailedTitle: "Connection fail",
      connectedTitle: "Pi account connected",
      connectedBody: "Your PiScrow workspace don ready.",
      signedIn: (username) => `Signed in as @${username}.`,
      connectedNoToken: (username) =>
        `Connected as @${username}, but Pi Browser no return access token.`,
    },
  },
};
type AppCopy = (typeof appCopy)[LanguageCode];

function isLanguageCode(value: string | null): value is LanguageCode {
  return supportedLanguages.some((language) => language.code === value);
}

export function PiScrowApp({
  consentAction,
  connectAction,
  allowDemo = false,
  forceMaintenance = false,
}: {
  consentAction?: string;
  connectAction?: string;
  allowDemo?: boolean;
  forceMaintenance?: boolean;
}) {
  const initialConsentState: ConsentState = allowDemo
    ? "accepted"
    : consentAction === "accept"
      ? "accepted"
      : consentAction === "reject"
        ? "rejected"
        : readStoredConsentState();
  const [user, setUser] = useState<SessionUser | null>(
    allowDemo ? { ...demoUser, isAdmin: true } : null,
  );
  const [piConnected, setPiConnected] = useState(false);
  const [piAccessToken, setPiAccessToken] = useState("");
  const [language, setLanguage] = useState<LanguageCode>(() => {
    if (typeof window === "undefined") {
      return "en";
    }

    try {
      const stored = window.localStorage.getItem(languageStorageKey);
      return isLanguageCode(stored) ? stored : "en";
    } catch {
      return "en";
    }
  });
  const [authMessage, setAuthMessage] = useState<AuthMessageState>(() => ({
    key:
      allowDemo
        ? "demo"
        : initialConsentState === "rejected"
          ? "consentRejected"
          : initialConsentState === "accepted"
            ? "consentAccepted"
            : "initial",
  }));
  const [mode, setMode] = useState<ViewMode>("ledger");
  const [trades, setTrades] = useState<Trade[]>(allowDemo ? demoTrades : []);
  const [interests, setInterests] = useState<TradeInterest[]>(
    allowDemo ? demoInterests : [],
  );
  const [events, setEvents] = useState<TradeEvent[]>(allowDemo ? demoEvents : []);
  const [chatRooms, setChatRooms] = useState<TradeChatRoom[]>(
    allowDemo ? demoChatRooms : [],
  );
  const [chatMessages, setChatMessages] = useState<TradeChatMessage[]>(
    allowDemo ? demoChatMessages : [],
  );
  const [chatLoadingTradeId, setChatLoadingTradeId] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [activeChatTrade, setActiveChatTrade] = useState<Trade | null>(null);
  const [ledgerTrades, setLedgerTrades] = useState<Trade[]>(
    allowDemo ? demoTrades : [],
  );
  const [ledgerEvents, setLedgerEvents] = useState<TradeEvent[]>(
    allowDemo ? demoEvents : [],
  );
  const [selectedTradeId, setSelectedTradeId] = useState(
    allowDemo ? (demoTrades[0]?.id ?? "") : "",
  );
  const [expandedTradeId, setExpandedTradeId] = useState(
    allowDemo ? (demoTrades[0]?.id ?? "") : "",
  );
  const [formError, setFormError] = useState("");
  const [handoffCodeModal, setHandoffCodeModal] = useState<{
    tradeId: string;
    code: string;
    expiresAt?: string;
  } | null>(null);
  const [handoffCodeCache, setHandoffCodeCache] = useState<
    Record<string, { code: string; expiresAt?: string }>
  >(() => readStoredHandoffCodeCache());
  const [paymentState, setPaymentState] = useState("No payment started.");
  const [appRefreshing, setAppRefreshing] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(!allowDemo);
  const [workspaceTradeLoading, setWorkspaceTradeLoading] = useState(!allowDemo);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [sellerComposerOpen, setSellerComposerOpen] = useState(false);
  const [sellerFormResetKey, setSellerFormResetKey] = useState(0);
  const [connectingPi, setConnectingPi] = useState(false);
  const [profile, setProfile] = useState<UserReputation | null>(
    allowDemo ? buildDemoProfile(demoUser.username, demoTrades) : null,
  );
  const [telegram, setTelegram] = useState<TelegramLinkStatus>(
    allowDemo
      ? {
          configured: true,
          linked: false,
          botUsername: "PiScrow_bot",
          notificationsEnabled: false,
        }
      : defaultTelegramStatus,
  );
  const [telegramAwaitingLink, setTelegramAwaitingLink] = useState(false);
  const [verificationRequests, setVerificationRequests] = useState<UserReputation[]>(
    allowDemo ? buildDemoVerificationRequests(demoTrades) : [],
  );
  const [reviewRecommendations, setReviewRecommendations] = useState<
    TradeReviewRecommendation[]
  >(allowDemo ? buildDemoReviewRecommendations() : []);
  const [reviewLoadingTradeId, setReviewLoadingTradeId] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>(null);
  const [blockingAction, setBlockingAction] = useState<BlockingAction | null>(null);
  const [payoutReadyLoading, setPayoutReadyLoading] = useState(false);
  const [consentState, setConsentState] = useState<ConsentState>(
    () => initialConsentState,
  );
  const connectActionHandledRef = useRef(false);
  const connectPiRef = useRef<() => Promise<void>>(async () => {});
  const demoSessionRef = useRef(allowDemo);
  const restoredPiSessionRef = useRef(false);
  const workspaceRefreshInFlightRef = useRef(false);
  const tradeChatRefreshInFlightRef = useRef<string | null>(null);
  const seenSavedNotificationIdsRef = useRef<Set<string>>(new Set());

  const signedIn = Boolean(user);
  const copy = appCopy[language];
  const authState =
    authMessage.text ?? copy.auth[authMessage.key ?? (allowDemo ? "demo" : "initial")];
  const canConnectPi = consentState === "accepted";
  const maintenanceEnabled = forceMaintenance || nextPublicMaintenanceEnabled;
  const normalizedUsername = normalizeUsername(user?.username ?? "");
  const navItems: ViewMode[] = user?.isAdmin
    ? ["ledger", "market", "sell", "profile", "admin"]
    : ["ledger", "market", "sell", "profile"];
  const activeMode: ViewMode = mode === "admin" && !user?.isAdmin ? "ledger" : mode;
  const unreadNoticeCount = notices.filter((notice) => notice.persistent).length;
  const toastNotices = notices.filter((notice) => !notice.persistent);
  const inboxNotices = notices.filter((notice) => notice.persistent);
  const activeChatTradeRecord =
    activeChatTrade == null
      ? null
      : trades.find((trade) => trade.id === activeChatTrade.id) ?? activeChatTrade;

  const selectedTrade =
    trades.find((trade) => trade.id === selectedTradeId) ??
    trades.find((trade) => trade.id === expandedTradeId) ??
    trades[0];

  const activeHandoffCodeCache = useMemo<
    Record<string, { code: string; expiresAt?: string }>
  >(
    () =>
      Object.fromEntries(
        Object.entries(handoffCodeCache).filter(([tradeId]) => {
          const trade = trades.find((item) => item.id === tradeId);
          return trade?.handoffCode?.status === "active";
        }),
      ),
    [handoffCodeCache, trades],
  );

  useEffect(() => {
    window.localStorage.setItem(
      handoffCodeCacheStorageKey,
      JSON.stringify(activeHandoffCodeCache),
    );
  }, [activeHandoffCodeCache]);

  const sellerTrades = useMemo(
    () =>
      trades.filter(
        (trade) =>
          trade.status !== "Cancelled" &&
          normalizeUsername(trade.sellerPiUsername) === normalizedUsername,
      ),
    [normalizedUsername, trades],
  );

  const buyerTrades = useMemo(
    () =>
      trades.filter((trade) => {
        if (!user) {
          return false;
        }

        if (trade.status === "Cancelled") {
          return false;
        }

        if (trade.visibility === "public") {
          return true;
        }

        if (normalizeUsername(trade.buyerPiUsername ?? "") === normalizedUsername) {
          return true;
        }

        return trade.targetBuyerPiUsernames.includes(normalizedUsername);
      }),
    [normalizedUsername, trades, user],
  );

  const adminTrades = useMemo(
    () =>
      trades.filter((trade) =>
        ["Disputed", "AwaitingRelease"].includes(trade.status),
      ),
    [trades],
  );

  const activeValue = trades
    .filter((trade) => !isTerminal(trade.status))
    .reduce((total, trade) => total + trade.amountTestPi, 0);

  const profileStats = useMemo(
    () => profile ?? (user ? buildDemoProfile(user.username, trades) : null),
    [profile, trades, user],
  );

  const clearStoredPiSession = useCallback(() => {
    removeStoredJson(piSessionStorageKey);
  }, []);

  const clearStoredTelegramLinkState = useCallback(() => {
    removeStoredJson(telegramLinkStateStorageKey);
  }, []);

  const persistPiSession = useCallback(
    (nextUser: SessionUser, accessToken: string) => {
      if (!accessToken) {
        clearStoredPiSession();
        return;
      }

      writeStoredJson(piSessionStorageKey, {
        accessToken,
        user: nextUser,
        savedAt: new Date().toISOString(),
      } satisfies StoredPiSession);
    },
    [clearStoredPiSession],
  );

  const clearPersistedAuthState = useCallback(() => {
    clearStoredPiSession();
    clearStoredTelegramLinkState();
  }, [clearStoredPiSession, clearStoredTelegramLinkState]);

  const persistTelegramAwaitingLink = useCallback(
    (awaitingLink: boolean) => {
      if (!awaitingLink) {
        clearStoredTelegramLinkState();
        return;
      }

      writeStoredJson(telegramLinkStateStorageKey, {
        awaitingLink: true,
        savedAt: new Date().toISOString(),
      } satisfies StoredTelegramLinkState);
    },
    [clearStoredTelegramLinkState],
  );

  function showBlockingAction(title: string, body: string) {
    setBlockingAction({ title, body });
  }

  function hideBlockingAction() {
    setBlockingAction(null);
  }

  function requirePayoutReadiness(actionLabel: string) {
    if (allowDemo) {
      return true;
    }

    if (!user) {
      return false;
    }

    if (!profileStats) {
      setMode("profile");
      setFormError("PiScrow is still loading your profile. Open Profile and try again in a moment.");
      return false;
    }

    if (profileStats.payoutReady) {
      return true;
    }

    setSellerComposerOpen(false);
    setNotificationsOpen(false);
    setMode("profile");
    setFormError(
      `Complete payout readiness in Profile before you ${actionLabel}. PiScrow uses your authenticated Pi account for buyer refunds and seller releases.`,
    );
    return false;
  }

  function changeLanguage(nextLanguage: LanguageCode) {
    setLanguage(nextLanguage);

    try {
      window.localStorage.setItem(languageStorageKey, nextLanguage);
    } catch {
      // Language selection is still applied for the current session.
    }
  }

  function changeMode(nextMode: ViewMode) {
    setNotificationsOpen(false);
    setSellerComposerOpen(false);

    if (nextMode === "admin" && !user?.isAdmin) {
      setMode("ledger");
      return;
    }

    setMode(nextMode);

    if (nextMode === "ledger") {
      void refreshPublicLedger();
    }

    if (nextMode === "profile") {
      void refreshProfile();
    }

    if (nextMode === "admin") {
      void refreshVerificationRequests();
      void refreshReviewRecommendations();
    }
  }

  async function refreshCurrentView() {
    setNotificationsOpen(false);
    setAppRefreshing(true);

    try {
      if (!signedIn) {
        await refreshPublicLedger();
        return;
      }

      await refreshAuthenticatedWorkspace({
        includeProfile: activeMode === "profile",
        includeAdmin: activeMode === "admin" && Boolean(user?.isAdmin),
        silent: false,
      });

      if (activeChatTradeRecord) {
        await refreshTradeChat(activeChatTradeRecord, { keepOpen: true });
      }

      if (activeMode === "ledger") {
        await refreshPublicLedger();
      }

      if (activeMode === "profile") {
        await refreshProfile();
      }

      if (activeMode === "admin") {
        await Promise.all([
          refreshVerificationRequests(),
          refreshReviewRecommendations(),
        ]);
      }
    } finally {
      setAppRefreshing(false);
    }
  }

  function applyTradePayload(payload: Partial<TradePayload>) {
    if (payload.trades) {
      setTrades(payload.trades);
      setSelectedTradeId((current) => {
        if (current && payload.trades?.some((trade) => trade.id === current)) {
          return current;
        }

        return payload.trades?.[0]?.id ?? "";
      });
    }

    if (payload.interests) {
      setInterests(payload.interests);
    }

    if (payload.events) {
      setEvents(payload.events);
    }
  }

  function applyChatPayload(payload: ChatPayload) {
    if (payload.trades) {
      setTrades(payload.trades);
    }
    if (payload.interests) {
      setInterests(payload.interests);
    }
    if (payload.events) {
      setEvents(payload.events);
    }
    setChatRooms((current) => [
      payload.room,
      ...current.filter((room) => room.tradeId !== payload.room.tradeId),
    ]);
    setChatMessages((current) => [
      ...current.filter((message) => message.tradeId !== payload.room.tradeId),
      ...payload.messages,
    ]);
  }

  const upsertDemoChatRoom = useCallback((
    trade: Trade,
    status: TradeChatRoom["status"] = trade.status === "Disputed" ? "disputed" : "active",
  ) => {
    const existing = chatRooms.find((room) => room.tradeId === trade.id);
    const now = new Date().toISOString();
    const room: TradeChatRoom = existing
      ? { ...existing, status, updatedAt: now }
      : {
          id: `chat-room-${trade.id}`,
          tradeId: trade.id,
          status,
          createdAt: now,
          updatedAt: now,
        };

    setChatRooms((current) => [
      room,
      ...current.filter((item) => item.tradeId !== trade.id),
    ]);

    if (!existing) {
      setChatMessages((current) => [
        ...current,
        {
          id: createClientId("chat-system"),
          roomId: room.id,
          tradeId: trade.id,
          senderPiUsername: "system",
          senderRole: "system",
          messageType: "system",
          body: "Secure trade room opened. Use this chat for delivery updates, proof, and dispute evidence.",
          createdAt: now,
        },
      ]);
    }

    return room;
  }, [chatRooms]);

  function appendDemoChatMessage(
    trade: Trade,
    message: Omit<TradeChatMessage, "id" | "roomId" | "tradeId" | "createdAt">,
    status?: TradeChatRoom["status"],
  ) {
    const room = upsertDemoChatRoom(trade, status);
    setChatMessages((current) => [
      ...current,
      {
        id: createClientId("chat-message"),
        roomId: room.id,
        tradeId: trade.id,
        createdAt: new Date().toISOString(),
        ...message,
      },
    ]);
  }

  const pushNotice = useCallback((
    title: string,
    body: string,
    tone: AppNotice["tone"] = "info",
    options: { persistent?: boolean } = {},
  ) => {
    const persistent = options.persistent ?? false;
    setNotices((current) => [
      {
        id: createClientId("notice"),
        title,
        body,
        tone,
        persistent,
        expiresAt: persistent ? undefined : Date.now() + 6500,
      },
      ...current,
    ].slice(0, 6));
  }, []);

  const cachePublicLedger = useCallback((payload: PublicLedgerPayload) => {
    try {
      window.localStorage.setItem(
        publicLedgerCacheKey,
        JSON.stringify({
          trades: payload.trades,
          events: payload.events,
          cachedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Ignore local cache write failures.
    }
  }, []);

  const loadCachedPublicLedger = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(publicLedgerCacheKey);

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as {
        trades?: Trade[];
        events?: TradeEvent[];
        cachedAt?: string;
      };

      if (!Array.isArray(parsed.trades) || !Array.isArray(parsed.events)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }, []);

  const broadcastRealtimeSync = useCallback(async (
    event:
      | "workspace-refresh"
      | "ledger-refresh"
      | "profile-refresh"
      | "admin-refresh",
  ) => {
    if (allowDemo) {
      return;
    }

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      return;
    }

    const channel = supabase.channel(realtimeSyncChannelName);

    try {
      await channel.httpSend(event, {
        at: Date.now(),
        source: "piscrow-client",
      });
    } finally {
      void supabase.removeChannel(channel);
    }
  }, [allowDemo]);

  const refreshAuthenticatedWorkspace = useCallback(
    async ({
      accessToken = piAccessToken,
      includeProfile,
      includeAdmin,
      silent = true,
      sessionUser,
    }: {
      accessToken?: string;
      includeProfile?: boolean;
      includeAdmin?: boolean;
      silent?: boolean;
      sessionUser?: SessionUser | null;
    } = {}) => {
      const activeUser = sessionUser ?? user;
      const shouldIncludeProfile = includeProfile ?? activeMode === "profile";
      const shouldIncludeAdmin =
        includeAdmin ?? (activeMode === "admin" && Boolean(activeUser?.isAdmin));

      if (allowDemo || !accessToken || !activeUser) {
        return;
      }

      if (workspaceRefreshInFlightRef.current) {
        return;
      }

      workspaceRefreshInFlightRef.current = true;
      setWorkspaceTradeLoading(true);

      try {
        const profilePromise = shouldIncludeProfile
          ? apiRequest<ProfilePayload>("/api/profile", accessToken)
          : Promise.resolve(null);
        const verificationPromise = shouldIncludeAdmin
          ? apiRequest<VerificationQueuePayload>(
              "/api/admin/verification-requests",
              accessToken,
            )
          : Promise.resolve(null);
        const reviewPromise = shouldIncludeAdmin
          ? apiRequest<ReviewRecommendationsPayload>(
              "/api/admin/review-recommendations",
              accessToken,
            )
          : Promise.resolve(null);
        const [
          tradePayload,
          notificationPayload,
          profilePayload,
          verificationPayload,
          reviewPayload,
        ] = await Promise.all([
          apiRequest<TradePayload>("/api/trades", accessToken),
          apiRequest<{ notifications: SavedNotification[] }>(
            "/api/notifications",
            accessToken,
          ),
          profilePromise,
          verificationPromise,
          reviewPromise,
        ]);

        applyTradePayload(tradePayload);
        mergeSavedNotifications(notificationPayload.notifications);

        if (profilePayload) {
          setProfile(profilePayload.profile);
          const nextTelegram = profilePayload.telegram ?? defaultTelegramStatus;
          setTelegram(nextTelegram);
          if (nextTelegram.linked) {
            setTelegramAwaitingLink(false);
          }
        }

        if (verificationPayload) {
          setVerificationRequests(verificationPayload.requests);
        }

        if (reviewPayload) {
          setReviewRecommendations(reviewPayload.recommendations);
        }
      } catch (error) {
        if (!silent) {
          setFormError(
            error instanceof Error
              ? error.message
              : "Could not refresh the PiScrow workspace.",
          );
        }
      } finally {
        workspaceRefreshInFlightRef.current = false;
        setWorkspaceTradeLoading(false);
      }
    },
    [activeMode, allowDemo, piAccessToken, user],
  );

  const refreshPublicLedger = useCallback(async () => {
    setLedgerLoading(true);
    setFormError("");

    if (allowDemo) {
      setLedgerTrades(trades);
      setLedgerEvents(events);
      setLedgerLoading(false);
      return;
    }

    try {
      const payload = await fetch("/api/public/feed").then((response) => {
        if (!response.ok) {
          throw new Error("Could not load public ledger.");
        }

        return response.json() as Promise<PublicLedgerPayload>;
      });
      setLedgerTrades(payload.trades);
      setLedgerEvents(payload.events);
      cachePublicLedger(payload);
      if (payload.stale) {
        pushNotice(
          "Ledger running on cached data",
          "PiScrow loaded the last available public ledger while live data recovers.",
          "warning",
        );
      }
    } catch (error) {
      const cached = loadCachedPublicLedger();

      if (cached) {
        setLedgerTrades(cached.trades ?? []);
        setLedgerEvents(cached.events ?? []);
        pushNotice(
          "Ledger temporarily cached",
          "Live public-ledger data is unavailable. Showing the last cached activity instead.",
          "warning",
        );
      } else {
        setFormError(error instanceof Error ? error.message : "Could not load ledger.");
      }
    } finally {
      setLedgerLoading(false);
    }
  }, [allowDemo, cachePublicLedger, events, loadCachedPublicLedger, pushNotice, trades]);

  const acceptConsent = useCallback(() => {
    setConsentState("accepted");
    setAuthMessage({ key: "consentAccepted" });

    try {
      window.localStorage.setItem(
        consentStorageKey,
        JSON.stringify({
          status: "accepted",
          version: consentVersion,
          acceptedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Local storage can fail in strict privacy modes. Keep the in-session gate open.
    }

    pushNotice(
      copy.notices.consentAcceptedTitle,
      copy.notices.consentAcceptedBody,
      "success",
    );
  }, [
    copy.notices.consentAcceptedBody,
    copy.notices.consentAcceptedTitle,
    pushNotice,
  ]);

  const rejectConsent = useCallback(() => {
    setConsentState("rejected");
    setUser(null);
    setPiConnected(false);
    setPiAccessToken("");
    clearPersistedAuthState();
    setTelegram(defaultTelegramStatus);
    setTelegramAwaitingLink(false);
    setActiveChatTrade(null);
    setAuthMessage({ key: "consentRejected" });

    try {
      window.localStorage.setItem(
        consentStorageKey,
        JSON.stringify({
          status: "rejected",
          version: consentVersion,
          rejectedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // The visible rejected state is enough to block this session.
    }

    pushNotice(
      copy.notices.loginBlockedTitle,
      copy.notices.loginBlockedBody,
      "warning",
    );
  }, [
    clearPersistedAuthState,
    copy.notices.loginBlockedBody,
    copy.notices.loginBlockedTitle,
    pushNotice,
  ]);

  function signOutPiSession() {
    setUser(null);
    setPiConnected(false);
    setPiAccessToken("");
    setHandoffCodeCache({});
    setHandoffCodeModal(null);
    window.localStorage.removeItem(handoffCodeCacheStorageKey);
    clearPersistedAuthState();
    setTelegram(defaultTelegramStatus);
    setTelegramAwaitingLink(false);
    setActiveChatTrade(null);
    setTrades([]);
    setInterests([]);
    setEvents([]);
    setNotices([]);
    setNotificationsOpen(false);
    setProfile(null);
    setVerificationRequests([]);
    setReviewRecommendations([]);
    setAuthMessage({ key: "initial" });
    setMode("market");
    pushNotice("Signed out", "Your PiScrow session has been cleared on this device.", "info");
  }

  function dismissNotice(id: string) {
    setNotices((current) => current.filter((notice) => notice.id !== id));
    seenSavedNotificationIdsRef.current.add(id);
  }

  function askConfirmation(action: ConfirmAction) {
    setConfirmAction(action);
  }

  function runConfirmedAction() {
    const action = confirmAction;
    setConfirmAction(null);
    action?.onConfirm();
  }

  useEffect(() => {
    if (allowDemo || consentState !== "accepted" || !restoredPiSessionRef.current) {
      return;
    }

    persistTelegramAwaitingLink(telegramAwaitingLink);
  }, [allowDemo, consentState, persistTelegramAwaitingLink, telegramAwaitingLink]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!allowDemo) {
        if (!demoSessionRef.current) {
          return;
        }

        demoSessionRef.current = false;
        setUser(null);
        setPiConnected(false);
        setPiAccessToken("");
        clearPersistedAuthState();
        setAuthMessage({ key: "initial" });
        setMode("ledger");
        setTrades([]);
        setInterests([]);
        setEvents([]);
        setLedgerTrades([]);
        setLedgerEvents([]);
        setProfile(null);
        setTelegram(defaultTelegramStatus);
        setTelegramAwaitingLink(false);
        setVerificationRequests([]);
        setReviewRecommendations([]);
        setActiveChatTrade(null);
        setSelectedTradeId("");
        setExpandedTradeId("");
        setPaymentState("No payment started.");
        setFormError("");
        setNotices([]);
        seenSavedNotificationIdsRef.current = new Set();
        const savedConsentState = readStoredConsentState();
        setConsentState(savedConsentState);
        setAuthMessage({
          key: savedConsentState === "rejected" ? "consentRejected" : "initial",
        });
        return;
      }

      demoSessionRef.current = true;
      setUser({ ...demoUser, isAdmin: true });
      setPiConnected(false);
      setPiAccessToken("");
      clearPersistedAuthState();
      setAuthMessage({ key: "demo" });
      setConsentState("accepted");
      setMode("ledger");
      setTrades(demoTrades);
      setInterests(demoInterests);
      setEvents(demoEvents);
      setLedgerTrades(demoTrades);
      setLedgerEvents(demoEvents);
      setProfile(buildDemoProfile(demoUser.username, demoTrades));
      setTelegram({
        configured: true,
        linked: false,
        botUsername: "PiScrow_bot",
        notificationsEnabled: false,
      });
      setTelegramAwaitingLink(false);
      setVerificationRequests(buildDemoVerificationRequests(demoTrades));
      setReviewRecommendations(buildDemoReviewRecommendations());
      setActiveChatTrade(null);
      setSelectedTradeId(demoTrades[0]?.id ?? "");
      setExpandedTradeId(demoTrades[0]?.id ?? "");
      setPaymentState("Demo mode is active. Test Pi payments are simulated.");
      setFormError("");
      setSellerFormResetKey((current) => current + 1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [allowDemo, clearPersistedAuthState]);

  useEffect(() => {
    if (allowDemo) {
      return;
    }

    let timer: number | null = null;

    if (consentAction === "accept") {
      timer = window.setTimeout(() => {
        acceptConsent();
        window.history.replaceState({}, "", "/");
      }, 0);
    } else if (consentAction === "reject") {
      timer = window.setTimeout(() => {
        rejectConsent();
        window.history.replaceState({}, "", "/");
      }, 0);
    }

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [allowDemo, consentAction, acceptConsent, rejectConsent]);

  useEffect(() => {
    connectPiRef.current = connectPi;
  });

  useEffect(() => {
    if (
      allowDemo ||
      connectAction !== "1" ||
      connectActionHandledRef.current ||
      connectingPi ||
      consentState !== "accepted" ||
      piConnected ||
      user
    ) {
      return;
    }

    connectActionHandledRef.current = true;

    const timer = window.setTimeout(() => {
      void connectPiRef.current();
      window.history.replaceState({}, "", "/");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [allowDemo, connectAction, connectingPi, consentState, piConnected, user]);

  useEffect(() => {
    if (notices.length === 0) {
      return;
    }

    const timers = notices
      .filter((notice) => !notice.persistent && typeof notice.expiresAt === "number")
      .map((notice) =>
        window.setTimeout(() => {
          setNotices((current) =>
            current.filter((item) => item.id !== notice.id),
          );
        }, Math.max(0, (notice.expiresAt ?? Date.now()) - Date.now())),
      );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [notices]);

  const refreshTradeChat = useCallback(async (
    trade: Trade,
    options: {
      keepOpen?: boolean;
      silent?: boolean;
    } = {},
  ) => {
    const { keepOpen = true, silent = false } = options;

    if (!silent) {
      setFormError("");
    }

    if (keepOpen) {
      setActiveChatTrade(trade);
    }

    if (allowDemo) {
      upsertDemoChatRoom(
        trade,
        trade.status === "Disputed" ? "disputed" : "active",
      );
      return;
    }

    if (!piAccessToken) {
      if (!silent) {
        setFormError("Connect your Pi account before opening trade chat.");
      }
      return;
    }

    if (tradeChatRefreshInFlightRef.current == trade.id) {
      return;
    }

    tradeChatRefreshInFlightRef.current = trade.id;

    if (!silent) {
      setChatLoadingTradeId(trade.id);
    }

    try {
      const payload = await apiRequest<ChatPayload>(
        `/api/trades/${trade.id}/chat`,
        piAccessToken,
      );
      applyChatPayload(payload);
    } catch (error) {
      if (!silent) {
        setFormError(error instanceof Error ? error.message : "Could not open chat.");
      }
    } finally {
      tradeChatRefreshInFlightRef.current = null;

      if (!silent) {
        setChatLoadingTradeId("");
      }
    }
  }, [allowDemo, piAccessToken, upsertDemoChatRoom]);

  useEffect(() => {
    if (allowDemo) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const channels: {
      unsubscribe: () => void;
    }[] = [];

    const syncWorkspace = () => {
      if (user && piAccessToken) {
        void refreshAuthenticatedWorkspace({ silent: true });
      }

      if (activeChatTradeRecord) {
        void refreshTradeChat(activeChatTradeRecord, {
          keepOpen: true,
          silent: true,
        });
      }

      if (activeMode === "ledger") {
        void refreshPublicLedger();
      }
    };
    const syncAdminQueues = () => {
      if (!user?.isAdmin || !piAccessToken) {
        return;
      }

      void refreshAuthenticatedWorkspace({
        includeAdmin: true,
        includeProfile: activeMode === "profile",
        silent: true,
      });
    };
    const handleWorkspaceVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        syncWorkspace();
      }
    };

    syncWorkspace();

    const interval = window.setInterval(
      syncWorkspace,
      workspaceFallbackSyncIntervalMs,
    );
    const chatInterval = activeChatTradeRecord
      ? window.setInterval(() => {
          void refreshTradeChat(activeChatTradeRecord, {
            keepOpen: true,
            silent: true,
          });
        }, activeChatRefreshIntervalMs)
      : null;
    window.addEventListener("focus", handleWorkspaceVisibilityRefresh);
    document.addEventListener("visibilitychange", handleWorkspaceVisibilityRefresh);

    if (supabase) {
      const syncChannel = supabase
        .channel(realtimeSyncChannelName, {
          config: {
            broadcast: { self: false, ack: false },
          },
        })
        .on("broadcast", { event: "workspace-refresh" }, () => {
          syncWorkspace();
        })
        .on("broadcast", { event: "ledger-refresh" }, () => {
          void refreshPublicLedger();
        })
        .on("broadcast", { event: "profile-refresh" }, () => {
          if (!user || !piAccessToken) {
            return;
          }

          void refreshAuthenticatedWorkspace({
            includeProfile: true,
            includeAdmin: activeMode === "admin" && Boolean(user.isAdmin),
            silent: true,
          });
        })
        .on("broadcast", { event: "admin-refresh" }, () => {
          syncAdminQueues();
        })
        .subscribe();

      channels.push({
        unsubscribe: () => {
          void supabase.removeChannel(syncChannel);
        },
      });
    }

    return () => {
      window.clearInterval(interval);
      if (chatInterval != null) {
        window.clearInterval(chatInterval);
      }
      window.removeEventListener("focus", handleWorkspaceVisibilityRefresh);
      document.removeEventListener(
        "visibilitychange",
        handleWorkspaceVisibilityRefresh,
      );
      channels.forEach((channel) => channel.unsubscribe());
    };
  }, [
    activeMode,
    activeChatTradeRecord,
    allowDemo,
    piAccessToken,
    refreshAuthenticatedWorkspace,
    refreshTradeChat,
    refreshPublicLedger,
    user,
  ]);

  useEffect(() => {
    if (allowDemo) {
      return;
    }

    function handleMutationSuccess(event: Event) {
      const detail = (event as CustomEvent<{ method?: string; path?: string }>).detail;
      const method = (detail?.method ?? "GET").toUpperCase();
      const path = detail?.path ?? "";

      if (method === "GET" || !path.startsWith("/api/")) {
        return;
      }

      if (path.startsWith("/api/auth/") || path.startsWith("/api/feedback")) {
        return;
      }

      if (path.startsWith("/api/profile/verification-request")) {
        void broadcastRealtimeSync("profile-refresh");
        void broadcastRealtimeSync("admin-refresh");
        return;
      }

      if (path.startsWith("/api/profile/payout-readiness")) {
        void broadcastRealtimeSync("profile-refresh");
        return;
      }

      if (path.startsWith("/api/admin/verification-requests")) {
        void broadcastRealtimeSync("profile-refresh");
        void broadcastRealtimeSync("admin-refresh");
        return;
      }

      if (path.startsWith("/api/trades/") && path.includes("/review-copilot")) {
        void broadcastRealtimeSync("admin-refresh");
        return;
      }

      if (path.startsWith("/api/trades/") && path.includes("/admin-resolve")) {
        void broadcastRealtimeSync("workspace-refresh");
        void broadcastRealtimeSync("ledger-refresh");
        void broadcastRealtimeSync("admin-refresh");
        return;
      }

      if (path.startsWith("/api/trades") || path.startsWith("/api/pi/")) {
        void broadcastRealtimeSync("workspace-refresh");
        void broadcastRealtimeSync("ledger-refresh");
      }
    }

    window.addEventListener(
      "piscrow:mutation-success",
      handleMutationSuccess as EventListener,
    );

    return () => {
      window.removeEventListener(
        "piscrow:mutation-success",
        handleMutationSuccess as EventListener,
      );
    };
  }, [allowDemo, broadcastRealtimeSync]);

  async function recoverIncompletePayment(payment: PiPaymentDTO) {
    setPaymentState("Recovering an unfinished Pi payment...");

    try {
      const payload = await fetch("/api/pi/incomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.identifier }),
      });

      if (!payload.ok) {
        const body = (await payload.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Could not recover unfinished payment.");
      }

      const recovered = (await payload.json()) as { mode?: string; tradeId?: string };
      setPaymentState(
        recovered.mode === "already_completed"
          ? "PiScrow already completed the unfinished payment."
          : "Recovered unfinished Pi payment with PiScrow.",
      );
      pushNotice(
        "Payment recovered",
        recovered.tradeId
          ? `Unfinished payment for trade ${recovered.tradeId} was checked by PiScrow.`
          : "Unfinished payment was checked by PiScrow.",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not recover unfinished Pi payment.";
      setPaymentState(message);
      pushNotice("Payment recovery needed", message, "warning");
    }
  }

  function mergeSavedNotifications(saved: SavedNotification[]) {
    setNotices((current) => {
      const existingIds = new Set([
        ...current.map((notice) => notice.id),
        ...seenSavedNotificationIdsRef.current,
      ]);
      const incoming = saved
        .filter((notice) => !existingIds.has(notice.id))
        .map((notice) => ({
          id: notice.id,
          title: notice.title,
          body: notice.body,
          tone: toneFromNotificationType(notice.type),
          persistent: true,
          expiresAt: undefined,
        }));

      incoming.forEach((notice) => {
        seenSavedNotificationIdsRef.current.add(notice.id);
      });

      return [...incoming, ...current].slice(0, 6);
    });
  }

  function appendEvent(
    tradeId: string,
    eventType: string,
    notes: string,
    actor = user?.username ?? "demo_actor",
  ) {
    setEvents((current) => [
      createEvent(tradeId, actor, eventType, notes),
      ...current,
    ]);
  }

  function updateTrade(
    tradeId: string,
    status: TradeStatus,
    patch: Partial<Trade> = {},
  ) {
    setTrades((current) =>
      current.map((trade) =>
        trade.id === tradeId
          ? { ...trade, ...patch, status, updatedAt: new Date().toISOString() }
          : trade,
      ),
    );
  }

  function demoTransactionLink(txid: string) {
    return `https://blockexplorer.minepi.com/testnet/tx/${encodeURIComponent(txid)}`;
  }

  function ensureDemoPaymentSummary(trade: Trade): TradePaymentSummary {
    const now = new Date().toISOString();

    return (
      trade.payment ?? {
        id: `demo-payment-${trade.id}`,
        tradeId: trade.id,
        piPaymentId: `demo-pi-payment-${trade.id}`,
        amountTestPi: calculateBuyerTotal(trade.amountTestPi),
        sellerAmountTestPi: trade.amountTestPi,
        platformFeeTestPi: calculatePlatformFee(trade.amountTestPi),
        buyerTotalTestPi: calculateBuyerTotal(trade.amountTestPi),
        releaseStatus: "NotStarted",
        createdAt: now,
        updatedAt: now,
      }
    );
  }

  async function connectPi() {
    setFormError("");

    if (consentState !== "accepted") {
      const key =
        consentState === "checking" ? "checkingConsent" : "acceptConsentRequired";
      const message = copy.auth[key];
      setAuthMessage({ key });
      pushNotice(copy.notices.consentRequiredTitle, message, "warning");
      return;
    }

    setConnectingPi(true);
    setAuthMessage({ key: "preparing" });
    showBlockingAction(
      "Connecting Pi account",
      "PiScrow is preparing Pi Browser authentication for your private workspace.",
    );

    const pi = await waitForPiSdk().catch((error) => {
      const message = resolvePiAuthMessage(error, copy.auth);
      setAuthMessage({ text: message });
      pushNotice(copy.notices.piSdkTitle, message, "warning");
      hideBlockingAction();
      setConnectingPi(false);
      return null;
    });

    if (!pi) {
      return;
    }

    try {
      setAuthMessage({ key: "sdkReady" });
      showBlockingAction(
        "Approve in Pi Browser",
        "PiScrow is ready. Approve the Pi Browser sign-in request to continue.",
      );
      const authResult = await authenticateWithPiBrowser(
        pi,
        nextPublicSandbox,
        (payment) => {
          void recoverIncompletePayment(payment);
        },
      );
      const piUser = "user" in authResult ? authResult.user : authResult;
      const accessToken = "accessToken" in authResult ? authResult.accessToken : "";

      setPiAccessToken(accessToken);
      setPiConnected(Boolean(accessToken));

      if (!accessToken) {
        clearPersistedAuthState();
        setUser(null);
        setTelegram(defaultTelegramStatus);
        setActiveChatTrade(null);
        setAuthMessage({ text: copy.notices.connectedNoToken(piUser.username) });
        hideBlockingAction();
        return;
      }

      showBlockingAction(
        "Loading workspace",
        "PiScrow is syncing your trades, notifications, and profile.",
      );
      const session = await apiRequest<{ user: SessionUser }>("/api/auth/pi", accessToken, {
        method: "POST",
      });
      setUser(session.user);
      persistPiSession(session.user, accessToken);
      setMode("ledger");
      setAuthMessage({ text: copy.notices.signedIn(session.user.username) });

      const payload = await apiRequest<TradePayload>("/api/trades", accessToken);
      applyTradePayload(payload);
      const notificationPayload = await apiRequest<{
        notifications: SavedNotification[];
      }>("/api/notifications", accessToken);
      mergeSavedNotifications(notificationPayload.notifications);
      void refreshProfile(accessToken);
      pushNotice(
        copy.notices.connectedTitle,
        copy.notices.connectedBody,
        "success",
      );
    } catch (error) {
      clearPersistedAuthState();
      setPiConnected(false);
      setPiAccessToken("");
      setUser(allowDemo ? { ...demoUser, isAdmin: true } : null);
      setTelegram(
        allowDemo
          ? {
              configured: true,
              linked: false,
              botUsername: "PiScrow_bot",
              notificationsEnabled: false,
            }
          : defaultTelegramStatus,
      );
      setActiveChatTrade(null);
      const message = resolvePiAuthMessage(error, copy.auth);
      setAuthMessage({ text: message });
      pushNotice(copy.notices.connectionFailedTitle, message, "warning");
    } finally {
      setConnectingPi(false);
      hideBlockingAction();
    }
  }

  async function refreshProfile(accessToken = piAccessToken) {
    if (allowDemo) {
      setProfile(buildDemoProfile(user?.username ?? demoUser.username, trades));
      setTelegram({
        configured: true,
        linked: false,
        botUsername: "PiScrow_bot",
        notificationsEnabled: false,
      });
      setTelegramAwaitingLink(false);
      return;
    }

    if (!accessToken) {
      return;
    }

    setProfileLoading(true);

    try {
      const payload = await apiRequest<ProfilePayload>("/api/profile", accessToken);
      setProfile(payload.profile);
      const nextTelegram = payload.telegram ?? defaultTelegramStatus;
      setTelegram(nextTelegram);
      if (nextTelegram.linked) {
        setTelegramAwaitingLink(false);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not load profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  const refreshTelegramStatus = useCallback(
    async (accessToken = piAccessToken, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (allowDemo || !accessToken) {
        return;
      }

      setTelegramLoading(true);

      try {
        const payload = await apiRequest<{ telegram?: TelegramLinkStatus }>(
          "/api/telegram/status",
          accessToken,
        );
        const nextTelegram = payload.telegram ?? defaultTelegramStatus;
        const justLinked = nextTelegram.linked && !telegram.linked;

        setTelegram(nextTelegram);

        if (nextTelegram.linked) {
          setTelegramAwaitingLink(false);
        }

        if (!silent) {
          pushNotice(
            nextTelegram.linked ? "Telegram active" : "Telegram not linked yet",
            nextTelegram.linked
              ? "PiScrow can now send trade and dispute updates to your Telegram bot chat."
              : "Open the PiScrow bot in Telegram, press Start, then check again here.",
            nextTelegram.linked ? "success" : "warning",
          );
        } else if (justLinked) {
          pushNotice(
            "Telegram linked",
            "PiScrow will now keep your Telegram bot updated with trade activity.",
            "success",
          );
        }
      } catch (error) {
        if (!silent) {
          setFormError(
            error instanceof Error ? error.message : "Could not refresh Telegram status.",
          );
        }
      } finally {
        setTelegramLoading(false);
      }
    },
    [allowDemo, piAccessToken, pushNotice, telegram.linked],
  );

  useEffect(() => {
    if (allowDemo) {
      clearPersistedAuthState();
      restoredPiSessionRef.current = true;
      return;
    }

    if (restoredPiSessionRef.current || consentState !== "accepted") {
      return;
    }

    restoredPiSessionRef.current = true;
    const storedSession = readStoredPiSession();
    const storedTelegramLink = readStoredTelegramLinkState();

    if (!storedSession) {
      if (storedTelegramLink) {
        clearStoredTelegramLinkState();
      }
      return;
    }

    let cancelled = false;

    const restoreSession = async () => {
      try {
        if (storedTelegramLink?.awaitingLink) {
          setTelegramAwaitingLink(true);
        }

        setPiAccessToken(storedSession.accessToken);
        setAuthMessage({ key: "preparing" });

        const session = await apiRequest<{ user: SessionUser }>(
          "/api/auth/pi",
          storedSession.accessToken,
          { method: "POST" },
        );

        if (cancelled) {
          return;
        }

        setUser(session.user);
        setPiConnected(true);
        setAuthMessage({ text: copy.notices.signedIn(session.user.username) });
        persistPiSession(session.user, storedSession.accessToken);

        await refreshAuthenticatedWorkspace({
          accessToken: storedSession.accessToken,
          includeProfile: true,
          includeAdmin: Boolean(session.user.isAdmin),
          silent: true,
          sessionUser: session.user,
        });

        if (storedTelegramLink?.awaitingLink) {
          await refreshTelegramStatus(storedSession.accessToken, { silent: true });
        }
      } catch {
        if (cancelled) {
          return;
        }

        clearPersistedAuthState();
        setPiConnected(false);
        setPiAccessToken("");
        setUser(null);
        setTelegram(defaultTelegramStatus);
        setTelegramAwaitingLink(false);
        setAuthMessage({ key: "initial" });
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [
    allowDemo,
    clearPersistedAuthState,
    clearStoredTelegramLinkState,
    consentState,
    copy.notices,
    persistPiSession,
    refreshAuthenticatedWorkspace,
    refreshTelegramStatus,
  ]);

  async function linkTelegram() {
    setFormError("");

    if (allowDemo) {
      setTelegram({
        configured: true,
        linked: true,
        botUsername: "PiScrow_bot",
        notificationsEnabled: true,
        telegramUsername: "piscrow_demo",
        linkedAt: new Date().toISOString(),
      });
      setTelegramAwaitingLink(false);
      pushNotice(
        "Telegram linked",
        "Demo Telegram alerts are now connected to this profile.",
        "success",
      );
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your Pi account before linking Telegram.");
      return;
    }

    if (telegram.linked && telegram.botUsername && typeof window !== "undefined") {
      window.open(
        `https://t.me/${telegram.botUsername.replace(/^@+/, "")}`,
        "_blank",
        "noopener,noreferrer",
      );
      pushNotice("Telegram opened", "Your PiScrow bot chat opened in a new tab.", "success");
      return;
    }

    setTelegramLoading(true);

    try {
      const payload = await apiRequest<{
        deepLink: string;
        telegram?: TelegramLinkStatus;
      }>("/api/telegram/link", piAccessToken, {
        method: "POST",
      });

      setTelegram(payload.telegram ?? defaultTelegramStatus);
      setTelegramAwaitingLink(true);
      persistTelegramAwaitingLink(true);

      if (typeof window !== "undefined") {
        window.open(payload.deepLink, "_blank", "noopener,noreferrer");
      }

      pushNotice(
        "Telegram link ready",
        "Open Telegram, press Start, then return to PiScrow. The profile can check the link status for you.",
        "success",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not prepare Telegram link.",
      );
    } finally {
      setTelegramLoading(false);
    }
  }

  async function unlinkTelegram() {
    setFormError("");

    if (allowDemo) {
      setTelegram({
        configured: true,
        linked: false,
        botUsername: "PiScrow_bot",
        notificationsEnabled: false,
      });
      setTelegramAwaitingLink(false);
      pushNotice(
        "Telegram disconnected",
        "Demo Telegram alerts have been turned off.",
        "warning",
      );
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your Pi account before changing Telegram alerts.");
      return;
    }

    setTelegramLoading(true);

    try {
      const payload = await apiRequest<{ telegram?: TelegramLinkStatus }>(
        "/api/telegram/link",
        piAccessToken,
        {
          method: "DELETE",
        },
      );
      setTelegram(payload.telegram ?? defaultTelegramStatus);
      setTelegramAwaitingLink(false);
      clearStoredTelegramLinkState();
      pushNotice(
        "Telegram disconnected",
        "PiScrow will now keep your alerts inside the app only.",
        "warning",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not disconnect Telegram.",
      );
    } finally {
      setTelegramLoading(false);
    }
  }

  useEffect(() => {
    if (!telegramAwaitingLink || allowDemo || !signedIn || !piAccessToken) {
      return;
    }

    const syncTelegram = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void refreshTelegramStatus(piAccessToken, { silent: true });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTelegram();
      }
    };

    const timer = window.setTimeout(syncTelegram, 2500);
    window.addEventListener("focus", syncTelegram);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", syncTelegram);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    allowDemo,
    piAccessToken,
    refreshTelegramStatus,
    signedIn,
    telegramAwaitingLink,
  ]);

  async function requestVerifiedBadge() {
    setFormError("");
    const currentProfile =
      profile ?? (user ? buildDemoProfile(user.username, trades) : null);

    if (!currentProfile) {
      setFormError("Could not load profile.");
      return;
    }

    if (currentProfile.verifiedBadge) {
      setFormError("Your account is already verified.");
      return;
    }

    if (currentProfile.verificationRequestedAt) {
      setFormError("Your verification request is already waiting for admin review.");
      return;
    }

    if (!canRequestVerifiedBadge(currentProfile)) {
      setFormError(
        `Complete ${VERIFIED_BADGE_MIN_COMPLETED_TRADES} successful trades before requesting verification.`,
      );
      return;
    }

    if (allowDemo) {
      const requestedAt = new Date().toISOString();
      const nextProfile = {
        ...currentProfile,
        verifiedBadge: false,
        verificationRequestedAt: requestedAt,
      };
      setProfile(nextProfile);
      setVerificationRequests((current) => {
        const remaining = current.filter((item) => item.userId !== nextProfile.userId);
        return [...remaining, nextProfile];
      });
      pushNotice(
        "Verification requested",
        "Demo admin can now approve the badge request.",
        "success",
      );
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your Pi account before requesting verification.");
      return;
    }

    setProfileLoading(true);

    try {
      const payload = await apiRequest<ProfilePayload>(
        "/api/profile/verification-request",
        piAccessToken,
        { method: "POST" },
      );
      setProfile(payload.profile);
      pushNotice(
        "Verification requested",
        "Your profile is waiting for admin review.",
        "success",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not request verification.",
      );
    } finally {
      setProfileLoading(false);
    }
  }

  async function confirmPayoutReadiness() {
    setFormError("");

    if (allowDemo) {
      setProfile((current) => {
        const next = current ?? buildDemoProfile(user?.username ?? demoUser.username, trades);
        return {
          ...next,
          payoutReady: true,
          payoutReadinessConfirmedAt: new Date().toISOString(),
        };
      });
      pushNotice(
        "Payouts enabled",
        "Demo account can now post offers, show interest, and receive releases.",
        "success",
      );
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your Pi account before enabling payouts.");
      return;
    }

    setPayoutReadyLoading(true);
    showBlockingAction(
      "Enabling PiScrow payouts",
      "PiScrow is linking refunds and seller releases to your authenticated Pi account.",
    );

    try {
      const payload = await apiRequest<ProfilePayload>(
        "/api/profile/payout-readiness",
        piAccessToken,
        { method: "POST" },
      );
      setProfile(payload.profile);
      pushNotice(
        "Payouts enabled",
        "You can now post offers, show buyer interest, and fund trades.",
        "success",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not enable PiScrow payouts.",
      );
    } finally {
      setPayoutReadyLoading(false);
      hideBlockingAction();
    }
  }

  async function refreshVerificationRequests(accessToken = piAccessToken) {
    if (!user?.isAdmin) {
      return;
    }

    if (allowDemo) {
      setVerificationRequests(buildDemoVerificationRequests(trades));
      return;
    }

    if (!accessToken) {
      return;
    }

    setVerificationLoading(true);

    try {
      const payload = await apiRequest<VerificationQueuePayload>(
        "/api/admin/verification-requests",
        accessToken,
      );
      setVerificationRequests(payload.requests);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not load verification requests.",
      );
    } finally {
      setVerificationLoading(false);
    }
  }

  async function refreshReviewRecommendations(accessToken = piAccessToken) {
    if (!user?.isAdmin) {
      return;
    }

    if (allowDemo) {
      setReviewRecommendations(buildDemoReviewRecommendations());
      return;
    }

    if (!accessToken) {
      return;
    }

    try {
      const payload = await apiRequest<ReviewRecommendationsPayload>(
        "/api/admin/review-recommendations",
        accessToken,
      );
      setReviewRecommendations(payload.recommendations);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not load review recommendations.",
      );
    }
  }

  async function approveVerifiedBadge(request: UserReputation) {
    askConfirmation({
      title: "Approve verified badge?",
      body: `This will show a public verified badge on @${request.piUsername}'s PiScrow profile.`,
      confirmLabel: "Approve badge",
      onConfirm: () => {
        void approveVerifiedBadgeConfirmed(request);
      },
    });
  }

  async function approveVerifiedBadgeConfirmed(request: UserReputation) {
    setFormError("");

    if (!canRequestVerifiedBadge(request)) {
      setFormError(
        `@${request.piUsername} must complete ${VERIFIED_BADGE_MIN_COMPLETED_TRADES} successful trades before approval.`,
      );
      return;
    }

    if (allowDemo) {
      setVerificationRequests((current) =>
        current.filter((item) => item.userId !== request.userId),
      );
      pushNotice(
        "Verified badge approved",
        `@${request.piUsername} is verified in the demo queue.`,
        "success",
      );
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your admin Pi account before approving badges.");
      return;
    }

    setVerificationLoading(true);

    try {
      const payload = await apiRequest<VerificationQueuePayload>(
        "/api/admin/verification-requests",
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify({ userId: request.userId }),
        },
      );
      setVerificationRequests(payload.requests);
      pushNotice(
        "Verified badge approved",
        `@${request.piUsername} received a verified badge.`,
        "success",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not approve badge.",
      );
    } finally {
      setVerificationLoading(false);
    }
  }

  async function runReviewRecommendation(trade: Trade) {
    setFormError("");

    if (allowDemo) {
      const recommendation = buildDemoReviewForTrade(
        trade,
        user?.username ?? "admin",
      );
      setReviewRecommendations((current) => [
        recommendation,
        ...current.filter((item) => item.tradeId !== trade.id),
      ]);
      appendEvent(
        trade.id,
        "Review copilot recommendation",
        `${reviewActionLabel(recommendation.recommendedAction)} with ${recommendation.confidence}% confidence. ${recommendation.summary}`,
        user?.username ?? "admin",
      );
      pushNotice(
        "Review recommendation ready",
        "The copilot added a recommend-only review to the demo admin desk.",
        "info",
      );
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your admin Pi account before running the review copilot.");
      return;
    }

    setReviewLoadingTradeId(trade.id);

    try {
      const payload = await apiRequest<
        TradePayload & {
          recommendation: TradeReviewRecommendation;
          reviewRecommendations?: TradeReviewRecommendation[];
        }
      >(`/api/trades/${trade.id}/review-copilot`, piAccessToken, {
        method: "POST",
      });

      applyTradePayload(payload);
      setReviewRecommendations((current) => [
        payload.recommendation,
        ...current.filter((item) => item.tradeId !== trade.id),
      ]);
      pushNotice(
        "Review recommendation ready",
        "The copilot saved an admin-only recommendation. No funds were released.",
        "info",
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not run review recommendation.",
      );
    } finally {
      setReviewLoadingTradeId("");
    }
  }

  function createTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!user) {
      setFormError("Connect your Pi account before posting an offer.");
      return;
    }

    if (!requirePayoutReadiness("post seller offers")) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = createTradeSchema.safeParse({
      title: formData.get("title"),
      amountTestPi: formData.get("amountTestPi"),
      description: formData.get("description"),
      locationLabel: formData.get("locationLabel"),
      locationArea: formData.get("locationArea"),
      deliveryTerms: formData.get("deliveryTerms"),
      visibility: formData.get("visibility"),
      targetBuyerPiUsernames: formData.get("targetBuyerPiUsernames") ?? "",
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Offer form is invalid.");
      return;
    }

    if (parsed.data.visibility === "private" && parsed.data.targetBuyerPiUsernames.length === 0) {
      setFormError("Private offers need at least one buyer Pi username.");
      return;
    }

    if (parsed.data.targetBuyerPiUsernames.includes(normalizedUsername)) {
      setFormError("You cannot send a private offer to your own Pi username.");
      return;
    }

    if (piConnected && piAccessToken) {
      showBlockingAction(
        "Publishing offer",
        "PiScrow is saving your seller listing and syncing it to buyers.",
      );
      void apiRequest<TradePayload>("/api/trades", piAccessToken, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      })
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          setSellerFormResetKey((current) => current + 1);
          setSellerComposerOpen(false);
          setMode("sell");
          pushNotice("Offer posted", "Your seller offer is now live.");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not post offer.",
          );
        })
        .finally(() => {
          hideBlockingAction();
        });
      return;
    }

    const now = new Date().toISOString();
    const visibility =
      parsed.data.visibility === "private" &&
      parsed.data.targetBuyerPiUsernames.length > 0
        ? "private"
        : "public";
    const trade: Trade = {
      id: createClientId("trade"),
      sellerUserId: user.uid,
      sellerPiUsername: normalizeUsername(user.username),
      visibility,
      targetBuyerPiUsernames:
        visibility === "private" ? parsed.data.targetBuyerPiUsernames : [],
      title: parsed.data.title,
      description: parsed.data.description,
      amountTestPi: parsed.data.amountTestPi,
      status: "Draft",
      locationLabel: parsed.data.locationLabel,
      locationArea: parsed.data.locationArea || undefined,
      deliveryTerms: parsed.data.deliveryTerms,
      interestCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    setTrades((current) => [trade, ...current]);
    setSelectedTradeId(trade.id);
    setExpandedTradeId(trade.id);
    appendEvent(
      trade.id,
      visibility === "private"
        ? "Private offer finalized"
        : "Seller posted public listing",
      visibility === "private"
        ? `Seller sent this private offer to @${trade.targetBuyerPiUsernames[0]}.`
        : "Seller opened the listing for buyer interest.",
    );
    pushNotice("Offer posted", "Your seller offer is now live.");
    form.reset();
    setSellerComposerOpen(false);
    setSellerFormResetKey((current) => current + 1);
  }

  function submitInterest(trade: Trade, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!user) {
      setFormError("Connect your Pi account before showing interest.");
      return;
    }

    if (normalizeUsername(trade.sellerPiUsername) === normalizedUsername) {
      setFormError("You can view your seller offer here, but you cannot buy it.");
      return;
    }

    if (!requirePayoutReadiness("show buyer interest")) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = createTradeInterestSchema.safeParse({
      tradeId: trade.id,
      responseNote: formData.get("responseNote"),
    });

    if (!parsed.success) {
      setFormError(interestErrorMessage(parsed.error.issues[0]?.message));
      return;
    }

    if (piConnected && piAccessToken) {
      showBlockingAction(
        "Sending interest",
        "PiScrow is submitting your buyer response to the seller.",
      );
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/interests`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice("Interest sent", "The seller can now review your response.");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error
              ? interestErrorMessage(error.message)
              : "Could not submit interest.",
          );
        })
        .finally(() => {
          hideBlockingAction();
        });
      return;
    }

    const now = new Date().toISOString();
    const interest: TradeInterest = {
      id: createClientId("interest"),
      tradeId: trade.id,
      buyerUserId: user.uid,
      buyerPiUsername: normalizeUsername(user.username),
      responseNote: parsed.data.responseNote ?? "",
      status: "Open",
      createdAt: now,
      updatedAt: now,
    };

    setInterests((current) => [interest, ...current]);
    setTrades((current) =>
      current.map((item) =>
        item.id === trade.id
          ? { ...item, interestCount: (item.interestCount ?? 0) + 1 }
          : item,
      ),
    );
    appendEvent(
      trade.id,
      "Interest submitted",
      `Buyer @${interest.buyerPiUsername} submitted interest for this listing.`,
    );
    pushNotice("Interest sent", "The seller can now review your response.");
    form.reset();
  }

  function declinePrivateOffer(trade: Trade) {
    askConfirmation({
      title: "Decline private request?",
      body: `This tells @${trade.sellerPiUsername} you do not want this private offer.`,
      confirmLabel: "Decline request",
      onConfirm: () => declinePrivateOfferConfirmed(trade),
    });
  }

  function declinePrivateOfferConfirmed(trade: Trade) {
    setFormError("");

    if (!user) {
      setFormError("Connect your Pi account before declining a private request.");
      return;
    }

    if (
      trade.visibility !== "private" ||
      !trade.targetBuyerPiUsernames.includes(normalizedUsername)
    ) {
      setFormError("This private offer is not assigned to your Pi username.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/decline-private`,
        piAccessToken,
        { method: "POST" },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice(
            "Private request declined",
            "The seller can see the decline in the trade activity log.",
            "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error
              ? error.message
              : "Could not decline private offer.",
          );
        });
      return;
    }

    setTrades((current) =>
      current.map((item) =>
        item.id === trade.id
          ? {
              ...item,
              targetBuyerPiUsernames: item.targetBuyerPiUsernames.filter(
                (username) => username !== normalizedUsername,
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    appendEvent(
      trade.id,
      "Private offer declined",
      `@${normalizedUsername} declined the private offer.`,
    );
    pushNotice(
      "Private request declined",
      "The seller can see the decline in the trade activity log.",
      "warning",
    );
  }

  function selectInterest(trade: Trade, interest: TradeInterest) {
    setFormError("");

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/select-interest`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify({ interestId: interest.id }),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice(
            "Buyer selected",
            `@${interest.buyerPiUsername} can now fund the trade.`,
            "success",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not select buyer.",
          );
        });
      return;
    }

    const selectedAt = new Date().toISOString();
    const selectionExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    updateTrade(trade.id, "PendingFunding", {
      buyerUserId: interest.buyerUserId,
      buyerPiUsername: interest.buyerPiUsername,
      selectedInterestId: interest.id,
      selectedAt,
      selectionExpiresAt,
      buyerProfile: interest.buyerProfile,
    });
    setSelectedTradeId(trade.id);
    setExpandedTradeId(trade.id);
    setInterests((current) =>
      current.map((item) => {
        if (item.id === interest.id) {
          return { ...item, status: "Selected", updatedAt: new Date().toISOString() };
        }

        if (item.tradeId === trade.id && item.status === "Open") {
          return { ...item, status: "Declined", updatedAt: new Date().toISOString() };
        }

        return item;
      }),
    );
    appendEvent(
      trade.id,
      "Buyer selected",
      `Seller selected @${interest.buyerPiUsername} and moved the trade to funding.`,
    );
    pushNotice(
      "Buyer selected",
      `@${interest.buyerPiUsername} can now fund the trade.`,
      "success",
    );
  }

  function deleteOffer(trade: Trade) {
    const isDraftOffer = trade.status === "Draft";
    askConfirmation({
      title: isDraftOffer ? "Delete this offer?" : "Delete this trade from your account?",
      body: isDraftOffer
        ? "This removes the open seller offer before a buyer is selected."
        : "This hides the closed trade from your workspace only. The other participant keeps their own copy until they delete it too.",
      confirmLabel: isDraftOffer ? "Delete offer" : "Delete trade",
      tone: "danger",
      onConfirm: () => deleteOfferConfirmed(trade),
    });
  }

  function deleteOfferConfirmed(trade: Trade) {
    setFormError("");
    const isDraftOffer = trade.status === "Draft";

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/delete`,
        piAccessToken,
        { method: "POST" },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice(
            isDraftOffer ? "Offer deleted" : "Trade deleted",
            isDraftOffer
              ? "The open seller offer was removed."
              : "The closed trade was removed from your workspace.",
            "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error
              ? error.message
              : isDraftOffer
                ? "Could not delete offer."
                : "Could not delete trade.",
          );
        });
      return;
    }

    if (isDraftOffer) {
      updateTrade(trade.id, "Cancelled");
      appendEvent(
        trade.id,
        "Offer deleted",
        "Seller removed the open offer before selecting a buyer.",
      );
      pushNotice("Offer deleted", "The open seller offer was removed.", "warning");
      return;
    }

    setTrades((current) => current.filter((item) => item.id !== trade.id));
    setInterests((current) => current.filter((item) => item.tradeId !== trade.id));
    setEvents((current) => current.filter((item) => item.tradeId !== trade.id));
    setLedgerTrades((current) => current.filter((item) => item.id !== trade.id));
    setLedgerEvents((current) => current.filter((item) => item.tradeId !== trade.id));
    setChatRooms((current) => current.filter((room) => room.tradeId !== trade.id));
    setChatMessages((current) => current.filter((message) => message.tradeId !== trade.id));
    setSelectedTradeId((current) => (current === trade.id ? "" : current));
    setExpandedTradeId((current) => (current === trade.id ? "" : current));
    pushNotice("Trade deleted", "The closed trade was removed from your workspace.", "warning");
  }

  function fundTrade(trade: Trade) {
    if (!requirePayoutReadiness("fund a selected trade")) {
      return;
    }

    askConfirmation({
      title: "Start Test Pi funding?",
      body: `You will fund ${formatTestPi(calculateBuyerTotal(trade.amountTestPi))}. PiScrow holds this testnet payment while delivery proof is reviewed.`,
      confirmLabel: "Start funding",
      onConfirm: () => fundTradeConfirmed(trade),
    });
  }

  async function fundTradeConfirmed(trade: Trade) {
    setPaymentState("Preparing Test Pi payment...");
    showBlockingAction(
      "Opening Pi payment",
      "Approve the Pi Browser payment prompt to move this buyer payment into PiScrow escrow.",
    );
    const buyerTotal = calculateBuyerTotal(trade.amountTestPi);
    const platformFee = calculatePlatformFee(trade.amountTestPi);

    if (allowDemo && (!window.Pi || !piConnected)) {
      const paymentTxid = `demo-fund-${trade.id}-${Date.now()}`;
      const deliveryDueAt = buildDeliveryDueAt();
      updateTrade(trade.id, "Funded", {
        deliveryDueAt,
        deliveryExpiredAt: undefined,
        payment: {
          ...ensureDemoPaymentSummary(trade),
          amountTestPi: buyerTotal,
          sellerAmountTestPi: trade.amountTestPi,
          platformFeeTestPi: platformFee,
          buyerTotalTestPi: buyerTotal,
          buyerPaymentTxid: paymentTxid,
          buyerPaymentLink: demoTransactionLink(paymentTxid),
          escrowStatus: "held_in_app",
          releaseType: undefined,
          releaseStatus: "NotStarted",
          releasePiPaymentId: undefined,
          releaseTxid: undefined,
          releaseTransactionLink: undefined,
          releaseAmountTestPi: undefined,
          releaseTargetPiUsername: undefined,
          releaseRequestedAt: undefined,
          releaseCompletedAt: undefined,
          updatedAt: new Date().toISOString(),
        },
      });
      appendEvent(
        trade.id,
        "Payment completed",
        `Demo marked ${formatTestPi(buyerTotal)} buyer funding as complete.`,
      );
      setPaymentState("Demo funding complete. Pi Browser auth not active.");
      pushNotice(
        "Trade funded",
        "The buyer payment is now held for seller delivery proof.",
        "success",
      );
      hideBlockingAction();
      return;
    }

    if (!window.Pi || !piConnected || !piAccessToken) {
      setPaymentState("Connect with Pi Browser before funding a real trade.");
      hideBlockingAction();
      return;
    }

    try {
      await initializePiSdk(window.Pi, nextPublicSandbox);
    } catch (error) {
      const message = resolvePiAuthMessage(error, copy.auth);
      setPaymentState(message);
      pushNotice("Payment setup failed", message, "warning");
      hideBlockingAction();
      return;
    }

    window.Pi.createPayment(
      {
        amount: buyerTotal,
        memo: piEscrowMemo(trade.id),
        metadata: {
          product: piscrowPaymentProduct,
          tradeId: trade.id,
          buyerUsername: normalizeUsername(user?.username ?? ""),
          sellerUsername: normalizeUsername(trade.sellerPiUsername),
          offerTitle: trade.title,
          sellerAmountTestPi: trade.amountTestPi,
          feeAmountTestPi: platformFee,
          buyerTotalTestPi: buyerTotal,
          mode: "testnet",
        },
      },
      {
        onReadyForServerApproval: (paymentId) => {
          void (async () => {
            try {
              setPaymentState("Payment is waiting for PiScrow approval.");
              showBlockingAction(
                "Approving payment",
                "PiScrow is approving the buyer payment with the Pi server.",
              );
              await apiRequest(`/api/pi/approve`, piAccessToken, {
                method: "POST",
                body: JSON.stringify({ paymentId, tradeId: trade.id }),
              });
              setPaymentState("PiScrow approved the Test Pi payment.");
              showBlockingAction(
                "Waiting for final confirmation",
                "Pi Browser is finishing the buyer funding on Pi Testnet.",
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Payment approval failed.";
              setPaymentState(message);
              pushNotice("Payment approval failed", message, "warning");
              hideBlockingAction();
            }
          })();
        },
        onReadyForServerCompletion: (paymentId, txid) => {
          void (async () => {
            try {
              setPaymentState("Finalizing Test Pi payment...");
              showBlockingAction(
                "Finalizing funding",
                "PiScrow is finalizing the escrow funding on Pi Testnet.",
              );
              const payload = await apiRequest<
                (TradePayload & { mode?: string }) | { mode: string }
              >(`/api/pi/complete`, piAccessToken, {
                method: "POST",
                body: JSON.stringify({ paymentId, tradeId: trade.id, txid }),
              });

              if ("trades" in payload) {
                applyTradePayload(payload);
              }

              setPaymentState("Test Pi payment completed.");
              pushNotice(
                "Trade funded",
                "The buyer payment is now held for seller delivery proof.",
                "success",
              );
              hideBlockingAction();
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Payment completion failed.";
              setPaymentState(message);
              pushNotice("Payment completion failed", message, "warning");
              hideBlockingAction();
            }
          })();
        },
        onCancel: () => {
          setPaymentState("Payment was cancelled.");
          pushNotice("Payment cancelled", "No escrow funding was completed.", "warning");
          hideBlockingAction();
        },
        onError: (error) => {
          setPaymentState(error.message);
          pushNotice("Payment error", error.message, "warning");
          hideBlockingAction();
        },
      },
    );
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFeedbackStatus(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = feedbackSchema.safeParse({
      category: String(formData.get("category") ?? "suggestion"),
      message: String(formData.get("message") ?? ""),
      contactEmail: String(formData.get("contactEmail") ?? ""),
      pageUrl: window.location.href,
    });

    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Check the feedback form.";
      setFeedbackStatus({ tone: "warning", message });
      pushNotice(
        "Feedback needs detail",
        message,
        "warning",
      );
      return;
    }

    setFeedbackSending(true);

    try {
      if (piAccessToken) {
        await apiRequest<{ ok: boolean }>("/api/feedback", piAccessToken, {
          method: "POST",
          body: JSON.stringify(parsed.data),
        });
      } else {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "Could not send feedback.");
        }
      }

      form.reset();
      setFeedbackStatus({
        tone: "success",
        message: "Feedback sent. Thanks for helping improve PiScrow.",
      });
      pushNotice(
        "Feedback sent",
        "Thanks. Your PiScrow feedback was saved for review.",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not send feedback.";
      setFeedbackStatus({ tone: "warning", message });
      pushNotice(
        "Feedback failed",
        message,
        "warning",
      );
    } finally {
      setFeedbackSending(false);
    }
  }

  function confirmReceipt(trade: Trade, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = confirmReceiptSchema.safeParse({
      tradeId: trade.id,
      buyerReceiptNote: formData.get("buyerReceiptNote"),
      buyerReceiptProofUrl: formData.get("buyerReceiptProofUrl"),
      buyerReceiptImagePath: "",
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Receipt form failed.");
      return;
    }

    askConfirmation({
      title: "Confirm receipt?",
      body: "This records buyer receipt proof and moves the trade to admin release review before seller payout.",
      confirmLabel: "Confirm receipt",
      onConfirm: () => confirmReceiptConfirmed(trade, formData, parsed.data, form),
    });
  }

  function confirmReceiptConfirmed(
    trade: Trade,
    formData: FormData,
    parsed: {
      tradeId: string;
      buyerReceiptNote: string;
      buyerReceiptProofUrl?: string;
      buyerReceiptImagePath?: string;
    },
    form: HTMLFormElement,
  ) {

    if (piConnected && piAccessToken) {
      void (async () => {
        try {
          showBlockingAction(
            "Confirming receipt",
            "PiScrow is saving buyer proof and moving the trade to release review.",
          );
          await optimizeImageInFormData(formData, "buyerReceiptImage");
          const payload = await apiRequest<TradePayload>(
            `/api/trades/${trade.id}/confirm`,
            piAccessToken,
            {
              method: "POST",
              body: formData,
            },
          );
          applyTradePayload(payload);
          form.reset();
          pushNotice(
            "Receipt confirmed",
            "The trade is waiting for admin release to the seller.",
            "success",
          );
        } catch (error) {
          setFormError(
            error instanceof Error ? error.message : "Could not confirm receipt.",
          );
        } finally {
          hideBlockingAction();
        }
      })();
      return;
    }

    updateTrade(trade.id, "AwaitingRelease", {
      buyerReceiptNote: parsed.buyerReceiptNote,
      buyerReceiptProofUrl: parsed.buyerReceiptProofUrl || undefined,
      payment: {
        ...ensureDemoPaymentSummary(trade),
        escrowStatus: "held_in_app",
        releaseStatus: "NotStarted",
        updatedAt: new Date().toISOString(),
      },
    });
    appendEvent(trade.id, "Receipt confirmed", parsed.buyerReceiptNote);
    pushNotice(
      "Receipt confirmed",
      "The trade is waiting for admin release to the seller.",
      "success",
    );
    form.reset();
  }

  function openDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const tradeId = String(formData.get("tradeId") ?? selectedTrade?.id ?? "");
    const trade = trades.find((item) => item.id === tradeId) ?? selectedTrade;

    if (!trade) {
      return;
    }

    const parsed = disputeSchema.safeParse({
      tradeId: trade.id,
      reason: formData.get("reason"),
      evidenceNote: formData.get("evidenceNote"),
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dispute form failed.");
      return;
    }

    askConfirmation({
      title: "Report this trade?",
      body: `This freezes only "${trade.title}" and sends its payment state, proof, and activity timeline to admin review.`,
      confirmLabel: "Freeze and report",
      tone: "danger",
      onConfirm: () => openDisputeConfirmed(trade, parsed.data, form),
    });
  }

  function openDisputeConfirmed(
    trade: Trade,
    parsed: {
      tradeId: string;
      reason: string;
      evidenceNote?: string;
    },
    form: HTMLFormElement,
  ) {

    if (piConnected && piAccessToken) {
      showBlockingAction(
        "Freezing trade",
        "PiScrow is freezing this trade and sending it to admin review.",
      );
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/dispute`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify(parsed),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice(
            "Dispute opened",
            "The trade is frozen for admin review.",
            "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not open dispute.",
          );
        })
        .finally(() => {
          hideBlockingAction();
        });
      return;
    }

    updateTrade(trade.id, "Disputed", {
      payment: {
        ...ensureDemoPaymentSummary(trade),
        escrowStatus: "held_in_app",
        releaseStatus: "NotStarted",
        updatedAt: new Date().toISOString(),
      },
    });
    appendEvent(trade.id, "Dispute opened", parsed.reason);
    pushNotice("Dispute opened", "The trade is frozen for admin review.", "warning");
    form.reset();
  }

  function requestSellerRelease(trade: Trade, note: string) {
    const trimmedNote = note.trim();

    if (trimmedNote.length < 8) {
      setFormError("Add a short seller release note before requesting payout.");
      return;
    }

    askConfirmation({
      title: "Request seller payout release?",
      body: "This moves the trade to admin release review so PiScrow can verify the proof before payout.",
      confirmLabel: "Request release",
      onConfirm: () => requestSellerReleaseConfirmed(trade, trimmedNote),
    });
  }

  function requestSellerReleaseConfirmed(trade: Trade, sellerReleaseNote: string) {
    if (piConnected && piAccessToken) {
      void (async () => {
        try {
          showBlockingAction(
            "Requesting payout release",
            "PiScrow is sending this trade to admin release review.",
          );
          const payload = await apiRequest<TradePayload>(
            `/api/trades/${trade.id}/request-release`,
            piAccessToken,
            {
              method: "POST",
              body: JSON.stringify({
                tradeId: trade.id,
                sellerReleaseNote,
              }),
            },
          );
          applyTradePayload(payload);
          pushNotice(
            "Release requested",
            "The trade is now waiting for admin release review.",
            "success",
          );
        } catch (error) {
          setFormError(
            error instanceof Error ? error.message : "Could not request payout release.",
          );
        } finally {
          hideBlockingAction();
        }
      })();
      return;
    }

    updateTrade(trade.id, "AwaitingRelease", {
      payment: {
        ...ensureDemoPaymentSummary(trade),
        escrowStatus: "held_in_app",
        releaseType: "seller_release",
        releaseStatus: "NotStarted",
        releaseRequestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    appendEvent(
      trade.id,
      "Seller requested release",
      `${sellerReleaseNote} Admin review is now required before seller payout.`,
    );
    pushNotice(
      "Release requested",
      "The trade is now waiting for admin release review.",
      "success",
    );
  }

  function generateHandoffCode(trade: Trade) {
    askConfirmation({
      title: trade.handoffCode?.status === "active" ? "Generate a new handoff code?" : "Generate handoff code?",
      body:
        trade.handoffCode?.status === "active"
          ? "This revokes the current handoff code and replaces it with a new one-time code."
          : "This creates a one-time buyer handoff code for a funded local delivery trade.",
      confirmLabel: trade.handoffCode?.status === "active" ? "Regenerate code" : "Generate code",
      onConfirm: () => generateHandoffCodeConfirmed(trade),
    });
  }

  function generateHandoffCodeConfirmed(trade: Trade) {
    if (!piConnected || !piAccessToken) {
      setFormError("Handoff codes are available only in the live PiScrow workspace.");
      return;
    }

    void (async () => {
      try {
        showBlockingAction(
          "Generating handoff code",
          "PiScrow is creating a one-time code for this local handoff.",
        );
        const payload = await apiRequest<HandoffCodePayload>(
          `/api/trades/${trade.id}/handoff-code`,
          piAccessToken,
          {
            method: "POST",
            body: JSON.stringify({
              tradeId: trade.id,
              action: "generate",
            }),
          },
        );
        applyTradePayload(payload);
        if (payload.code) {
          setHandoffCodeCache((current) => ({
            ...current,
            [trade.id]: {
              code: payload.code!,
              expiresAt: payload.handoffCode?.expiresAt,
            },
          }));
          setHandoffCodeModal({
            tradeId: trade.id,
            code: payload.code,
            expiresAt: payload.handoffCode?.expiresAt,
          });
        }
        pushNotice(
          "Handoff code ready",
          "Buyer handoff code generated. Show it to the seller only when the handoff is complete.",
          "success",
        );
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Could not generate the handoff code.",
        );
      } finally {
        hideBlockingAction();
      }
    })();
  }

  function showHandoffCode(trade: Trade) {
    const cached = activeHandoffCodeCache[trade.id];

    if (!cached?.code) {
      setFormError("Generate a fresh handoff code in this session before using Show code.");
      return;
    }

    if (!piConnected || !piAccessToken) {
      setFormError("Handoff codes are available only in the live PiScrow workspace.");
      return;
    }

    void (async () => {
      try {
        showBlockingAction(
          "Opening handoff code",
          "PiScrow is loading the active local handoff code.",
        );
        const payload = await apiRequest<HandoffCodePayload>(
          `/api/trades/${trade.id}/handoff-code`,
          piAccessToken,
          {
            method: "POST",
            body: JSON.stringify({
              tradeId: trade.id,
              action: "reveal",
            }),
          },
        );
        applyTradePayload(payload);
        setHandoffCodeModal({
          tradeId: trade.id,
          code: cached.code,
          expiresAt: payload.handoffCode?.expiresAt ?? cached.expiresAt,
        });
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Could not open the handoff code.",
        );
      } finally {
        hideBlockingAction();
      }
    })();
  }

  function copyHandoffCode() {
    if (!handoffCodeModal?.code) {
      return;
    }

    void (async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(handoffCodeModal.code);
        } else {
          const textArea = document.createElement("textarea");
          textArea.value = handoffCodeModal.code;
          textArea.setAttribute("readonly", "true");
          textArea.style.position = "absolute";
          textArea.style.left = "-9999px";
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
        }

        pushNotice("Code copied", "The buyer handoff code has been copied to your clipboard.", "success");
      } catch {
        setFormError("Could not copy the handoff code.");
      }
    })();
  }

  function verifyHandoffCode(trade: Trade, code: string) {
    const trimmedCode = code.trim();

    if (trimmedCode.length < 8) {
      setFormError("Enter the buyer handoff code before verifying.");
      return;
    }

    if (!piConnected || !piAccessToken) {
      setFormError("Handoff code verification is available only in the live PiScrow workspace.");
      return;
    }

    void (async () => {
      try {
        showBlockingAction(
          "Verifying handoff code",
          "PiScrow is verifying the one-time code and releasing escrow automatically if it matches.",
        );
        const payload = await apiRequest<HandoffVerifyPayload>(
          `/api/trades/${trade.id}/handoff-code/verify`,
          piAccessToken,
          {
            method: "POST",
            body: JSON.stringify({
              tradeId: trade.id,
              code: trimmedCode,
            }),
          },
        );
        applyTradePayload(payload);
        if (
          payload.outcome === "review_required" ||
          payload.outcome === "already_reviewing"
        ) {
          pushNotice(
            payload.outcome === "already_reviewing"
              ? "Payout already under review"
              : "Admin review required",
            payload.message ??
              (payload.outcome === "already_reviewing"
                ? "PiScrow already moved this seller payout into admin review after detecting linked blockchain activity. Do not retry the handoff code."
                : "PiScrow paused automatic seller payout and moved this trade into admin review to prevent double payment."),
            "warning",
            { persistent: true },
          );
        } else {
          pushNotice(
            "Trade completed",
            "Handoff code verified. PiScrow released escrow to the seller.",
            "success",
          );
        }
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Could not verify the handoff code.",
        );
      } finally {
        hideBlockingAction();
      }
    })();
  }

  function chatSenderRoleFor(trade: Trade): TradeChatMessage["senderRole"] {
    if (normalizeUsername(trade.buyerPiUsername ?? "") === normalizedUsername) {
      return "buyer";
    }

    if (normalizeUsername(trade.sellerPiUsername) === normalizedUsername) {
      return "seller";
    }

    return "admin";
  }

  function syncDemoTradeFromChat(
    trade: Trade,
    senderRole: TradeChatMessage["senderRole"],
    body: string,
    attachmentUrl?: string,
  ) {
    if (!attachmentUrl || (senderRole !== "seller" && senderRole !== "buyer")) {
      return;
    }

    if (senderRole === "seller" && trade.status === "Funded") {
      updateTrade(trade.id, "DeliverySubmitted", {
        deliveryProofNote: trade.deliveryProofNote || body || "Seller proof uploaded in trade chat.",
        deliveryProofUrl: trade.deliveryProofUrl || attachmentUrl,
        payment: {
          ...ensureDemoPaymentSummary(trade),
          escrowStatus: "held_in_app",
          releaseStatus: "NotStarted",
          updatedAt: new Date().toISOString(),
        },
      });
      appendEvent(
        trade.id,
        "Delivery submitted",
        body || "Seller proof uploaded in trade chat.",
      );
      return;
    }

    if (senderRole === "buyer" && trade.status === "DeliverySubmitted") {
      updateTrade(trade.id, "AwaitingRelease", {
        buyerReceiptNote: trade.buyerReceiptNote || body || "Buyer receipt proof uploaded in trade chat.",
        buyerReceiptProofUrl: trade.buyerReceiptProofUrl || attachmentUrl,
        payment: {
          ...ensureDemoPaymentSummary(trade),
          escrowStatus: "held_in_app",
          releaseStatus: "NotStarted",
          updatedAt: new Date().toISOString(),
        },
      });
      appendEvent(
        trade.id,
        "Receipt confirmed",
        `${
          body || "Buyer receipt proof uploaded in trade chat."
        } Seller payout is waiting for admin release.`,
      );
    }
  }

  const openTradeChat = useCallback(async (trade: Trade) => {
    if (
      ![
        "Funded",
        "DeliverySubmitted",
        "AwaitingRelease",
        "Disputed",
        "Completed",
        "Cancelled",
      ].includes(trade.status)
    ) {
      const message = "Trade chat opens after buyer funding clears.";
      setFormError(message);
      pushNotice("Chat unavailable", message, "warning");
      return;
    }

    await refreshTradeChat(trade, { keepOpen: true });
  }, [pushNotice, refreshTradeChat]);

  async function sendTradeChatMessage(
    trade: Trade,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setFormError("");

    if (!user) {
      setFormError("Connect your Pi account before sending chat messages.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = tradeChatMessageSchema.safeParse({
      tradeId: trade.id,
      body: formData.get("body"),
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Chat message is invalid.");
      return;
    }

    const attachment = fileFromFormData(formData, "attachment");

    if (!(parsed.data.body ?? "").trim() && !attachment) {
      setFormError("Add a message or proof image before sending.");
      return;
    }

    setChatSending(true);

    if (allowDemo) {
      const attachmentUrl = attachment ? URL.createObjectURL(attachment) : undefined;
      const senderRole = chatSenderRoleFor(trade);
      appendDemoChatMessage(
        trade,
        {
          senderUserId: user.uid,
          senderPiUsername: normalizedUsername,
          senderRole,
          messageType: attachmentUrl ? "proof" : "text",
          body: parsed.data.body ?? "",
          attachmentUrl,
        },
        trade.status === "Disputed" ? "disputed" : "active",
      );
      syncDemoTradeFromChat(trade, senderRole, parsed.data.body ?? "", attachmentUrl);
      form.reset();
      setChatSending(false);
      pushNotice("Message sent", "The trade chat was updated.", "success");
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your Pi account before sending chat messages.");
      setChatSending(false);
      return;
    }

    try {
      await optimizeImageInFormData(formData, "attachment");
      const payload = await apiRequest<ChatPayload>(
        `/api/trades/${trade.id}/chat`,
        piAccessToken,
        {
          method: "POST",
          body: formData,
        },
      );
      applyChatPayload(payload);
      form.reset();
      pushNotice("Message sent", "The trade chat was updated.", "success");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setChatSending(false);
    }
  }

  async function claimTradeChat(trade: Trade) {
    setFormError("");
    setActiveChatTrade(trade);

    if (!user?.isAdmin) {
      setFormError("Only admins can join review rooms.");
      return;
    }

    if (allowDemo) {
      const room = upsertDemoChatRoom(
        trade,
        trade.status === "Disputed" ? "disputed" : "active",
      );
      const now = new Date().toISOString();
      setChatRooms((current) =>
        current.map((item) =>
          item.tradeId === trade.id
            ? {
                ...item,
                claimedAdminUserId: user.uid,
                claimedAdminPiUsername: normalizedUsername,
                claimedAt: now,
                updatedAt: now,
              }
            : item,
        ),
      );
      setChatMessages((current) => [
        ...current,
        {
          id: createClientId("chat-claim"),
          roomId: room.id,
          tradeId: trade.id,
          senderPiUsername: "system",
          senderRole: "system",
          messageType: "system",
          body:
            trade.status === "AwaitingRelease"
              ? `Admin @${normalizedUsername} joined this release review room.`
              : `Admin @${normalizedUsername} joined this dispute room.`,
          createdAt: now,
        },
      ]);
      pushNotice(
        trade.status === "AwaitingRelease" ? "Review room joined" : "Dispute room joined",
        trade.status === "AwaitingRelease"
          ? "You can now message this release review room."
          : "You can now message this dispute room.",
        "success",
      );
      return;
    }

    if (!piAccessToken) {
      setFormError("Connect your admin Pi account before joining review rooms.");
      return;
    }

    setChatLoadingTradeId(trade.id);

    try {
      const payload = await apiRequest<ChatPayload>(
        `/api/trades/${trade.id}/chat/claim`,
        piAccessToken,
        { method: "POST" },
      );
      applyChatPayload(payload);
      pushNotice(
        trade.status === "AwaitingRelease" ? "Review room joined" : "Dispute room joined",
        trade.status === "AwaitingRelease"
          ? "You can now message this release review room."
          : "You can now message this dispute room.",
        "success",
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : trade.status === "AwaitingRelease"
            ? "Could not join review room."
            : "Could not join dispute room.",
      );
    } finally {
      setChatLoadingTradeId("");
    }
  }

  function adminResolve(
    trade: Trade,
    status: "Completed" | "Cancelled" | "AlreadyPaid",
  ) {
    askConfirmation({
      title:
        status === "Completed"
          ? "Release seller payout?"
          : status === "Cancelled"
            ? "Refund buyer from escrow?"
            : "Mark seller as already paid?",
      body:
        status === "Completed"
          ? "PiScrow will release the held Test Pi from escrow to the seller after this review."
          : status === "Cancelled"
            ? "PiScrow will refund the held Test Pi from escrow back to the buyer after this review."
            : "Use this only when PiScrow already has linked payout evidence for this trade. It will close the review without sending another payout.",
      confirmLabel:
        status === "Completed"
          ? "Release payout"
          : status === "Cancelled"
            ? "Refund buyer"
            : "Mark already paid",
      tone: status === "Cancelled" ? "danger" : "warning",
      onConfirm: () => adminResolveConfirmed(trade, status),
    });
  }

  function adminResolveConfirmed(
    trade: Trade,
    status: "Completed" | "Cancelled" | "AlreadyPaid",
  ) {
    setFormError("");

    const notes =
      status === "Completed"
        ? "Admin approved the seller release path after reviewing buyer receipt and party evidence."
        : status === "AlreadyPaid"
          ? "Admin confirmed the seller payout was already completed on-chain from existing linked payout evidence and closed the review without sending another payout."
        : trade.status === "AwaitingRelease"
          ? "Admin approved the buyer refund path after reviewing buyer receipt, seller proof, and party evidence."
          : "Admin approved the buyer refund path after reviewing the dispute and party evidence.";

    showBlockingAction(
      status === "Completed"
        ? "Releasing seller payout"
        : status === "Cancelled"
          ? "Refunding buyer"
          : "Confirming linked seller payout",
      status === "Completed"
        ? "PiScrow is signing and submitting the escrow payout transaction."
        : status === "Cancelled"
          ? "PiScrow is signing and submitting the escrow refund transaction."
          : "PiScrow is closing this review from existing linked payout evidence without sending another payout.",
    );

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/admin-resolve`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify({
            action: status === "AlreadyPaid" ? "mark_already_paid" : "resolve",
            ...(status === "AlreadyPaid" ? {} : { status }),
            notes,
          }),
        },
      )
        .then((payload) => {
          applyTradePayload(payload);
          const resolvedTrade = payload.trades.find((item) => item.id === trade.id);

          if (resolvedTrade) {
            setActiveChatTrade(resolvedTrade);
          }
        })
        .then(() => {
          pushNotice(
            status === "Completed"
              ? "Payout completed"
              : status === "Cancelled"
                ? "Refund completed"
                : "Linked payout confirmed",
            status === "Completed"
              ? "Held Test Pi was released to the seller after admin review."
              : status === "Cancelled"
                ? "Held Test Pi was refunded to the buyer after admin review."
                : "Admin confirmed the seller payout was already completed on-chain and PiScrow did not send another payout.",
            status === "Completed" || status === "AlreadyPaid" ? "success" : "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not complete the admin review.",
          );
        })
        .finally(() => {
          hideBlockingAction();
        });
      return;
    }

    const resolvedStatus = status === "AlreadyPaid" ? "Completed" : status;
    const releaseTxid = `demo-${status === "Completed" ? "release" : status === "Cancelled" ? "refund" : "linked"}-${trade.id}-${Date.now()}`;
    const now = new Date().toISOString();
    updateTrade(trade.id, resolvedStatus, {
      payment: {
        ...ensureDemoPaymentSummary(trade),
        escrowStatus:
          status === "Cancelled" ? "refunded_to_buyer" : "released_to_seller",
        releaseType:
          status === "Cancelled" ? "buyer_refund" : "seller_release",
        releaseStatus: "Completed",
        releasePiPaymentId: `demo-release-payment-${trade.id}`,
        releaseTxid,
        releaseTransactionLink: demoTransactionLink(releaseTxid),
        releaseAmountTestPi:
          status !== "Cancelled"
            ? trade.payment?.sellerAmountTestPi ?? trade.amountTestPi
            : trade.payment?.buyerTotalTestPi ?? calculateBuyerTotal(trade.amountTestPi),
        releaseTargetPiUsername:
          status === "Cancelled" ? trade.buyerPiUsername : trade.sellerPiUsername,
        releaseRequestedAt: now,
        releaseCompletedAt: now,
        updatedAt: now,
      },
    });
    setActiveChatTrade((current) =>
      current?.id === trade.id
        ? {
            ...current,
            status: resolvedStatus,
            completedAt: status !== "Cancelled" ? now : current.completedAt,
            cancelledAt: status === "Cancelled" ? now : current.cancelledAt,
            updatedAt: now,
          }
        : current,
    );
    if (status === "Completed" || status === "Cancelled" || status === "AlreadyPaid") {
      setTrades((current) =>
        current.map((item) =>
          item.id === trade.id
            ? {
                ...item,
                completedAt: status !== "Cancelled" ? now : item.completedAt,
                cancelledAt: status === "Cancelled" ? now : item.cancelledAt,
                updatedAt: now,
              }
            : item,
        ),
      );
    }
    appendEvent(
      trade.id,
      status === "Completed"
        ? "Admin approved seller release"
        : status === "Cancelled"
          ? "Admin approved buyer refund"
          : "Admin confirmed seller payout already completed",
      notes,
      user?.username ?? "admin",
    );
    pushNotice(
      status === "Completed"
        ? "Payout completed"
        : status === "Cancelled"
          ? "Refund completed"
          : "Linked payout confirmed",
      status === "Completed"
        ? "Held Test Pi was released to the seller after admin review."
        : status === "Cancelled"
          ? "Held Test Pi was refunded to the buyer after admin review."
          : "Admin confirmed the seller payout was already completed on-chain and PiScrow did not send another payout.",
      status === "Completed" || status === "AlreadyPaid" ? "success" : "warning",
    );
    hideBlockingAction();
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <NotificationStack notices={toastNotices} onDismiss={dismissNotice} />
      {formError && (
        <ActionFeedbackDialog
          message={formError}
          onDismiss={() => setFormError("")}
        />
      )}
      {confirmAction && (
        <ConfirmActionDialog
          action={confirmAction}
          onCancel={() => setConfirmAction(null)}
          onConfirm={runConfirmedAction}
        />
      )}
        {handoffCodeModal && (
          <HandoffCodeDialog
            code={handoffCodeModal.code}
            expiresAt={handoffCodeModal.expiresAt}
            onCopy={copyHandoffCode}
            onClose={() => setHandoffCodeModal(null)}
          />
        )}

      <section className="ps">
        {blockingAction && <ProcessingOverlay action={blockingAction} />}
        <AppTopBar
          activeValue={activeValue}
          authState={authState}
          copy={copy}
          notificationsOpen={notificationsOpen}
          refreshing={appRefreshing}
          refreshDisabled={appRefreshing || ledgerLoading || connectingPi}
          signedIn={signedIn}
          unreadCount={unreadNoticeCount}
          username={normalizedUsername}
          onRefresh={refreshCurrentView}
          onToggleNotifications={() => setNotificationsOpen((current) => !current)}
        />

        {notificationsOpen && (
          <NotificationDrawer
            notices={inboxNotices}
            onClose={() => setNotificationsOpen(false)}
            onDismiss={dismissNotice}
          />
        )}

        <div className="psc">
          {maintenanceEnabled && (
            <MaintenanceBanner copy={copy} message={nextPublicMaintenanceMessage} />
          )}

          {allowDemo && !signedIn && <DemoModeBanner copy={copy} />}

          {!signedIn && (
            <div className="grid gap-3 pb-4">
              <LanguageSelector
                copy={copy}
                language={language}
                onChange={changeLanguage}
                variant="guest"
              />
              <WelcomeHero copy={copy} />
              <SessionCard
                authState={authState}
                canConnect={canConnectPi}
                connecting={connectingPi}
                copy={copy}
                profile={profileStats}
                user={user}
                onConnect={connectPi}
              />
              {consentState !== "accepted" ? (
                <ConsentGate
                  consentState={consentState}
                  copy={copy}
                />
              ) : (
                <SignInPanel
                  authState={authState}
                  canConnect={canConnectPi}
                  connecting={connectingPi}
                  copy={copy}
                  onConnect={connectPi}
                />
              )}
              <AppFooter />
            </div>
          )}

          {signedIn && (
            <div className="grid gap-3 pb-4">
              {activeMode === "market" && (
                <BuyerDesk
                  chatLoadingTradeId={chatLoadingTradeId}
                  chatMessages={chatMessages}
                  chatRooms={chatRooms}
                  language={language}
                  trades={buyerTrades}
                  interests={interests}
                  loading={workspaceTradeLoading}
                  currentUserId={user?.id ?? user?.uid}
                  currentUsername={normalizedUsername}
                  activeValue={activeValue}
                  paymentState={paymentState}
                  onConfirm={confirmReceipt}
                  onGenerateHandoffCode={generateHandoffCode}
                  onDeleteTrade={deleteOffer}
                  onDeclinePrivate={declinePrivateOffer}
                  onFund={fundTrade}
                  onRevealHandoffCode={showHandoffCode}
                  onOpenChat={openTradeChat}
                  onOpenDispute={openDispute}
                  onSubmitInterest={submitInterest}
                />
              )}

              {activeMode === "sell" && (
                <section className="grid gap-3">
                  {sellerComposerOpen ? (
                    <SellerPostPanel
                      key={sellerFormResetKey}
                      profile={profileStats}
                      username={normalizedUsername}
                      onCancel={() => setSellerComposerOpen(false)}
                      onCreateTrade={createTrade}
                    />
                  ) : (
                    <SellerDesk
                      chatLoadingTradeId={chatLoadingTradeId}
                      chatMessages={chatMessages}
                      chatRooms={chatRooms}
                      language={language}
                      trades={sellerTrades}
                      interests={interests}
                      loading={workspaceTradeLoading}
                      currentUserId={user?.id ?? user?.uid}
                      currentUsername={normalizedUsername}
                      onNewListing={() => {
                        if (requirePayoutReadiness("post seller offers")) {
                          setSellerComposerOpen(true);
                        }
                      }}
                      onSelect={(tradeId) => {
                        setSelectedTradeId(tradeId);
                        setExpandedTradeId(tradeId);
                      }}
                      onSelectInterest={selectInterest}
                      onDeleteOffer={deleteOffer}
                      onOpenChat={openTradeChat}
                      onRequestRelease={requestSellerRelease}
                      onVerifyHandoffCode={verifyHandoffCode}
                      onOpenDispute={openDispute}
                    />
                  )}
                </section>
              )}

              {activeMode === "ledger" && (
                <PublicLedger
                  language={language}
                  trades={ledgerTrades}
                  events={ledgerEvents}
                  currentUsername={normalizedUsername}
                  interests={interests}
                  loading={ledgerLoading}
                  onDeclinePrivate={declinePrivateOffer}
                  onSubmitInterest={signedIn ? submitInterest : undefined}
                  onRefresh={refreshPublicLedger}
                />
              )}

              {activeMode === "profile" && (
                <>
                  <ProfileDesk
                    feedbackSending={feedbackSending}
                    feedbackStatus={feedbackStatus}
                    language={language}
                    loading={profileLoading}
                    payoutReadyLoading={payoutReadyLoading}
                    profile={profileStats}
                    telegram={telegram}
                    telegramLoading={telegramLoading}
                    telegramPendingLink={telegramAwaitingLink}
                    trades={trades}
                    username={normalizedUsername}
                    onConfirmPayoutReadiness={() => void confirmPayoutReadiness()}
                    onLinkTelegram={() => void linkTelegram()}
                    onRefreshTelegram={() => void refreshTelegramStatus()}
                    onSubmitFeedback={submitFeedback}
                    onRefresh={() => void refreshProfile()}
                    onSignOut={signOutPiSession}
                    onRequestVerifiedBadge={() => void requestVerifiedBadge()}
                    onUnlinkTelegram={() => void unlinkTelegram()}
                  />
                  <LanguageSelector
                    copy={copy}
                    language={language}
                    onChange={changeLanguage}
                    variant="card"
                  />
                  <AppFooter />
                </>
              )}

              {activeMode === "admin" && user?.isAdmin && (
                <AdminDesk
                  chatLoadingTradeId={chatLoadingTradeId}
                  chatMessages={chatMessages}
                  chatRooms={chatRooms}
                  currentUserId={user?.id ?? user?.uid}
                  language={language}
                  loading={workspaceTradeLoading}
                  trades={adminTrades}
                  events={events}
                  reviewLoadingTradeId={reviewLoadingTradeId}
                  reviewRecommendations={reviewRecommendations}
                  verificationLoading={verificationLoading}
                  verificationRequests={verificationRequests}
                  onApproveVerification={(request) => void approveVerifiedBadge(request)}
                  onClaimChat={claimTradeChat}
                  onConfirmAlreadyPaid={(trade) => adminResolve(trade, "AlreadyPaid")}
                  onOpenChat={openTradeChat}
                  onRefreshVerifications={() => void refreshVerificationRequests()}
                  onRunReview={runReviewRecommendation}
                  onResolve={adminResolve}
                />
              )}
            </div>
          )}
        </div>

        {signedIn && activeChatTradeRecord && (
          <TradeChatModal
            currentUserId={user?.id ?? user?.uid}
            currentUsername={normalizedUsername}
            isAdmin={Boolean(user?.isAdmin)}
            loading={chatLoadingTradeId === activeChatTradeRecord.id}
            messages={chatMessages.filter(
              (message) => message.tradeId === activeChatTradeRecord.id,
            )}
            room={chatRooms.find((room) => room.tradeId === activeChatTradeRecord.id)}
            sending={chatSending}
            trade={activeChatTradeRecord}
            onClaim={user?.isAdmin ? claimTradeChat : undefined}
            onClose={() => setActiveChatTrade(null)}
            onRefresh={openTradeChat}
            onSend={sendTradeChatMessage}
          />
        )}

        {signedIn && (
          <BottomTabBar
            copy={copy}
            mode={activeMode}
            navItems={navItems}
            onModeChange={changeMode}
          />
        )}
      </section>
    </main>
  );
}

async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const isFormData = init.body instanceof FormData;
  const method = (init.method ?? "GET").toUpperCase();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}.`);
  }

  if (typeof window !== "undefined" && method !== "GET" && path.startsWith("/api/")) {
    window.dispatchEvent(
      new CustomEvent("piscrow:mutation-success", {
        detail: { method, path },
      }),
    );
  }

  return response.json() as Promise<T>;
}

function fileFromFormData(formData: FormData, name: string) {
  const file = formData.get(name);
  return file instanceof File && file.size > 0 ? file : null;
}

async function imageFileToBitmap(file: File) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    image.src = url;
  });
}

async function compressImageForUpload(file: File | null) {
  if (!file || file.size < 350 * 1024 || typeof window === "undefined") {
    return file;
  }

  try {
    const source = await imageFileToBitmap(file);
    const sourceWidth =
      source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight =
      source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const maxSide = 1280;
    const ratio = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.drawImage(source, 0, 0, width, height);

    if ("close" in source && typeof source.close === "function") {
      source.close();
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.78);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "proof"}.webp`,
      {
        type: "image/webp",
        lastModified: Date.now(),
      },
    );
  } catch {
    return file;
  }
}

async function optimizeImageInFormData(formData: FormData, fieldName: string) {
  const file = fileFromFormData(formData, fieldName);
  const optimized = await compressImageForUpload(file);

  if (file && optimized && optimized !== file) {
    formData.set(fieldName, optimized);
  }
}

function AppFooter() {
  return (
    <footer className="mx-[14px] mb-4 grid gap-2 border-t border-white/8 pt-4 text-center">
      <p className="inline-flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        Built with
        <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
        by Kamarudeen
      </p>
      <a
        className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-[var(--gold)]"
        href="mailto:coodeflowx1@gmail.com"
      >
        <Mail className="h-3.5 w-3.5" />
        coodeflowx1@gmail.com
      </a>
    </footer>
  );
}

function LanguageSelector({
  copy,
  language,
  onChange,
  variant = "inline",
}: {
  copy: AppCopy;
  language: LanguageCode;
  onChange: (language: LanguageCode) => void;
  variant?: "inline" | "card" | "guest";
}) {
  const containerClassName =
    variant === "card"
      ? "card mx-[14px] grid gap-1"
      : variant === "guest"
        ? "mx-[14px] grid gap-2 rounded-2xl border border-white/10 bg-[rgba(10,20,36,0.88)] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.16)]"
      : "mx-[14px] grid gap-1";
  const labelClassName =
    variant === "guest"
      ? "inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-200"
      : "text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]";
  const selectClassName =
    variant === "guest"
      ? "inp h-11 normal-case border-white/12 bg-[rgba(5,12,22,0.72)]"
      : "inp h-10 normal-case";

  return (
    <label className={containerClassName}>
      <span className={labelClassName}>
        {variant === "guest" && <Languages className="h-4 w-4 text-[var(--gold)]" />}
        {copy.language}
      </span>
      <select
        className={selectClassName}
        value={language}
        onChange={(event) => {
          const nextLanguage = event.target.value;
          if (isLanguageCode(nextLanguage)) {
            onChange(nextLanguage);
          }
        }}
      >
        {supportedLanguages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.shortLabel} - {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SessionCard({
  authState,
  canConnect,
  connecting,
  copy,
  profile,
  user,
  onConnect,
}: {
  authState: string;
  canConnect: boolean;
  connecting: boolean;
  copy: AppCopy;
  profile?: UserReputation | null;
  user: SessionUser | null;
  onConnect: () => void;
}) {
  return (
    <aside className="card mx-[14px] grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="lbl">
            {copy.session}
          </p>
          <div className="mt-1 text-base font-bold text-white">
            {user ? (
              <VerifiedUsername
                className="text-white"
                profile={profile ?? undefined}
                username={user.username}
              />
            ) : (
              copy.notConnected
            )}
          </div>
        </div>
        <Link
          aria-disabled={Boolean(user) || connecting || !canConnect}
          className={`btn-gh shrink-0 border-[rgba(245,166,35,0.22)] bg-[rgba(245,166,35,0.12)] text-[var(--gold)] ${
            Boolean(user) || connecting || !canConnect ? "pointer-events-none opacity-70" : ""
          }`}
          href="/?consent=accept&connect=1"
          onClick={(event) => {
            if (Boolean(user) || connecting || !canConnect) {
              event.preventDefault();
              return;
            }

            event.preventDefault();
            onConnect();
          }}
          prefetch={false}
          replace
          scroll={false}
          tabIndex={Boolean(user) || connecting || !canConnect ? -1 : undefined}
        >
          {user ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : connecting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserRoundCheck className="h-4 w-4" />
          )}
          {user ? copy.connected : connecting ? copy.connecting : copy.connect}
        </Link>
      </div>
      <p className="rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-sm leading-6 text-slate-300">
        {authState}
      </p>
    </aside>
  );
}

function SignInPanel({
  authState,
  canConnect,
  connecting,
  copy,
  onConnect,
}: {
  authState: string;
  canConnect: boolean;
  connecting: boolean;
  copy: AppCopy;
  onConnect: () => void;
}) {
  return (
    <section className="card mx-[14px] grid gap-5 border-[rgba(245,166,35,0.14)] bg-[radial-gradient(circle_at_top_right,rgba(245,166,35,0.12),transparent_34%),linear-gradient(180deg,rgba(18,35,57,0.96),rgba(11,23,40,0.98))]">
      <div className="grid gap-4 md:grid-cols-[auto,1fr] md:items-start">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-[rgba(245,166,35,0.1)] text-[var(--gold)] shadow-[0_14px_40px_rgba(245,166,35,0.12)]">
          <UserRoundCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="lbl">
            {copy.privateWorkspace}
          </p>
          <h2 className="mt-2 text-lg font-bold text-white">
            {copy.signInTitle}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {copy.signInBody}
          </p>
        </div>
      </div>
      <p className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm font-semibold leading-6 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        {authState}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          aria-disabled={connecting || !canConnect}
          className={`btn-g ${connecting || !canConnect ? "pointer-events-none opacity-70" : ""}`}
          href="/?consent=accept&connect=1"
          onClick={(event) => {
            if (connecting || !canConnect) {
              event.preventDefault();
              return;
            }

            event.preventDefault();
            onConnect();
          }}
          prefetch={false}
          replace
          scroll={false}
          tabIndex={connecting || !canConnect ? -1 : undefined}
        >
          {connecting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserRoundCheck className="h-4 w-4" />
          )}
          {connecting ? `${copy.connecting}...` : copy.connectPiAccount}
        </Link>
        <Link
          className="btn-gh"
          href="/?demo=1"
        >
          <CirclePlay className="h-4 w-4" />
          {copy.loginDemo}
        </Link>
      </div>
    </section>
  );
}

function MaintenanceBanner({
  copy,
  message,
}: {
  copy: AppCopy;
  message: string;
}) {
  return (
    <section className="card mx-[14px] mt-3 flex flex-col gap-3 border-amber-400/25 bg-amber-400/10 text-amber-100">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/14">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black">{copy.maintenanceNotice}</p>
          <p className="mt-1 text-sm leading-6 text-amber-50/85">{message}</p>
        </div>
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-200/80">
        {copy.appStaysOnline}
      </p>
    </section>
  );
}

function DemoModeBanner({ copy }: { copy: AppCopy }) {
  const demoViews = [
    copy.views.market.label,
    copy.views.sell.label,
    copy.views.profile.label,
    copy.views.admin.label,
  ];

  return (
    <section className="mx-[14px] mt-3 flex items-start gap-3 rounded-[24px] border border-sky-400/25 bg-[linear-gradient(180deg,rgba(14,57,96,0.26),rgba(8,28,48,0.2))] px-4 py-4 text-sky-100 shadow-[0_18px_40px_rgba(5,34,58,0.18)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/14">
        <CirclePlay className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">{copy.demoWorkspace}</p>
        <p className="mt-1 text-sm leading-6 text-sky-50/78">
          {copy.demoBody}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {demoViews.map((label) => (
            <span
              key={label}
              className="rounded-full border border-sky-300/18 bg-sky-300/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-50/88"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <Link
        className="btn-gh shrink-0 border-sky-300/25 px-3 py-2 text-xs text-sky-100"
        href="/"
      >
        {copy.exitDemo}
      </Link>
    </section>
  );
}

function ConsentGate({
  consentState,
  copy,
}: {
  consentState: ConsentState;
  copy: AppCopy;
}) {
  const rejected = consentState === "rejected";
  const checking = consentState === "checking";

  return (
    <section className="card mx-[14px] grid gap-5 border-[rgba(245,166,35,0.14)] bg-[radial-gradient(circle_at_top_left,rgba(91,37,159,0.16),transparent_36%),linear-gradient(180deg,rgba(15,27,45,0.98),rgba(11,23,40,0.98))]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[rgba(91,37,159,0.14)] text-[#d7b8ff] shadow-[0_16px_36px_rgba(91,37,159,0.18)]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="lbl">
            {copy.consentRequired}
          </p>
          <h2 className="mt-2 text-lg font-bold text-white">
            {copy.consentTitle}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {copy.consentBody}
          </p>
        </div>
      </div>
      <div className="grid gap-2 text-sm font-semibold leading-6 text-slate-200">
        {copy.consentCards.map((card) => (
          <div
            key={card}
            className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
          >
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--gold)] shadow-[0_0_0_3px_rgba(245,166,35,0.12)]" />
            <span>{card}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 rounded-2xl border border-[rgba(245,166,35,0.16)] bg-[rgba(245,166,35,0.08)] p-4">
        <div>
          <p className="text-sm font-black text-white">
            {checking
              ? copy.checkingConsent
              : rejected
                ? copy.loginDisabled
                : copy.agreeBeforeLogin}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            {rejected ? copy.rejectedBody : copy.consentBlockBody}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            aria-disabled={checking}
            className={`btn-g ${checking ? "pointer-events-none opacity-70" : ""}`}
            href="/?consent=accept"
            prefetch={false}
            replace
            scroll={false}
            tabIndex={checking ? -1 : undefined}
          >
            <ShieldCheck className="h-4 w-4" />
            {copy.agreeContinue}
          </Link>
          <Link
            aria-disabled={checking}
            className={`btn-gh ${checking ? "pointer-events-none opacity-70" : ""}`}
            href="/?consent=reject"
            prefetch={false}
            replace
            scroll={false}
            tabIndex={checking ? -1 : undefined}
          >
            {copy.reject}
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            className="btn-gh"
            href="/rules"
          >
            <ShieldCheck className="h-4 w-4" />
            {copy.readRules}
          </Link>
          <Link
            className="btn-gh"
            href="/?demo=1"
          >
            <CirclePlay className="h-4 w-4" />
            {copy.loginDemo}
          </Link>
        </div>
      </div>
    </section>
  );
}

function WelcomeHero({ copy }: { copy: AppCopy }) {
  return (
    <section className="card mx-[14px] mt-3 grid gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-[rgba(8,16,28,0.72)] shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
          <NextImage
            alt="PiScrow app icon"
            className="h-12 w-12"
            height={48}
            priority
            src="/brand/piscrow-app-icon.svg"
            width={48}
          />
        </div>
        <div className="min-w-0">
          <span className="bdg bv">
            <ShieldCheck className="h-3 w-3" />
            {copy.testnetBadge}
          </span>
          <h1 className="mt-2">
            <NextImage
              alt={copy.heroTitle}
              className="h-8 w-auto"
              height={56}
              priority
              src="/brand/piscrow-wordmark.svg"
              width={220}
            />
          </h1>
        </div>
      </div>
      <p className="text-sm leading-6 text-slate-300">{copy.heroBody}</p>
    </section>
  );
}

function AppTopBar({
  activeValue,
  authState,
  copy,
  notificationsOpen,
  refreshing,
  refreshDisabled,
  signedIn,
  unreadCount,
  username,
  onRefresh,
  onToggleNotifications,
}: {
  activeValue: number;
  authState: string;
  copy: AppCopy;
  notificationsOpen: boolean;
  refreshing: boolean;
  refreshDisabled: boolean;
  signedIn: boolean;
  unreadCount: number;
  username: string;
  onRefresh: () => void;
  onToggleNotifications: () => void;
}) {
  const balanceLabel = signedIn ? formatHeaderPi(activeValue) : copy.testnet;

  return (
    <header className="hd">
      <div className="hd-logo" aria-label="PiScrow">
        <NextImage
          alt="PiScrow"
          className="hd-logo-img"
          height={40}
          priority
          src="/brand/piscrow-wordmark.svg"
          width={156}
        />
      </div>
      <span className="hd-pill">{copy.testnet}</span>
      <span className="hd-bal" title={signedIn ? `@${username}` : authState}>
        {balanceLabel}
      </span>
      <button
        aria-label="Refresh PiScrow"
        className="hd-nd"
        disabled={refreshDisabled}
        type="button"
        onClick={onRefresh}
      >
        <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
      <button
        aria-expanded={notificationsOpen}
        aria-label="Open notifications"
        className="hd-nd"
        type="button"
        onClick={onToggleNotifications}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="hd-count">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>
    </header>
  );
}

function NotificationDrawer({
  notices,
  onClose,
  onDismiss,
}: {
  notices: AppNotice[];
  onClose: () => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <section className="absolute inset-x-0 top-[76px] z-40 px-4">
      <div className="rounded-2xl border border-white/10 bg-[rgba(11,23,40,0.96)] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-white">Notifications</p>
            <p className="text-xs text-slate-400">Trade updates and admin follow-ups.</p>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-200"
            type="button"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid max-h-[320px] gap-2 overflow-y-auto pr-1">
          {notices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/12 p-4 text-sm text-slate-400">
              No unread notifications right now.
            </div>
          ) : (
            notices.map((notice) => (
              <article
                key={notice.id}
                className="grid gap-2 rounded-xl border border-white/8 bg-black/14 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{notice.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{notice.body}</p>
                  </div>
                  <button
                    aria-label={`Dismiss ${notice.title}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/6 text-slate-300"
                    type="button"
                    onClick={() => onDismiss(notice.id)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function BottomTabBar({
  copy,
  mode,
  navItems,
  onModeChange,
}: {
  copy: AppCopy;
  mode: ViewMode;
  navItems: ViewMode[];
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    <nav className="nav">
      {navItems.map((item) => {
        const Icon = viewIcons[item];
        const selected = mode === item;

        return (
          <button
            key={item}
            aria-label={copy.views[item].label}
            aria-pressed={selected}
            className={`nb${selected ? " on" : ""}`}
            type="button"
            onClick={() => onModeChange(item)}
          >
            <Icon className="h-4 w-4" />
            <span className="nb-l">{copy.views[item].label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function NotificationStack({
  notices,
  onDismiss,
}: {
  notices: AppNotice[];
  onDismiss: (id: string) => void;
}) {
  if (notices.length === 0) {
    return null;
  }

  const tones: Record<AppNotice["tone"], string> = {
    info: "border-sky-400/25 bg-sky-500/12 text-sky-100",
    success: "border-emerald-400/25 bg-emerald-500/12 text-emerald-100",
    warning: "border-amber-400/25 bg-amber-400/12 text-amber-100",
  };

  return (
    <section
      aria-label="PiScrow notifications"
      className="fixed left-1/2 top-4 z-50 grid w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 gap-2"
    >
      {notices.map((notice) => (
        <article
          key={notice.id}
          className={`relative rounded-2xl border p-3 pr-10 text-sm leading-6 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur ${tones[notice.tone]}`}
        >
          <button
            aria-label={`Dismiss ${notice.title}`}
            className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/8 text-current"
            type="button"
            onClick={() => onDismiss(notice.id)}
          >
            <X className="h-4 w-4" />
          </button>
          <p className="font-black">{notice.title}</p>
          <p>{notice.body}</p>
        </article>
      ))}
    </section>
  );
}

function ProcessingOverlay({
  action,
}: {
  action: BlockingAction;
}) {
  return (
    <section aria-live="polite" className="pub-ov">
      <div className="spin" />
      <div className="max-w-[270px] px-6 text-center">
        <p className="text-base font-black text-white">{action.title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{action.body}</p>
      </div>
    </section>
  );
}

function ActionFeedbackDialog({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-labelledby="action-feedback-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/70 px-4 py-6 backdrop-blur-sm"
      role="alertdialog"
    >
      <div className="w-full max-w-md rounded-[26px] border border-rose-400/25 bg-[rgba(11,23,40,0.96)] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/14 text-rose-200">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2
                className="text-lg font-black text-white"
                id="action-feedback-title"
              >
                Action needed
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                {message}
              </p>
            </div>
          </div>
          <button
            aria-label="Dismiss action message"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300"
            type="button"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#f5a623,#d97706)] px-4 text-sm font-black text-slate-950 transition hover:brightness-105"
          type="button"
          onClick={onDismiss}
        >
          Got it
        </button>
      </div>
    </section>
  );
}

function HandoffCodeDialog({
  code,
  expiresAt,
  onCopy,
  onClose,
}: {
  code: string;
  expiresAt?: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-labelledby="handoff-code-title"
      aria-modal="true"
      className="fixed inset-0 z-[62] grid place-items-center bg-zinc-950/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-sm rounded-[26px] border border-white/10 bg-[rgba(11,23,40,0.96)] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white" id="handoff-code-title">
              Buyer handoff code
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Show this code to the seller only after the local exchange is complete.
            </p>
          </div>
          <button
            aria-label="Close handoff code"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300"
            type="button"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-5 text-center">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[28px] font-black tracking-[0.16em] text-[var(--gold)]">
                {code}
              </p>
            </div>
            <button
              aria-label="Copy handoff code"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/8 text-slate-100 transition hover:bg-white/14"
              type="button"
              onClick={onCopy}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
        {expiresAt && (
          <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Expires {new Date(expiresAt).toLocaleString()}
          </p>
        )}
        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#f5a623,#d97706)] px-4 text-sm font-black text-slate-950 transition hover:brightness-105"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </section>
  );
}

function ConfirmActionDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: ConfirmAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const danger = action.tone === "danger";

  return (
    <section
      aria-labelledby="confirm-action-title"
      aria-modal="true"
      className="fixed inset-0 z-[65] grid place-items-center bg-zinc-950/70 px-4 py-6 backdrop-blur-sm"
      role="alertdialog"
    >
      <div className="w-full max-w-md rounded-[26px] border border-white/10 bg-[rgba(11,23,40,0.96)] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.48)]">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              danger
                ? "bg-rose-500/14 text-rose-200"
                : "bg-amber-400/14 text-amber-200"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2
              className="text-lg font-black text-white"
              id="confirm-action-title"
            >
              {action.title}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
              {action.body}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/6 px-4 text-sm font-black text-white transition hover:bg-white/10"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-black text-white transition ${
              danger
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-[linear-gradient(135deg,#f5a623,#d97706)] text-slate-950 hover:brightness-105"
            }`}
            type="button"
            onClick={onConfirm}
          >
            {action.confirmLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
