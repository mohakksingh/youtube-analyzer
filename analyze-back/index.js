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
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

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

async function analyzeAllComments(comments) {
  try {
    // Construct a single prompt for all comments
    const prompt = `
      Analyze the following YouTube comments and categorize each one as AGREE, DISAGREE, or NEUTRAL based on whether they agree, disagree, or are neutral with respect to the video content.
      Consider:
      - Comments that express support, agreement, or positive feedback should be marked as AGREE
      - Comments that criticize, object, reject, hate, disrespect, objectify, discriminate, or express negative opinions should be marked as DISAGREE
      - Comments that are neutral, factual, or unrelated should be marked as NEUTRAL

      Comments:
      ${comments
        .map((comment, index) => `${index + 1}. "${comment.text}"`)
        .join("\n")}

      Respond with a JSON object where the key is the comment number (1, 2, 3, etc.) and the value is the sentiment (AGREE, DISAGREE, or NEUTRAL).
      Example:
      {
        "1": "AGREE",
        "2": "DISAGREE",
        "3": "NEUTRAL"
      }
    `;

    // Send the prompt to the Gemini API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Parse the response into a JSON object
    const sentimentResults = JSON.parse(text);
    return sentimentResults;
  } catch (error) {
    console.error("Error in sentiment analysis:", error);
    throw error;
  }
}

function fallbackSentimentAnalysis(comment) {
  const positiveWords = ["good", "great", "awesome", "love", "like","cool","nice","amazing","fantastic","excellent","best","beautiful","wonderful","perfect"];
  const negativeWords = ["bad", "terrible", "hate", "dislike", "awful","gross","cringe","disgusting","horrible","worst","sucks","stupid","trash"];

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

function groupCommentsByMonth(comments) {
  const groupedComments = {};
  comments.forEach((comment) => {
    const timestamp = new Date(
      comment.snippet.topLevelComment.snippet.publishedAt
    );
    const month = timestamp.toLocaleString("default", { month: "short" });

    if (!groupedComments[month]) {  
      groupedComments[month] = [];
    }

    groupedComments[month].push({
      id: comment.snippet.topLevelComment.id,
      text: comment.snippet.topLevelComment.snippet.textDisplay,
      username: comment.snippet.topLevelComment.snippet.authorDisplayName,
      timestamp,
    });
  });
  return groupedComments;
}

//rateLimitter due to the rate limit of the API
// Updated rateLimiter function to process comments in batches
async function rateLimiter(comments, batchSize = 10, delayBetweenBatches = 2000) {
  const sentiments = [];
  for (let i = 0; i < comments.length; i += batchSize) {
    const batch = comments.slice(i, i + batchSize);

    // Process the batch in parallel
    const batchPromises = batch.map(async (comment) => {
      try {
        const sentiment = await analyzeSentiment(
          comment.snippet.topLevelComment.snippet.textDisplay
        );
        return sentiment;
      } catch (error) {
        console.error("Error in sentiment analysis:", error);
        return "neutral"; // Fallback to neutral if analysis fails
      }
    });

    // Wait for the batch to complete
    const batchResults = await Promise.all(batchPromises);
    sentiments.push(...batchResults);

    // Add a delay between batches to respect rate limits
    if (i + batchSize < comments.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }
  return sentiments;
}

// Updated /api/analyze endpoint
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

    // Group comments by month
    const groupedComments = groupCommentsByMonth(comments);

    // Flatten all comments into a single array for analysis
    const allComments = Object.values(groupedComments).flat();

    // Analyze all comments at once
    const sentimentResults = await analyzeAllComments(allComments);

    const analysisResults = {
      agree: 0,
      disagree: 0,
      neutral: 0,
    };

    const distribution = allMonths();

    // Process sentiment results and update analysis
    allComments.forEach((comment, index) => {
      const sentiment = sentimentResults[index + 1]; // +1 because comments are 1-indexed in the prompt
      analysisResults[sentiment.toLowerCase()]++;

      const month = comment.timestamp.toLocaleString("default", {
        month: "short",
      });
      distribution[month]++;
    });

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