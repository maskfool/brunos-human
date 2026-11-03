import type { Card as CardData } from "./script";

// Bruno's scrapbook: notes he tapes up at each stop. Handwriting is Bruno
// talking; the printed part is the fact he's pointing at.

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

const Paw = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 64 64" className={`paw ${className}`} aria-hidden="true">
    <ellipse cx="32" cy="42" rx="14" ry="12" />
    <ellipse cx="15" cy="27" rx="6" ry="8" transform="rotate(-20 15 27)" />
    <ellipse cx="26" cy="17" rx="6" ry="8" transform="rotate(-6 26 17)" />
    <ellipse cx="38" cy="17" rx="6" ry="8" transform="rotate(6 38 17)" />
    <ellipse cx="49" cy="27" rx="6" ry="8" transform="rotate(20 49 27)" />
  </svg>
);

const Tape = () => <span className="tape" aria-hidden="true" />;

const Note = ({ text }: { text?: string }) => (text ? <p className="note-scrawl">{text}</p> : null);

const Card = ({ card }: { card: CardData }) => {
  switch (card.kind) {
    case "person":
      return (
        <article className="note note-person">
          <Tape />
          <div className="polaroid">
            <img src={card.photo} alt="Shubham Saini" />
            <p className="polaroid-caption">{card.note}</p>
          </div>
          <div className="note-text">
            <p className="note-kicker">{card.kicker}</p>
            <h3 className="note-title">{card.title}</h3>
            <p className="note-meta">📍 {card.meta}</p>
            <p className="note-quote">“{card.body}”</p>
          </div>
          <Paw className="paw-stamp" />
        </article>
      );
    case "list":
      return (
        <article className="note note-ruled">
          <Tape />
          <p className="note-kicker">{card.kicker}</p>
          <h3 className="note-title">{card.title}</h3>
          {card.meta && <p className="note-meta">{card.meta}</p>}
          <ul className="note-list">
            {card.items.map((item) => (
              <li key={item}>{item.includes("@") ? <a href={`mailto:${item}`}>{item}</a> : item}</li>
            ))}
          </ul>
          <Note text={card.note} />
          <Paw className="paw-stamp" />
        </article>
      );
    case "project":
      return (
        <article className="note note-project">
          <Tape />
          <p className="note-kicker">{card.kicker}</p>
          <div className="snap">
            <img src={card.image} alt={`${card.title} screenshot`} />
          </div>
          <h3 className="note-title">{card.title}</h3>
          <p className="note-body">{card.body}</p>
          <div className="note-row">
            {card.tags.map((t) => (
              <span key={t} className="sticker">{t}</span>
            ))}
          </div>
          <div className="note-row note-links">
            <a href={card.live} {...ext}>see it live ↗</a>
            {card.github && <a href={card.github} {...ext}>code ↗</a>}
          </div>
          <Note text={card.note} />
        </article>
      );
    case "chips":
      return (
        <article className="note">
          <Tape />
          <p className="note-kicker">{card.kicker}</p>
          <h3 className="note-title">{card.title}</h3>
          <div className="note-row">
            {card.chips.map((c) => (
              <span key={c} className="sticker">{c}</span>
            ))}
          </div>
          <Note text={card.note} />
          <div className="note-row">
            {card.learning.map((c) => (
              <span key={c} className="sticker sticker-soft">{c}</span>
            ))}
          </div>
          <Paw className="paw-stamp" />
        </article>
      );
  }
};

/** Each note lands at its own slight angle, like it was slapped on by a paw. */
const TILTS = [-2.6, 2.1, -1.2];

export const CardStack = ({ cards, visible }: { cards: CardData[]; visible: boolean }) => (
  <div className={`cards ${visible ? "cards-on" : ""}`}>
    {cards.map((c, i) => (
      <div
        key={i}
        className="card-slot"
        style={{ ["--tilt" as string]: `${TILTS[i % TILTS.length]}deg`, transitionDelay: visible ? `${0.1 + i * 0.18}s` : "0s" }}
      >
        <Card card={c} />
      </div>
    ))}
  </div>
);
