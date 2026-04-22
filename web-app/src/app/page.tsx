import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import SocialProof from '@/components/landing/SocialProof';
import FeaturesGrid from '@/components/landing/FeaturesGrid';
import TimerShowcase from '@/components/landing/TimerShowcase';
import AnalyticsShowcase from '@/components/landing/AnalyticsShowcase';
import AICoachShowcase from '@/components/landing/AICoachShowcase';
import CrossPlatform from '@/components/landing/CrossPlatform';
import TeamsSection from '@/components/landing/TeamsSection';
import Pricing from '@/components/landing/Pricing';
import FAQ from '@/components/landing/FAQ';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="min-h-screen bg-surface-0 text-white">
        <Hero />
        <SocialProof />
        <FeaturesGrid />
        <TimerShowcase />
        <AnalyticsShowcase />
        <AICoachShowcase />
        <CrossPlatform />
        <TeamsSection />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
