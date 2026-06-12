import type { LanguageCode } from "@/lib/language";

export type WorkspaceCopy = {
  buyerDesk: {
    openOffers: string;
    activePi: string;
    disputes: string;
    myInterests: string;
    activeEscrows: string;
    noBuyerInterests: string;
    noEscrows: string;
  };
  sellerDesk: {
    myListings: string;
    newListing: string;
    noSellerOffers: string;
  };
  publicLedger: {
    liveActivity: string;
    close: string;
    searchListings: string;
    filters: Record<"All" | "Digital Assets" | "Physical Goods" | "Services", string>;
    liveLedger: string;
    activity: string;
    refresh: string;
    refreshing: string;
    noMatches: string;
  };
  admin: {
    totalTrades: string;
    disputes: string;
    resolved: string;
    disputeQueue: string;
    activeCount: (count: number) => string;
    noDisputes: string;
    unselectedBuyer: string;
    buyerSellerLine: (buyer: string, seller: string) => string;
    atStake: string;
    enterDisputeRoom: string;
    releaseToSeller: string;
    refundBuyer: string;
  };
  trade: {
    deleteTrade: string;
    deleteOffer: string;
    buyerResponses: string;
    noBuyerResponses: string;
    declinePrivateRequest: string;
    optionalBuyerNote: string;
    submitInterest: string;
    interestedBuyers: (count: number) => string;
    connectedResponses: (count: number) => string;
    deliveryTerms: string;
    ownListingInfo: string;
    yourResponse: (status: string) => string;
    selectBuyer: string;
    changeBuyer: string;
    reselectBuyer: string;
    sellerPackageProof: string;
    sellerProofImage: string;
    buyerReceiptProof: string;
    buyerReceiptImage: string;
    locationNotProvided: string;
    buyerFunds: string;
  };
  escrowTracker: {
    offerAccepted: string;
    fundEscrow: string;
    deliveryInProgress: string;
    adminReleaseReview: string;
    releaseFunds: string;
    completedOrActive: string;
    waitingForNextAction: string;
    chat: string;
    reviewProof: string;
    inProgress: string;
    chatAfterFunding: string;
    escrowTotal: string;
    fund: (amount: string) => string;
  };
  chat: {
    title: string;
    disputeActive: string;
    tradeRoomInfo: string;
    secureRoomReady: string;
    secureRoomOnDemand: string;
    messagesRecorded: (count: number) => string;
    noMessages: string;
    disputeRoom: string;
    tradeRoom: string;
    latestUpdate: string;
    proofImageUploaded: string;
    claimedBy: (username: string) => string;
    noReleaseRoomAdmin: string;
    noDisputeRoomAdmin: string;
    openFullConversation: string;
    openSecureChat: string;
    joinRoom: string;
    anotherAdminRelease: string;
    anotherAdminDispute: string;
    openFullScreenHelp: string;
    readOnlyHelp: string;
  };
  profile: {
    profileNotReady: string;
    trustScore: (score: number) => string;
    trades: string;
    done: string;
    inAppNotifications: string;
    telegramAlerts: string;
    payoutReadiness: string;
    achievementBadges: string;
    refreshProfile: string;
    signOut: string;
    verifiedBadgeActive: string;
    badgeRequestPending: string;
    requestVerifiedBadge: string;
    tradeHistory: string;
  };
  verification: {
    queue: string;
    title: string;
    refresh: string;
    noRequests: string;
    statsLine: (successful: number, disputed: number, cancelled: number) => string;
    approveBadge: string;
  };
  review: {
    title: string;
    body: string;
    review: string;
    confidence: (confidence: number) => string;
    missingEvidence: string;
    riskFlags: string;
  };
};

