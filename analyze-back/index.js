import express from "express";
import { google } from "googleapis";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
  })
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });

const youtube = google.youtube({
  version: "v3",
  auth: process.env.YOUTUBE_API_KEY,
});

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB:", err));


const commentSchema = new mongoose.Schema({
  videoId: String,
  commentId: String,
  maskedUsername: String,
  comment: String,
  sentiment: String,
  timestamp: Date,
});

const Comment = mongoose.model("Comment", commentSchema);

function extractVideoId(url) {
  const regex = /(?:v=|\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function analyzeSentiment(comment, retries = 3, delay = 2000) {
  try {
    const prompt = `
      Analyze if the following YouTube comment agrees or disagrees with the video content, or is neutral.
      Consider:
      - Comments that express support, agreement, or positive feedback should be marked as AGREE
      - Comments that criticize, object, or express negative opinions should be marked as DISAGREE
      - Comments that are neutral, factual, or unrelated should be marked as NEUTRAL
      
      Comment: "${comment}"
      
      Respond with EXACTLY one word: AGREE, DISAGREE, or NEUTRAL
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim().toUpperCase();

    if (text.includes("AGREE")) return "agree";
    if (text.includes("DISAGREE")) return "disagree";
    return "neutral";
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      console.log(`Rate limit exceeded. Retrying in ${delay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return analyzeSentiment(comment, retries - 1, delay * 2);
    }
    console.error("Error in sentiment analysis. Using fallback method:", error);
    return fallbackSentimentAnalysis(comment); 
  }
}

function fallbackSentimentAnalysis(comment) {
  const positiveWords = ["good", "great", "awesome", "love", "like"];
  const negativeWords = ["bad", "terrible", "hate", "dislike", "awful"];

  const lowerCaseComment = comment.toLowerCase();
  const positiveCount = positiveWords.filter((word) =>
    lowerCaseComment.includes(word)
  ).length;
  const negativeCount = negativeWords.filter((word) =>
    lowerCaseComment.includes(word)
  ).length;

  if (positiveCount > negativeCount) return "agree";
  if (negativeCount > positiveCount) return "disagree";
  return "neutral";
}

//rateLimitter due to the rate limit of the API
async function rateLimiter(comments) {
  const sentiments = [];
  for (const comment of comments) {
    try {
      const sentiment = await analyzeSentiment(
        comment.snippet.topLevelComment.snippet.textDisplay
      );
      sentiments.push(sentiment);
    } catch (error) {
      console.error("Error in sentiment analysis:", error);
      sentiments.push("neutral"); 
    }
    await new Promise((resolve) => setTimeout(resolve, 2000)); 
  }
  return sentiments;
}

function maskUsername(username) {
  return username.charAt(0) + "*".repeat(username.length - 1);
}

function allMonths() {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const distribution = {};
  months.forEach((month) => {
    distribution[month] = 0;
  });
  return distribution;
}

function sortMonths(distribution) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const sortedDistribution = {};
  months.forEach((month) => {
    sortedDistribution[month] = distribution[month] || 0;
  });
  return sortedDistribution;
}

app.post("/api/analyze", async (req, res) => {
  try {
    const { url } = req.body;
    const videoId = extractVideoId(url);

    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const response = await youtube.commentThreads.list({
      key: process.env.YOUTUBE_API_KEY,
      part: ["snippet"],
      videoId,
      maxResults: 100,
      order: "relevance",
    });

    if (!response.data.items) {
      return res.status(404).json({ error: "No comments found" });
    }

    const comments = response.data.items;
    const sentiments = await rateLimiter(comments);

    const analysisResults = {
      agree: 0,
      disagree: 0,
      neutral: 0,
    };

    const distribution = allMonths();

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const commentId = comment.snippet.topLevelComment.id;
      const existingComment = await Comment.findOne({ commentId });

      if (existingComment) {
        analysisResults[existingComment.sentiment]++;
        const month = existingComment.timestamp.toLocaleString("default", {
          month: "short",
        });
        distribution[month]++;
      } else {
        const commentText = comment.snippet.topLevelComment.snippet.textDisplay;
        const username =
          comment.snippet.topLevelComment.snippet.authorDisplayName;
        const timestamp = new Date(
          comment.snippet.topLevelComment.snippet.publishedAt
        );
        const sentiment = sentiments[i];

        analysisResults[sentiment]++;

        const month = timestamp.toLocaleString("default", { month: "short" });
        distribution[month]++;

        await Comment.create({
          videoId,
          commentId,
          maskedUsername: maskUsername(username),
          comment: commentText,
          sentiment,
          timestamp,
        });
      }
    }

    const total = Object.values(analysisResults).reduce((a, b) => a + b, 0);
    const sentimentAnalysis = {
      agree: ((analysisResults.agree / total) * 100).toFixed(1),
      disagree: ((analysisResults.disagree / total) * 100).toFixed(1),
      neutral: ((analysisResults.neutral / total) * 100).toFixed(1),
    };

    const sortedDistribution = sortMonths(distribution);

    res.json({
      sentimentAnalysis,
      totalComments: total,
      distribution: sortedDistribution,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to analyze comments" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});