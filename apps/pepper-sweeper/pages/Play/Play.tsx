import { useI18n } from "@panellet/i18n-runtime";
import type { Labels } from "../../render/scene";
import { Plancha } from "../../ui/components/Plancha/Plancha";

/**
 * The only place in this app that touches i18n.
 *
 * The board draws its text onto a canvas, which no JSX translation element
 * can reach, so every string is resolved here and handed down. The win
 * message is pre-formatted per side rather than passed as a function — there
 * are only ever two players, and it keeps the draw code free of callbacks.
 */
export function Play() {
  const { format } = useI18n();

  const brava = format("padron.name.brava");
  const alioli = format("padron.name.alioli");

  const labels: Labels = {
    title: format("padron.title"),
    tagline: format("padron.tagline"),
    solo: format("padron.solo"),
    duel: format("padron.duel"),
    soloHint: format("padron.soloHint"),
    duelHint: format("padron.duelHint"),
    holdHint: format("padron.holdHint"),
    remaining: format("padron.remaining"),
    time: format("padron.time"),
    best: format("padron.best"),
    swept: format("padron.swept"),
    bitten: format("padron.bitten"),
    playAgain: format("padron.playAgain"),
    name: { left: brava, right: alioli },
    winner: {
      left: format("padron.win", { name: brava }),
      right: format("padron.win", { name: alioli }),
    },
  };

  return <Plancha labels={labels} />;
}
