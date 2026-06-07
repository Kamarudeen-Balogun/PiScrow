import { z } from "zod";

const piUsernameListSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.join(",");
  }

  return value;
}, z
  .string()
  .trim()
  .max(64, "Private buyer username is too long.")
  .default("")
  .transform((value) =>
    [...new Set(
      value
        .split(/[\n,]/)
        .map((username) => username.trim().replace(/^@+/, "").toLowerCase())
        .filter(Boolean),
    )].slice(0, 1),
  ));

export const createTradeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(4, "Trade title is required.")
    .max(90, "Keep the trade title under 90 characters."),
  amountTestPi: z.coerce
    .number()
    .positive("Amount must be greater than zero.")
    .max(1000, "MVP trades are capped at 1,000 Test Pi."),
  description: z
    .string()
    .trim()
    .min(12, "Add a short description of the item or service.")
    .max(600, "Keep the description under 600 characters."),
  locationLabel: z
    .string()
    .trim()
    .min(2, "Add the trade location.")
    .max(120, "Keep the location under 120 characters."),
  locationArea: z
    .string()
    .trim()
    .max(120, "Keep the area under 120 characters.")
    .optional()
    .or(z.literal("")),
  deliveryTerms: z
    .string()
    .trim()
    .min(12, "Delivery terms are required.")
    .max(600, "Keep delivery terms under 600 characters."),
  visibility: z.enum(["public", "private"]),
  targetBuyerPiUsernames: piUsernameListSchema,
});

export const createTradeInterestSchema = z.object({
  tradeId: z.string().min(1),
  responseNote: z
    .string()
    .trim()
    .min(12, "Add a short response so the seller can compare buyers.")
    .max(600, "Keep the response under 600 characters."),
});

export const selectTradeInterestSchema = z.object({
  tradeId: z.string().min(1),
  interestId: z.string().min(1),
});

export const deliveryProofSchema = z.object({
  tradeId: z.string().min(1),
  deliveryProofNote: z
    .string()
    .trim()
    .min(8, "Add delivery proof details.")
    .max(600, "Keep proof notes under 600 characters."),
  deliveryProofUrl: z
    .string()
    .trim()
    .url("Use a valid proof URL.")
    .optional()
    .or(z.literal("")),
  deliveryProofImagePath: z.string().trim().optional().or(z.literal("")),
});

export const disputeSchema = z.object({
  tradeId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(12, "Dispute reason is required.")
    .max(600, "Keep dispute reason under 600 characters."),
  evidenceNote: z
    .string()
    .trim()
    .max(600, "Keep evidence notes under 600 characters.")
    .optional(),
});

export const confirmReceiptSchema = z.object({
  tradeId: z.string().min(1),
  buyerReceiptNote: z
    .string()
    .trim()
    .min(8, "Add a short receipt confirmation note.")
    .max(600, "Keep receipt notes under 600 characters."),
  buyerReceiptProofUrl: z
    .string()
    .trim()
    .url("Use a valid proof URL.")
    .optional()
    .or(z.literal("")),
  buyerReceiptImagePath: z.string().trim().optional().or(z.literal("")),
});

export type CreateTradeInput = z.infer<typeof createTradeSchema>;
export type CreateTradeInterestInput = z.infer<typeof createTradeInterestSchema>;
export type SelectTradeInterestInput = z.infer<typeof selectTradeInterestSchema>;
export type DeliveryProofInput = z.infer<typeof deliveryProofSchema>;
export type DisputeInput = z.infer<typeof disputeSchema>;
export type ConfirmReceiptInput = z.infer<typeof confirmReceiptSchema>;
