import { z } from "zod";

/**
 * Payment contracts.
 *
 * Payment methods are described by the server from provider configuration; the
 * client never names a gateway or a channel it is allowed to use.
 */

export const paymentReferenceParamSchema = z.object({
  masterOrderNumber: z
    .string()
    .trim()
    .min(4, "Enter a checkout reference")
    .max(80, "Enter a valid checkout reference"),
});

export const retryPaymentSchema = z.object({}).strict();

export type RetryPaymentBody = z.infer<typeof retryPaymentSchema>;
