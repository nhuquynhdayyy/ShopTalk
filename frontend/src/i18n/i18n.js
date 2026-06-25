import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from './en.json';
import viTranslations from './vi.json';

// Lấy ngôn ngữ đã lưu hoặc mặc định theo trình duyệt
const savedLanguage = sessionStorage.getItem('shoptalk_language');
const defaultLanguage = savedLanguage || (navigator.language.includes('vi') ? 'vi' : 'en');

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      vi: { translation: viTranslations }
    },
    lng: defaultLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React đã tự động chống XSS
    }
  });

export default i18n;