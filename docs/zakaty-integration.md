# Zakaty integration preparation

Zakaty now accepts a simplified invoice with a buyer name and no address. Miqass sends `{ "buyer": { "name": "..." } }` for these invoices and never substitutes the salon's address as the buyer's.

## Existing flows

- POS sales are stored in `Sale` and `SaleItem`. The sale invoice currently contains a Phase 1 five-tag QR code when the salon has a tax number.
- A separate legacy booking receipt path in `paymentController.getInvoiceData` can sign and report a booking invoice when direct ZATCA credentials exist. It runs while retrieving the receipt, not while finalizing the POS sale. Do not report the linked POS sale as a second tax invoice until this is reconciled.
- A paid booking deposit is carried into the linked POS sale as a payment, not an extra sale line. The Zakaty payload should use the final sale total once, not the deposit as a separate item.

## Salon setup in Miqass

- `/api/zatca/zakaty/config` stores each salon's tenant-scoped Zakaty API key encrypted with the existing `ENCRYPTION_KEY`, EGS unit UUID, and seller registration/address. The API key is never returned to the browser.
- The server-only Miqass provisioning credential is read from `ZAKATY_PROVISIONING_API_KEY` and `ZAKATY_PROVISIONING_ENVIRONMENT` (or `ZAKATY_PROVISIONING_CONFIG_FILE` in non-Compose deployments). It is never a salon API key and is never returned to the browser. In Settings > Finance/Zakaty, the salon owner enters the real VAT number, legal seller name, CR, and address, then explicitly starts `POST /api/zatca/zakaty/setup`. Miqass saves those details and uses its authenticated salon ID as Zakaty's `externalTenantId`.
- A resumable backend worker then connects/reuses the Zakaty tenant and EGS, issues one tenant-scoped key, stores it encrypted, and generates CSR/private key only if the EGS lacks one. The UI waits for the user to enter the ZATCA OTP at `POST /api/zatca/zakaty/setup/otp`; the OTP is not persisted. After Zakaty confirms Compliance CSID, the worker runs SDK compliance checks and requests Production CSID automatically. A minute-based recovery job resumes incomplete work after server restarts. The worker uses a database lease, re-reads EGS state before each non-idempotent step, and does not blindly reissue a key after an ambiguous provider response. Such a key issue requires operator review.
- The older manual provisioning, key, and device endpoints remain for controlled maintenance, but the salon-facing UI shows only legal details, connect, OTP, and setup status. Managed-key disconnect revokes the key in Zakaty before clearing it locally, while preserving the Zakaty tenant/device linkage. Salons connected through the old direct ZATCA path cannot start this setup until that path is reconciled, to avoid double reporting.
- `/api/sales/:saleId/zakaty-readiness` checks a sale without sending it. The check is available in POS sales history.
- A paid direct POS sale can be sent manually with `POST /api/sales/:saleId/zakaty/submit`. The UI asks for confirmation. No scheduled or automatic submission is enabled.
- The sale stores its original Zakaty request snapshot, external invoice ID, response status, invoice ID, QR, attempts, and last error. Unknown outcomes can be checked through `POST /api/sales/:saleId/zakaty/reconcile`; resubmission first reads the status and then reuses the identical idempotency key and request snapshot if Zakaty has no matching invoice.
- `prepareZakatyInvoice` maps persisted VAT-inclusive sale lines to the Zakaty v1 contract (`priceIncludesVat: true`, `vatRate: 15`) and derives stable `externalInvoiceId`/`idempotencyKey` values from the Miqass tenant and sale ids.
- The issue date/time use Asia/Riyadh and the original sale creation timestamp. A retry sends the stored payload, not mutable catalog prices or the current time.
- Set `ZAKATY_BASE_URL` on the Miqass backend only when a reachable Zakaty instance exists. For Miqass Docker and Zakaty on the same host, `127.0.0.1` inside the Miqass container is not the host; use an internal Docker network address or a secured HTTPS service URL. Never put an API key in frontend environment variables.
- The supplied provisioning JSON belongs on the server only. In this local Compose setup its key and environment are extracted into Git-ignored `.local-secrets/miqass-zakaty.env`, which Compose reads as `env_file` without bind-mounting the Zakaty workspace. Both `.gitignore` and `.dockerignore` exclude this file. Do not commit it, copy it to frontend assets, or paste its key into the salon-key field. A different host must provide its own secured file.

## Remaining limits

1. Linked appointment sales remain blocked. The legacy booking receipt path can report when the receipt is fetched and does not persist a durable submission state. Historic booking invoices must be reconciled, and future reporting must move to one sale-based flow before these sales can be sent to Zakaty.
2. Zakaty's current contract requires a buyer name even for simplified invoices; Miqass uses the saved customer name or `عميل نقدي`. Standard invoices are not supported by this POS adapter.
3. Refunds and cancellations are not mapped to Zakaty credit/debit notes. Do not cancel a submitted invoice as if it had never been issued.
4. Verify the real salon VAT number, CR, address, EGS onboarding, and Zakaty environment in simulation or sandbox before any live salon uses manual submission. No production acceptance is claimed until an end-to-end test succeeds.
5. Provisioning a real salon or requesting CSID is a live external write. The configured credential targets the production Zakaty environment; no salons or certificates should be created from sample VAT/CR values. The public booking-linked sale path remains blocked from Zakaty until legacy tax reporting is reconciled.

Zakaty contract source: `C:\Users\iHussam\Documents\Zakaty\zatca-middleware-mvp\docs\external-api-contract.md` and the current `src/modules/integration/integration.schema.ts`.
