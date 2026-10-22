import { skyCSS, SKIES } from "@/features/storybook/sky";
import { envIndices, STORY } from "@/features/storybook/story";
import styles from "@/features/storybook/storybook.module.css";

const bg = (i: number) => ({ background: skyCSS(SKIES[envIndices[i]].grad) });

/* Still version: one rendered frame per moment, or text only (images === null) without WebGL. */
export default function StorybookStill({
  images,
  login,
}: {
  images: string[] | null;
  login: React.ReactNode;
}) {
  const N = STORY.chapters.length;

  return (
    <main className={styles.still}>
      <section className={styles.sSec} style={bg(0)}>
        <div className={styles.sInner}>
          <p className={styles.kicker}>{STORY.intro.kicker}</p>
          {images ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URLs rendered in the browser; next/image adds nothing
            <img
              className={styles.sImg}
              src={images[0]}
              alt="The closed storybook lying on a table."
            />
          ) : null}
        </div>
      </section>
      {STORY.chapters.map((ch, k) => (
        <section key={ch.number} className={styles.sSec} style={bg(k + 1)}>
          <div className={styles.sInner}>
            <div style={{ color: ch.headInk, textShadow: ch.headShadow }}>
              <p className={styles.eyebrow}>{ch.number}</p>
              <h2 className={styles.chTitle}>{ch.title}</h2>
            </div>
            {images ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: URLs rendered in the browser; next/image adds nothing
              <img className={styles.sImg} src={images[k + 1]} alt={ch.alt} />
            ) : null}
            <p className={styles.caption} style={{ color: ch.capInk }}>
              {ch.caption}
            </p>
          </div>
        </section>
      ))}
      <section className={`${styles.sSec} ${styles.sEnd}`} style={bg(N + 1)}>
        <div className={styles.sInner}>
          <h2 className={styles.endTitle}>{STORY.ending.title}</h2>
          <p className={styles.endLine}>{STORY.ending.line}</p>
          <div className={styles.cta} style={{ marginTop: 18 }}>
            {login}
          </div>
        </div>
      </section>
    </main>
  );
}
