import { CredibilityStrip } from "@/components/CredibilityStrip";
import { FaqSection } from "@/components/FaqSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { Footer } from "@/components/Footer";
import { FounderStory } from "@/components/FounderStory";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Nav } from "@/components/Nav";
import { ProblemSection } from "@/components/ProblemSection";
import { WaitlistSection } from "@/components/WaitlistSection";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <CredibilityStrip />
        <ProblemSection />
        <HowItWorks />
        <FeaturesSection />
        <FounderStory />
        <WaitlistSection />
        <FaqSection />
      </main>
      <Footer />
    </>
  );
}
