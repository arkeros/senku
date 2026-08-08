import { useI18n } from "@panellet/i18n-runtime";
import type { PersonaId } from "../../game/bot";
import type { Labels, PersonaLabels } from "../../render/scene";
import { Plate } from "../../ui/components/Plate/Plate";

/**
 * The only place in this app that touches i18n.
 *
 * The plate draws its text onto a canvas, which no JSX translation element
 * can reach, so every string is resolved here and handed down. The round and
 * win messages are pre-formatted per seat rather than passed as functions —
 * there are only ever two strands, and it keeps the draw code free of
 * callbacks.
 *
 * The personas are pre-formatted for the same reason and could not be done
 * any other way: this component has no idea which one is playing, or whether
 * one is, so it resolves all five and lets the canvas pick. Five bags is
 * cheaper than a `format` callback reaching into the draw code.
 */
export function Play() {
  const { format } = useI18n();

  const pesto = format("pasta.name.pesto");
  const carbonara = format("pasta.name.carbonara");

  // Spelled out rather than looped over `PERSONA_IDS`, because the build
  // checks that every key in the catalogue is referenced from source and a
  // computed key is invisible to it. The check is right: a key nobody names
  // is a string nobody can be sure is still needed.
  const persona = (name: string, line: string): PersonaLabels => ({
    name,
    line,
    roundBy: format("pasta.round", { name }),
    winner: format("pasta.win", { name }),
  });

  const personas: Record<PersonaId, PersonaLabels> = {
    ketchup: persona(format("pasta.bot.ketchup"), format("pasta.bot.ketchup.line")),
    mayo: persona(format("pasta.bot.mayo"), format("pasta.bot.mayo.line")),
    alioli: persona(format("pasta.bot.alioli"), format("pasta.bot.alioli.line")),
    brava: persona(format("pasta.bot.brava"), format("pasta.bot.brava.line")),
    kamikaze: persona(format("pasta.bot.kamikaze"), format("pasta.bot.kamikaze.line")),
  };

  const labels: Labels = {
    title: format("pasta.title"),
    tagline: format("pasta.tagline"),
    solo: format("pasta.solo"),
    duel: format("pasta.duel"),
    soloHint: format("pasta.soloHint"),
    duelHint: format("pasta.duelHint"),
    bot: format("pasta.bot"),
    botHint: format("pasta.botHint"),
    botTag: format("pasta.botTag"),
    rosterTitle: format("pasta.rosterTitle"),
    back: format("pasta.back"),
    personas,
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
