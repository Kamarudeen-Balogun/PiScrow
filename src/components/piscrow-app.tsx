"use client";

import {
  AlertTriangle,
  AtSign,
  CirclePlay,
  X,
  CheckCircle2,
  FileWarning,
  HandCoins,
  Heart,
  History,
  LockKeyhole,
  Megaphone,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  LoaderCircle,
  Menu,
  Store,
  UserCircle,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AdminDesk,
  OfferFeed,
  ProfileDesk,
  PublicLedger,
  SellerDesk,
  SellerPostPanel,
  SideRail,
} from "@/components/piscrow-workspaces";
import {
  demoEvents,
  demoInterests,
  demoTrades,
  demoUser,
} from "@/lib/demo-data";
import {
  calculateBuyerTotal,
  calculatePlatformFee,
} from "@/lib/fees";
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
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { formatTestPi } from "@/lib/trade-state";
import {
  createTradeInterestSchema,
  createTradeSchema,
  confirmReceiptSchema,
  deliveryProofSchema,
  disputeFollowUpSchema,
  disputeSchema,
  feedbackSchema,
} from "@/lib/validation";
import type { PiPaymentDTO, PiUser } from "@/types/pi";
import type { UserReputation } from "@/types/profile";
import type { TradeReviewRecommendation } from "@/types/review";
import type { Trade, TradeEvent, TradeInterest, TradeStatus } from "@/types/trade";

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

type ProfilePayload = {
  profile: UserReputation;
};

type VerificationQueuePayload = {
  requests: UserReputation[];
};

type ReviewRecommendationsPayload = {
  recommendations: TradeReviewRecommendation[];
};

type AppNotice = {
  id: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warning";
};

type ConfirmAction = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "warning" | "danger";
  onConfirm: () => void;
};

type ConsentState = "checking" | "pending" | "accepted" | "rejected";
type LanguageCode = "en" | "es" | "fr" | "pt" | "ar" | "hi" | "id" | "zh";
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

type SavedNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
};

type AdminFollowUpAction = "request_buyer_followup" | "request_seller_followup";

const nextPublicSandbox =
  process.env.NEXT_PUBLIC_PI_SANDBOX === undefined
    ? true
    : process.env.NEXT_PUBLIC_PI_SANDBOX === "true";

const consentStorageKey = "piscrow-consent-v1";
const languageStorageKey = "piscrow-language-v1";
const consentVersion = "2026-06-07";
const nextPublicMaintenanceEnabled =
  process.env.NEXT_PUBLIC_PISCROW_MAINTENANCE_ENABLED === "true";
const nextPublicMaintenanceMessage =
  process.env.NEXT_PUBLIC_PISCROW_MAINTENANCE_MESSAGE?.trim() ||
  "PiScrow is receiving updates. The app remains online, but some actions may be slower than usual.";
const workspaceFallbackSyncIntervalMs = 60_000;
const realtimeSyncChannelName = "piscrow-app-sync";

const viewIcons: Record<ViewMode, typeof Store> = {
  market: Store,
  sell: Megaphone,
  ledger: History,
  profile: UserCircle,
  admin: LockKeyhole,
};

const supportedLanguages: { code: LanguageCode; label: string; shortLabel: string }[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "es", label: "Espanol", shortLabel: "ES" },
  { code: "fr", label: "Francais", shortLabel: "FR" },
  { code: "pt", label: "Portugues", shortLabel: "PT" },
  { code: "ar", label: "العربية", shortLabel: "AR" },
  { code: "hi", label: "हिन्दी", shortLabel: "HI" },
  { code: "id", label: "Bahasa Indonesia", shortLabel: "ID" },
  { code: "zh", label: "中文", shortLabel: "ZH" },
];

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
      "Admins can review disputed trades before release or cancellation.",
    ],
    readRules: "Read full rules, privacy, and agreements",
    checkingConsent: "Checking saved consent...",
    loginDisabled: "Pi login is disabled.",
    agreeBeforeLogin: "Agree before Pi login.",
    rejectedBody:
      "You rejected the agreement on this browser. You can read the rules again and agree when you are ready.",
    consentBlockBody:
      "Rejecting keeps the public ledger visible, but blocks Pi account login, seller posting, buyer interest, funding, and proof uploads.",
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
      "Rechazar mantiene visible el libro publico, pero bloquea login, publicaciones, interes, pagos y pruebas.",
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
    consentBlockBody: "Refuser garde le registre public visible mais bloque connexion, offres, interet, paiement et preuves.",
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
    consentBlockBody: "Rejeitar mantem o livro publico visivel, mas bloqueia login, ofertas, interesse, pagamentos e provas.",
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
    consentBlockBody: "الرفض يبقي السجل العام مرئيا لكنه يمنع تسجيل الدخول والنشر والاهتمام والتمويل والإثباتات.",
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
      "Admins disputed trades release ya cancel se pehle review karte hain.",
    ],
    readRules: "Rules, privacy aur agreements padhein",
    checkingConsent: "Saved consent check ho raha hai...",
    loginDisabled: "Pi login disabled hai.",
    agreeBeforeLogin: "Pi login se pehle agree karein.",
    rejectedBody: "Aapne agreement reject kiya. Ready hone par rules padhkar agree kar sakte hain.",
    consentBlockBody: "Reject karne se public ledger visible rahega, par login, posting, interest, funding aur proofs block honge.",
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
      admin: { label: "Admin", description: "Approved Pi usernames ke disputed trades resolve karein." },
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
    consentBlockBody: "Menolak tetap membuat ledger publik terlihat, tetapi memblokir login, posting, minat, pendanaan, dan bukti.",
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
    consentBlockBody: "拒绝后仍可查看公开账本，但会阻止 Pi 登录、发布、兴趣、支付和凭证上传。",
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
};

type AppCopy = (typeof appCopy)[LanguageCode];

