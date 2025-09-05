const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  photo: String,
  about: String,
  date: {
    type: Date,
    default: new Date(),
  },
  likedUserId: [],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

// Create model
const Post = mongoose.model("Post", postSchema);

module.exports = Post;
