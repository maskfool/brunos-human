import { useCallback, useState } from "react";
import Player from "./film/Player";
import BrunoChat from "./chat/BrunoChat";

// The whole site is the film. The chat drawer opens from the "Ask Bruno"
// diya at the end.
const App = () => {
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = useCallback(() => setChatOpen(true), []);

  return (
    <>
      <main>
        <Player onAsk={openChat} />
      </main>
      <BrunoChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
};

export default App;
