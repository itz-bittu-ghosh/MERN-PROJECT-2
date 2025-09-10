const express = require("express");
const app = express();
const UserModel = require("./models/user");
const PostModel = require("./models/post");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { check, validationResult } = require("express-validator");
const fs = require("fs");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");

mongoose.connect(process.env.MONGO_URI);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET, 
});

// Upload an image
async function uploadFile(filePath) {
  const uploadResult = await cloudinary.uploader.upload(filePath, {
    folder: "Mini FaceBook", // optional folder
  });
  return uploadResult;
}

const storage = multer.diskStorage({
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});
const uploadFiles = multer({ storage });

app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// 🔹 Add this BEFORE your routes
app.use((req, res, next) => {
  res.locals.isUserLoggedIn = !!req.cookies.token; // always available in EJS
  res.locals.currentPage = ""; // default (can overwrite in routes)
  next();
});

app.get("/", async (req, res) => {
  const allPosts = await PostModel.find().populate("user");
  res.render("home", {
    allPosts,
    isUserLoggedIn: !!req.cookies.token,
    currentPage: "home",
  });
});
app.get("/terms", (req, res) => {
  res.render("terms");
});

app.post(
  "/add-post",
  isLoggedIn,
  uploadFiles.single("photo"),
  async (req, res) => {
    const { about } = req.body;
  const photo = req.file.path;
  const photoURI = await uploadFile(photo);
    const logUserPosts = await PostModel.find({ user: req.user.userId });
    if (logUserPosts.length <= 2) {
      const newPost = new PostModel({
        photo : photoURI.secure_url,
        about,
        user: req.user.userId,
      });
      await newPost.save();
      res.redirect("/your-posts");
    } else {
      res.redirect(
        "/your-posts?msg=You+will+post+maximum+3+posts...If+you+want+to+post+farther+then+delete+previous+one!!!"
      );
    }
  }
);
app.get("/login", (req, res) => {
  res.render("login", {
    errorMag: "",
    email: "",
    isUserLoggedIn: !!req.cookies.token,
    // currentPage: "login",
  });
});

app.get("/logout", (req, res) => {
  res.cookie("token", "");
  res.redirect("/");
});
app.get("/signup", (req, res) => {
  res.render("signup", {
    errors: [],
    oldInput: {},
    isUserLoggedIn: !!req.cookies.token,
    // currentPage: "signup",
  });
});

