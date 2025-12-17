import mongoose from 'mongoose'

const articleSchema = new mongoose.Schema(
  {
    title: String,
    url: String,
    content: String,
    portal: String,
    explained: String,
  },
  { _id: false }
)

const newsCacheSchema = new mongoose.Schema(
  {
    summary: {
      type: String,
      required: true,
    },
    articles: [articleSchema],
    rawContent: String,
  },
  {
    timestamps: true,
  }
)

const NewsCache = mongoose.model('NewsCache', newsCacheSchema)

export default NewsCache