const en: WorkspaceCopy = {
  buyerDesk: {
    openOffers: "Open Offers",
    activePi: "Active Pi",
    disputes: "Disputes",
    myInterests: "My Interests",
    activeEscrows: "Active Escrows",
    noBuyerInterests:
      "No interests yet. Open a listing from Explore and send one.",
    noEscrows: "No funded or selected escrows yet.",
  },
  sellerDesk: {
    myListings: "My Listings",
    newListing: "New Listing",
    noSellerOffers: "No listings yet. Create one to start trading.",
  },
  publicLedger: {
    liveActivity: "Live Activity",
    close: "Close",
    searchListings: "Search listings...",
    filters: {
      All: "All",
      "Physical Goods": "Physical Goods",
      Services: "Services",
      "Digital Assets": "Digital Assets",
    },
    liveLedger: "Live Ledger",
    activity: "Activity",
    refresh: "Refresh",
    refreshing: "Refreshing",
    noMatches: "No ledger activity matches this filter.",
  },
  admin: {
    totalTrades: "Total Trades",
    disputes: "Disputes",
    resolved: "Resolved",
    disputeQueue: "Dispute Queue",
    activeCount: (count) => `${count} active`,
    noDisputes: "No disputed trades waiting for admin review.",
    unselectedBuyer: "unselected",
    buyerSellerLine: (buyer, seller) => `Buyer: @${buyer} · Seller: @${seller}`,
    atStake: "at stake",
    enterDisputeRoom: "Enter Dispute Room",
    releaseToSeller: "Release to seller",
    refundBuyer: "Refund buyer",
  },
  trade: {
    deleteTrade: "Delete trade",
    deleteOffer: "Delete offer",
    buyerResponses: "Buyer Responses",
    noBuyerResponses: "No buyer responses yet.",
    declinePrivateRequest: "Decline private request",
    optionalBuyerNote: "Optional note to help the seller choose you.",
    submitInterest: "Submit Interest",
    interestedBuyers: (count) => `${count} interested buyers`,
    connectedResponses: (count) => `${count} response(s) connected to this listing.`,
    deliveryTerms: "Delivery terms",
    ownListingInfo:
      "This is your listing. You can view it publicly, but you cannot show interest in your own trade.",
    yourResponse: (status) => `Your response is ${status.toLowerCase()}.`,
    selectBuyer: "Select buyer",
    changeBuyer: "Change buyer",
    reselectBuyer: "Reselect buyer",
    sellerPackageProof: "Seller package proof",
    sellerProofImage: "Seller proof image",
    buyerReceiptProof: "Buyer receipt proof",
    buyerReceiptImage: "Buyer receipt image",
    locationNotProvided: "Location not provided",
    buyerFunds: "Buyer funds",
  },
  escrowTracker: {
    offerAccepted: "Offer accepted",
    fundEscrow: "Fund escrow",
    deliveryInProgress: "Delivery in progress",
    adminReleaseReview: "Admin release review",
    releaseFunds: "Release funds",
    completedOrActive: "Completed or active",
    waitingForNextAction: "Waiting for next action",
    chat: "Chat",
    reviewProof: "Review proof",
    inProgress: "In progress",
    chatAfterFunding: "Trade chat opens after buyer funding clears.",
    escrowTotal: "escrow total",
    fund: (amount) => `Fund ${amount}`,
  },
  chat: {
    title: "Trade Chat",
    disputeActive:
      "Dispute is open. Keep replies, proof, and admin decisions in this room.",
    tradeRoomInfo:
      "Use this room for delivery updates, proof, and buyer-seller coordination.",
    secureRoomReady: "Secure room is ready",
    secureRoomOnDemand: "Secure room will open on demand",
    messagesRecorded: (count) => `${count} messages recorded for this trade.`,
    noMessages: "No messages yet. Open the full chat when you need it.",
    disputeRoom: "Dispute room",
    tradeRoom: "Trade room",
    latestUpdate: "Latest update",
    proofImageUploaded: "Proof image uploaded in chat.",
    claimedBy: (username) => `Claimed by @${username}`,
    noReleaseRoomAdmin: "No admin has joined this release review room yet.",
    noDisputeRoomAdmin: "No admin has joined this dispute room yet.",
    openFullConversation: "Open full conversation",
    openSecureChat: "Open secure chat",
    joinRoom: "Join room",
    anotherAdminRelease:
      "Another admin has this release review room. You can still read the timeline.",
    anotherAdminDispute:
      "Another admin has this dispute room. You can still read the timeline.",
    openFullScreenHelp:
      "Open the full-screen chat to read the full conversation, send proof, and reply.",
    readOnlyHelp: "This room becomes read-only after the trade is completed or cancelled.",
  },
  profile: {
    profileNotReady: "Profile data is not ready yet.",
    trustScore: (score) => `${score}% Trust Score`,
    trades: "Trades",
    done: "Done",
    inAppNotifications: "In-app Notifications",
    telegramAlerts: "Telegram Alerts",
    payoutReadiness: "Payout Readiness",
    achievementBadges: "Achievement Badges",
    refreshProfile: "Refresh profile",
    signOut: "Sign out",
    verifiedBadgeActive: "Verified badge active",
    badgeRequestPending: "Badge request pending",
    requestVerifiedBadge: "Request verified badge",
    tradeHistory: "Trade history",
  },
  verification: {
    queue: "Verification queue",
    title: "Verified Badge Requests",
    refresh: "Refresh",
    noRequests: "No badge requests waiting.",
    statsLine: (successful, disputed, cancelled) =>
      `${successful} successful / ${disputed} disputed / ${cancelled} cancelled`,
    approveBadge: "Approve badge",
  },
  review: {
    title: "Review copilot",
    body: "This recommendation helps admins review a trade. It cannot release funds or close a trade on its own.",
    review: "Review",
    confidence: (confidence) => `${confidence}% confidence`,
    missingEvidence: "Missing evidence",
    riskFlags: "Risk flags",
  },
};

