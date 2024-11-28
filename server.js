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

// Setup __dirname for ES Modules
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

app.use(formidable());
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

let db;

// Connect to MongoDB
const connectToDatabase = async () => {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Failed to connect to MongoDB:", error);
        process.exit(1); // Exit if the database connection fails
    }
};

// Middleware to ensure the database is ready
app.use((req, res, next) => {
    if (!db) {
        console.error("Database connection is not ready.");
        return res.status(500).send("Database connection is not ready. Please try again later.");
    }
    next();
});

// Utility Functions
const findUser = async (criteria) => {
    if (!db) {
        console.error("Database connection not established.");
        throw new Error("Database connection not established.");
    }
    const collection = db.collection(usersCollectionName);
    const standardizedCriteria = { ...criteria };
    if (criteria.username) {
        standardizedCriteria.username = criteria.username.toLowerCase();
    }
    return await collection.findOne(standardizedCriteria);
};

const createUser = async (user) => {
    if (!db) {
        console.error("Database connection not established.");
        throw new Error("Database connection not established.");
    }
    const collection = db.collection(usersCollectionName);
    return await collection.insertOne(user);
};

// Passport Strategies
passport.use(
    new LocalStrategy(async (username, password, done) => {
        try {
            const user = await findUser({ username });
            if (!user) {
                return done(null, false, { message: "Invalid username or password" });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return done(null, false, { message: "Invalid username or password" });
            }
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    })
);

passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await findUser({ _id: new ObjectId(id) });
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Routes
app.get("/", (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        res.redirect("/content");
    } else {
        res.redirect("/login");
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

app.get("/content", (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.send("Welcome to the content page!");
});

// Start the Server After Connecting to MongoDB
const startServer = async () => {
    await connectToDatabase();
    const port = process.env.PORT || 8099;
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
};

startServer();
