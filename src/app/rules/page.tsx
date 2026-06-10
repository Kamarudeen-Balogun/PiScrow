import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "PiScrow Rules, Privacy, And Consent",
  description:
    "PiScrow testnet rules, privacy notice, consent terms, and user agreement.",
};

const sections = [
  {
    title: "Testnet Disclaimer",
    body: [
      "PiScrow is built for Pi Testnet and Pi Sandbox testing. It is not a Mainnet Pi escrow service and does not custody Mainnet Pi.",
      "Testnet payments, balances, listings, disputes, and platform fees are for product validation, hackathon review, and beta testing only.",
    ],
  },
  {
    title: "Account And Login Consent",
    body: [
      "To use seller, buyer, funding, proof upload, notification, and dispute features, users must connect through Pi Browser and agree to these rules.",
      "PiScrow may store the Pi username, Pi UID, app session state, role activity, and admin status needed to operate the app.",
      "Rejecting the agreement blocks Pi login and private app actions until the user accepts the rules and consent terms.",
    ],
  },
  {
    title: "Trade Rules",
    body: [
      "Sellers create public offers or private offers targeted to one Pi username. Buyers can show interest only in eligible offers.",
      "A seller cannot participate as a buyer in the same offer they created.",
      "The seller reviews buyer responses and selects the buyer they want to trade with. The selected buyer is expected to fund the testnet payment before delivery continues.",
      "Trade locations, pickup zones, delivery terms, and confirmation rules should be clear enough for both parties and admins to understand the agreement.",
    ],
  },
  {
    title: "Proof Upload Consent",
    body: [
      "Users may upload package, delivery, receipt, or dispute proof images. Uploaded proof may be reviewed by the seller, selected buyer, and approved PiScrow admins.",
      "Users should not upload private documents, payment secrets, wallet seed phrases, identity documents, or images unrelated to the trade.",
      "Proof images are stored for trade review and dispute resolution. Access may be limited, but users should treat uploaded trade evidence as visible to the parties involved in that trade.",
    ],
  },
  {
    title: "Public Activity And Transparency",
    body: [
      "PiScrow may display public trade activity, public listing details, trade states, dispute states, and completion activity so the marketplace remains transparent.",
      "Private offer targeting and protected proof links are not intended for the public activity feed, but trade activity may still appear in a redacted form.",
    ],
  },
  {
    title: "Platform Fees",
    body: [
      "PiScrow can calculate and display the fee for an individual testnet transaction before funding.",
      "Platform fee totals are internal operating information and do not need to be shown publicly inside the app.",
    ],
  },
  {
    title: "Notifications",
    body: [
      "PiScrow may show in-app notifications for login, private requests, buyer interest, seller selection, payment status, proof uploads, disputes, admin actions, and completed trades.",
      "Future realtime and Telegram notifications may use the same trade and account data to keep users informed about their own activity.",
    ],
  },
  {
    title: "Feedback And Support",
    body: [
      "Users may submit feedback, suggestions, issues, and optional contact email through the PiScrow feedback form.",
      "Feedback is stored for developer review and may be forwarded to a configured automation webhook or notification channel so the developer can receive and respond to reports.",
      "Users should not include wallet seed phrases, private keys, payment secrets, identity documents, or unrelated personal information in feedback messages.",
    ],
  },
  {
    title: "Admin Review And Disputes",
    body: [
      "Approved PiScrow admins can review disputed trades, proof uploads, event logs, and party activity before marking a trade completed or cancelled.",
      "Admin review is designed to support fair testnet marketplace testing. It is not legal arbitration or a regulated escrow service.",
    ],
  },
  {
    title: "Privacy And Data Use",
    body: [
      "PiScrow collects only app data needed to authenticate Pi users, operate listings, handle interests, process testnet payment flows, store proof, show notifications, maintain activity logs, receive feedback, and support admin review.",
      "PiScrow should not request wallet seed phrases, Mainnet wallet credentials, private keys, or unnecessary personal identity documents.",
      "Users can request support or deletion review through coodeflowx1@gmail.com or the developer Pi username @villari002.",
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
                Last updated June 10, 2026. This page is the official rules,
                privacy, and acknowledgement reference for PiScrow Testnet and
                Sandbox users.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-[26px] border border-[rgba(245,166,35,0.16)] bg-[linear-gradient(180deg,rgba(245,166,35,0.1),rgba(245,166,35,0.04))] p-5 shadow-[0_18px_48px_rgba(245,166,35,0.08)] sm:p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--gold)]">
            Consent Summary
          </p>
          <p className="mt-3 text-sm leading-7 text-amber-50/90">
            By clicking agree in PiScrow, you confirm that you understand this
            is a Pi Testnet and Sandbox app, you consent to the app storing the
            data needed to run trades and notifications, and you agree that
            uploaded trade proof may be reviewed by the relevant trade parties
            and approved admins.
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
