import { useState } from "react";
import { Client } from "boardgame.io/react";
import { Kriegspiel, P_ID } from "./Game";
import { Local } from "boardgame.io/multiplayer";
import { Board } from "./Board";
import { RandomBot } from "boardgame.io/ai";

const KriegspielClient = Client({
  game: Kriegspiel,
  board: Board,
  debug: { collapseOnLoad: true },
  numPlayers: 3,

  //SocketIO({ server: 'localhost:8000' })
  //multiplayer: Local({ bots: { "1": RandomBot } }),
});

const App = () => {
  //const [currentPlayer, setCurrentPlayer] = useState<P_ID>("0");

  return (
    <div>
      <KriegspielClient
      // playerID={currentPlayer}
      //setCurrentPlayer={setCurrentPlayer}
      />
      {/* <KriegspielClient playerID="1" /> */}
    </div>
  );
};

export default App;
