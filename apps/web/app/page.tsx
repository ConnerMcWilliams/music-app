import { CredibilityStrip } from "@/components/CredibilityStrip";
import { FaqSection } from "@/components/FaqSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { Footer } from "@/components/Footer";
import { FounderStory } from "@/components/FounderStory";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { JsonLd } from "@/components/JsonLd";
import { Nav } from "@/components/Nav";
import { ProblemSection } from "@/components/ProblemSection";
import { Reveal } from "@/components/Reveal";
import { WaitlistSection } from "@/components/WaitlistSection";
import { softwareApplicationSchema } from "@/lib/structured-data";

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema} />
      <Nav />
      <main>
        <Hero />
        <CredibilityStrip />
        <ProblemSection />
        <HowItWorks />
        <FeaturesSection />
        <Reveal className="reveal">
          <FounderStory />
        </Reveal>
        <Reveal className="reveal">
          <WaitlistSection />
        </Reveal>
        <Reveal className="reveal">
          <FaqSection />
        </Reveal>
      </main>
      <Footer />
    </>
  );
}
