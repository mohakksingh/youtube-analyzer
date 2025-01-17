import { BrowserRouter, Routes, Route } from 'react-router-dom';
import InputPage from './pages/InputPage';
import ResultsPage from './pages/ResultsPage';


const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<InputPage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;