// Crore formatting: Indian donor/CSR reporting convention. 1 Cr = 1,00,00,000.
export function moneyCr(n) {
  const cr = (n || 0) / 10000000;
  return `₹${cr.toFixed(2)} Cr`;
}

// Lakh formatting — 1 Lakh = 1,00,000.
export function moneyLakh(n) {
  const lakh = (n || 0) / 100000;
  return `₹${lakh.toFixed(2)} L`;
}

// Thousand formatting — for gifts too small for Lakh to be legible
// either (anything under ₹1,00,000, including sub-₹1,000 amounts,
// which just come out as a fraction of a thousand rather than adding a
// 4th unit).
export function moneyThousand(n) {
  const thousand = (n || 0) / 1000;
  return `₹${thousand.toFixed(2)} K`;
}

// Auto-scales to whichever unit keeps the number readable: Crore once
// it's large enough that Crore is the natural unit (matching every
// other figure on the dashboard), Lakh for mid-size amounts, Thousand
// for small ones. If even Thousand format would round away to a
// misleading "₹0.00 K" (a gift under ₹5), falls back to the exact plain
// rupee amount instead — so a real, nonzero donation is never shown as
// zero at any scale.
export function moneyAutoScale(n) {
  const amount = Number(n) || 0;
  if (amount === 0) return "₹0";
  const abs = Math.abs(amount);
  if (abs >= 10000000) return moneyCr(amount);
  if (abs >= 100000) return moneyLakh(amount);
  const thousand = (amount / 1000).toFixed(2);
  if (thousand === "0.00" || thousand === "-0.00") {
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  }
  return `₹${thousand} K`;
}

// Every donor gets the auto-scaled Thousand/Lakh/Crore format above,
// regardless of Donor Type — donation sizes vary widely enough across
// every type (not just Individual) that a flat Crore format was
// rounding plenty of real, nonzero gifts down to a misleading
// "₹0.00 Cr". `donorType` is accepted for call-site compatibility
// (every caller already passes it) but no longer changes the format.
export function moneyForDonorType(n, _donorType) {
  return moneyAutoScale(n);
}

export function fullMoney(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}