function isLanguageCode(value: string | null): value is LanguageCode {
  return supportedLanguages.some((language) => language.code === value);
}

export function PiScrowApp({
  allowDemo = false,
  forceMaintenance = false,
}: {
  allowDemo?: boolean;
  forceMaintenance?: boolean;
}) {
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
  const [authMessage, setAuthMessage] = useState<AuthMessageState>({
    key: allowDemo ? "demo" : "initial",
  });
  const [mode, setMode] = useState<ViewMode>("market");
  const [trades, setTrades] = useState<Trade[]>(allowDemo ? demoTrades : []);
  const [interests, setInterests] = useState<TradeInterest[]>(
    allowDemo ? demoInterests : [],
  );
  const [events, setEvents] = useState<TradeEvent[]>(allowDemo ? demoEvents : []);
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
  const [paymentState, setPaymentState] = useState("No payment started.");
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sellerFormResetKey, setSellerFormResetKey] = useState(0);
  const [connectingPi, setConnectingPi] = useState(false);
  const [profile, setProfile] = useState<UserReputation | null>(
    allowDemo ? buildDemoProfile(demoUser.username, demoTrades) : null,
  );
  const [verificationRequests, setVerificationRequests] = useState<UserReputation[]>(
    allowDemo ? buildDemoVerificationRequests(demoTrades) : [],
  );
  const [reviewRecommendations, setReviewRecommendations] = useState<
    TradeReviewRecommendation[]
  >(allowDemo ? buildDemoReviewRecommendations() : []);
  const [reviewLoadingTradeId, setReviewLoadingTradeId] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>(null);
  const [consentState, setConsentState] = useState<ConsentState>(
    allowDemo ? "accepted" : "checking",
  );
  const demoSessionRef = useRef(allowDemo);
  const workspaceRefreshInFlightRef = useRef(false);
  const seenSavedNotificationIdsRef = useRef<Set<string>>(new Set());

  const signedIn = Boolean(user);
  const copy = appCopy[language];
  const authState =
    authMessage.text ?? copy.auth[authMessage.key ?? (allowDemo ? "demo" : "initial")];
  const canConnectPi = consentState === "accepted";
  const maintenanceEnabled = forceMaintenance || nextPublicMaintenanceEnabled;
  const normalizedUsername = normalizeUsername(user?.username ?? "");
  const navItems: ViewMode[] = user?.isAdmin
    ? ["market", "sell", "ledger", "profile", "admin"]
    : ["market", "sell", "ledger", "profile"];
  const activeMode: ViewMode = mode === "admin" && !user?.isAdmin ? "market" : mode;

  const selectedTrade =
    trades.find((trade) => trade.id === selectedTradeId) ??
    trades.find((trade) => trade.id === expandedTradeId) ??
    trades[0];

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

        return trade.targetBuyerPiUsernames.includes(normalizedUsername);
      }),
    [normalizedUsername, trades, user],
  );

  const adminTrades = useMemo(
    () => trades.filter((trade) => trade.status === "Disputed"),
    [trades],
  );

  const activeValue = trades
    .filter((trade) => !isTerminal(trade.status))
    .reduce((total, trade) => total + trade.amountTestPi, 0);

  const profileStats = useMemo(
    () => profile ?? (user ? buildDemoProfile(user.username, trades) : null),
    [profile, trades, user],
  );

  function changeLanguage(nextLanguage: LanguageCode) {
    setLanguage(nextLanguage);

    try {
      window.localStorage.setItem(languageStorageKey, nextLanguage);
    } catch {
      // Language selection is still applied for the current session.
    }
  }

  function changeMode(nextMode: ViewMode) {
    setMobileNavOpen(false);

    if (nextMode === "admin" && !user?.isAdmin) {
      setMode("market");
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

  function pushNotice(
    title: string,
    body: string,
    tone: AppNotice["tone"] = "info",
  ) {
    setNotices((current) => [
      { id: `notice-${crypto.randomUUID()}`, title, body, tone },
      ...current,
    ].slice(0, 6));
  }

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
      includeProfile = activeMode === "profile",
      includeAdmin = activeMode === "admin" && Boolean(user?.isAdmin),
      silent = true,
    }: {
      accessToken?: string;
      includeProfile?: boolean;
      includeAdmin?: boolean;
      silent?: boolean;
    } = {}) => {
      if (allowDemo || !accessToken || !user) {
        return;
      }

      if (workspaceRefreshInFlightRef.current) {
        return;
      }

      workspaceRefreshInFlightRef.current = true;

      try {
        const profilePromise = includeProfile
          ? apiRequest<ProfilePayload>("/api/profile", accessToken)
          : Promise.resolve(null);
        const verificationPromise = includeAdmin
          ? apiRequest<VerificationQueuePayload>(
              "/api/admin/verification-requests",
              accessToken,
            )
          : Promise.resolve(null);
        const reviewPromise = includeAdmin
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

        return response.json() as Promise<Pick<TradePayload, "trades" | "events">>;
      });
      setLedgerTrades(payload.trades);
      setLedgerEvents(payload.events);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not load ledger.");
    } finally {
      setLedgerLoading(false);
    }
  }, [allowDemo, events, trades]);

  function acceptConsent() {
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
  }

  function rejectConsent() {
    setConsentState("rejected");
    setUser(null);
    setPiConnected(false);
    setPiAccessToken("");
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
    if (!mobileNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

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
        setAuthMessage({ key: "initial" });
        setMode("market");
        setTrades([]);
        setInterests([]);
        setEvents([]);
        setLedgerTrades([]);
        setLedgerEvents([]);
        setProfile(null);
      setVerificationRequests([]);
      setReviewRecommendations([]);
        setSelectedTradeId("");
        setExpandedTradeId("");
        setPaymentState("No payment started.");
        setFormError("");
        setNotices([]);
        seenSavedNotificationIdsRef.current = new Set();
        setConsentState("checking");
        return;
      }

      demoSessionRef.current = true;
      setUser({ ...demoUser, isAdmin: true });
      setPiConnected(false);
      setPiAccessToken("");
      setAuthMessage({ key: "demo" });
      setConsentState("accepted");
      setMode("market");
      setTrades(demoTrades);
      setInterests(demoInterests);
      setEvents(demoEvents);
      setLedgerTrades(demoTrades);
      setLedgerEvents(demoEvents);
      setProfile(buildDemoProfile(demoUser.username, demoTrades));
      setVerificationRequests(buildDemoVerificationRequests(demoTrades));
      setReviewRecommendations(buildDemoReviewRecommendations());
      setSelectedTradeId(demoTrades[0]?.id ?? "");
      setExpandedTradeId(demoTrades[0]?.id ?? "");
      setPaymentState("Demo mode is active. Test Pi payments are simulated.");
      setFormError("");
      setSellerFormResetKey((current) => current + 1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [allowDemo]);

  useEffect(() => {
    if (allowDemo) {
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(consentStorageKey);
        const parsed = stored
          ? (JSON.parse(stored) as { status?: ConsentState; version?: string })
          : null;
        const savedState =
          parsed?.version === consentVersion ? parsed.status : undefined;

        if (savedState === "accepted") {
          setConsentState("accepted");
          return;
        }

        if (savedState === "rejected") {
          setConsentState("rejected");
          setAuthMessage({ key: "consentRejected" });
          return;
        }

        setConsentState("pending");
      } catch {
        setConsentState("pending");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [allowDemo]);

  useEffect(() => {
    if (notices.length === 0) {
      return;
    }

    const timers = notices.map((notice) =>
      window.setTimeout(() => {
        setNotices((current) =>
          current.filter((item) => item.id !== notice.id),
        );
      }, 6500),
    );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [notices]);

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
      window.removeEventListener("focus", handleWorkspaceVisibilityRefresh);
      document.removeEventListener(
        "visibilitychange",
        handleWorkspaceVisibilityRefresh,
      );
      channels.forEach((channel) => channel.unsubscribe());
    };
  }, [
    activeMode,
    allowDemo,
    piAccessToken,
    refreshAuthenticatedWorkspace,
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

    const pi = await waitForPiSdk().catch((error) => {
      const message = resolvePiAuthMessage(error, copy.auth);
      setAuthMessage({ text: message });
      pushNotice(copy.notices.piSdkTitle, message, "warning");
      setConnectingPi(false);
      return null;
    });

    if (!pi) {
      return;
    }

    try {
      setAuthMessage({ key: "sdkReady" });
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
        setUser(null);
        setAuthMessage({ text: copy.notices.connectedNoToken(piUser.username) });
        return;
      }

      const session = await apiRequest<{ user: SessionUser }>("/api/auth/pi", accessToken, {
        method: "POST",
      });
      setUser(session.user);
      setMode("market");
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
      setPiConnected(false);
      setPiAccessToken("");
      setUser(allowDemo ? { ...demoUser, isAdmin: true } : null);
      const message = resolvePiAuthMessage(error, copy.auth);
      setAuthMessage({ text: message });
      pushNotice(copy.notices.connectionFailedTitle, message, "warning");
    } finally {
      setConnectingPi(false);
    }
  }

  async function refreshProfile(accessToken = piAccessToken) {
    if (allowDemo) {
      setProfile(buildDemoProfile(user?.username ?? demoUser.username, trades));
      return;
    }

    if (!accessToken) {
      return;
    }

    setProfileLoading(true);

    try {
      const payload = await apiRequest<ProfilePayload>("/api/profile", accessToken);
      setProfile(payload.profile);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not load profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function requestVerifiedBadge() {
    setFormError("");

    if (allowDemo) {
      setProfile((current) => {
        const next = current ?? buildDemoProfile(user?.username ?? demoUser.username, trades);
        return {
          ...next,
          verifiedBadge: false,
          verificationRequestedAt: new Date().toISOString(),
        };
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
      void apiRequest<TradePayload>("/api/trades", piAccessToken, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      })
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          setSellerFormResetKey((current) => current + 1);
          setMode("sell");
          pushNotice("Offer posted", "Your seller offer is now live.");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not post offer.",
          );
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
      id: `trade-${crypto.randomUUID()}`,
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
        });
      return;
    }

    const now = new Date().toISOString();
    const interest: TradeInterest = {
      id: `interest-${crypto.randomUUID()}`,
      tradeId: trade.id,
      buyerUserId: user.uid,
      buyerPiUsername: normalizeUsername(user.username),
      responseNote: parsed.data.responseNote,
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
    const selectionExpiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

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
    askConfirmation({
      title: "Delete this offer?",
      body: "This removes the open seller offer before a buyer is selected.",
      confirmLabel: "Delete offer",
      tone: "danger",
      onConfirm: () => deleteOfferConfirmed(trade),
    });
  }

  function deleteOfferConfirmed(trade: Trade) {
    setFormError("");

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/delete`,
        piAccessToken,
        { method: "POST" },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice("Offer deleted", "The open seller offer was removed.", "warning");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not delete offer.",
          );
        });
      return;
    }

    updateTrade(trade.id, "Cancelled");
    appendEvent(
      trade.id,
      "Offer deleted",
      "Seller removed the open offer before selecting a buyer.",
    );
    pushNotice("Offer deleted", "The open seller offer was removed.", "warning");
  }

  function fundTrade(trade: Trade) {
    askConfirmation({
      title: "Start Test Pi funding?",
      body: `You will fund ${formatTestPi(calculateBuyerTotal(trade.amountTestPi))}. PiScrow holds this testnet payment while delivery proof is reviewed.`,
      confirmLabel: "Start funding",
      onConfirm: () => fundTradeConfirmed(trade),
    });
  }

  async function fundTradeConfirmed(trade: Trade) {
    setPaymentState("Preparing Test Pi payment...");
    const buyerTotal = calculateBuyerTotal(trade.amountTestPi);
    const platformFee = calculatePlatformFee(trade.amountTestPi);

    if (allowDemo && (!window.Pi || !piConnected)) {
      updateTrade(trade.id, "Funded");
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
      return;
    }

    if (!window.Pi || !piConnected || !piAccessToken) {
      setPaymentState("Connect with Pi Browser before funding a real trade.");
      return;
    }

    try {
      await initializePiSdk(window.Pi, nextPublicSandbox);
    } catch (error) {
      const message = resolvePiAuthMessage(error, copy.auth);
      setPaymentState(message);
      pushNotice("Payment setup failed", message, "warning");
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
              await apiRequest(`/api/pi/approve`, piAccessToken, {
                method: "POST",
                body: JSON.stringify({ paymentId, tradeId: trade.id }),
              });
              setPaymentState("PiScrow approved the Test Pi payment.");
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Payment approval failed.";
              setPaymentState(message);
              pushNotice("Payment approval failed", message, "warning");
            }
          })();
        },
        onReadyForServerCompletion: (paymentId, txid) => {
          void (async () => {
            try {
              setPaymentState("Finalizing Test Pi payment...");
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
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Payment completion failed.";
              setPaymentState(message);
              pushNotice("Payment completion failed", message, "warning");
            }
          })();
        },
        onCancel: () => {
          setPaymentState("Payment was cancelled.");
          pushNotice("Payment cancelled", "No escrow funding was completed.", "warning");
        },
        onError: (error) => {
          setPaymentState(error.message);
          pushNotice("Payment error", error.message, "warning");
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

  function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!selectedTrade) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = deliveryProofSchema.safeParse({
      tradeId: selectedTrade.id,
      deliveryProofNote: formData.get("deliveryProofNote"),
      deliveryProofUrl: formData.get("deliveryProofUrl"),
      deliveryProofImagePath: "",
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Delivery proof failed.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${selectedTrade.id}/delivery`,
        piAccessToken,
        {
          method: "POST",
          body: formData,
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice(
            "Package proof submitted",
            "The buyer can now review and confirm receipt.",
            "success",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not submit proof.",
          );
        });
      return;
    }

    updateTrade(selectedTrade.id, "DeliverySubmitted", {
      deliveryProofNote: parsed.data.deliveryProofNote,
      deliveryProofUrl: parsed.data.deliveryProofUrl || undefined,
    });
    appendEvent(selectedTrade.id, "Delivery submitted", parsed.data.deliveryProofNote);
    pushNotice(
      "Package proof submitted",
      "The buyer can now review and confirm receipt.",
      "success",
    );
    form.reset();
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
      body: "This marks the trade as completed and records buyer receipt proof on the activity timeline.",
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
      void apiRequest<TradePayload>(`/api/trades/${trade.id}/confirm`, piAccessToken, {
        method: "POST",
        body: formData,
      })
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice("Receipt confirmed", "The trade is marked completed.", "success");
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not confirm receipt.",
          );
        });
      return;
    }

    updateTrade(trade.id, "Completed", {
      buyerReceiptNote: parsed.buyerReceiptNote,
      buyerReceiptProofUrl: parsed.buyerReceiptProofUrl || undefined,
    });
    appendEvent(trade.id, "Receipt confirmed", parsed.buyerReceiptNote);
    pushNotice("Receipt confirmed", "The trade is marked completed.", "success");
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
        });
      return;
    }

    updateTrade(trade.id, "Disputed");
    appendEvent(trade.id, "Dispute opened", parsed.reason);
    pushNotice("Dispute opened", "The trade is frozen for admin review.", "warning");
    form.reset();
  }

  function submitDisputeUpdate(
    trade: Trade,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setFormError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = disputeFollowUpSchema.safeParse({
      tradeId: trade.id,
      followUpNote: formData.get("followUpNote"),
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dispute update failed.");
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/dispute-update`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice(
            "Dispute update sent",
            "Your response was added to the trade timeline.",
            "success",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not add dispute update.",
          );
        });
      return;
    }

    appendEvent(
      trade.id,
      "Dispute update",
      parsed.data.followUpNote,
      user?.username ?? "demo_actor",
    );
    pushNotice(
      "Dispute update sent",
      "Your response was added to the trade timeline.",
      "success",
    );
    form.reset();
  }

  function adminRequestFollowUp(
    trade: Trade,
    action: AdminFollowUpAction,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setFormError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const note = String(formData.get("notes") ?? "").trim();
    const targetRole = action === "request_buyer_followup" ? "buyer" : "seller";

    if (note.length < 8) {
      setFormError(`Add a short ${targetRole} follow-up request before sending.`);
      return;
    }

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/admin-resolve`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            notes: note,
          }),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          form.reset();
          pushNotice(
            "Follow-up requested",
            `The ${targetRole} was notified and the request is on the ledger.`,
            "info",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not request follow-up.",
          );
        });
      return;
    }

    appendEvent(
      trade.id,
      action === "request_buyer_followup"
        ? "Admin requested buyer follow-up"
        : "Admin requested seller follow-up",
      note,
      user?.username ?? "admin",
    );
    pushNotice(
      "Follow-up requested",
      `The ${targetRole} request is on the demo timeline.`,
      "info",
    );
    form.reset();
  }

  function adminResolve(trade: Trade, status: "Completed" | "Cancelled") {
    askConfirmation({
      title:
        status === "Completed"
          ? "Approve seller release?"
          : "Approve buyer refund?",
      body:
        status === "Completed"
          ? "This records that admin reviewed the dispute and approved the seller release path."
          : "This records that admin reviewed the dispute and approved the buyer refund path.",
      confirmLabel:
        status === "Completed" ? "Approve release" : "Approve refund",
      tone: status === "Cancelled" ? "danger" : "warning",
      onConfirm: () => adminResolveConfirmed(trade, status),
    });
  }

  function adminResolveConfirmed(trade: Trade, status: "Completed" | "Cancelled") {
    setFormError("");

    const notes =
      status === "Completed"
        ? "Admin approved the seller release path after reviewing buyer receipt and party evidence."
        : "Admin approved the buyer refund path after reviewing the dispute and party evidence.";

    if (piConnected && piAccessToken) {
      void apiRequest<TradePayload>(
        `/api/trades/${trade.id}/admin-resolve`,
        piAccessToken,
        {
          method: "POST",
          body: JSON.stringify({
            action: "resolve",
            status,
            notes,
          }),
        },
      )
        .then(applyTradePayload)
        .then(() => {
          pushNotice(
            "Dispute resolved",
            status === "Completed"
              ? "Seller release path approved after review."
              : "Buyer refund path approved after cancellation review.",
            status === "Completed" ? "success" : "warning",
          );
        })
        .catch((error) => {
          setFormError(
            error instanceof Error ? error.message : "Could not resolve dispute.",
          );
        });
      return;
    }

    updateTrade(trade.id, status);
    appendEvent(
      trade.id,
      status === "Completed"
        ? "Admin approved seller release"
        : "Admin approved buyer refund",
      notes,
      user?.username ?? "admin",
    );
    pushNotice(
      "Dispute resolved",
      status === "Completed"
        ? "Seller release path approved after review."
        : "Buyer refund path approved after cancellation review.",
      status === "Completed" ? "success" : "warning",
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-black/10 pb-5 lg:grid-cols-[1fr_390px]">
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex w-fit items-center gap-2 border border-black/15 bg-white px-3 py-2 text-xs font-bold uppercase text-zinc-700">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                {copy.testnetBadge}
              </div>
              <LanguageSelector
                copy={copy}
                language={language}
                onChange={changeLanguage}
              />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <Image
                  alt=""
                  className="h-14 w-14 border border-black/10 bg-white p-2 shadow-[4px_4px_0_#10b981]"
                  height={56}
                  src="/piscrow-logo.svg"
                  width={56}
                />
                <h1 className="text-4xl font-black leading-none text-zinc-950 sm:text-6xl">
                  {copy.heroTitle}
                </h1>
              </div>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-700">
                {copy.heroBody}
              </p>
            </div>
          </div>

          <SessionCard
            authState={authState}
            canConnect={canConnectPi}
            connecting={connectingPi}
            copy={copy}
            user={user}
            onConnect={connectPi}
          />
        </header>

        {maintenanceEnabled && (
          <MaintenanceBanner copy={copy} message={nextPublicMaintenanceMessage} />
        )}

        {allowDemo && <DemoModeBanner copy={copy} />}

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

        {!signedIn && (
          <>
            {consentState !== "accepted" ? (
              <ConsentGate
                consentState={consentState}
                copy={copy}
                onAccept={acceptConsent}
                onReject={rejectConsent}
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
            {activeMode !== "ledger" && (
              <NotificationStack notices={notices} onDismiss={dismissNotice} />
            )}
            <PublicLedger
              trades={ledgerTrades}
              events={ledgerEvents}
              loading={ledgerLoading}
              onRefresh={refreshPublicLedger}
            />
          </>
        )}

        {signedIn && (
          <>
            <WorkspaceSwitcher
              copy={copy}
              mode={activeMode}
              mobileOpen={mobileNavOpen}
              navItems={navItems}
              username={normalizedUsername}
              onMobileOpenChange={setMobileNavOpen}
              onModeChange={changeMode}
            />

            {activeMode !== "ledger" && (
              <section className="grid gap-3 md:grid-cols-3">
                <Metric
                  icon={<Store className="h-5 w-5" />}
                  label={copy.metrics.openOffers}
                  value={trades.filter((trade) => trade.status === "Draft").length}
                />
                <Metric
                  icon={<HandCoins className="h-5 w-5" />}
                  label={copy.metrics.activeValue}
                  value={formatTestPi(activeValue)}
                />
                <Metric
                  icon={<FileWarning className="h-5 w-5" />}
                  label={copy.metrics.disputes}
                  value={trades.filter((trade) => trade.status === "Disputed").length}
                />
              </section>
            )}

            {activeMode !== "ledger" && (
              <NotificationStack notices={notices} onDismiss={dismissNotice} />
            )}

            {activeMode === "market" && (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                <OfferFeed
                  trades={buyerTrades}
                  interests={interests}
                  currentUsername={normalizedUsername}
                  expandedTradeId={expandedTradeId}
                  onExpand={setExpandedTradeId}
                  onSelect={setSelectedTradeId}
                  onSubmitInterest={submitInterest}
                  onDeclinePrivate={declinePrivateOffer}
                  onFund={fundTrade}
                  onConfirm={confirmReceipt}
                />
                <SideRail
                  trade={selectedTrade}
                  currentUsername={normalizedUsername}
                  events={events}
                  paymentState={paymentState}
                  onOpenDispute={openDispute}
                  onSubmitDisputeUpdate={submitDisputeUpdate}
                />
              </section>
            )}

            {activeMode === "sell" && (
              <section className="grid gap-5 lg:grid-cols-[430px_minmax(0,1fr)]">
                <SellerPostPanel
                  key={sellerFormResetKey}
                  username={normalizedUsername}
                  onCreateTrade={createTrade}
                />
                <SellerDesk
                  trades={sellerTrades}
                  interests={interests}
                  events={events}
                  currentUsername={normalizedUsername}
                  selectedTrade={selectedTrade}
                  onSelect={(tradeId) => {
                    setSelectedTradeId(tradeId);
                    setExpandedTradeId(tradeId);
                  }}
                  onSelectInterest={selectInterest}
                  onDeleteOffer={deleteOffer}
                  onSubmitDelivery={submitDelivery}
                  onOpenDispute={openDispute}
                  onSubmitDisputeUpdate={submitDisputeUpdate}
                />
              </section>
            )}

            {activeMode === "ledger" && (
              <PublicLedger
                trades={ledgerTrades}
                events={ledgerEvents}
                loading={ledgerLoading}
                onRefresh={refreshPublicLedger}
              />
            )}

            {activeMode === "profile" && (
              <ProfileDesk
                loading={profileLoading}
                profile={profileStats}
                trades={trades}
                username={normalizedUsername}
                onRefresh={() => void refreshProfile()}
                onRequestVerifiedBadge={() => void requestVerifiedBadge()}
              />
            )}

            {activeMode === "admin" && user?.isAdmin && (
              <AdminDesk
                trades={adminTrades}
                events={events}
                reviewLoadingTradeId={reviewLoadingTradeId}
                reviewRecommendations={reviewRecommendations}
                verificationLoading={verificationLoading}
                verificationRequests={verificationRequests}
                onApproveVerification={(request) => void approveVerifiedBadge(request)}
                onRefreshVerifications={() => void refreshVerificationRequests()}
                onRequestFollowUp={adminRequestFollowUp}
                onRunReview={runReviewRecommendation}
                onResolve={adminResolve}
              />
            )}
          </>
        )}
        <AppFooter
          feedbackStatus={feedbackStatus}
          feedbackSending={feedbackSending}
          footerDisclaimer={copy.footerDisclaimer}
          rulesLink={copy.rulesLink}
          onSubmitFeedback={submitFeedback}
        />
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

function AppFooter({
  feedbackStatus,
  feedbackSending,
  footerDisclaimer,
  rulesLink,
  onSubmitFeedback,
}: {
  feedbackStatus: FeedbackStatus;
  feedbackSending: boolean;
  footerDisclaimer: string;
  rulesLink: string;
  onSubmitFeedback: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <footer className="border-t border-black/10 py-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <section className="grid gap-4 border border-black/10 bg-white p-4">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500">Developer contact</p>
            <h2 className="mt-1 text-lg font-black text-zinc-950">
              Help improve PiScrow
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Send product issues, marketplace suggestions, payment-flow feedback,
              or hackathon review notes directly to the builder.
            </p>
          </div>
          <div className="grid gap-2 text-sm font-semibold text-zinc-700">
            <a
              className="inline-flex w-fit items-center gap-2 underline-offset-4 hover:text-emerald-800 hover:underline"
              href="mailto:coodeflowx1@gmail.com"
            >
              <Mail className="h-4 w-4" />
              coodeflowx1@gmail.com
            </a>
            <p className="inline-flex items-center gap-2">
              <AtSign className="h-4 w-4" />
              Pi username: @villari002
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs font-semibold text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <p>{footerDisclaimer}</p>
            <Link
              className="w-fit underline underline-offset-4 hover:text-zinc-950"
              href="/rules"
            >
              {rulesLink}
            </Link>
          </div>
          <p className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-normal text-zinc-500">
            Built with
            <Heart className="h-3.5 w-3.5 fill-rose-600 text-rose-600" />
            by Kamarudeen
          </p>
        </section>

        <FeedbackForm
          sending={feedbackSending}
          status={feedbackStatus}
          onSubmit={onSubmitFeedback}
        />
      </div>
    </footer>
  );
}

function FeedbackForm({
  sending,
  status,
  onSubmit,
}: {
  sending: boolean;
  status: FeedbackStatus;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="grid gap-3 border border-emerald-200 bg-white p-4"
      onSubmit={onSubmit}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-emerald-100 text-emerald-800">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-black text-zinc-950">Feedback</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Your message is saved for review. Add your email only if you want a reply.
          </p>
        </div>
      </div>
      <label className="grid gap-2">
        <span className="text-xs font-bold uppercase text-zinc-500">Type</span>
        <select
          className="h-11 border border-black/15 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-700"
          defaultValue="suggestion"
          name="category"
        >
          <option value="suggestion">Suggestion</option>
          <option value="improvement">Improvement</option>
          <option value="issue">Issue</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-bold uppercase text-zinc-500">Message</span>
        <textarea
          className="min-h-28 resize-y border border-black/15 bg-white p-3 text-sm leading-6 outline-none focus:border-emerald-700"
          maxLength={1500}
          name="message"
          placeholder="What should PiScrow improve, fix, or add next?"
        />
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-bold uppercase text-zinc-500">
          Email for reply
        </span>
        <input
          className="h-11 border border-black/15 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          name="contactEmail"
          placeholder="Optional"
          type="email"
        />
      </label>
      <button
        className="inline-flex h-11 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={sending}
        type="submit"
      >
        {sending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {sending ? "Sending" : "Send feedback"}
      </button>
      {status && (
        <p
          className={`border px-3 py-2 text-sm font-semibold leading-6 ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          {status.message}
        </p>
      )}
    </form>
  );
}

function LanguageSelector({
  copy,
  language,
  onChange,
}: {
  copy: AppCopy;
  language: LanguageCode;
  onChange: (language: LanguageCode) => void;
}) {
  return (
    <label className="grid w-full gap-1 text-xs font-bold uppercase text-zinc-500 sm:w-56">
      {copy.language}
      <select
        className="h-10 border border-black/15 bg-white px-3 text-sm font-black normal-case text-zinc-950 outline-none transition focus:border-emerald-700"
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
  user,
  onConnect,
}: {
  authState: string;
  canConnect: boolean;
  connecting: boolean;
  copy: AppCopy;
  user: SessionUser | null;
  onConnect: () => void;
}) {
  return (
    <aside className="border border-black/10 bg-white p-4 shadow-[8px_8px_0_#111827]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">{copy.session}</p>
          <p className="mt-2 text-lg font-black text-zinc-950">
            {user ? `@${user.username}` : copy.notConnected}
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 border border-zinc-950 bg-zinc-950 px-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:border-emerald-700 disabled:bg-emerald-700"
          type="button"
          onClick={onConnect}
          disabled={Boolean(user) || connecting || !canConnect}
        >
          {user ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : connecting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserRoundCheck className="h-4 w-4" />
          )}
          {user ? copy.connected : connecting ? copy.connecting : copy.connect}
        </button>
      </div>
      <p className="mt-4 border-t border-black/10 pt-4 text-sm leading-6 text-zinc-600">
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
    <section className="grid gap-5 border border-black/10 bg-white p-5 shadow-[8px_8px_0_#111827] md:grid-cols-[1fr_280px]">
      <div>
        <p className="text-xs font-bold uppercase text-zinc-500">
          {copy.privateWorkspace}
        </p>
        <h2 className="mt-3 text-2xl font-black text-zinc-950">
          {copy.signInTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          {copy.signInBody}
        </p>
        <p className="mt-4 border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
          {authState}
        </p>
        <Link
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 border border-zinc-950 bg-white px-4 text-sm font-black text-zinc-950 transition hover:bg-zinc-50 sm:w-auto"
          href="/?demo=1"
        >
          <CirclePlay className="h-4 w-4" />
          {copy.loginDemo}
        </Link>
      </div>
      <div className="flex items-center md:justify-end">
        <button
          className="inline-flex h-12 w-full items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700 md:w-auto"
          type="button"
          onClick={onConnect}
          disabled={connecting || !canConnect}
        >
          {connecting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserRoundCheck className="h-4 w-4" />
          )}
          {connecting ? `${copy.connecting}...` : copy.connectPiAccount}
        </button>
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
    <section className="flex flex-col gap-3 border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-amber-200">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black">{copy.maintenanceNotice}</p>
          <p className="mt-1 text-sm leading-6">{message}</p>
        </div>
      </div>
      <p className="text-xs font-bold uppercase tracking-normal">
        {copy.appStaysOnline}
      </p>
    </section>
  );
}

function DemoModeBanner({ copy }: { copy: AppCopy }) {
  return (
    <section className="flex flex-col gap-3 border border-sky-200 bg-sky-50 p-4 text-sky-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-sky-200">
          <CirclePlay className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black">{copy.demoWorkspace}</p>
          <p className="mt-1 text-sm leading-6">
            {copy.demoBody}
          </p>
        </div>
      </div>
      <Link
        className="inline-flex h-10 items-center justify-center border border-sky-950 bg-white px-3 text-sm font-black transition hover:bg-sky-100"
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
  onAccept,
  onReject,
}: {
  consentState: ConsentState;
  copy: AppCopy;
  onAccept: () => void;
  onReject: () => void;
}) {
  const rejected = consentState === "rejected";
  const checking = consentState === "checking";

  return (
    <section className="grid gap-5 border border-black/10 bg-white p-5 shadow-[8px_8px_0_#111827] lg:grid-cols-[1fr_340px]">
      <div>
        <p className="text-xs font-bold uppercase text-zinc-500">
          {copy.consentRequired}
        </p>
        <h2 className="mt-3 text-2xl font-black text-zinc-950">
          {copy.consentTitle}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
          {copy.consentBody}
        </p>
        <div className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-zinc-700 sm:grid-cols-2">
          {copy.consentCards.map((card) => (
            <div key={card} className="border border-black/10 bg-zinc-50 p-3">
              {card}
            </div>
          ))}
        </div>
        <Link
          className="mt-4 inline-flex text-sm font-black text-emerald-800 underline underline-offset-4 hover:text-zinc-950"
          href="/rules"
        >
          {copy.readRules}
        </Link>
      </div>
      <div className="flex flex-col justify-between gap-4 border border-black/10 bg-emerald-50 p-4">
        <div>
          <p className="text-sm font-black text-zinc-950">
            {checking
              ? copy.checkingConsent
              : rejected
                ? copy.loginDisabled
                : copy.agreeBeforeLogin}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-700">
            {rejected ? copy.rejectedBody : copy.consentBlockBody}
          </p>
        </div>
        <div className="grid gap-2">
          <button
            className="inline-flex h-12 items-center justify-center gap-2 bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700"
            disabled={checking}
            type="button"
            onClick={onAccept}
          >
            <ShieldCheck className="h-4 w-4" />
            {copy.agreeContinue}
          </button>
          <button
            className="inline-flex h-11 items-center justify-center border border-zinc-950 bg-white px-4 text-sm font-black text-zinc-950 transition hover:bg-amber-50"
            disabled={checking}
            type="button"
            onClick={onReject}
          >
            {copy.reject}
          </button>
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 border border-zinc-950 bg-white px-4 text-sm font-black text-zinc-950 transition hover:bg-zinc-50"
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

function WorkspaceSwitcher({
  copy,
  mode,
  mobileOpen,
  navItems,
  username,
  onMobileOpenChange,
  onModeChange,
}: {
  copy: AppCopy;
  mode: ViewMode;
  mobileOpen: boolean;
  navItems: ViewMode[];
  username: string;
  onMobileOpenChange: (open: boolean) => void;
  onModeChange: (mode: ViewMode) => void;
}) {
  const active = copy.views[mode];
  const Icon = viewIcons[mode];

  return (
    <section className="relative flex flex-col gap-3 border border-black/10 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-zinc-950 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-zinc-500">
            {copy.workspace}
          </p>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="truncate text-lg font-black text-zinc-950">
              {active.label}
            </h2>
            <button
              aria-expanded={mobileOpen}
              aria-label={copy.workspaceMenu}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 border border-zinc-950 bg-zinc-950 px-3 text-sm font-black text-white transition hover:bg-emerald-700 sm:hidden"
              type="button"
              onClick={() => onMobileOpenChange(true)}
            >
              <Menu className="h-4 w-4" />
              {copy.menu}
            </button>
          </div>
          <p className="mt-1 text-sm leading-6 text-zinc-600 sm:mt-0">
            {active.description}
          </p>
        </div>
      </div>
      <div
        aria-label="Switch workspace"
        className="hidden gap-1 border border-black/15 bg-zinc-50 p-1 sm:grid sm:w-auto sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none"
        role="group"
      >
        {navItems.map((item) => {
          const ItemIcon = viewIcons[item];
          const selected = mode === item;

          return (
            <button
              key={item}
              aria-pressed={selected}
              className={`inline-flex h-11 min-w-24 items-center justify-center gap-2 px-3 text-sm font-black transition ${
                selected
                  ? "bg-zinc-950 text-white shadow-[3px_3px_0_#10b981]"
                  : "text-zinc-600 hover:bg-white hover:text-zinc-950"
              }`}
              type="button"
              onClick={() => onModeChange(item)}
            >
              <ItemIcon className="h-4 w-4" />
              {copy.views[item].label}
            </button>
          );
        })}
      </div>
      {mobileOpen && (
        <div
          aria-label={copy.workspaceMenu}
          aria-modal="true"
          className="fixed inset-0 z-[80] sm:hidden"
          role="dialog"
        >
          <button
            aria-label={copy.closeWorkspaceMenu}
            className="absolute inset-0 bg-zinc-950/45"
            type="button"
            onClick={() => onMobileOpenChange(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-[72vw] min-w-[280px] max-w-[360px] flex-col border-l border-black/20 bg-white shadow-[-8px_0_0_#111827]">
            <div className="flex items-start justify-between gap-3 border-b border-black/10 p-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-emerald-700">
                  PiScrow {copy.workspace.toLowerCase()}
                </p>
                <h2 className="mt-1 truncate text-xl font-black text-zinc-950">
                  @{username || "pi-user"}
                </h2>
                <p className="mt-1 text-xs font-bold uppercase text-zinc-500">
                  {copy.testnetBadge}
                </p>
              </div>
              <button
                aria-label={copy.closeWorkspaceMenu}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-zinc-950 bg-white text-zinc-950 transition hover:bg-zinc-950 hover:text-white"
                type="button"
                onClick={() => onMobileOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="grid content-start gap-2 overflow-y-auto p-3">
              {navItems.map((item) => {
                const ItemIcon = viewIcons[item];
                const selected = mode === item;

                return (
                  <button
                    key={item}
                    aria-current={selected ? "page" : undefined}
                    className={`grid min-h-20 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 border p-3 text-left transition ${
                      selected
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-[4px_4px_0_#10b981]"
                        : "border-black/10 bg-zinc-50 text-zinc-950 hover:border-zinc-950 hover:bg-white"
                    }`}
                    type="button"
                    onClick={() => onModeChange(item)}
                  >
                    <span className="flex h-11 w-11 items-center justify-center bg-white text-zinc-950">
                      <ItemIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-black">
                        {copy.views[item].label}
                      </span>
                      <span
                        className={`mt-1 block text-xs font-semibold leading-5 ${
                          selected ? "text-zinc-200" : "text-zinc-600"
                        }`}
                      >
                        {copy.views[item].description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-black/10 bg-emerald-50 p-4">
              <div className="border border-black/10 bg-white p-2">
                <p className="text-[10px] font-bold uppercase text-zinc-500">
                  {copy.current}
                </p>
                <p className="mt-1 truncate text-sm font-black text-zinc-950">
                  {active.label}
                </p>
              </div>
              <div className="border border-black/10 bg-white p-2">
                <p className="text-[10px] font-bold uppercase text-zinc-500">
                  {copy.network}
                </p>
                <p className="mt-1 truncate text-sm font-black text-zinc-950">
                  {copy.testnet}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-black/10 bg-white p-4">
      <div className="flex items-center gap-3 text-zinc-500">
        {icon}
        <p className="text-xs font-bold uppercase">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black text-zinc-950">{value}</p>
    </div>
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
    info: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
  };

  return (
    <section
      aria-label="PiScrow notifications"
      className="fixed right-4 top-4 z-50 grid w-[calc(100vw-2rem)] max-w-sm gap-2 sm:right-6 sm:top-6"
    >
      {notices.map((notice) => (
        <article
          key={notice.id}
          className={`relative border p-3 pr-10 text-sm leading-6 shadow-[6px_6px_0_#111827] ${tones[notice.tone]}`}
        >
          <button
            aria-label={`Dismiss ${notice.title}`}
            className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center border border-black/10 bg-white/75 text-zinc-700 transition hover:bg-white hover:text-zinc-950"
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
      className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/40 px-4 py-6"
      role="alertdialog"
    >
      <div className="w-full max-w-md border border-rose-300 bg-white p-5 shadow-[10px_10px_0_#111827]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-rose-100 text-rose-800">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2
                className="text-lg font-black text-zinc-950"
                id="action-feedback-title"
              >
                Action needed
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-zinc-700">
                {message}
              </p>
            </div>
          </div>
          <button
            aria-label="Dismiss action message"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-black/10 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-950 hover:text-white"
            type="button"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700"
          type="button"
          onClick={onDismiss}
        >
          Got it
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
      className="fixed inset-0 z-[65] grid place-items-center bg-zinc-950/45 px-4 py-6"
      role="alertdialog"
    >
      <div className="w-full max-w-md border border-black/15 bg-white p-5 shadow-[10px_10px_0_#111827]">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center ${
              danger ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2
              className="text-lg font-black text-zinc-950"
              id="confirm-action-title"
            >
              {action.title}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-zinc-700">
              {action.body}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex h-11 items-center justify-center border border-zinc-950 bg-white px-4 text-sm font-black text-zinc-950 transition hover:bg-zinc-50"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`inline-flex h-11 items-center justify-center px-4 text-sm font-black text-white transition ${
              danger ? "bg-rose-700 hover:bg-rose-800" : "bg-zinc-950 hover:bg-emerald-700"
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