app.post(
  "/signup",
  uploadFiles.single("profilePhoto"),
  // Validation chain
  check("firstName")
    .trim()
    .isLength({ min: 2 })
    .withMessage("First Name should be at least 2 characters long")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("First Name should contain only alphabets"),

  check("lastName")
    .matches(/^[A-Za-z\s]*$/)
    .withMessage("Last Name should contain only alphabets"),

  check("email")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),

  check("password")
    .isLength({ min: 8 })
    .withMessage("Password should be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password should contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password should contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password should contain at least one number")
    .matches(/[!@&]/)
    .withMessage("Password should contain at least one special character")
    .trim(),

  check("confirmPassword")
    .trim()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),

  check("terms")
    .notEmpty()
    .withMessage("Please accept the terms and conditions")
    .custom((value) => {
      if (value !== "on") {
        throw new Error("Please accept the terms and conditions");
      }
      return true;
    }),

  // Request handler
  async (req, res) => {
    const { firstName, lastName, email, password, terms } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).render("signup", {
        errors: errors.array().map((err) => err.msg),
        oldInput: { firstName, lastName, email },
        user: {},
      });
    }

    try {
      const termsAccepted = terms === "on";
      const existingUser = await UserModel.find();
      // console.log("Total User: ",existingUser.length);
      // res.render("your-posts", );

      // User Limit set
      if (existingUser.length <= 2) {
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashPassword = await bcrypt.hash(password, salt);
        const photo = req.file.path;
        const photoURI = await uploadFile(photo);
        // Save user
        const newUser = new UserModel({
          firstName,
          lastName,
          email,
          password: hashPassword,
          photo: photoURI.secure_url,
          termsAccepted,
        });

        await newUser.save();
        res.redirect("/login?msg=Account+created+successfully");
      } else {
        res.redirect("/?msg=Maximum+users+reached+plz+contact+with+admin!!!");
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  }
);
app.post("/login", async (req, res) => {
  const { email } = req.body;
  let UserPresent = await UserModel.findOne({ email });
  if (!UserPresent) {
    console.error("User Not Present");
    res.render("login", {
      errorMag: "User not found. Please check your email or sign up.",
    });
  } else {
    bcrypt.compare(
      req.body.password,
      UserPresent.password,
      function (err, result) {
        if (result) {
          const token = jwt.sign(
            { userId: UserPresent._id, email: UserPresent.email },
            process.env.JWT_SECRET
            // { expiresIn: "1h" } // token expiry
          );
          res.cookie("token", token);
          return res.redirect("/your-posts");
        } else {
          console.error("PassWord Wrong!");
          // return res.redirect("/login");
          res.render("login", {
            errorMag: "Password is worng",
            email,
          });
        }
      }
    );
  }
});
app.get("/post/delete/:postId", isLoggedIn, async (req, res) => {
  const postId = req.params.postId;
  const post = await PostModel.findById(postId);
  //  console.log(post);

  if (post.photo) {
    const filePath = path.join(
      __dirname,
      "public",
      "profileImages",
      post.photo
    ); // adjust folder
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("Error deleting file:", err);
      } else {
        console.log("File deleted:", filePath);
      }
    });
  }
  await PostModel.findOneAndDelete({ _id: postId });
  res.redirect("/your-posts");
});
app.get("/profile/:userId", isLoggedIn, async (req, res) => {
  const userId = req.params.userId;
  const user = await UserModel.findOne({ _id: userId });
  const userPosts = await PostModel.find({ user: userId });
  res.render("profile", { user, userPosts });
});
app.get("/your-posts", isLoggedIn, async (req, res) => {
  const user = await UserModel.find({ _id: req.user.userId });
  const userPosts = await PostModel.find({ user: req.user.userId });
  res.render("userPost", {
    userPosts,
    user,
    // userName: ,
    isUserLoggedIn: !!req.cookies.token,
    currentPage: "your-posts",
    willBeEdited: null,
  });
});
app.get("/post/edit/:postId", isLoggedIn, async (req, res) => {
  const loggedInUser = await UserModel.find({ _id: req.user.userId });
  const postId = req.params.postId;
  const willBeEdited = await PostModel.findOne({ _id: postId });
  const userPosts = await PostModel.find({
    user: loggedInUser[0]._id,
  }).populate("user");

  res.render("userPost", {
    willBeEdited,
    user: loggedInUser,
    userPosts,
    userName: loggedInUser[0].firstName,
    isUserLoggedIn: !!req.cookies.token,
    currentPage: "your-posts",
  });
});
app.post(
  "/update-post/:postId",
  isLoggedIn,
  uploadFiles.single("photo"),
  async (req, res) => {
    const { about } = req.body;
  const photo = req.file.path;
  const photoURI = await uploadFile(photo);

    const postId = req.params.postId;
    await PostModel.findOneAndUpdate(
      { _id: postId },
      { photo : photoURI.secure_url , about },
      { new: true, runValidators: true }
    );
    res.redirect("/your-posts");
  }
);

app.get("/like-post/:likedPostId", isLoggedIn, async (req, res) => {
  try {
    const likedUserId = req.user.userId;
    const likedFromProfile = req.query.likedFromProfile === "ture";
    const likedFromProfile_dask = req.query.likedFromProfile_dask === "ture";

    const likedPostId = req.params.likedPostId;

    // Find the post by ID
    const likedPost = await PostModel.findById(likedPostId).populate("user");
    if (!likedPost) return res.status(404).send("Post not found");

    // Initialize likedUserId array if it doesn't exist
    if (!likedPost.likedUserId) likedPost.likedUserId = [];

    // Toggle like: remove if exists, add if not
    const index = likedPost.likedUserId.indexOf(likedUserId);
    if (index === -1) {
      // Not liked yet → add like
      likedPost.likedUserId.push(likedUserId);
    } else {
      // Already liked → remove like
      likedPost.likedUserId.splice(index, 1);
    }

    // Save the updated post
    await likedPost.save();
    if (likedFromProfile) {
      return res.redirect("/profile/" + likedPost.user._id);
    }
    if (likedFromProfile_dask) {
      return res.redirect("/your-posts");
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// -----------404 Page ---------------
app.use((req, res) => {
  res.render("404");
});

function isLoggedIn(req, res, next) {
  if (!req.cookies.token) {
    return res.redirect("/login"); // stop execution
  }
  const token = req.cookies.token;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;
  next();
}

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Your App is running on => http://localhost:${PORT}`);
});
