import  { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {  Github } from "lucide-react";

const InputPage = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      navigate("/results", { state: { results: data } });
    } catch (error) {
      console.error("Error analyzing comments:", error);
      alert("Failed to analyze comments. Please check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 flex items-center justify-center">
      <Card className="w-full max-w-xl bg-black border-gray-900 text-white">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            YouTube Comment Analyzer
            <a href="https://github.com/mohakksingh/youtube-analyzer">
              <Github size={24} color="white"></Github>
            </a>
            <p className="text-sm text-gray-500 mt-2">
              Enter a YouTube video URL to analyze its comments
            </p>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-white  ">
            <Input
              placeholder="Enter a YouTube video URL to analyze its comments..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-black border-gray-800"
            />
            <Button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full bg-white text-black hover:bg-gray-200"
            >
              {loading ? "Analyzing..." : "Analyze Comments"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InputPage;
