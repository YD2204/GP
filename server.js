import dotenv from "dotenv";
dotenv.config();

import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as FacebookStrategy } from "passport-facebook";
import session from "express-session";
import formidable from "express-formidable";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mongoUrl = process.env.MONGO_URL;
const dbName = "tableBooking";
const usersCollectionName = "users";
const tablesCollectionName = "tables";

const client = new MongoClient(mongoUrl, {
  serverApi: { version: "1", strict: true, deprecationErrors: true },
});

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// Session middleware (must be added before passport initialization)
app.use(formidable()); // Parse form data
app.use(
    session({
        secret: process.env.SESSION_SECRET || "defaultSecret",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // Use `secure: true` in production with HTTPS
    })
);
app.use(passport.initialize());
app.use(passport.session());


let db;
client.connect()
  .then(() => {
    db = client.db(dbName);
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });

const findUser = async (criteria) => {
  const collection = db.collection(usersCollectionName);
  const standardizedCriteria = { ...criteria };
  if (criteria.username) {
    standardizedCriteria.username = criteria.username.toLowerCase();
  }
  return await collection.findOne(standardizedCriteria);
};

const createUser = async (user) => {
  const collection = db.collection(usersCollectionName);
  return await collection.insertOne(user);
};

// Local Strategy for login
passport.use(
    new LocalStrategy(async (username, password, done) => {
        console.log("Attempting login for:", username); // Debugging
        try {
            const user = await findUser({ username });
            if (!user) {
                console.log("User not found:", username);
                return done(null, false, { message: "Invalid username or password" });
            }

            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.log("Invalid password for user:", username);
                return done(null, false, { message: "Invalid username or password" });
            }

            console.log("Authentication successful for:", username);
            return done(null, user);
        } catch (err) {
            console.error("Error during authentication:", err);
            return done(err);
        }
    })
);



// Facebook Strategy for login
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await findUser({ facebookId: profile.id });
        if (!user) {
          user = {
            facebookId: profile.id,
            username: profile.displayName || "Facebook User",
            type: "facebook",
          };
          await createUser(user);
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUser({ _id: new ObjectId(id) });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
};
app.get("/", (req, res) => {
    res.redirect("/login"); // Redirect to login page
});
// Routes
app.get("/login", (req, res) => {
  res.render("login");
});
app.post(
    "/login",
    (req, res, next) => {
        console.log("Received login credentials:", req.body); // Debugging
        passport.authenticate("local", (err, user, info) => {
            if (err) {
                console.error("Error during authentication:", err);
                return next(err);
            }
            if (!user) {
                console.log("Authentication failed:", info.message);
                return res.redirect("/login"); // Redirect on failure
            }
            req.logIn(user, (err) => {
                if (err) {
                    console.error("Error during login:", err);
                    return next(err);
                }
                console.log("Login successful:", user); // Debugging
                return res.redirect("/content"); // Redirect on success
            });
        })(req, res, next);
    }
);





app.get("/auth/facebook", passport.authenticate("facebook"));

app.get(
  "/auth/facebook/callback",
  (req, res, next) => {
    console.log("Handling Facebook callback");
    next();
  },
  passport.authenticate("facebook", {
    successRedirect: "/content",
    failureRedirect: "/login",
  })
);

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  const { username, password } = req.fields;
  if (!username || !password) {
    return res.status(400).send("Username and password are required.");
  }
  if (username.trim().length < 3 || password.trim().length < 6) {
    return res.status(400).send("Invalid username or password length.");
  }
  const existingUser = await findUser({ username: username.toLowerCase() });
  if (existingUser) {
    return res.status(400).send("Username is already taken.");
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await createUser({ username: username.toLowerCase(), password: hashedPassword });
    res.redirect("/login");
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).send("Internal server error.");
  }
});

app.get("/content", isLoggedIn, async (req, res) => {
  res.send("Welcome to the content page, " + req.user.username);
});

// Handle unknown routes
app.get("/*", (req, res) => {
  res.status(404).send("Page not found.");
});

const port = process.env.PORT || 8099;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
