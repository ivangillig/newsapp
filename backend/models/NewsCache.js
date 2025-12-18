import mongoose from 'mongoose'

const articleSchema = new mongoose.Schema(
  {
    category: String, // PRINCIPALES, POLÍTICA, etc.
    title: String, // AI-optimized title
    description: String, // AI-generated mini-summary
    url: String, // Article URL
    content: String, // Full scraped content
    portal: String, // Source portal
    explained: String, // AI-generated informal explanation
  },
  { _id: false }
)

const newsCacheSchema = new mongoose.Schema(
  {
    summary: {
      type: String,
      required: false, // Deprecated - now we use articles directly
      default: '',
    },
    articles: [articleSchema],
    rawContent: {
      type: String,
      required: false, // Deprecated
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

const NewsCache = mongoose.model('NewsCache', newsCacheSchema)

export default NewsCache
