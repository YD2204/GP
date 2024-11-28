import dotenv from 'dotenv';
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
const collectionName = tablesCollectionName;

const client = new MongoClient(mongoUrl, {
    serverApi: { version: "1", strict: true, deprecationErrors: true },
});

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(formidable());

let db;

// Connect to the database
const connectToDatabase = async () => {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1); // Exit the application if the database connection fails
    }
};

// Middleware to ensure DB connection is ready
app.use((req, res, next) => {
    if (!db) {
        console.error("Database connection is not ready.");
        return res.status(500).send("Database connection is not ready. Please try again later.");
    }
    next();
});

const findUser = async (criteria) => {
    if (!db) {
        console.error("Database connection is not established.");
        throw new Error("Database connection is not established.");
    }
    const collection = db.collection(usersCollectionName);
    const standardizedCriteria = { ...criteria };
    if (criteria.username) {
        standardizedCriteria.username = criteria.username.toLowerCase();
    }
    const user = await collection.findOne(standardizedCriteria);
    console.log("findUser result for criteria", standardizedCriteria, ":", user);
    return user;
};

const createUser = async (user) => {
    if (!db) {
        console.error("Database connection is not established.");
        throw new Error("Database connection is not established.");
    }
    const collection = db.collection(usersCollectionName);
    return await collection.insertOne(user);
};

// Passport Configuration
passport.use(
    new LocalStrategy(async (username, password, done) => {
        console.log("Attempting login for:", username);
        try {
            const user = await findUser({ username });
            if (!user) {
                console.log("User not found.");
                return done(null, false, { message: "Invalid username or password" });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.log("Invalid password.");
                return done(null, false, { message: "Invalid username or password" });
            }
            console.log("User authenticated:", user);
            return done(null, user);
        } catch (err) {
            console.error("Error in LocalStrategy:", err);
            return done(err);
        }
    })
);

passport.use(
    new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        },
        async (token, refreshToken, profile, done) => {
            try {
                let user = await findUser({ facebookId: profile.id });
                if (!user) {
                    user = {
                        facebookId: profile.id,
                        username: profile.displayName,
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

// Session Configuration
app.use(
    session({
        secret: process.env.SESSION_SECRET || "defaultSecret",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false },
    })
);
app.use(passport.initialize());
app.use(passport.session());

const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect("/login");
};

// Routes
app.get("/", (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("/content");
    } else {
        res.redirect("/login");
    }
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.post("/signup", async (req, res) => {
    const { username, password } = req.fields;
    if (!username || !password) {
        return res.status(400).send("Username and password are required.");
    }
    if (username.trim().length < 3 || password.trim().length < 6) {
        return res.status(400).send("Username must be at least 3 characters and password at least 6 characters.");
    }
    const existingUser = await findUser({ username: username.toLowerCase() });
    if (existingUser) {
        return res.status(400).send("Username is already taken.");
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser({ username: username.toLowerCase(), password: hashedPassword });
        res.redirect("/login");
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).send("Internal server error.");
    }
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/content",
        failureRedirect: "/login",
        failureFlash: false,
    })
);

app.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Error logging out:", err);
            return res.status(500).send("Error logging out.");
        }
        res.redirect("/login");
    });
});

app.get("/auth/facebook", passport.authenticate("facebook"));
app.get(
    "/auth/facebook/callback",
    passport.authenticate("facebook", {
        successRedirect: "/content",
        failureRedirect: "/login",
    })
);

app.get("/content", isLoggedIn, async (req, res) => {
    const bookings = await findDocument(db, { userid: req.user.id });
    res.render("list", { user: req.user, bookings, nBookings: bookings.length });
});

// Server Start after DB Connection
const startServer = async () => {
    await connectToDatabase();

    const port = process.env.PORT || 8099;
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
};

startServer();
