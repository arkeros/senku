import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { Trans, useI18n } from "@panellet/i18n-runtime";
import {
  MODES,
  isFinished,
  play,
  score,
  stainCandidates,
  startGame,
  undo,
  type Game,
  type ModeName,
  type Player,
} from "../../game/rules";
import { Bill } from "../../ui/components/Bill/Bill";
import { Cell } from "../../ui/components/Cell/Cell";
import { Napkin } from "../../ui/components/Napkin/Napkin";
import { Tile } from "../../ui/components/Tile/Tile";
import { color, radius, size } from "../../ui/theme/tokens.stylex";

const PLAYERS = ["blue", "red"] as const;

/** A game plus the seed that decides how wobbly this napkin's grid is. */
type Session = { game: Game; seed: number };

function deal(mode: ModeName): Session {
  const candidates = stainCandidates(MODES[mode].size);
  return {
    game: startGame(
      mode,
      candidates[Math.floor(Math.random() * candidates.length)],
    ),
    seed: Math.floor(Math.random() * 2 ** 31),
  };
}

const styles = stylex.create({
  turn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBlock: size.s,
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: radius.round,
    boxShadow: "0 0 0 3px rgba(255, 255, 255, 0.08)",
  },
  blue: { backgroundColor: color.blue },
  red: { backgroundColor: color.red },
  hand: {
    marginTop: size.s,
  },
  handIdle: {
    opacity: 0.32,
  },
  handLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    marginBottom: 7,
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: color.graphite,
  },
  tiles: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  billSlot: {
    marginTop: size.m,
  },
  controls: {
    display: "flex",
    gap: 8,
    marginTop: size.s,
  },
  button: {
    flexGrow: 1,
    paddingBlock: 12,
    paddingInline: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(247, 243, 232, 0.16)",
    backgroundColor: {
      default: color.transparent,
      ":hover": "rgba(247, 243, 232, 0.07)",
    },
    color: color.chalk,
    fontFamily: "inherit",
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    cursor: "pointer",
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${color.paper}`,
    },
    outlineOffset: 2,
  },
  buttonOn: {
    backgroundColor: color.paper,
    borderColor: color.paper,
    color: color.tableDeep,
  },
  buttonOff: {
    opacity: 0.3,
    cursor: "default",
  },
});

export function Play() {
  const { format } = useI18n();
  const [{ game, seed }, setSession] = useState<Session>(() => deal("classic"));
  const [chosen, setChosen] = useState<number | null>(null);

  const points = score(game.board, game.size);
  const over = isFinished(game);

  // Pen names for standalone labels ("Blue pen") and bare colours for the
  // ones that read inside a sentence ("blue's turn"). Both are passed to
  // every sentence so each locale can pick whichever fits its grammar.
  //
  // Written out as maps rather than looked up by a concatenated id, because
  // i18n ids must be string literals for the build-time coverage check.
  const pen: Record<Player, string> = {
    blue: format("play.pen.blue"),
    red: format("play.pen.red"),
  };
  const colour: Record<Player, string> = {
    blue: format("play.colour.blue"),
    red: format("play.colour.red"),
  };

  const restart = (mode: ModeName) => {
    setSession(deal(mode));
    setChosen(null);
  };

  const write = (index: number) => {
    if (chosen === null) return;
    const next = play(game, index, chosen);
    if (next === game) return;
    setSession((session) => ({ ...session, game: next }));
    setChosen(null);
  };

  const rewind = () => {
    setSession((session) => ({ ...session, game: undo(session.game) }));
    setChosen(null);
  };

  const leader = points.blue > points.red ? "blue" : "red";
  const verdict = over
    ? points.blue === points.red
      ? format("play.bill.draw", { points: points.blue })
      : format("play.bill.win", {
          pen: pen[leader],
          colour: colour[leader],
          margin: Math.abs(points.blue - points.red),
        })
    : points.blue === points.red
      ? format("play.bill.tied")
      : format("play.bill.leading", {
          pen: pen[leader],
          colour: colour[leader],
        });

  return (
    <>
      {/* Two people share one screen, so whose turn it is has to be
          announced, not just coloured. */}
      <p aria-live="polite" {...stylex.props(styles.turn)}>
        {over ? (
          format("play.turn.finished")
        ) : (
          <>
            <span
              aria-hidden="true"
              {...stylex.props(styles.dot, styles[game.turn])}
            />
            {chosen === null
              ? format("play.turn.chooseNumber", {
                  pen: pen[game.turn],
                  colour: colour[game.turn],
                })
              : format("play.turn.tapCell", {
                  pen: pen[game.turn],
                  colour: colour[game.turn],
                })}
          </>
        )}
      </p>

      <Napkin size={game.size} seed={seed}>
        {game.board.map((mark, index) => {
          const row = Math.floor(index / game.size) + 1;
          const col = (index % game.size) + 1;
          return (
            <Cell
              key={index}
              index={index}
              mark={mark}
              stained={index === game.stain}
              turn={game.turn}
              disabled={over || chosen === null}
              label={
                index === game.stain
                  ? format("play.cell.stain")
                  : mark
                    ? format("play.cell.written", {
                        row,
                        col,
                        value: mark.value,
                        pen: pen[mark.player],
                      })
                    : format("play.cell.free", { row, col })
              }
              onSelect={() => write(index)}
            />
          );
        })}
      </Napkin>

      {PLAYERS.map((player) => {
        const idle = over || game.turn !== player;
        return (
          <div
            key={player}
            {...stylex.props(styles.hand, idle && styles.handIdle)}
          >
            <p {...stylex.props(styles.handLabel)}>
              <span
                aria-hidden="true"
                {...stylex.props(styles.dot, styles[player])}
              />
              {pen[player]}
            </p>
            <div {...stylex.props(styles.tiles)}>
              {Array.from(
                { length: MODES[game.mode].tiles },
                (_unused, i) => i + 1,
              ).map((value) => {
                const spent = !game.hands[player].includes(value);
                return (
                  <Tile
                    key={value}
                    value={value}
                    player={player}
                    spent={spent}
                    chosen={chosen === value && game.turn === player}
                    disabled={idle}
                    label={
                      spent
                        ? format("play.tile.spent", {
                            value,
                            pen: pen[player],
                          })
                        : format("play.tile", { value, pen: pen[player] })
                    }
                    onSelect={() =>
                      setChosen((current) => (current === value ? null : value))
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <div {...stylex.props(styles.billSlot)}>
        <Bill
          heading={format("play.bill.heading")}
          lines={PLAYERS.map((player) => ({
            player,
            label: pen[player],
            points: points[player],
          }))}
          verdict={verdict}
        />
      </div>

      <div {...stylex.props(styles.controls)}>
        <button
          type="button"
          disabled={game.history.length === 0}
          onClick={rewind}
          {...stylex.props(
            styles.button,
            game.history.length === 0 && styles.buttonOff,
          )}
        >
          <Trans id="play.action.undo" />
        </button>
        <button
          type="button"
          onClick={() => restart(game.mode)}
          {...stylex.props(styles.button)}
        >
          <Trans id="play.action.new" />
        </button>
      </div>

      <div {...stylex.props(styles.controls)}>
        <button
          type="button"
          aria-pressed={game.mode === "classic"}
          onClick={() => restart("classic")}
          {...stylex.props(
            styles.button,
            game.mode === "classic" && styles.buttonOn,
          )}
        >
          <Trans id="play.mode.classic" />
        </button>
        <button
          type="button"
          aria-pressed={game.mode === "lightning"}
          onClick={() => restart("lightning")}
          {...stylex.props(
            styles.button,
            game.mode === "lightning" && styles.buttonOn,
          )}
        >
          <Trans id="play.mode.lightning" />
        </button>
      </div>
    </>
  );
}
