// How much a person should get back on the Summary: what they paid minus
// their own share, only when they paid more than their share. null when
// there's no payment info or they didn't overpay (paid exactly their share
// still reads as "paid in full", not "gets back ₱0.00"). Integer centavos.
export function computeGetsBackCentavos(
  paidCentavos: number | undefined,
  shareCentavos: number,
): number | null {
  if (paidCentavos === undefined || paidCentavos <= shareCentavos) return null;
  return paidCentavos - shareCentavos;
}
