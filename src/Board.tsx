import React, { useRef, useState } from "react";
import { BoardProps } from "boardgame.io/react";
import * as Game from "./Game";
import {
  objTypeList,
  strongholdTypeList,
  BoardSize,
  CellID,
  P_ID,
  GameState,
  ObjInstance,
  canPick,
  canAttack,
  canPut,
  CId2Pos,
  dualPlayerID,
  getBattleFactor,
  getChargedCavalries,
  getDirSuppliedLines,
  getSuppliedCells,
  exportGame,
  turns,
} from "./Game";

import { useGesture } from "@use-gesture/react";

interface GameProps extends BoardProps<GameState> {}

export const Board = ({
  G,
  ctx,
  moves,
  isActive,
  events,
  ...props
}: GameProps) => {
  const myID = (
    props.playerID !== null ? props.playerID : ctx.currentPlayer
  ) as P_ID;
  const opponentID = dualPlayerID(myID);
  const currentPlayer = ctx.currentPlayer as P_ID;
  const [pickedID, pickUpID] = useState<CellID | null>(null);
  const editMode = ctx.activePlayers?.[myID] === "edition";
  const opEditMode = ctx.activePlayers?.[opponentID] === "edition";
  const [turfMode, setTurfMode] = useState(false);
  const localSupplyStorage = localStorage.getItem("supplyVisible");
  const localSupply = localSupplyStorage
    ? JSON.parse(localSupplyStorage)
    : null;
  const [supplyVisible, setSupplyVisible] = useState<P_ID[]>(
    localSupply || ["0", "1", "2", "3", "4", "5", "6", "7"]
  );
  const [turnNumber, setTurnNumber] = useState(turns.length - 1);

  function pickedData(pId: CellID | null) {
    if (pId !== null && canPick(G, ctx, pId) && isActive) {
      return G.cells[pId];
    } else {
      return null;
    }
  }

  function myOnClick(id: CellID) {
    if (editMode) {
      if (editState !== null) {
        if (editState < 6) {
          const obj = G.cells[id]
            ? null
            : Game.newPiece(objTypeList[editState], editFiction);
          moves.editCells(id, obj);
        } else {
          const state = editState - 6;
          //only arsenal has fiction
          const fiction = state ? null : editFiction;
          const str = G.places[id]
            ? null
            : Game.newStronghold(strongholdTypeList[state], fiction);
          moves.editPlaces(id, str);
        }
      }
    } else {
      switch (pickedID) {
        case null:
          pickUpID(id);

          break;
        case id:
          if (canAttack(G, ctx, id)[0]) {
            moves.attack(id);
          }
          pickUpID(null);
          break;
        default:
          if (pickedData(pickedID) !== null && canPut(G, ctx, pickedID, id)) {
            pickUpID(null);
            moves.movePiece(pickedID, id);
          } else {
            pickUpID(id);
          }
      }
    }
  }

  function isAvailable(id: CellID) {
    if (!isActive) return false;
    else if (
      pickedID !== null &&
      pickedData(pickedID) !== null &&
      canPut(G, ctx, pickedID, id)
    )
      return true;
  }

  function getCellColor(id: CellID) {
    const strongholdColor = G.places[id]?.belong;
    if (id === pickedID) {
      return pico8Palette.dark_purple;
    } else if (isAvailable(id)) {
      //predict supply after moving
      if (
        getSuppliedCells(
          {
            ...G,
            cells: G.cells.map((obj, CId) =>
              CId === pickedID ? null : CId === id ? pickedData(pickedID) : obj
            ),
          },
          currentPlayer
        ).includes(id)
      ) {
        return pico8Palette.green;
      } else {
        return pico8Palette.yellow;
      }
    } else if (turfMode) {
      return pico8Palette.white;
    } else if (typeof strongholdColor === "string") {
      return fictionColor(strongholdColor);
    } else {
      const pos = CId2Pos(id);
      const colorCase = (pos.x + pos.y) % 2 === 0;
      return colorCase //pico8Palette.light_grey
        ? pico8Palette.very_light_grey
        : pico8Palette.white;
    }
  }

  function renderEffectedTurf(belong: P_ID) {
    return renderLayer((area) => {
      const relDef = area[belong];
      const control = area.control;
      return (
        relDef >= 0 &&
        control === belong && (
          <rect
            width="1"
            height="1"
            fillOpacity={(relDef + 5) / 50}
            fill={fictionColor(belong)}
          />
        )
      );
    }, G.controlArea);
  }

  function renderCombatEffect(CId: CellID) {
    const obj = G.cells[CId];
    if (obj) {
      const belong = obj.belong;
      const fireRange = Game.fireRange(G, CId, obj.range);
      const offLst = getBattleFactor(G, dualPlayerID(belong), true, CId)[1];
      const defLst = getBattleFactor(G, belong, false, CId)[1];
      //show the detailed info for selected cell, otherwise only cell in danger

      let result = offLst
        .map((id) =>
          gTranslate(
            renderStr("⚔️", 0.4),
            CId2Pos(id).x - 0.3,
            CId2Pos(id).y - 0.3
          )
        )
        .concat(
          defLst.map((id) =>
            gTranslate(
              renderStr("🛡️", 0.4),
              CId2Pos(id).x - 0.3,
              CId2Pos(id).y - 0.3
            )
          )
        );
      if (obj.supplied) {
        result = result.concat(
          fireRange.map((id) =>
            gTranslate(
              renderStr("🎯", 0.3),
              CId2Pos(id).x + 0.3,
              CId2Pos(id).y + 0.3
            )
          )
        );
      }

      return result;
    }
  }
  function renderCombatResult(CId: CellID) {
    const obj = G.cells[CId];
    if (obj) {
      const relDef = G.controlArea[CId][obj.belong];
      return (
        obj &&
        relDef < 0 &&
        gTranslate(
          renderStr(defState(relDef), 0.4),
          CId2Pos(CId).x + 0.3,
          CId2Pos(CId).y - 0.3
        )
      );
    }
  }

  function drawOneSupplyLine(line: CellID[], pId: P_ID) {
    {
      const offset = pId === "0" ? -0.05 : 0.05;
      const originIsSameFaction =
        G.places[line[0]]?.belong === pId || G.cells[line[0]]?.belong === pId; //without this every alliance draws twice as many lines

      return (
        originIsSameFaction &&
        line.length > 1 &&
        gTranslate(
          drawLine(
            line[0],
            line[line.length - 1],
            supplyVisible.includes(pId) ? fictionColor(pId) : "rgba(0,0,0,0)",
            0.05,
            "0.4, 0.1"
          ),
          offset,
          offset
        )
      );
    }
  }

  //draw all 8 direction supply lines form one point
  function draw8DirSupplyLines(lines: CellID[][], pId: P_ID) {
    return lines.map((line) => drawOneSupplyLine(line, pId));
  }

  function drawAllSupplyLines(pId: P_ID) {
    //get all supply lines groups from different points
    return getDirSuppliedLines(G, pId)[1].flatMap((lines) =>
      draw8DirSupplyLines(lines, pId)
    );
  }

  const boardRef = useRef(null);

  //map move ui
  const [mapPos, setMapPos] = useState<Game.Position>({ x: 0, y: 0 });
  const [mapScale, setMapScale] = useState<number>(1);

  useGesture(
    {
      onDrag: (state) => {
        const e = state.event;
        const svg = e.target as SVGAElement;
        const CTM = svg.getScreenCTM();
        if (CTM) {
          const move = state.offset;
          const dx = move[0] / CTM.a;
          const dy = move[1] / CTM.d;
          setMapPos({ x: dx, y: dy });
        }
      },
      onWheel: (state) => {
        const evt = state.event;
        evt.preventDefault();
        const spd = 0.0007;

        const newScale = mapScale * (1 - spd * state.movement[1]);

        setMapScale(newScale);
      },
      onPinch: (state) => {
        const newScale = state.offset[0];

        setMapScale(newScale);
      },
    },
    {
      target: boardRef,
      eventOptions: { passive: false },
    }
  );

  //render Main board

  const gameBoard = (
    <svg
      viewBox={`-0.6 -0.6 ${BoardSize.mx + 1.2} ${BoardSize.my + 1.2}`}
      ref={boardRef}
    >
      <g
        transform={`translate(${BoardSize.mx / 2} ${
          BoardSize.my / 2
        })  scale(${mapScale}) translate(${mapPos.x - BoardSize.mx / 2} ${
          mapPos.y - BoardSize.my / 2
        })`}
      >
        <rect
          x={-0.6}
          y={-0.6}
          width="100%"
          height="100%"
          fill={pico8Palette.light_peach}
          stroke={pico8Palette.dark_grey}
          strokeWidth="0.05"
        />
        {/* background */}
        {/* 4 border */}
        {Array(BoardSize.mx)
          .fill(null)
          .map((_, id) => gTranslate(renderStr((id + 1).toString()), id, -0.8))}
        {Array(BoardSize.my)
          .fill(null)
          .map((_, id) =>
            gTranslate(renderStr(String.fromCharCode(65 + id)), -0.8, id)
          )}
        {Array(BoardSize.mx)
          .fill(null)
          .map((_, id) =>
            gTranslate(
              renderStr((id + 1).toString()),
              id,
              BoardSize.my - 1 + 0.8
            )
          )}
        {Array(BoardSize.my)
          .fill(null)
          .map((_, id) =>
            gTranslate(
              renderStr(String.fromCharCode(65 + id)),
              BoardSize.mx - 1 + 0.8,
              id
            )
          )}
        {/* cells */}
        {renderLayer((_, id) => (
          <rect
            key={id}
            width="1"
            height="1"
            fill={getCellColor(id)}
            stroke={pico8Palette.dark_grey}
            strokeWidth="0.05"
          />
        ))}
        {/* middle line */}
        <line
          x1="0"
          y1={BoardSize.my / 2}
          x2={BoardSize.mx}
          y2={BoardSize.my / 2}
          stroke={pico8Palette.lavender}
          strokeWidth="0.2"
        />

        {/* supply line */}

        {drawAllSupplyLines("0")}
        {drawAllSupplyLines("1")}
        {drawAllSupplyLines("2")}
        {drawAllSupplyLines("3")}
        {drawAllSupplyLines("4")}
        {drawAllSupplyLines("5")}
        {drawAllSupplyLines("6")}
        {drawAllSupplyLines("7")}

        {/* stronghold */}
        {renderLayer(
          (stronghold) => (
            <>{stronghold && renderStr(stronghold.placeRender, 1)}</>
          ),
          G.places
        )}
        {/* show effected turf */}
        {turfMode && renderEffectedTurf("0").concat(renderEffectedTurf("1"))}

        {/* move indication */}
        {G.moveRecords["0"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.dark_blue, 0.5, "0.3, 0.1")
        )}
        {G.moveRecords["1"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.brown, 0.5, "0.3, 0.1")
        )}
        {G.moveRecords["2"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.balanced_grey, 0.5, "0.3, 0.1")
        )}
        {G.moveRecords["3"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.dark_green, 0.5, "0.3, 0.1")
        )}
        {G.moveRecords["4"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.dark_purple, 0.5, "0.3, 0.1")
        )}
        {G.moveRecords["5"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.black, 0.5, "0.3, 0.1")
        )}
        {G.moveRecords["6"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.brown, 0.5, "0.3, 0.1")
        )}
        {G.moveRecords["7"].map(([st, ed]) =>
          drawLine(st, ed, pico8Palette.black, 0.5, "0.3, 0.1")
        )}

        {/* piece */}
        {renderLayer(
          (obj) => (
            <>{obj && renderPiece(obj)}</>
          ),
          G.cells
        )}
        {/* attack */}
        {[
          G.attackRecords["0"],
          G.attackRecords["1"],
          G.attackRecords["2"],
          G.attackRecords["3"],
          G.attackRecords["4"],
          G.attackRecords["5"],
          G.attackRecords["6"],
          G.attackRecords["7"],
        ].map(
          (atk) =>
            atk !== null &&
            gTranslate(
              renderStr("💥", 0.7),
              CId2Pos(atk[0]).x,
              CId2Pos(atk[0]).y
            )
        )}
        {/* charge */}
        {renderLayer(
          (obj, id) => (
            <>
              {obj &&
                getChargedCavalries(G, id, null).map((chargeRow) =>
                  chargeRow.map((pos, id, row) =>
                    gTranslate(
                      renderStr("⚡"),
                      pos.x - 0.5 * row[0].x,
                      pos.y - 0.5 * row[0].y
                    )
                  )
                )}
            </>
          ),
          G.cells
        )}
        {/* battle info indication */}
        {pickedID !== null && renderCombatEffect(pickedID)}
        {G.cells.map((_, id) => (
          <>{renderCombatResult(id)}</>
        ))}
        {/* control */}
        {renderLayer((_, id) => (
          <rect
            cursor="pointer"
            onClick={() => myOnClick(id)}
            width="1"
            height="1"
            fillOpacity="0"
          />
        ))}
      </g>
    </svg>
  );

  //render Battle info UI
  function battleFactorTable(id: CellID | null) {
    if (id === null) {
      return null;
    }

    const players: P_ID[] = ["0", "1", "2", "3", "4", "5", "6", "7"];
    const playersWithCombatFactor = players
      .map((playerId) => ({
        id: playerId,
        atk: getBattleFactor(G, playerId, true, id)[0],
        def: getBattleFactor(G, playerId, false, id)[0],
      }))
      .filter((player) => player.atk !== 0 || player.def !== 0);

    return (
      <table style={{ marginLeft: "auto", marginRight: "auto" }}>
        <tr>
          {playersWithCombatFactor.map((player) => (
            <td
              style={{
                backgroundColor: fictionColor(player.id),
                color:
                  fictionColor(player.id) === "#000000" ? "white" : "black",
              }}
            >
              Atk: {player.atk}
            </td>
          ))}
        </tr>
        <tr>
          {playersWithCombatFactor.map((player) => (
            <td
              style={{
                backgroundColor: fictionColor(player.id),
                color:
                  fictionColor(player.id) === "#000000" ? "white" : "black",
              }}
            >
              Def: {player.def}
            </td>
          ))}
        </tr>
      </table>
    );
  }

  /*
  //render Battle info UI
  function battleFactorTable(id: CellID | null) {
    const nonNull = id !== null;
    const MyOff = nonNull ? getBattleFactor(G, myID, true, id)[0] : 0;
    const MyDef = nonNull ? getBattleFactor(G, myID, false, id)[0] : 0;
    const EnemyDef = nonNull ? getBattleFactor(G, opponentID, false, id)[0] : 0;
    const EnemyOff = nonNull ? getBattleFactor(G, opponentID, true, id)[0] : 0;
    const RelOff = MyOff - EnemyDef;
    const RelDef = MyDef - EnemyOff;
    const obj = nonNull ? G.cells[id] : null;
    const myOffTd = (
      <td style={{ backgroundColor: fictionColor(myID) }}>
        MyAtk: {MyOff} {offState(RelOff)}
      </td>
    );
    const myDefTd = (
      <td style={{ backgroundColor: fictionColor(myID) }}>
        MyDef: {MyDef} {defState(RelDef)}
      </td>
    );
    const eDefTd = (
      <td style={{ backgroundColor: fictionColor(opponentID) }}>
        EnemyDef: {EnemyDef} {defState(-RelOff)}
      </td>
    );
    const eOffTd = (
      <td style={{ backgroundColor: fictionColor(opponentID) }}>
        EnemyAtk: {EnemyOff} {offState(-RelDef)}
      </td>
    );

    return (
      <table style={{ marginLeft: "auto", marginRight: "auto" }}>
        {obj?.belong !== opponentID ? (
          // if choose my unit or empty place
          <tr>
            {myDefTd}
            {eOffTd}
          </tr>
        ) : null}
        {obj?.belong !== myID ? (
          // if choose enemy unit or empty place
          <tr>
            {myOffTd}
            {eDefTd}
          </tr>
        ) : null}
      </table>
    );
  }
  */
  function offState(n: number) {
    if (n > 0) return "⚔️";
    else return "";
  }
  function defState(n: number) {
    if (n >= 0) return "🛡️";
    else if (n === -1) return "🏃‍♂️";
    else return "💀";
  }
  function overAllUnits(belong: P_ID) {
    return spanBGColor(
      <>
        {objTypeList.map((type) => {
          const num = Game.filterCId(
            G.cells,
            (obj) => obj.typeName === type && obj.belong === belong
          ).length;
          return Game.objDataList[type].objRender + num;
        })}
      </>,
      fictionColor(belong)
    );
  }
  console.log(G, ctx);
  console.log(G.attackRecords, G.moveRecords);
  let moveRecordString: string = "";

  Object.keys(G.moveRecords).forEach((playerId) => {
    const move = G.moveRecords[playerId as P_ID];
    moveRecordString += playerId + ": [";
    move.forEach((unitMove, i) => {
      if (i > 0) moveRecordString += ",";
      moveRecordString += `[${unitMove[0]},${unitMove[1]}]`;
    });
    moveRecordString += "],\n";
  });

  console.log(moveRecordString);

  const sideBarPlay = (
    <div id="PlayUI">
      {/* how many units left */}

      <p>
        <label>Players: (Select active)</label>

        <div
        /*  onClick={() => {
            setTurfMode(!turfMode);
          }}
          style={{ cursor: "pointer" }}*/
        >
          {G.players.map((player) => (
            <div className="player-units" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={supplyVisible.includes(player.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    const newSupply = supplyVisible.concat([player.id]);
                    setSupplyVisible(newSupply);
                    localStorage.setItem(
                      "supplyVisible",
                      JSON.stringify(newSupply)
                    );
                  } else {
                    const newSupply = supplyVisible.filter(
                      (id) => id !== player.id
                    );
                    setSupplyVisible(newSupply);
                    localStorage.setItem(
                      "supplyVisible",
                      JSON.stringify(newSupply)
                    );
                  }
                }}
              ></input>
              <span
                onClick={() => {
                  events.endTurn && events.endTurn({ next: player.id });
                }}
              >
                {player.name}
                {overAllUnits(player.id)}
                Allies:
                {G.alliances[player.id].map((allyID) =>
                  spanBGColor(<>🕊️</>, fictionColor(allyID))
                )}
              </span>
              <br />
            </div>
          ))}
        </div>
        {/*<label>(click to toggle Turf View)</label>*/}
      </p>

      {/* turn info */}
      <p>
        {spanBGColor(
          <>
            It is {G.players.find((p) => p.id === currentPlayer)?.name + "'s"}{" "}
            turn.{" "}
          </>,
          fictionColor(currentPlayer)
        )}
        {/* <button
          disabled={!isActive}
          onClick={() => {
            events.endTurn && events.endTurn();
          }}
        >
          End Turn
        </button> */}
      </p>
      <p>{getWinner()}</p>

      {/* action info */}
      <label>My Moves and Attack: (click to undo)</label>
      <svg viewBox="-0.1 -0.1 6.2 1.2" onClick={props.undo} cursor="pointer">
        {renderLayer((_, id) => {
          const moveEdRec = G.moveRecords[myID].map((p) => p[1]);
          const atk = G.attackRecords[myID];
          if (id < 5) {
            const edCId = moveEdRec[id];
            const edObj = G.cells[edCId];
            console.log(G.attackRecords[myID]);
            //render moved pieces, if attacked, then can not move anymore
            return (
              <>
                <rect
                  width="1"
                  height="1"
                  fill={pico8Palette.light_peach}
                  stroke={pico8Palette.dark_grey}
                  strokeWidth="0.05"
                />

                {edObj ? renderPiece(edObj) : atk ? renderStr("❌") : null}
              </>
            );
          } else {
            return (
              <>
                <rect
                  width="1"
                  height="1"
                  fill={pico8Palette.red}
                  stroke={pico8Palette.dark_grey}
                  strokeWidth="0.05"
                />
                {atk &&
                  (atk[1] === "Arsenal"
                    ? renderStr("🎪")
                    : renderPiece(atk[1]))}
              </>
            );
          }
        }, Array(6).fill(null))}
      </svg>
      {/* retreat info */}
      {G.forcedRetreat[currentPlayer][0] !== null && (
        <p>🏃‍♂️💥 I must retreat my unit from attack first.</p>
      )}

      <div>
        <label>Turn output:</label>
        <input
          id="turn-output"
          type="text"
          placeholder="Turn text"
          value={
            G.moveRecords[myID].join(";") +
            ` | Attack:${formatAttack(G.attackRecords[myID])}`
          }
          readOnly
        ></input>
        <button
          onClick={(event) => {
            const copyText = document.getElementById(
              "turn-output"
            ) as HTMLInputElement;
            // Select the text field
            if (copyText) {
              copyText.select();
              copyText.setSelectionRange(0, 99999); // For mobile devices
              navigator.clipboard.writeText(copyText.value);
            }
          }}
        >
          Copy
        </button>
      </div>

      {/* chosen piece info */}

      <p>
        Chosen Unit{" "}
        {pickedID !== null &&
          ((id) => {
            const obj = G.cells[id];
            const str = G.places[id];
            const pos = CId2Pos(pickedID);

            return (
              <>
                {" "}
                at {pos.x + 1} | {id}
                {String.fromCharCode(65 + pos.y)}:{" "}
                {obj && (
                  <>
                    {spanBGColor(
                      <>
                        {obj.objRender + obj.typeName},<br />
                        <span title="Attack">
                          ⚔️:{" "}
                          {obj.objType === "Cavalry" ? "4(+3)" : obj.offense}{" "}
                        </span>
                        <span title="Defense">🛡️: {obj.defense} </span>
                        <span title="Range">🎯: {obj.range} </span>
                        <span title="Speed">🐴: {obj.speed} </span>
                      </>,
                      fictionColor(obj.belong)
                    )}
                    <br />
                    <button
                      disabled={!(isActive && canAttack(G, ctx, pickedID)[0])}
                      onClick={() => {
                        pickUpID(null);
                        moves.attack(pickedID);
                      }}
                    >
                      💥Attack!
                    </button>
                  </>
                )}
                {str && (
                  <>
                    <br />
                    {spanBGColor(
                      <>
                        {str.placeRender + str.placeType}
                        {str.defenseAdd > 0 ? (
                          <>
                            ,{" "}
                            <span title="Additional Defense">
                              {" "}
                              🛡️+: {str.defenseAdd}{" "}
                            </span>{" "}
                          </>
                        ) : (
                          ""
                        )}
                      </>,
                      str.belong ? fictionColor(str.belong) : ""
                    )}{" "}
                  </>
                )}
              </>
            );
          })(pickedID)}
      </p>

      {/* combat factors */}
      <label>Total Combat Factors:</label>
      {battleFactorTable(pickedID)}
      <label>Turn input:</label>
      <input id="turn-input" type="text" placeholder="Turn text"></input>
      <button
        onClick={(event) => {
          const turnText = document.getElementById(
            "turn-input"
          ) as HTMLInputElement;

          const [moveText, attackText] = turnText.value.split(" | Attack:");
          const moveList = moveText.split(";");

          moveList.forEach((move) => {
            const [startSquare, endSquare] = move.split(",");
            moves.movePiece(parseInt(startSquare), parseInt(endSquare));
          });

          if (attackText !== "none") {
            moves.attack(parseInt(attackText));
          }
        }}
      >
        Make Move
      </button>
    </div>
  );
  // editor
  const [gameData, setGameData] = useState<string>("");
  const [editState, setEditState] = useState<CellID | null>(null);
  const [editFiction, setEditFiction] = useState<P_ID>(myID);

  function editorClick(id: CellID) {
    switch (editState) {
      case null:
        setEditState(id);
        break;
      case id:
        setEditState(null);
        break;
      default:
        setEditState(id);
    }
  }
  function editorCells(id: number, render: string) {
    return (
      <g
        cursor="pointer"
        onClick={() => {
          editorClick(id);
        }}
      >
        <rect
          width="0.9"
          height="0.9"
          x="0.05"
          y="0.05"
          fill={fictionColor(editFiction)}
          stroke={id === editState ? pico8Palette.red : pico8Palette.dark_grey}
          strokeWidth={id === editState ? 0.15 : 0.05}
        />
        {renderStr(render)}
      </g>
    );
  }

  const sideBarEdit = (
    <div id="EditUI">
      {/* Editor */}
      <div>
        <svg viewBox="-0.1 -0.2 6.2 2.2">
          {renderLayer(
            (type, id) => editorCells(id, Game.objDataList[type].objRender),
            objTypeList
          )}
          {gTranslate(
            renderLayer(
              (type, oid) =>
                editorCells(oid + 6, Game.renderPlaceByType(type)[0]),
              strongholdTypeList
            ),
            0,
            1
          )}
        </svg>
        <input
          type="button"
          value="Change Color"
          onClick={() => {
            setEditFiction(dualPlayerID(editFiction));
          }}
        />
        <input
          type="button"
          value="Reset Board"
          onClick={() => moves.load(Game.onlyMap)}
        />
      </div>
      {/* Game Data */}
      <form>
        <label>GameData:</label>
        <select onChange={(e) => setGameData(e.target.value)}>
          {Game.gameList.map((option) => (
            <option key={option.name} value={option.data}>
              {option.name}
            </option>
          ))}
        </select>
        <textarea
          name="gameData"
          id="gameData"
          rows={10}
          style={{ width: "90%", height: "60%", resize: "vertical" }}
          value={gameData}
          onChange={(e) => setGameData(e.target.value)}
        ></textarea>

        <input
          type="button"
          value="Export Game"
          onClick={() => setGameData(exportGame(G))}
        />
        <input
          type="button"
          value="Load Game"
          onClick={() => moves.load(gameData)}
        />
        <input
          type="button"
          value="Merge Game"
          onClick={() => moves.merge(gameData)}
        />
        <input
          type="button"
          value="Copy Data"
          onClick={() => {
            // Get the text field
            const copyText = document.getElementById(
              "gameData"
            ) as HTMLInputElement;
            // Select the text field
            copyText.select();
            copyText.setSelectionRange(0, 99999); // For mobile devices
            // Copy the text inside the text field
            navigator.clipboard.writeText(gameData);
          }}
        />
        <input
          type="button"
          value="Remove Data"
          onClick={() => setGameData("")}
        />
      </form>
    </div>
  );

  function formatAttack(attackText: [number, ObjInstance | "Arsenal"] | null) {
    if (attackText) return attackText[0];
    else return "none";
  }

  //get winner
  function getWinner() {
    if (ctx.gameover) {
      const result = ctx.gameover.winner === "0" ? "Blue" : "Orange";
      return `The winner is ${result} Player`;
    } else {
      return null;
    }
  }
  //const winner = getWinner();

  // render all

  return (
    <main>
      <div
        style={{
          height: "auto",
          color: "black",
          textAlign: "center",
          fontFamily: "'Lato', sans-serif",
          display: "flex",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            maxHeight: "100vh",
            minWidth: "55vw",
            flex: "4",
            maxWidth: "122vh",
            border: `2px solid ${pico8Palette.dark_green}`,
            backgroundColor: `${pico8Palette.white}`,
            touchAction: "none",
          }}
        >
          {/* svg Game Board */}
          {gameBoard}
        </div>

        {/* info UI */}
        <div
          style={{
            minWidth: "250px",
            flex: "1",
            maxWidth: "100vw",
            border: `2px solid ${pico8Palette.dark_green}`,
            backgroundColor: `${pico8Palette.white}`,
          }}
        >
          {editMode && (
            <div
              style={{
                padding: "5px 0px",
                width: "100%",
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => {
                  const newTurnNumber = turnNumber - 1;
                  if (turnNumber > 0) {
                    setTurnNumber(newTurnNumber);
                    moves.load(turns[newTurnNumber]);
                  }
                }}
              >
                back
              </button>
              <span style={{ margin: "0px 10px" }}>Turn: {turnNumber}</span>
              <button
                onClick={() => {
                  const newTurnNumber = turnNumber + 1;
                  if (turnNumber < turns.length - 1) {
                    setTurnNumber(newTurnNumber);
                    moves.load(turns[newTurnNumber]);
                  }
                }}
              >
                forward
              </button>
            </div>
          )}

          {editMode ? sideBarEdit : sideBarPlay}

          <p>
            {opEditMode && (
              <>
                Other player is editing.
                <br />
              </>
            )}
            More information{" "}
            <a href="https://github.com/king-mob/kriegspiel">here</a>.{" "}
            <input
              type="button"
              value="Edit Mode"
              onClick={() => {
                if (!editMode) {
                  events.setStage && events.setStage("edition");
                } else {
                  events.endStage && events.endStage();
                }
              }}
            />
          </p>
        </div>
      </div>
    </main>
  );
};

