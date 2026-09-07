type Props = {
  activeSection: string;
};

const links = [
  ["about", "about"],
  ["whereabouts", "whereabouts"],
  ["generator", "generator"],
  ["contact", "contact"],
];

export function Navigation({ activeSection }: Props) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        {links.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className={activeSection === id ? "active" : ""}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}