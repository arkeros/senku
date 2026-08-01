import { useI18n } from "@panellet/i18n-runtime";
import type { Labels } from "../../render/scene";
import { Arena } from "../../ui/components/Arena/Arena";

/**
 * The only place in this app that touches i18n.
 *
 * The arena draws its text onto a canvas, which no JSX translation element
 * can reach, so every string is resolved here and handed down. Goal and
 * win messages are pre-formatted per seat rather than passed as functions —
 * there are only two players, and it keeps the draw code free of callbacks.
 */
export function Play() {
  const { format } = useI18n();

  const rex = format("dino.name.rex");
  const trike = format("dino.name.trike");

  const labels: Labels = {
    title: format("dino.title"),
    tagline: format("dino.tagline"),
    howTo: format("dino.howTo"),
    tapToStart: format("dino.tapToStart"),
    go: format("dino.go"),
    playAgain: format("dino.playAgain"),
    goalBy: {
      bottom: format("dino.goal", { name: rex }),
      top: format("dino.goal", { name: trike }),
    },
    winner: {
      bottom: format("dino.win", { name: rex }),
      top: format("dino.win", { name: trike }),
    },
  };

  return <Arena labels={labels} />;
}
