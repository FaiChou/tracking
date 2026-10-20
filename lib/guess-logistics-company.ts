type LogisticsCompany = {
  id: string;
  name: string;
};

// 按顺序匹配，FedEx 优先于 DHL。
const COMPANY_RULES = [
  { name: "ups", pattern: /^1Z/i },
  { name: "fedex", pattern: /^\d{12}$/ },
  { name: "usps", pattern: /^\d{22}$/ },
  { name: "ems", pattern: /^EZ/i },
  { name: "dhl", pattern: /^\d{10}$/ },
];

export function guessLogisticsCompanyId(
  trackingNumber: string,
  companies: readonly LogisticsCompany[]
): string | null {
  const number = trackingNumber.trim();
  const companyName = COMPANY_RULES.find(rule => rule.pattern.test(number))?.name;
  const findCompany = (name: string) =>
    companies.find(company => company.name.trim().toLowerCase() === name);

  return (
    (companyName ? findCompany(companyName)?.id : undefined) ??
    findCompany("17track")?.id ??
    null
  );
}
