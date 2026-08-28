// Crore formatting: Indian donor/CSR reporting convention. 1 Cr = 1,00,00,000.
export function moneyCr(n) {
  const cr = (n || 0) / 10000000;
  return `₹${cr.toFixed(2)} Cr`;
}

export function fullMoney(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}