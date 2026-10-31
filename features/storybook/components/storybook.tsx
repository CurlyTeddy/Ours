"use client";

import { useEffect, useRef, useState } from "react";
import { corben, gaegu } from "@/components/ui/storybook-fonts";
import { nunito } from "@/components/ui/fonts";
import { cn } from "@/lib/utils";
import StorybookStill from "@/features/storybook/components/storybook-still";
import type { StageElements } from "@/features/storybook/stage";
import { STORY } from "@/features/storybook/story";
import styles from "@/features/storybook/storybook.module.css";

export default function Storybook({ login }: { login: React.ReactNode }) {
  // undefined: animated (or still booting); null: text-only; array: one still per moment
  const [stills, setStills] = useState<string[] | null>();
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const skyHost = useRef<HTMLDivElement>(null);
  const scrollTrack = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLElement[]>([]);
  const heads = useRef<HTMLElement[]>([]);
  const caps = useRef<HTMLElement[]>([]);
  const endHead = useRef<HTMLDivElement>(null);
  const endCap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unmounted = false;
    let dispose: (() => void) | undefined;
    if (
      !canvas.current ||
      !skyHost.current ||
      !scrollTrack.current ||
      !endHead.current ||
      !endCap.current
    )
      return;
    const els: StageElements = {
      canvas: canvas.current,
      skyHost: skyHost.current,
      scrollTrack: scrollTrack.current,
      intro: intro.current,
      heads: heads.current,
      caps: caps.current,
      endHead: endHead.current,
      endCap: endCap.current,
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Boot a frame later: Strict Mode's throwaway first effect is cancelled here instead of
    // creating a renderer on this canvas, whose shared GL context its dispose would then lose.
    const id = requestAnimationFrame(() => {
      import("@/features/storybook/stage")
        .then(({ bootStage }) => bootStage(els, { reduced }))
        .then((result) => {
          if (result.kind !== "animated") {
            if (!unmounted) {
              setStills(result.kind === "stills" ? result.images : null);
              setReady(true);
            }
          } else if (unmounted) result.dispose();
          else {
            dispose = result.dispose;
            setReady(true);
          }
        })
        .catch((error: unknown) => {
          // A failed chunk download or build must still leave the text and the login reachable.
          console.error(error);
          if (!unmounted) {
            setStills(null);
            setReady(true);
          }
        });
    });
    return () => {
      unmounted = true;
      cancelAnimationFrame(id);
      dispose?.();
    };
  }, []);

  return (
    <div
      className={cn(
        styles.root,
        corben.variable,
        gaegu.variable,
        nunito.variable,
      )}
    >
      {stills === undefined ? (
        <>
          <div className={styles.bgs} ref={skyHost} aria-hidden="true" />
          <canvas
            className={cn(styles.gl, ready && styles.ready)}
            ref={canvas}
            aria-hidden="true"
          />
          <div className={cn(styles.ui, !ready && styles.pending)}>
            <div className={styles.heads}>
              <div
                ref={(el) => {
                  if (el) intro.current[0] = el;
                }}
              >
                <p className={styles.kicker}>{STORY.intro.kicker}</p>
              </div>
              {STORY.chapters.map((ch, k) => (
                <div
                  key={ch.number}
                  ref={(el) => {
                    if (el) heads.current[k] = el;
                  }}
                  className={styles.chEl}
                  style={{ color: ch.headInk, textShadow: ch.headShadow }}
                >
                  <p className={styles.eyebrow}>{ch.number}</p>
                  <h2 className={styles.chTitle}>{ch.title}</h2>
                </div>
              ))}
              <div ref={endHead} className={styles.chEl}>
                <h2 className={styles.endTitle}>{STORY.ending.title}</h2>
                <p className={styles.endLine}>{STORY.ending.line}</p>
              </div>
            </div>
            <div />
            <div className={styles.caps}>
              {STORY.chapters.map((ch, k) => (
                <div
                  key={ch.number}
                  ref={(el) => {
                    if (el) caps.current[k] = el;
                  }}
                  className={styles.chEl}
                  style={{ color: ch.capInk }}
                >
                  <p className={styles.caption}>{ch.caption}</p>
                  <p className="sr-only">{ch.alt}</p>
                </div>
              ))}
              <div ref={endCap} className={cn(styles.chEl, styles.cta)}>
                {/* Mount once in its final place: the still path would remount an auto-opened dialog and wipe its input. */}
                {ready ? login : null}
              </div>
            </div>
            <div
              ref={(el) => {
                if (el) intro.current[1] = el;
              }}
              className={styles.hintWrap}
            >
              <span className={styles.hint}>
                {STORY.intro.hint}
                <span className={styles.chev} />
              </span>
            </div>
          </div>
          <div className={styles.scroll} ref={scrollTrack} aria-hidden="true" />
        </>
      ) : (
        <StorybookStill images={stills} login={login} />
      )}
      <div className={cn(styles.veil, ready && styles.gone)} aria-hidden="true">
        <p>unfolding the paper…</p>
      </div>
    </div>
  );
}
