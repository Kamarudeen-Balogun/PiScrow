import type { Metadata } from "next";
import Link from "next/link";

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
      "Rejecting the agreement blocks Pi login and private app actions. Public ledger viewing may remain available for transparency.",
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
    title: "Public Ledger Transparency",
    body: [
      "PiScrow may display public trade activity, public listing details, trade states, dispute states, and completion activity so the marketplace remains transparent.",
      "Private offer targeting and protected proof links are not intended for the public ledger, but trade activity may still appear in a redacted form.",
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
      "Future realtime notifications may use the same trade and account data to keep users informed about their own activity.",
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
      "PiScrow collects only app data needed to authenticate Pi users, operate listings, handle interests, process testnet payment flows, store proof, show notifications, maintain activity logs, and support admin review.",
      "PiScrow should not request wallet seed phrases, Mainnet wallet credentials, private keys, or unnecessary personal identity documents.",
      "Users can request support or deletion review through the developer contact provided in the Pi Developer Portal or app support channel.",
    ],
  },
];

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-5 text-[var(--foreground)] sm:px-6 lg:px-8">
      <article className="mx-auto grid max-w-4xl gap-5">
        <header className="border-b border-black/10 pb-5">
          <Link
            className="text-sm font-bold text-zinc-600 underline underline-offset-4 hover:text-zinc-950"
            href="/"
          >
            Back to PiScrow
          </Link>
          <p className="mt-5 text-xs font-bold uppercase text-emerald-800">
            PiScrow legal and consent notice
          </p>
          <h1 className="mt-2 text-4xl font-black leading-tight text-zinc-950 sm:text-5xl">
            Rules, Privacy, And User Agreement
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-700">
            Last updated June 7, 2026. This page is the submit-ready consent,
            privacy, and agreement reference for PiScrow Testnet/Sandbox users.
          </p>
        </header>

        <section className="border border-black/10 bg-white p-5 shadow-[8px_8px_0_#111827]">
          <h2 className="text-xl font-black text-zinc-950">
            Consent Summary
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-700">
            By clicking agree in PiScrow, you confirm that you understand this
            is a Pi Testnet/Sandbox app, you consent to the app storing the data
            needed to run trades and notifications, and you agree that uploaded
            trade proof may be reviewed by the relevant trade parties and admins.
          </p>
        </section>

        <section className="grid gap-4">
          {sections.map((section) => (
            <section key={section.title} className="border border-black/10 bg-white p-5">
              <h2 className="text-xl font-black text-zinc-950">
                {section.title}
              </h2>
              <div className="mt-3 grid gap-3 text-sm leading-6 text-zinc-700">
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