function renderLayer<T>(
  objRender: (a: T, b: CellID) => React.ReactNode,
  objLst: readonly T[] = Array(BoardSize.mx * BoardSize.my).fill(null)
) {
  return objLst.map((obj, id) => {
    const pos = CId2Pos(id);
    return gTranslate(objRender(obj, id), pos.x, pos.y);
  });
}
function renderPiece(obj: ObjInstance) {
  return (
    <>
      {
        <circle
          cx="0.5"
          cy="0.5"
          r="0.4"
          stroke={pico8Palette.dark_grey}
          strokeWidth="0.05"
          fill={fictionColor(obj.belong)}
        />
      }
      {renderStr(obj.objRender)}
      {!obj.supplied && renderStr("😅", 0.4)}
      {obj.retreating && renderStr("🏃‍♂️", 0.4)}
    </>
  );
}
function renderStr(str: string, size: number = 0.5) {
  return (
    <text
      fontSize={`${size}`}
      x="0.5"
      y="0.5"
      dominantBaseline="middle"
      textAnchor="middle"
    >
      {str}
    </text>
  );
}

function gTranslate(jsx: React.ReactNode, x = 0, y = 0) {
  return <g transform={`translate(${x} ${y})`}>{jsx}</g>;
}

function drawLine(
  stCId: CellID,
  edCId: CellID,
  color: string = "black",
  width: number = 0.1,
  dash: string = ""
) {
  const stPos = CId2Pos(stCId);
  const edPos = CId2Pos(edCId);
  return (
    <line
      x1={stPos.x + 0.5}
      y1={stPos.y + 0.5}
      x2={edPos.x + 0.5}
      y2={edPos.y + 0.5}
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dash}
    />
  );
}

