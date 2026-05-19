import { normalizeNigerianWhatsApp, isPlausibleNigerianMobile } from "./whatsapp";

export interface SignUpFormData {
  email: string;
  password: string;
  displayName: string;
  // Renamed from whatsappNumber in Phase E.1.0 (D-055) to align with the
  // profiles.phone column. UI label remains "WhatsApp number" since the
  // column holds the user's WhatsApp number in NG context.
  phone: string;
}

export interface ValidationErrors {
  email?: string;
  password?: string;
  displayName?: string;
  phone?: string;
}

export function validateEmail(email: string): string | undefined {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 72) return "Password is too long (max 72 characters)";
  return undefined;
}

export function validateDisplayName(name: string): string | undefined {
  if (!name || !name.trim()) return "Name is required";
  if (name.trim().length < 2) return "Name must be at least 2 characters";
  if (name.trim().length > 60) return "Name is too long (max 60 characters)";
  return undefined;
}

export function validateWhatsAppNumber(raw: string): string | undefined {
  if (!raw || !raw.trim()) return "WhatsApp number is required";
  const normalized = normalizeNigerianWhatsApp(raw);
  if (!normalized) return "Enter a valid Nigerian phone number (e.g. 0801 234 5678)";
  if (!isPlausibleNigerianMobile(normalized))
    return "That doesn't look like a Nigerian mobile number";
  return undefined;
}

export function validateSignUpForm(data: SignUpFormData): ValidationErrors {
  return {
    email: validateEmail(data.email),
    password: validatePassword(data.password),
    displayName: validateDisplayName(data.displayName),
    phone: validateWhatsAppNumber(data.phone),
  };
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}
