// Schema.org structured data describing the site, product, and FAQ. Rendered as
// JSON-LD (see components/JsonLd.tsx) so search and AI answer engines can
// understand what Clarke Coach is and quote the FAQ answers directly.
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, SOCIAL_PROFILES } from "./site";

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description: SITE_DESCRIPTION,
  sameAs: SOCIAL_PROFILES,
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
};

// The product itself — a mobile practice app in free private beta.
export const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "EducationalApplication",
  operatingSystem: "iOS, Android",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free early access during the private beta.",
  },
};

export function faqPageSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
