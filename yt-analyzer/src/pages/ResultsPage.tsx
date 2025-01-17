import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface SentimentAnalysis {
  agree: number;
  disagree: number;
  neutral: number;
}

interface AnalysisResult {
  sentimentAnalysis: SentimentAnalysis;
  totalComments: number;
  distribution: {
    [key: string]: number;
  };
}

interface SentimentAnalysisCardProps {
  sentimentAnalysis: SentimentAnalysis;
}

const SentimentAnalysisCard: React.FC<SentimentAnalysisCardProps> = ({
  sentimentAnalysis,
}) => (
  <Card className="bg-black border-gray-800 text-white">
    <CardHeader>
      <CardTitle>Sentiment Analysis</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        {Object.entries(sentimentAnalysis).map(([type, value]) => (
          <div key={type} className="flex flex-col justify-between items-center ">
            <div className="flex flex-row justify-between items-end w-full">
              <span className="capitalize">{type}</span>
              <span>{value}%</span>
            </div>
            <div className="flex items-center gap-4 w-full">
              <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-white h-full"
                  style={{ width: `${value}%` }}
                />
              </div>
              
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

interface TotalCommentsCardProps {
  totalComments: number;
  sentimentAnalysis: SentimentAnalysis;
}

const TotalCommentsCard: React.FC<TotalCommentsCardProps> = ({
  totalComments,
  sentimentAnalysis,
}) => (
  <Card className="bg-black border-gray-800 text-white">
    <CardHeader>
      <CardTitle>Total Comments</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-4xl font-bold mb-6">{totalComments}</div>
      <div className="grid grid-cols-3 gap-4 text-center">
        {Object.entries(sentimentAnalysis).map(([type, percentage]) => (
          <div key={type}>
            <div className="text-xl font-bold">
              {Math.round(totalComments * (Number(percentage) / 100))}
            </div>
            <div className="text-gray-500 capitalize">{type}</div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

interface CommentDistributionCardProps {
  distribution: {
    [key: string]: number;
  };
}

const CommentDistributionCard: React.FC<CommentDistributionCardProps> = ({
  distribution,
}) => {
  const chartData = Object.entries(distribution)
    .filter(([_, count]) => count > 0)
    .map(([month, count]) => ({
      month,
      comments: count,
    }));

  return (
    <Card className="bg-black border-gray-800">
      <CardHeader>
        <CardTitle>Comment Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <BarChart
            width={1100}
            height={300}
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="month" stroke="#fff" />
            <YAxis stroke="#fff" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#000",
                border: "1px solid #333",
                borderRadius: "4px",
                padding: "8px",
              }}
              labelStyle={{ color: "#fff" }}
            />
            <Bar dataKey="comments" fill="#8884d8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </div>
      </CardContent>
    </Card>
  );
};

const ResultsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Dummy data for testing
  //if the api key gets exhausted
  // const dummyResults: AnalysisResult = {
  //   sentimentAnalysis: {
  //     agree: 60.5,
  //     disagree: 25.3,
  //     neutral: 14.2,
  //   },
  //   totalComments: 1234,
  //   distribution: {
  //     Jan: 100,
  //     Feb: 150,
  //     Mar: 200,
  //     Apr: 180,
  //     May: 220,
  //     Jun: 250,
  //     Jul: 300,
  //     Aug: 280,
  //     Sep: 240,
  //     Oct: 200,
  //     Nov: 150,
  //     Dec: 100,
  //   },
  // };

  // Use dummy data instead of location.state
  // const results = dummyResults;

  const results = location.state?.results as AnalysisResult | undefined;
  if (!results) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-white hover:text-black"
          >
            Home
          </Button>
          <span className="text-gray-500">{">"}</span>
          <span>Results</span>
        </div>

        <h1 className="text-2xl font-bold mb-8">Analysis Results</h1>

        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <SentimentAnalysisCard
              sentimentAnalysis={results.sentimentAnalysis}
            />
            <TotalCommentsCard
              totalComments={results.totalComments}
              sentimentAnalysis={results.sentimentAnalysis}
            />
          </div>

          <CommentDistributionCard distribution={results.distribution} />

          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="border-gray-800 hover:bg-gray-900 text-white bg-black hover:text-white"
          >
            Back to Input
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;
