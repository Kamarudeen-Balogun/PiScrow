import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "PiScrow Rules, Privacy, And Consent",
  description:
    "Rules, privacy notice, consent terms, and user agreement for PiScrow Testnet.",
};

const sections = [
  {
    title: "Testnet Disclaimer",
    body: [
      "PiScrow runs on Pi Testnet and Pi Sandbox. It is not a Mainnet escrow service and it does not hold Mainnet Pi.",
      "Testnet payments, balances, listings, disputes, and fees exist for product validation, hackathon review, and beta testing only.",
    ],
  },
  {
    title: "Account And Login Consent",
    body: [
      "To use seller, buyer, funding, proof upload, notification, and dispute features, you must sign in through Pi Browser and accept these rules.",
      "PiScrow may store the Pi username, Pi UID, app session state, role activity, and admin status needed to run the app.",
      "If you reject the agreement, PiScrow blocks Pi login and private app actions until you accept the rules and consent terms.",
    ],
  },
  {
    title: "Trade Rules",
    body: [
      "Sellers can create public offers or private offers aimed at one Pi username. Buyers can show interest only in offers they are allowed to join.",
      "A seller cannot join their own offer as a buyer.",
      "The seller reviews buyer responses and picks one buyer. That buyer must fund the testnet payment before delivery moves forward.",
      "Trade locations, pickup zones, delivery terms, and confirmation rules should be clear enough for both parties and admins to understand the deal.",
    ],
  },
  {
    title: "Proof Upload Consent",
    body: [
      "You may upload package, delivery, receipt, or dispute proof images. The seller, selected buyer, and approved PiScrow admins may review that proof.",
      "Do not upload private documents, payment secrets, wallet seed phrases, identity documents, or images that do not belong to the trade.",
      "PiScrow stores proof images for trade review and dispute resolution. Access may be limited, but you should treat trade evidence as visible to the people involved in that trade.",
    ],
  },
  {
    title: "Public Activity And Transparency",
    body: [
      "PiScrow may show public trade activity, public listing details, trade states, dispute states, and completion activity so the marketplace stays transparent.",
      "Private offer targeting and protected proof links should not appear in the public activity feed, but trade activity may still appear in redacted form.",
    ],
  },
  {
    title: "Platform Fees",
    body: [
      "PiScrow can calculate and show the fee for a testnet transaction before funding.",
      "Platform fee totals are internal operating data and do not need to appear publicly inside the app.",
    ],
  },
  {
    title: "Notifications",
    body: [
      "PiScrow may show in-app notifications for login, private requests, buyer interest, seller selection, payment status, proof uploads, disputes, admin actions, and completed trades.",
      "Realtime and Telegram notifications may use the same trade and account data to keep you informed about your own activity.",
    ],
  },
  {
    title: "Feedback And Support",
    body: [
      "You may submit feedback, suggestions, issues, and an optional contact email through the PiScrow feedback form.",
      "PiScrow stores feedback for developer review and may forward it to a configured webhook or notification channel so the developer can respond.",
      "Do not include wallet seed phrases, private keys, payment secrets, identity documents, or unrelated personal information in feedback messages.",
    ],
  },
  {
    title: "Admin Review And Disputes",
    body: [
      "Approved PiScrow admins can review disputed trades, proof uploads, event logs, and party activity before marking a trade completed or cancelled.",
      "Admin review supports fair testnet marketplace testing. It is not legal arbitration or a regulated escrow service.",
    ],
  },
  {
    title: "Privacy And Data Use",
    body: [
      "PiScrow collects only the app data needed to authenticate Pi users, run listings, handle interests, process testnet payments, store proof, show notifications, keep activity logs, receive feedback, and support admin review.",
      "PiScrow should not ask for wallet seed phrases, Mainnet wallet credentials, private keys, or unnecessary identity documents.",
      "You can request support or deletion review through coodeflowx1@gmail.com or the developer Pi username @villari002.",
    ],
  },
];

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,37,159,0.18),transparent_28%),linear-gradient(180deg,#060c18_0%,#091321_100%)] px-4 py-5 text-[var(--foreground)] sm:px-6 lg:px-8">
      <article className="mx-auto grid max-w-5xl gap-4 pb-6">
        <header className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,30,51,0.94),rgba(11,23,40,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:p-7">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:border-[rgba(245,166,35,0.28)] hover:text-white"
            href="/"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to PiScrow
          </Link>

          <div className="mt-5 flex items-start gap-4">
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
                privacy, and consent reference for PiScrow Testnet and Sandbox
                users.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-[26px] border border-[rgba(245,166,35,0.16)] bg-[linear-gradient(180deg,rgba(245,166,35,0.1),rgba(245,166,35,0.04))] p-5 shadow-[0_18px_48px_rgba(245,166,35,0.08)] sm:p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--gold)]">
            Consent Summary
          </p>
          <p className="mt-3 text-sm leading-7 text-amber-50/90">
            If you click agree in PiScrow, you confirm that you understand this
            is a Pi Testnet and Sandbox app, you consent to the app storing the
            data needed to run trades and notifications, and you accept that
            the relevant trade parties and approved admins may review uploaded
            trade proof.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,30,51,0.96),rgba(11,23,40,0.98))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]"
            >
              <h2 className="text-lg font-black text-white">{section.title}</h2>
              <div className="mt-4 grid gap-3 text-sm leading-7 text-slate-300">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </section>
      </article>
    </main>
  );
}
