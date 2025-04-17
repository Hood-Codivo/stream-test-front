// src/App.tsx (Updated for react-router-dom v6)
// Use Routes, correct import paths
import { Routes, Route, Link } from "react-router-dom";
import StreamerStudio from "./components/StreamerStudio"; // Corrected path and name
import ViewerPage from "./components/ViewerPage"; // Corrected path and name

function App() {
  return (
    // Remove outer Router if it's in main.tsx
    <>
      <nav>
        <ul>
          <li>
            <Link to="/broadcaster">Broadcaster</Link>
          </li>
          <li>
            <Link to="/viewer">Viewer</Link>
          </li>
        </ul>
      </nav>
      {/* Use Routes instead of Switch */}
      <Routes>
        {/* Use element prop and remove exact */}
        <Route path="/broadcaster" element={<StreamerStudio />} />
        <Route path="/viewer" element={<ViewerPage />} />
        <Route path="/" element={<h2>Welcome! Choose an option above.</h2>} />
      </Routes>
    </>
  );
}

export default App;
