import type { ListTransactionsQuery } from "@/schemas/transaction";
import type { VendorTransactionListQuery } from "@/schemas/vendorPortal";
import { queryTransactions } from "@/services/transactions/query";

/**
 * Vendor transaction ledger.
 *
 * A payment record is also the transaction record, so this reuses the admin
 * query exactly and forces the vendor scope from the access token. The vendor
 * never chooses whose ledger is read.
 */
export async function queryVendorTransactions(
  vendorId: string,
  query: VendorTransactionListQuery,
) {
  return queryTransactions({
    ...query,
    vendor: vendorId,
  } as ListTransactionsQuery);
}
