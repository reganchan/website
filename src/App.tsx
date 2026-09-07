import { useEffect, useState } from "react";
import { Navigation } from "./components/Navigation";
import { About } from "./sections/About";
import { Whereabouts } from "./sections/Whereabouts";
import { Generator } from "./sections/Generator";
import { Contact } from "./sections/Contact";

export default function App() {
  const [activeSection, setActiveSection] = useState("about");

  useEffect(() => {
    const sections = ["about", "whereabouts", "generator", "contact"]
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible) setActiveSection(visible.target.id);
      },
      { threshold: [0.2, 0.5, 0.8] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Navigation activeSection={activeSection} />
      <main>
        <About />
        <Whereabouts />
        <Generator />
        <Contact />
      </main>
    </>
  );
}