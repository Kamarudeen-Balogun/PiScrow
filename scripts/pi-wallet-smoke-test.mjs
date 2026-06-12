import fs from "node:fs";
import path from "node:path";

import StellarSdk from "stellar-sdk";

const PI_TESTNET_HORIZON_URL = "https://api.testnet.minepi.com";
const PI_TESTNET_PASSPHRASE = "Pi Testnet";
const PI_TESTNET_BLOCK_EXPLORER_URL = "https://blockexplorer.minepi.com/testnet2";
const PI_WALLET_SEED_PATTERN = /^S[A-Z2-7]{55}$/;
const PI_WALLET_SEED_NOISE_PATTERN = /[`"'“”‘’<>()\[\]{}.,;:|\\/_-]+/g;

function loadLocalEnvFile(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);

  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const fileContents = fs.readFileSync(absolutePath, "utf8");

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (!key || process.env[key]) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function stripPiWalletPrivateSeedWrappers(seed) {
  return (seed ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[“”‘’]/g, "")
    .replace(/\\[rnt]/gi, "")
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, "");
}

function isValidPiWalletPrivateSeed(seed) {
  return PI_WALLET_SEED_PATTERN.test(seed);
}

function normalizePiWalletPrivateSeed(seed) {
  const strippedSeed = stripPiWalletPrivateSeedWrappers(seed);
  const normalizedSeed = strippedSeed.toUpperCase();

  if (isValidPiWalletPrivateSeed(normalizedSeed)) {
    return normalizedSeed;
  }

  const separatorStrippedSeed = strippedSeed
    .replace(PI_WALLET_SEED_NOISE_PATTERN, "")
    .toUpperCase();

  if (isValidPiWalletPrivateSeed(separatorStrippedSeed)) {
    return separatorStrippedSeed;
  }

  const extractedSeedMatch = separatorStrippedSeed.match(/S[A-Z2-7]{55}/);
  return extractedSeedMatch?.[0] ?? normalizedSeed;
}

function readPiWalletPrivateSeedDiagnostics(seed) {
  const normalizedSeed = normalizePiWalletPrivateSeed(seed);
  const strippedSeed = stripPiWalletPrivateSeedWrappers(seed).toUpperCase();
  const invalidCharacters = Array.from(
    new Set(
      strippedSeed
        .replace(PI_WALLET_SEED_NOISE_PATTERN, "")
        .replace(/[A-Z2-7]/g, "")
        .split("")
        .filter(Boolean),
    ),
  );

  return {
    rawLength: (seed ?? "").length,
    normalizedSeed,
    normalizedLength: normalizedSeed.length,
    hasValue: normalizedSeed.length > 0,
    startsWithS: normalizedSeed.startsWith("S"),
    hasOnlyBase32Chars: /^[A-Z2-7]+$/.test(normalizedSeed),
    invalidCharacters,
    isValid: isValidPiWalletPrivateSeed(normalizedSeed),
  };
}

function parseArgs(argv) {
  const options = {
    amount: "5",
    memo: "PiScrow wallet smoke test",
    send: false,
    to: "",
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--send") {
      options.send = true;
      continue;
    }

    if (argument === "--to") {
      options.to = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (argument === "--amount") {
      options.amount = argv[index + 1] ?? options.amount;
      index += 1;
      continue;
    }

    if (argument === "--memo") {
      options.memo = argv[index + 1] ?? options.memo;
      index += 1;
      continue;
    }

    positional.push(argument);
  }

  if (!options.to && positional[0]) {
    options.to = positional[0];
  }

  if (positional[1] && options.amount === "5") {
    options.amount = positional[1];
  }

  if (positional.length >= 3 && options.memo === "PiScrow wallet smoke test") {
    options.memo = positional.slice(2).join(" ");
  }

  if (!options.send && /^G[A-Z2-7]{55}$/.test(options.to)) {
    options.send = true;
  }

  return options;
}

async function main() {
  loadLocalEnvFile(".env.local");
  loadLocalEnvFile(".env");

  const options = parseArgs(process.argv.slice(2));
  const seedDiagnostics = readPiWalletPrivateSeedDiagnostics(
    process.env.PI_WALLET_PRIVATE_SEED,
  );

  console.log("PiScrow wallet smoke test");
  console.log(`Seed configured: ${seedDiagnostics.hasValue ? "yes" : "no"}`);
  console.log(`Raw length: ${seedDiagnostics.rawLength}`);
  console.log(`Normalized length: ${seedDiagnostics.normalizedLength}`);
  console.log(`Starts with S: ${seedDiagnostics.startsWithS ? "yes" : "no"}`);
  console.log(
    `Base32 only: ${seedDiagnostics.hasOnlyBase32Chars ? "yes" : "no"}`,
  );

  if (seedDiagnostics.invalidCharacters.length > 0) {
    console.log(
      `Invalid characters: ${seedDiagnostics.invalidCharacters.join(", ")}`,
    );
  }

  if (!seedDiagnostics.isValid) {
    console.error("Wallet seed is not valid after normalization.");
    process.exitCode = 1;
    return;
  }

  const keypair = StellarSdk.Keypair.fromSecret(seedDiagnostics.normalizedSeed);
  console.log(`Derived public key: ${keypair.publicKey()}`);

  const server = new StellarSdk.Server(PI_TESTNET_HORIZON_URL);
  const account = await server.loadAccount(keypair.publicKey());
  const nativeBalance =
    account.balances.find((balance) => balance.asset_type === "native")
      ?.balance ?? "0";

  console.log(`Native balance: ${nativeBalance} PI`);

  if (!options.send) {
    console.log("No send requested. Use --send --to <PUBLIC_KEY> to submit a payment.");
    return;
  }

  if (!options.to) {
    console.error("Missing destination. Use --to <PUBLIC_KEY>.");
    process.exitCode = 1;
    return;
  }

  const amount = Number(options.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("Amount must be a positive number.");
    process.exitCode = 1;
    return;
  }

  console.log(`Preparing payment of ${amount} PI to ${options.to}`);
  console.log(`Memo: ${options.memo}`);

  const baseFee = await server.fetchBaseFee();
  const timebounds = await server.fetchTimebounds(180);
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: baseFee.toString(),
    networkPassphrase: PI_TESTNET_PASSPHRASE,
    timebounds,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: options.to,
        asset: StellarSdk.Asset.native(),
        amount: amount.toString(),
      }),
    )
    .addMemo(StellarSdk.Memo.text(options.memo.slice(0, 28)))
    .build();

  transaction.sign(keypair);

  const submitted = await server.submitTransaction(transaction);

  console.log("Payment submitted.");
  console.log(`Transaction ID: ${submitted.id}`);
  console.log(
    `Explorer: ${PI_TESTNET_BLOCK_EXPLORER_URL}/tx/${encodeURIComponent(submitted.hash)}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