const pcm: WorkspaceCopy = {
  buyerDesk: {
    openOffers: "Open offers",
    activePi: "Active Pi",
    disputes: "Disputes",
    myInterests: "My interests",
    activeEscrows: "Active escrows",
    noBuyerInterests:
      "No interest yet. Open one listing for Explore make you send your own.",
    noEscrows: "No funded or selected escrow yet.",
  },
  sellerDesk: {
    myListings: "My listings",
    newListing: "New listing",
    noSellerOffers: "No listing yet. Create one make trade start.",
  },
  publicLedger: {
    liveActivity: "Live activity",
    close: "Close",
    searchListings: "Search listings...",
    filters: {
      All: "All",
      "Physical Goods": "Physical goods",
      Services: "Services",
      "Digital Assets": "Digital assets",
    },
    liveLedger: "Live ledger",
    activity: "Activity",
    refresh: "Refresh",
    refreshing: "Refreshing",
    noMatches: "No ledger activity match this filter.",
  },
  admin: {
    totalTrades: "Total trades",
    disputes: "Disputes",
    resolved: "Resolved",
    disputeQueue: "Dispute queue",
    activeCount: (count) => `${count} active`,
    noDisputes: "No disputed trade dey wait for admin review.",
    unselectedBuyer: "never select",
    buyerSellerLine: (buyer, seller) => `Buyer: @${buyer} · Seller: @${seller}`,
    atStake: "wey dey stake",
    enterDisputeRoom: "Enter dispute room",
    releaseToSeller: "Release to seller",
    refundBuyer: "Refund buyer",
  },
  trade: {
    deleteTrade: "Delete trade",
    deleteOffer: "Delete offer",
    buyerResponses: "Buyer responses",
    noBuyerResponses: "No buyer response yet.",
    declinePrivateRequest: "Decline private request",
    optionalBuyerNote: "Optional note wey fit help seller choose you.",
    submitInterest: "Submit interest",
    interestedBuyers: (count) => `${count} buyer show interest`,
    connectedResponses: (count) => `${count} response(s) connect to this listing.`,
    deliveryTerms: "Delivery terms",
    ownListingInfo:
      "This na your listing. You fit view am publicly, but you no fit show interest for your own trade.",
    yourResponse: (status) => `Your response dey ${status.toLowerCase()}.`,
    selectBuyer: "Select buyer",
    changeBuyer: "Change buyer",
    reselectBuyer: "Reselect buyer",
    sellerPackageProof: "Seller package proof",
    sellerProofImage: "Seller proof image",
    buyerReceiptProof: "Buyer receipt proof",
    buyerReceiptImage: "Buyer receipt image",
    locationNotProvided: "Location no dey provided",
    buyerFunds: "Buyer funds",
  },
  escrowTracker: {
    offerAccepted: "Offer accepted",
    fundEscrow: "Fund escrow",
    deliveryInProgress: "Delivery dey happen",
    adminReleaseReview: "Admin release review",
    releaseFunds: "Release funds",
    completedOrActive: "Completed or active",
    waitingForNextAction: "Dey wait for next action",
    chat: "Chat",
    reviewProof: "Review proof",
    inProgress: "In progress",
    chatAfterFunding: "Trade chat go open after buyer funding clear.",
    escrowTotal: "escrow total",
    fund: (amount) => `Fund ${amount}`,
  },
  chat: {
    title: "Trade chat",
    disputeActive:
      "Dispute don open. Keep reply, proof, and admin decision inside this room.",
    tradeRoomInfo:
      "Use this room for delivery update, proof, and buyer-seller coordination.",
    secureRoomReady: "Secure room don ready",
    secureRoomOnDemand: "Secure room go open when you need am",
    messagesRecorded: (count) => `${count} message don record for this trade.`,
    noMessages: "No message yet. Open full chat when you need am.",
    disputeRoom: "Dispute room",
    tradeRoom: "Trade room",
    latestUpdate: "Latest update",
    proofImageUploaded: "Proof image don upload for chat.",
    claimedBy: (username) => `Claimed by @${username}`,
    noReleaseRoomAdmin: "No admin never join this release review room yet.",
    noDisputeRoomAdmin: "No admin never join this dispute room yet.",
    openFullConversation: "Open full conversation",
    openSecureChat: "Open secure chat",
    joinRoom: "Join room",
    anotherAdminRelease:
      "Another admin don take this release review room. You still fit read the timeline.",
    anotherAdminDispute:
      "Another admin don take this dispute room. You still fit read the timeline.",
    openFullScreenHelp:
      "Open full-screen chat make you read full conversation, send proof, and reply.",
    readOnlyHelp: "This room go turn read-only after the trade complete or cancel.",
  },
  profile: {
    profileNotReady: "Profile data never ready yet.",
    trustScore: (score) => `${score}% Trust score`,
    trades: "Trades",
    done: "Done",
    inAppNotifications: "In-app notifications",
    telegramAlerts: "Telegram alerts",
    payoutReadiness: "Payout readiness",
    achievementBadges: "Achievement badges",
    refreshProfile: "Refresh profile",
    signOut: "Sign out",
    verifiedBadgeActive: "Verified badge don active",
    badgeRequestPending: "Badge request still pending",
    requestVerifiedBadge: "Request verified badge",
    tradeHistory: "Trade history",
  },
  verification: {
    queue: "Verification queue",
    title: "Verified badge requests",
    refresh: "Refresh",
    noRequests: "No badge request dey wait.",
    statsLine: (successful, disputed, cancelled) =>
      `${successful} successful / ${disputed} disputed / ${cancelled} cancelled`,
    approveBadge: "Approve badge",
  },
  review: {
    title: "Review copilot",
    body: "This recommendation help admin review trade. E no fit release funds or close trade by itself.",
    review: "Review",
    confidence: (confidence) => `${confidence}% confidence`,
    missingEvidence: "Missing evidence",
    riskFlags: "Risk flags",
  },
};

const copyByLanguage: Partial<Record<LanguageCode, WorkspaceCopy>> = {
  en,
  pcm,
};

export function getWorkspaceCopy(language: LanguageCode) {
  return copyByLanguage[language] ?? en;
}
