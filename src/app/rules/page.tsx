import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BellRing,
  FileLock2,
  Gavel,
  Globe2,
  Handshake,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

export const metadata: Metadata = {
  title: "PiScrow Rules, Privacy, And Consent",
  description:
    "Rules, privacy notice, consent terms, and user agreement for PiScrow Testnet.",
};

type RuleSection = {
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  body: string[];
};

const sections: RuleSection[] = [
  {
    title: "Testnet Disclaimer",
    eyebrow: "Environment",
    icon: Globe2,
    body: [
      "PiScrow runs on Pi Testnet and Pi Sandbox. It is not a Mainnet escrow service and it does not hold Mainnet Pi.",
      "Testnet payments, balances, listings, disputes, and fees exist for product validation, hackathon review, and beta testing only.",
    ],
  },
  {
    title: "Account And Login Consent",
    eyebrow: "Access",
    icon: ShieldCheck,
    body: [
      "To use seller, buyer, funding, proof upload, notification, and dispute features, you must sign in through Pi Browser and accept these rules.",
      "PiScrow may store the Pi username, Pi UID, app session state, role activity, and admin status needed to run the app.",
      "If you reject the agreement, PiScrow blocks Pi login and private app actions until you accept the rules and consent terms.",
    ],
  },
  {
    title: "Trade Rules",
    eyebrow: "Marketplace",
    icon: Handshake,
    body: [
      "Sellers can create public offers or private offers aimed at one Pi username. Buyers can show interest only in offers they are allowed to join.",
      "A seller cannot join their own offer as a buyer.",
      "The seller reviews buyer responses and picks one buyer. That buyer must fund the testnet payment before delivery moves forward.",
      "Trade locations, pickup zones, delivery terms, and confirmation rules should be clear enough for both parties and admins to understand the deal.",
    ],
  },
  {
    title: "Proof Upload Consent",
    eyebrow: "Evidence",
    icon: FileLock2,
    body: [
      "You may upload package, delivery, receipt, or dispute proof images. The seller, selected buyer, and approved PiScrow admins may review that proof.",
      "Do not upload private documents, payment secrets, wallet seed phrases, identity documents, or images that do not belong to the trade.",
      "PiScrow stores proof images for trade review and dispute resolution. Access may be limited, but you should treat trade evidence as visible to the people involved in that trade.",
    ],
  },
  {
    title: "Public Activity And Transparency",
    eyebrow: "Visibility",
    icon: Globe2,
    body: [
      "PiScrow may show public trade activity, public listing details, trade states, dispute states, and completion activity so the marketplace stays transparent.",
      "Private offer targeting and protected proof links should not appear in the public activity feed, but trade activity may still appear in redacted form.",
    ],
  },
  {
    title: "Platform Fees",
    eyebrow: "Payments",
    icon: WalletCards,
    body: [
      "PiScrow can calculate and show the fee for a testnet transaction before funding.",
      "Platform fee totals are internal operating data and do not need to appear publicly inside the app.",
    ],
  },
  {
    title: "Notifications",
    eyebrow: "Alerts",
    icon: BellRing,
    body: [
      "PiScrow may show in-app notifications for login, private requests, buyer interest, seller selection, payment status, proof uploads, disputes, admin actions, and completed trades.",
      "Realtime and Telegram notifications may use the same trade and account data to keep you informed about your own activity.",
    ],
  },
  {
    title: "Feedback And Support",
    eyebrow: "Support",
    icon: BellRing,
    body: [
      "You may submit feedback, suggestions, issues, and an optional contact email through the PiScrow feedback form.",
      "PiScrow stores feedback for developer review and may forward it to a configured webhook or notification channel so the developer can respond.",
      "Do not include wallet seed phrases, private keys, payment secrets, identity documents, or unrelated personal information in feedback messages.",
    ],
  },
  {
    title: "Admin Review And Disputes",
    eyebrow: "Moderation",
    icon: Gavel,
    body: [
      "Approved PiScrow admins can review disputed trades, proof uploads, event logs, and party activity before marking a trade completed or cancelled.",
      "Admin review supports fair testnet marketplace testing. It is not legal arbitration or a regulated escrow service.",
    ],
  },
  {
    title: "Privacy And Data Use",
    eyebrow: "Data",
    icon: ShieldCheck,
    body: [
      "PiScrow collects only the app data needed to authenticate Pi users, run listings, handle interests, process testnet payments, store proof, show notifications, keep activity logs, receive feedback, and support admin review.",
      "PiScrow should not ask for wallet seed phrases, Mainnet wallet credentials, private keys, or unnecessary identity documents.",
      "You can request support or deletion review through coodeflowx1@gmail.com or the developer Pi username @villari002.",
    ],
  },
];

