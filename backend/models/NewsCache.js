import mongoose from 'mongoose'

const newsCacheSchema = new mongoose.Schema(
  {
    summary: {
      type: String,
      required: true,
    },
    rawContent: String,
  },
  {
    timestamps: true,
  }
)

const NewsCache = mongoose.model('NewsCache', newsCacheSchema)

export default NewsCache
