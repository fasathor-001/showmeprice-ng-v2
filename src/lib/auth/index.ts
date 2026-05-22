export {
  normalizeNigerianWhatsApp,
  isPlausibleNigerianMobile,
  formatNigerianPhone,
} from "./whatsapp";
export {
  phoneGateDest,
  isPhoneVerified,
  requirePhoneVerified,
} from "./post-auth";
export { maybeBootstrapAdmin } from "./admin-bootstrap";
export {
  validateEmail,
  validatePassword,
  validateDisplayName,
  validateWhatsAppNumber,
  validateSignUpForm,
  hasErrors,
  type SignUpFormData,
  type ValidationErrors,
} from "./validation";
