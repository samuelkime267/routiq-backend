export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Federal Capital Territory",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export const NIGERIAN_PHONE_REGEX = /^(?:\+234|0)[789][01]\d{8}$/;
export const CAC_REGISTRATION_REGEX = /^(RC|BN|IT)?\d{4,10}$/i;
export const TIN_REGEX = /^\d{8,15}$/;
export const BVN_REGEX = /^\d{11}$/;
export const NIN_REGEX = /^\d{11}$/;
export const BANK_ACCOUNT_REGEX = /^\d{10}$/;
export const BANK_CODE_REGEX = /^\d{3,6}$/;
export const SCUML_REGEX = /^[A-Z0-9-]{4,20}$/i;