const quickFacts = [
  "PiScrow is a Pi Testnet and Pi Sandbox product, not a Mainnet escrow service.",
  "Pi Browser sign-in and agreement acceptance are required before private trade actions unlock.",
  "Trade proof can be reviewed by the selected trade parties and approved PiScrow admins.",
  "Admins can review disputes and trade evidence, but this is platform testing rather than legal arbitration.",
];

function toSectionId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function RulesPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(91,37,159,0.2),transparent_28%),linear-gradient(180deg,#060c18_0%,#091321_100%)] px-4 py-5 text-[var(--foreground)] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-20 h-52 w-52 rounded-full bg-[rgba(91,37,159,0.14)] blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-64 w-64 rounded-full bg-[rgba(245,166,35,0.1)] blur-3xl" />
        <div className="absolute bottom-10 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[rgba(44,120,255,0.08)] blur-3xl" />
      </div>

      <article className="relative mx-auto grid max-w-6xl gap-5 pb-8">
        <header className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <section className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,30,51,0.94),rgba(11,23,40,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:p-7">
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:border-[rgba(245,166,35,0.28)] hover:text-white"
              href="/"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to PiScrow
            </Link>

            <div className="mt-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(91,37,159,0.92),rgba(245,166,35,0.92))] text-white shadow-[0_18px_40px_rgba(91,37,159,0.28)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--gold)]">
                  Rules, Privacy, And Consent
                </p>
                <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
                  PiScrow User Agreement
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                  Last updated June 10, 2026. This page is the main rules,
                  privacy, and consent reference for PiScrow Testnet and
                  Sandbox users.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {quickFacts.map((fact) => (
                <div
                  key={fact}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200"
                >
                  {fact}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-[rgba(245,166,35,0.16)] bg-[linear-gradient(180deg,rgba(245,166,35,0.12),rgba(245,166,35,0.04))] p-5 shadow-[0_18px_48px_rgba(245,166,35,0.08)] sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--gold)]">
              Consent Summary
            </p>
            <p className="mt-3 text-sm leading-7 text-amber-50/90">
              If you click agree in PiScrow, you confirm that you understand
              this is a Pi Testnet and Sandbox app, you consent to the app
              storing the data needed to run trades and notifications, and you
              accept that the relevant trade parties and approved admins may
              review uploaded trade proof.
            </p>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-[rgba(7,16,29,0.34)] p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">
                What This Page Covers
              </p>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-200 sm:grid-cols-2 lg:grid-cols-1">
                {sections.slice(0, 4).map((section) => {
                  const Icon = section.icon;

                  return (
                    <div
                      key={section.title}
                      className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[var(--gold)]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {section.eyebrow}
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {section.title}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </header>

        <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,27,46,0.9),rgba(9,19,33,0.96))] p-5 shadow-[0_20px_64px_rgba(0,0,0,0.22)] lg:sticky lg:top-5 lg:self-start">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--gold)]">
              Quick Navigation
            </p>
            <h2 className="mt-3 text-xl font-black text-white">
              Scan the agreement by topic
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Jump to the section you need, then read the full terms in the
              matching card.
            </p>

            <nav className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {sections.map((section, index) => (
                <a
                  key={section.title}
                  className="group flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:border-[rgba(245,166,35,0.26)] hover:bg-white/[0.05]"
                  href={`#${toSectionId(section.title)}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[rgba(245,166,35,0.08)] text-xs font-black text-[var(--gold)]">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 transition group-hover:text-slate-300">
                      {section.eyebrow}
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-5 text-white">
                      {section.title}
                    </span>
                  </span>
                </a>
              ))}
            </nav>
          </aside>

          <div className="grid gap-4">
            {sections.map((section, index) => {
              const Icon = section.icon;

              return (
                <section
                  id={toSectionId(section.title)}
                  key={section.title}
                  className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,30,51,0.96),rgba(11,23,40,0.98))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-6"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(245,166,35,0.92),rgba(255,255,255,0.24),transparent)]" />

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(245,166,35,0.14),rgba(91,37,159,0.16))] text-[var(--gold)] shadow-[0_16px_36px_rgba(0,0,0,0.16)]">
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {section.eyebrow}
                        </p>
                        <h2 className="mt-1 text-xl font-black text-white sm:text-[1.35rem]">
                          {section.title}
                        </h2>
                      </div>
                    </div>

                    <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-300">
                      Section {(index + 1).toString().padStart(2, "0")}
                    </div>
                  </div>

                  <ul className="mt-5 grid gap-3">
                    {section.body.map((paragraph) => (
                      <li
                        key={paragraph}
                        className="flex items-start gap-3 rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-3 text-sm leading-7 text-slate-300"
                      >
                        <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
                        <span>{paragraph}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>
      </article>
    </main>
  );
}