function spanBGColor(jsx: React.ReactNode, color: string) {
  return (
    <span
      style={{
        backgroundColor: color,
        whiteSpace: "normal",
        color: color === "#000000" ? "white" : "black",
      }}
    >
      {jsx}
    </span>
  );
}

function fictionColor(pID: P_ID) {
  switch (pID) {
    case "0":
      return pico8Palette.blue;
    case "1":
      return pico8Palette.red;
    case "2":
      return pico8Palette.balanced_grey;
    case "3":
      return pico8Palette.green;
    case "4":
      return pico8Palette.purple;
    case "5":
      return pico8Palette.brown;
    case "6":
      return pico8Palette.orange;
    case "7":
      return pico8Palette.black;
  }
}

const pico8Palette = {
  black: "#000000",
  cyan: "#00ffff",
  dark_blue: "#1d2b53",
  dark_purple: "#7e2553",
  dark_green: "#008751",
  brown: "#ab5236",
  purple: "#cf04ba",
  dark_grey: "#5f574f",
  balanced_grey: "#939393",
  light_grey: "#c2c3c7",
  very_light_grey: "#e3e3e3",
  white: "#fff1e8",
  red: "#ff004d",
  orange: "#ffa300",
  yellow: "#ffec27",
  dark_yellow: "#d0cc0a",
  green: "#00e436",
  blue: "#29adff",
  lavender: "#83769c",
  pink: "#ff77a8",
  light_peach: "#ffccaa",
};
