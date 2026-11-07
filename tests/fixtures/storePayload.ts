export const validStoreBody = {
  name: "Routiq Mart",
  legalBusinessName: "Routiq Limited",
  email: "store@example.com",
  phoneNumber: "08031234567",
  businessType: "limited_company",
  category: "grocery",
  cacRegistrationNumber: "RC123456",
  tin: "12345678",
  address: {
    street: "1 Test Street",
    city: "Ikeja",
    lga: "Ikeja",
    state: "Lagos",
    country: "Nigeria",
  },
  location: { type: "Point", coordinates: [3.3792, 6.5244] },
  operatingHours: [
    {
      day: "monday",
      isOpen: true,
      openingTime: "08:00",
      closingTime: "18:00",
    },
  ],
  representative: {
    fullName: "John Doe",
    dateOfBirth: "1990-01-01",
    nationality: "Nigerian",
    idType: "nin",
    idNumber: "12345678901",
    nin: "12345678901",
  },
  settlementAccount: {
    bankName: "GTBank",
    bankCode: "058",
    accountName: "Routiq Limited",
    accountNumber: "0123456789",
  },
  documents: [
    { type: "government_id", url: "https://example.com/id.pdf" },
    { type: "utility_bill", url: "https://example.com/bill.pdf" },
    { type: "cac_certificate", url: "https://example.com/cac.pdf" },
  ],
  compliance: { termsAccepted: true, dataProcessingConsent: true },
};

export const buildStoreBody = (overrides: Record<string, unknown> = {}) => ({
  ...validStoreBody,
  ...overrides,
});
