const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true, // ensures no duplicate emails
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  termsAccepted: {
    // store if user accepted terms
    type: Boolean,
    required: true,
    default: false,
  },
  photo: {
    type: String, // URL to the user's photo
    default: "https://example.com/default-photo.png",
  },
  date: {
    type: Date,
    default: new Date(),
  },
  postIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
  ],
});
// Create model
const User = mongoose.model("User", userSchema);

module.exports = User;
