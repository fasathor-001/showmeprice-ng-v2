// NIN (National Identification Number) verification types — vendor-agnostic.
// Phase E ships Korapay Identity as the primary implementation (D-074).
// Schema deliberately under-specified per D-075: the vendor_raw_response
// escape hatch carries vendor-specific fields (Korapay's confidence
// scores, biometric flags, full response envelope) that Stage 2 design
// will decide how to surface — split tables, views, or column-level RLS.

export interface VerifyNinParams {
  /** 11-digit Nigerian National Identification Number. */
  nin: string;
  /** Optional name match — vendor scores against the NIMC record. */
  first_name?: string;
  last_name?: string;
  /** YYYY-MM-DD — vendor scores against the NIMC record. */
  date_of_birth?: string;
}

export interface VerifyNinResult {
  /**
   * Vendor's overall match verdict. Required field — every vendor
   * returns a true/false on whether the NIN exists + (if name/dob were
   * supplied) whether they correlate.
   */
  match: boolean;

  /**
   * Vendor-side confidence rating, normalized to a tri-state.
   * Korapay returns numeric scores; we map: >=0.9 → 'high',
   * 0.7–0.89 → 'medium', <0.7 → 'low'. Mapping logic lives in the
   * vendor implementation, not the consumer.
   *
   * Optional because not all vendors expose a confidence number.
   */
  confidence?: "high" | "medium" | "low";

  /**
   * Vendor's reference for this verification call. Stored in
   * kyc_documents.document_reference for audit / re-verification.
   */
  vendor_reference: string;

  /**
   * Full vendor response, for audit / debugging. Per D-075 PII
   * discipline, this MUST NOT be exposed via user-facing self-read
   * RLS — store in an admin-only audit table or strip via view at
   * Stage 2 schema-finalization time.
   */
  vendor_raw_response?: unknown;
}
