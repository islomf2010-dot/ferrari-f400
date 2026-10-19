import { CHAPTERS, COLOPHON, LEGACY, MACHINE_SPECS, SITE, STORY_COPY } from '../content.ts';

/**
 * Everything after the film.
 *
 * Ordinary document flow: no pinning, no scroll listeners, no canvas. The film
 * section owns all of the scroll choreography and nothing below it participates,
 * which is the only way to be sure the second half of the page cannot disturb
 * the first.
 *
 * Images are lazy and carry intrinsic `width`/`height`, so the page never
 * reflows while they arrive and there is no cumulative layout shift on the way
 * down.
 */
export function Story() {
  return (
    <div className="story">
      {/* ── THE MACHINE ──────────────────────────────────────────────── */}
      <section className="machine" id="machine">
        <header className="machine__head">
          <p className="eyebrow">
            <span className="eyebrow__index">02</span>
            <span className="rule" aria-hidden="true" />
            The Machine
          </p>
          <h2 className="machine__title">
            <span>Specification,</span>
            <span className="accent">then argument.</span>
          </h2>
          <p className="machine__lede">
            {SITE.marque} {SITE.model} · European specification · {SITE.place}
          </p>
        </header>

        <dl className="specs">
          {MACHINE_SPECS.map((spec) => (
            <div className="specs__row" key={spec.label}>
              <dt className="specs__label">{spec.label}</dt>
              <dd className="specs__value">
                {spec.value}
                {spec.unit ? <span className="specs__unit">{spec.unit}</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        {CHAPTERS.map((chapter) => (
          <article className="chapter" key={chapter.id} id={chapter.id}>
            <div className="chapter__copy">
              <p className="eyebrow">
                <span className="eyebrow__index">{chapter.index}</span>
                <span className="rule" aria-hidden="true" />
                {chapter.kicker}
              </p>
              <h3 className="chapter__title">
                {chapter.title.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h3>
              {chapter.body.map((paragraph) => (
                <p className="chapter__body" key={paragraph.slice(0, 28)}>
                  {paragraph}
                </p>
              ))}
              {chapter.specs ? (
                <dl className="specs specs--tight">
                  {chapter.specs.map((spec) => (
                    <div className="specs__row" key={spec.label}>
                      <dt className="specs__label">{spec.label}</dt>
                      <dd className="specs__value">
                        {spec.value}
                        {spec.unit ? <span className="specs__unit">{spec.unit}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>

            {chapter.figure ? (
              <figure className={`plate plate--${chapter.figure.side}`}>
                <img
                  src={`${import.meta.env.BASE_URL}${chapter.figure.src}`}
                  alt={chapter.figure.alt}
                  width={1400}
                  height={934}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{chapter.figure.caption}</figcaption>
              </figure>
            ) : null}
          </article>
        ))}
      </section>

      {/* ── THE STORY ────────────────────────────────────────────────── */}
      <section className="legacy" id="story">
        <header className="legacy__head">
          <p className="eyebrow">
            <span className="eyebrow__index">03</span>
            <span className="rule" aria-hidden="true" />
            The Story
          </p>
          <h2 className="legacy__title">{STORY_COPY.title[0]}</h2>
          <h2 className="legacy__title legacy__title--accent">{STORY_COPY.title[1]}</h2>
          <p className="legacy__lede">{STORY_COPY.lede}</p>
        </header>

        <ol className="moments">
          {LEGACY.map((moment) => (
            <li className="moment" key={moment.year}>
              <p className="moment__year">{moment.year}</p>
              <h3 className="moment__title">{moment.title}</h3>
              <p className="moment__body">{moment.body}</p>
            </li>
          ))}
        </ol>

        <figure className="plate plate--wide">
          <img
            src={`${import.meta.env.BASE_URL}media/still/hood-light.jpg`}
            alt="The nose of a red Ferrari F40 in near darkness, a single hard light running across the bonnet."
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
          />
          <figcaption>{STORY_COPY.footnote}</figcaption>
        </figure>
      </section>

      <footer className="colophon">
        <p className="colophon__mark">
          <span>{SITE.marque}</span>
          <span className="colophon__model">{SITE.model}</span>
        </p>
        <ul className="colophon__lines">
          {COLOPHON.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="colophon__source">{COLOPHON.source}</p>
        <a className="colophon__up" href="#reveal">
          Run the film again
        </a>
      </footer>
    </div>
  );
}