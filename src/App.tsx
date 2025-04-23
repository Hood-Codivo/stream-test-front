// src/App.tsx (Updated for react-router-dom v6)
// Use Routes, correct import paths
import { Routes, Route} from "react-router-dom";
import StreamerStudio from "./components/StreamerStudio"
import ViewerPage from "./components/ViewerPage"; // Corrected path and name
import Navbar from "./components/Navbar";

function App() {
  return (
    // Remove outer Router if it's in main.tsx
    <>
      <nav>
        <Navbar />
      </nav>
      {/* Use Routes instead of Switch */}
      <Routes>
        {/* Use element prop and remove exact */}
        <Route path="/broadcaster" element={<StreamerStudio />} />
        <Route path="/viewers/:streamId" element={<ViewerPage />} />
        <Route path="/" element={<h2>Welcome! Choose an option above.</h2>} />
      </Routes>
    </>
  );
}

export default App;
