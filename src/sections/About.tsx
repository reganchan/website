export function About() {
  return (
    <section id="about" className="section about-section">
      <div className="about-grid">
        <div className="portrait-wrap">
          <img
            src="/images/bio.jpg"
            alt="Portrait"
            className="portrait"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.parentElement?.classList.add("portrait-placeholder");
            }}
          />
          <span className="portrait-fallback">your photo</span>
        </div>

        <div className="about-copy">
          <p className="eyebrow">hello</p>
          <h1>Regan Chan</h1>
          <p className="intro">
            Software engineer experienced with backend systems, infrastructure,
            distributed systems, and has interest in deployment of LLMs and image/video generators
          </p>
          <p className="muted">
            Experienced with: Python, Golang. Ruby. 
          </p>
          <p className="muted">
            Also knows: Java, C++, Typescript
          </p>
        </div>
      </div>
    </section>
  );
}