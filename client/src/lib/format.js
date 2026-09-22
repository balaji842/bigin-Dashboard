// Crore formatting: Indian donor/CSR reporting convention. 1 Cr = 1,00,00,000.
export function moneyCr(n) {
  const cr = (n || 0) / 10000000;
  return `₹${cr.toFixed(2)} Cr`;
}

// Lakh formatting — 1 Lakh = 1,00,000. Crore rounds anything under
// about ₹50,000 down to a misleading "₹0.00 Cr", which is common for
// individual donors' gifts (usually far smaller than corporate/NPO
// ones), so those switch to this instead — see moneyForDonorType below.
export function moneyLakh(n) {
  const lakh = (n || 0) / 100000;
  return `₹${lakh.toFixed(2)} L`;
}

// Individual donors' amounts are shown in Lakh (their gifts are usually
// too small for Crore to be legible); every other Donor Type keeps the
// standard Crore format. `donorType` may be a comma-joined list (a
// donor whose deals span more than one Donor Type) — checked with
// includes() rather than an exact match for that reason.
export function moneyForDonorType(n, donorType) {
  const isIndividual = typeof donorType === "string" && donorType.includes("Individual");
  return isIndividual ? moneyLakh(n) : moneyCr(n);
}

export function fullMoney(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}