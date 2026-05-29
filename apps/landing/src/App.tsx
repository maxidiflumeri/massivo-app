import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { Plans } from './components/Plans';
import { CtaBand } from './components/CtaBand';
import { Footer } from './components/Footer';

export function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Plans />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
