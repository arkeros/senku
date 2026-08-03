import { useI18n } from "@panellet/i18n-runtime";
import type { Labels } from "../../render/scene";
import { Plate } from "../../ui/components/Plate/Plate";

/**
 * The only place in this app that touches i18n.
 *
 * The plate draws its text onto a canvas, which no JSX translation element
 * can reach, so every string is resolved here and handed down. The round and
 * win messages are pre-formatted per seat rather than passed as functions —
 * there are only ever two strands, and it keeps the draw code free of
 * callbacks.
 */
export function Play() {
  const { format } = useI18n();

  const pesto = format("pasta.name.pesto");
  const carbonara = format("pasta.name.carbonara");

  const labels: Labels = {
    title: format("pasta.title"),
    tagline: format("pasta.tagline"),
    solo: format("pasta.solo"),
    duel: format("pasta.duel"),
    soloHint: format("pasta.soloHint"),
    duelHint: format("pasta.duelHint"),
    go: format("pasta.go"),
    score: format("pasta.score"),
    best: format("pasta.best"),
    gameOver: format("pasta.gameOver"),
    playAgain: format("pasta.playAgain"),
    draw: format("pasta.draw"),
    name: { bottom: pesto, top: carbonara },
    roundBy: {
      bottom: format("pasta.round", { name: pesto }),
      top: format("pasta.round", { name: carbonara }),
    },
    winner: {
      bottom: format("pasta.win", { name: pesto }),
      top: format("pasta.win", { name: carbonara }),
    },
  };

  return <Plate labels={labels} />;
}
